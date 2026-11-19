import mongoose, { Schema } from "mongoose";
import { INSTANCE_ID } from "../instance.js";
import { ensureMongo } from "./mongo.js";

interface LeaderDoc {
  _id: string;
  instanceId: string;
  hostname: string;
  startedAt: Date;
  heartbeatAt: Date;
}

const LeaderSchema = new Schema<LeaderDoc>(
  {
    _id: { type: String, default: "whatsapp-leader" },
    instanceId: String,
    hostname: String,
    startedAt: Date,
    heartbeatAt: Date,
  },
  { collection: "agentleader" },
);

const LeaderModel =
  mongoose.models.AgentLeader ??
  mongoose.model<LeaderDoc>("AgentLeader", LeaderSchema);

/**
 * Single-instance lock for WhatsApp sockets.
 *
 * Why: Baileys allows exactly ONE live socket per number. Two copies of this
 * server (Render zero-downtime deploy overlap, dev + prod sharing one DB,
 * manual double-start) open two sockets for the same number and WhatsApp
 * kicks both with a REPLACED/conflict close — the line flaps and looks
 * "shaky". The task queue is multi-instance safe (atomic claims + change
 * streams), but sockets are not — so only the leader dials.
 *
 * How: one Mongo row, heartbeat every HEARTBEAT_MS. A challenger may take
 * over only when the heartbeat is older than TAKEOVER_MS (dead process) via
 * an atomic conditional update — never by blind overwrite.
 */

const HEARTBEAT_MS = 10_000;
export const TAKEOVER_MS = 30_000;

let weAreLeader = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let startedAt = new Date();

export function isLeader(): boolean {
  return weAreLeader;
}

export async function getLeaderInfo(): Promise<{
  instanceId: string;
  ageSec: number;
  weAreLeader: boolean;
} | null> {
  try {
    await ensureMongo();
    const doc = await LeaderModel.findById("whatsapp-leader").lean();
    if (!doc) return null;
    return {
      instanceId: doc.instanceId,
      ageSec: Math.max(0, Math.round((Date.now() - new Date(doc.heartbeatAt).getTime()) / 1000)),
      weAreLeader: doc.instanceId === INSTANCE_ID,
    };
  } catch {
    return null;
  }
}

async function writeHeartbeat(): Promise<void> {
  await ensureMongo();
  await LeaderModel.updateOne(
    { _id: "whatsapp-leader", instanceId: INSTANCE_ID },
    { $set: { heartbeatAt: new Date() } },
  );
}

/** Try once to become leader. Returns true when we hold the lock. */
export async function tryAcquireLeadership(): Promise<boolean> {
  try {
    await ensureMongo();
  } catch {
    return false; // DB down — retry later, never claim blindly
  }
  startedAt = startedAt ?? new Date();
  try {
    await LeaderModel.create({
      _id: "whatsapp-leader",
      instanceId: INSTANCE_ID,
      hostname: INSTANCE_ID,
      startedAt,
      heartbeatAt: new Date(),
    });
    weAreLeader = true;
    return true;
  } catch {
    /* row exists — fall through to stale-takeover check */
  }
  try {
    const staleBefore = new Date(Date.now() - TAKEOVER_MS);
    const res = await LeaderModel.findOneAndUpdate(
      { _id: "whatsapp-leader", heartbeatAt: { $lt: staleBefore } },
      {
        $set: {
          instanceId: INSTANCE_ID,
          hostname: INSTANCE_ID,
          startedAt,
          heartbeatAt: new Date(),
        },
      },
      { new: true },
    );
    weAreLeader = !!res;
    return weAreLeader;
  } catch {
    return false;
  }
}

/** Heartbeat while leader. If we lose the row, step down immediately. */
export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!weAreLeader) return;
    writeHeartbeat().catch(() => {
      /* next tick retries — reconcile keeps sessions alive meanwhile */
    });
  }, HEARTBEAT_MS);
  (heartbeatTimer as unknown as { unref?: () => void }).unref?.();
}

/** Release the lock so the next deploy takes over instantly (no 30s gap). */
export async function releaseLeadership(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!weAreLeader) return;
  weAreLeader = false;
  try {
    await LeaderModel.deleteOne({ _id: "whatsapp-leader", instanceId: INSTANCE_ID });
  } catch {
    /* best effort — stale row expires via takeover timeout */
  }
}

/** Background loop: hold the lock, or wait quietly as standby. */
export function watchLeadership(onElected: () => void): void {
  const tick = async () => {
    if (weAreLeader) {
      // Verify we still hold the row (another instance could have taken a
      // stale lock while we were paused). Losing it means step down now —
      // two diallers is worse than a brief standby.
      try {
        await ensureMongo();
        const doc = await LeaderModel.findById("whatsapp-leader").lean();
        if (!doc || doc.instanceId !== INSTANCE_ID) {
          weAreLeader = false;
          console.log("Leadership lost — stepping down to standby (another instance is active).");
          return;
        }
      } catch {
        return; // DB blip — keep current role, retry next tick
      }
      return;
    }
    if (await tryAcquireLeadership()) {
      console.log(`Elected leader (${INSTANCE_ID}) — starting sessions.`);
      startHeartbeat();
      onElected();
    }
  };
  const t = setInterval(() => void tick(), HEARTBEAT_MS);
  (t as unknown as { unref?: () => void }).unref?.();
  void tick();
}
