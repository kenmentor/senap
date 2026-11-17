import { EventEmitter } from "node:events";
import type SessionManager from "./session-manager.js";
import { JobModel } from "./agent-tools/jobs.js";
import { ensureMongo } from "./mongo.js";

/**
 * Agent Task Server — webhook / event-driven, zero polling.
 *
 * How it works (no setInterval anywhere):
 *  - INBOUND WEBHOOK: `POST /sessions/:userId/tasks` (or the `schedule_task`
 *    tool) durably inserts a row, then emits `task:enqueued` in-process and —
 *    if Mongo is a replica set — a Change Stream on `agentjobs` fires for any
 *    other instance. No polling.
 *  - DISPATCH: a single armed `dueTimer` fires at exactly the next task's
 *    `runAt`. Imminent/due tasks dispatch via `setImmediate` (interrupt).
 *    After each drain we re-arm for the next earliest `runAt` (one cheap
 *    indexed `runAt` projection query, only when something happened).
 *  - OUTBOUND WEBHOOK: lifecycle events (`enqueued/done/failed`) POST to
 *    `TASK_WEBHOOK_URL` (Bearer `TASK_WEBHOOK_SECRET`) fire-and-forget, so the
 *    dashboard can react without polling `tasks/pending`.
 *  - Isolation + low-RAM guarantees from before are kept: every claim is
 *    scoped to (userId, chatJid), the agent only sees that chat's sliced
 *    context, nothing is cached except one timer + tiny per-chat lock chains.
 */

const BATCH = 25;
const MAX_ATTEMPTS = 10;
const MAX_TEXT = 2000;

let manager: SessionManager | null = null;
let dueTimer: ReturnType<typeof setTimeout> | null = null;
let dueAtMs: number | null = null;
let draining = false;
let watcherStarted = false;

/** In-process webhook bus. `task:enqueued` = inbound interrupt signal. */
export const taskEvents = new EventEmitter();
taskEvents.setMaxListeners(50);

type TaskLifecycle = "enqueued" | "done" | "failed" | "retry";

export function onTaskEvent(fn: (e: { type: TaskLifecycle; userId: string; chatJid: string; id: string; kind: string }) => void): () => void {
  taskEvents.on("task", fn);
  return () => taskEvents.off("task", fn);
}

function emitTask(type: TaskLifecycle, userId: string, chatJid: string, id: string, kind: string): void {
  taskEvents.emit("task", { type, userId, chatJid, id, kind });
  void postOutboundWebhook({ type, userId, chatJid, id, kind }).catch(() => {});
}

async function postOutboundWebhook(payload: Record<string, string>): Promise<void> {
  const url = process.env.TASK_WEBHOOK_URL?.trim();
  if (!url) return;
  const secret = process.env.TASK_WEBHOOK_SECRET?.trim() ?? "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ event: `task.${payload.type}`, ...payload, at: new Date().toISOString() }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Per-chat promise chains: `${userId}:${chatJid}` -> tail. Freed on completion. */
const chains = new Map<string, Promise<void>>();

function chainKey(userId: string, chatJid: string): string {
  return `${userId}:${chatJid}`;
}

function withChatLock<T>(userId: string, chatJid: string, fn: () => Promise<T>): Promise<T> {
  const key = chainKey(userId, chatJid);
  const prev = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((r) => (release = r));
  chains.set(key, tail);
  const out = prev.then(fn);
  return out.finally(() => {
    if (chains.get(key) === tail) chains.delete(key);
    release();
    if (chains.size > 5000) chains.clear();
  });
}

async function ensureConn(): Promise<void> {
  await ensureMongo().catch((e) => {
    console.error("Task server: Mongo unreachable, will retry on next webhook:", e instanceof Error ? e.message : e);
    throw e;
  });
}

export interface EnqueueTaskInput {
  userId: string;
  chatJid: string;
  createdBy: string;
  /** Scheduler privilege — customer tasks must never execute as owner. */
  createdByIsOwner?: boolean;
  kind: "send" | "agent";
  text: string;
  runAt: Date;
}

/** Inbound webhook handler: durably enqueue, then event-interrupt (no poll). */
export async function enqueueTask(input: EnqueueTaskInput): Promise<string> {
  await ensureConn();
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (!text) throw new Error("Task text is empty.");
  if (!input.userId.trim() || !input.chatJid.trim()) throw new Error("userId and chatJid are required.");
  // Double-push guard: a retried webhook / double-clicked dashboard button
  // must not create two identical jobs. Same scope + kind + exact text
  // pending within the last 60s reuses the existing job id.
  try {
    const recent = await JobModel.findOne({
      userId: input.userId,
      chatJid: input.chatJid,
      kind: input.kind,
      text,
      status: "pending",
      createdAt: { $gte: new Date(Date.now() - 60_000) },
    })
      .select("_id")
      .lean();
    const existingId = (recent as { _id?: unknown } | null)?._id;
    if (existingId) return String(existingId);
  } catch {
    /* dedupe is best-effort — fall through to insert */
  }
  const doc = await JobModel.create({
    userId: input.userId,
    chatJid: input.chatJid,
    createdBy: input.createdBy,
    createdByIsOwner: input.createdByIsOwner ?? false,
    kind: input.kind,
    text,
    runAt: input.runAt,
    status: "pending",
    attempts: 0,
    lastError: "",
  });
  const id = String(doc._id);
  emitTask("enqueued", input.userId, input.chatJid, id, input.kind);
  // Event-driven dispatch: due/imminent -> interrupt now; future -> arm exact timer.
  if (input.runAt.getTime() <= Date.now() + 1000) {
    setImmediate(() => void drainDue().catch((e) => console.error("Task dispatch failed:", e)));
  } else {
    armTimerFor(input.runAt.getTime());
  }
  return id;
}

/** Compat: explicit nudge (e.g. after tool schedule). Now just re-arms/drains — no poll. */
export function wake(): void {
  setImmediate(() => void drainDue().catch((e) => console.error("Task dispatch failed:", e)));
}

/** Arm the single due-timer for an exact fire time (earliest wins). */
function armTimerFor(fireAtMs: number): void {
  const delay = Math.max(0, fireAtMs - Date.now());
  if (dueTimer && dueAtMs !== null && dueAtMs <= fireAtMs) return; // already armed earlier
  if (dueTimer) clearTimeout(dueTimer);
  dueAtMs = fireAtMs;
  dueTimer = setTimeout(() => {
    dueTimer = null;
    dueAtMs = null;
    void drainDue().catch((e) => console.error("Task dispatch failed:", e));
  }, delay);
  (dueTimer as unknown as { unref?: () => void }).unref?.();
}

/** Query only the earliest pending runAt (indexed projection) and arm for it. */
async function rearmFromDb(): Promise<void> {
  try {
    await ensureMongo();
    const doc = await JobModel.findOne({ status: "pending" }).select("runAt").sort({ runAt: 1 }).lean();
    if (!doc?.runAt) return;
    const t = doc.runAt instanceof Date ? doc.runAt.getTime() : new Date(doc.runAt as unknown as string).getTime();
    if (Number.isFinite(t)) armTimerFor(t);
  } catch {
    /* DB down — next webhook re-arms */
  }
}

function backoffMs(attempts: number): number {
  return Math.min(5000 * 2 ** Math.min(attempts, 6), 5 * 60_000);
}

async function cleanupTerminal(): Promise<void> {
  try {
    await ensureMongo();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    await JobModel.deleteMany({ status: { $in: ["done", "failed"] }, createdAt: { $lt: cutoff } }).exec();
  } catch {
    /* best effort */
  }
}

/**
 * Drain all currently-due jobs. Each claim is atomic (pending->running) and
 * scoped to its own (userId, chatJid) — the session interrupt only ever
 * receives that one task's text, never another chat's details. Retries push
 * `runAt` forward with backoff + re-arm (no polling).
 */
export async function runDueJobs(sessions: SessionManager): Promise<number> {
  await ensureConn();
  const due = await JobModel.find({ status: "pending", runAt: { $lte: new Date() } })
    .select("_id userId chatJid createdBy createdByIsOwner kind text runAt attempts repeatMs repeatKey")
    .sort({ runAt: 1 })
    .limit(BATCH)
    .lean();
  let done = 0;
  for (const job of due) {
    const claimed = await JobModel.findOneAndUpdate(
      { _id: job._id, status: "pending" },
      { $set: { status: "running", lastError: "" } },
      { new: true },
    )
      .select("_id userId chatJid createdBy createdByIsOwner kind text attempts runAt repeatMs repeatKey")
      .lean();
    if (!claimed) continue;
    const rec = claimed as unknown as Record<string, unknown>;
    const userId = String(rec.userId ?? "");
    const chatJid = String(rec.chatJid ?? "");
    const kind = String(rec.kind ?? "send") as "send" | "agent";
    const text = String(rec.text ?? "").slice(0, MAX_TEXT);
    const attempts = Number(rec.attempts ?? 0);
    const executorIsOwner = rec.createdByIsOwner === true;
    const repeatMs = Math.max(0, Number(rec.repeatMs ?? 0));
    const repeatKey = String(rec.repeatKey ?? "");
    const createdBy = String(rec.createdBy ?? "");
    const id = String((claimed as { _id: unknown })._id);
    if (!userId || !chatJid) {
      await JobModel.updateOne({ _id: (claimed as { _id: unknown })._id }, { $set: { status: "failed", lastError: "missing scope" } });
      emitTask("failed", userId, chatJid, id, kind);
      continue;
    }
    try {
      await withChatLock(userId, chatJid, async () => {
        const session = sessions.getSession(userId);
        if (!session || !session.isConnected()) throw new Error("__SESSION_OFFLINE__");
        if (kind === "agent") await session.performScheduledTask(chatJid, text, { taskId: id, executorIsOwner });
        else await session.send(chatJid, text);
      });
      await JobModel.updateOne({ _id: (claimed as { _id: unknown })._id }, { $set: { status: "done" } });
      emitTask("done", userId, chatJid, id, kind);
      done++;
      // Recurrence: chain the next run (min 1h — faster loops are spam, not engagement).
      if (repeatMs >= 3_600_000) {
        const nextAt = new Date(Date.now() + Math.min(repeatMs, 7 * 24 * 3_600_000));
        await JobModel.create({
          userId,
          chatJid,
          createdBy,
          createdByIsOwner: executorIsOwner,
          kind,
          text,
          runAt: nextAt,
          status: "pending",
          attempts: 0,
          lastError: "",
          repeatMs,
          repeatKey,
        });
        armTimerFor(nextAt.getTime());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const nextAttempts = attempts + 1;
      const retryAt = new Date(Date.now() + (msg === "__SESSION_OFFLINE__" ? 15_000 : backoffMs(nextAttempts)));
      if (nextAttempts >= MAX_ATTEMPTS && msg !== "__SESSION_OFFLINE__") {
        await JobModel.updateOne(
          { _id: (claimed as { _id: unknown })._id },
          { $set: { status: "failed", lastError: msg.slice(0, 500), attempts: nextAttempts } },
        );
        console.error(`Task ${id} failed permanently:`, msg);
        emitTask("failed", userId, chatJid, id, kind);
      } else {
        // Push runAt forward + arm exact timer — the retry wakes itself, no poll.
        await JobModel.updateOne(
          { _id: (claimed as { _id: unknown })._id },
          { $set: { status: "pending", lastError: msg.slice(0, 500), attempts: nextAttempts, runAt: retryAt } },
        );
        emitTask("retry", userId, chatJid, id, kind);
        armTimerFor(retryAt.getTime());
      }
    }
    if (chains.size > 5000) chains.delete(chainKey(userId, chatJid));
  }
  return done;
}

async function drainDue(): Promise<void> {
  if (!manager || draining) return;
  draining = true;
  try {
    const done = await runDueJobs(manager);
    if (done > 0) void cleanupTerminal().catch(() => {});
    // Re-arm for whatever is next (retry rows pushed forward, or future tasks).
    await rearmFromDb();
  } finally {
    draining = false;
  }
}

/** Best-effort cross-instance trigger: Mongo Change Stream on agentjobs. */
async function startWatcher(): Promise<void> {
  if (watcherStarted) return;
  watcherStarted = true;
  try {
    await ensureMongo();
    const coll = JobModel.collection;
    const stream = coll.watch([{ $match: { operationType: { $in: ["insert", "update", "replace"] } } }], {
      fullDocument: "updateLookup",
    });
    stream.on("change", (change) => {
      try {
        const doc = (change as { fullDocument?: { status?: string; runAt?: Date; userId?: string; chatJid?: string; kind?: string } }).fullDocument;
        if (!doc || doc.status !== "pending" || !doc.runAt) return;
        const t = doc.runAt instanceof Date ? doc.runAt.getTime() : new Date(doc.runAt).getTime();
        if (!Number.isFinite(t)) return;
        if (t <= Date.now() + 1000) void drainDue().catch(() => {});
        else armTimerFor(t);
      } catch {
        /* ignore malformed change */
      }
    });
    stream.on("error", () => {
      // Standalone Mongo (no replica set) has no change streams — timers +
      // in-process events already cover single-instance. Stay quiet.
    });
    console.log("Task server: change-stream watcher armed (multi-instance).");
  } catch {
    /* standalone Mongo — event + timer dispatch is sufficient */
  }
}

/** Start the event-driven dispatcher. Safe to call once at boot. No polling. */
export function startTaskServer(sessions: SessionManager): void {
  if (manager) return;
  manager = sessions;
  taskEvents.on("task", (e: { type: TaskLifecycle }) => {
    if (e?.type === "enqueued") void drainDue().catch(() => {});
  });
  setImmediate(() =>
    (async () => {
      // Stability: jobs stuck in `running` died with the last boot (crash or
      // deploy) — return them to pending so nothing is silently lost.
      try {
        await ensureMongo();
        await JobModel.updateMany(
          { status: "running" },
          { $set: { status: "pending", lastError: "recovered after restart" } },
        );
      } catch {
        /* next webhook re-arms */
      }
      // Access repair: enabled group agents imply their groups are allowed
      // (covers setups from before auto-whitelisting + hand-deleted rules).
      try {
        const { repairManagedAccess } = await import("./agent-tools/group-agent-store.js");
        const fixed = await repairManagedAccess();
        if (fixed > 0) console.log(`Task server: re-allowed ${fixed} managed group(s).`);
      } catch {
        /* next boot retries */
      }
      await rearmFromDb().catch(() => {});
    })().catch(() => {}),
  );
  void startWatcher().catch(() => {});
  console.log("Task server started (webhook/event-driven, no polling).");
}

/** Stop timer + free in-memory lock state (DB rows are durable). */
export function stopTaskServer(): void {
  if (dueTimer) clearTimeout(dueTimer);
  dueTimer = null;
  dueAtMs = null;
  manager = null;
  chains.clear();
  taskEvents.removeAllListeners("task");
}

export function taskServerStats(): { chains: number; draining: boolean; armedFor: number | null } {
  return { chains: chains.size, draining, armedFor: dueAtMs };
}
