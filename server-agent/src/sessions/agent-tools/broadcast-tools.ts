import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid, lineAgeDays } from "./store.js";
import { ensureMongo } from "../mongo.js";
import { isChatAllowed, isWhitelisted } from "../chat-access.js";
import { countMessages } from "../chat-memory.js";
import { JobModel } from "./jobs.js";

const MAX_RECIPIENTS = 50;
const MAX_TEXT = 1000;
const MIN_STAGGER_SEC = 20;
const MAX_STAGGER_SEC = 300;
const DEFAULT_STAGGER_SEC = 45;
// WhatsApp guideline guardrail: cap bulk sends per account per day (env-tunable).
// Keeps a new/warm number far from spam thresholds; split bigger campaigns across days.
export const DAILY_BULK_CAP = Math.max(1, Number(process.env.BROADCAST_DAILY_CAP ?? 250) || 250);
// Warm-up: a freshly linked line blasts nothing big. Under 7 days old the
// daily bulk cap drops to 50 — the #1 rookie ban pattern is a new number
// going full-send on day one.
const WARMUP_DAYS = 7;
const WARMUP_DAILY_CAP = 50;
const STOP_FOOTER = "\n\nReply STOP to opt out.";

export interface StaggeredRecipient {
  /** Destination JID (already normalized). */
  jid: string;
  /** Full message body for THIS recipient (personalized text allowed). */
  text: string;
}

export interface StaggeredResult {
  queued: number;
  queuedJids: string[];
  skippedBlocked: number;
  /** Cold numbers: never messaged you and never whitelisted — dropped, not queued. */
  skippedUnknown: number;
  /** Garbage numbers that couldn't even be normalized to a JID (execute path only). */
  skippedInvalid?: number;
  deferredForCap: number;
  dailyCap: number;
  /** True when the new-line warm-up cap (not the daily cap) applied. */
  warmupCapped: boolean;
  staggerSec: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Shared ban-safe bulk engine: block-list respect, STOP footer, daily cap,
 * staggered durable queue, immediate wake. Used by send_broadcast (one text
 * for all) and the campaign planner (personalized text per recipient).
 */
export async function queueStaggeredSends(opts: {
  userId: string;
  createdBy: string;
  recipients: StaggeredRecipient[];
  staggerSec?: number;
  /** Groups this batch so it can be tracked/cancelled together (e.g. campaign:<id>). */
  batchKey?: string;
}): Promise<StaggeredResult> {
  await ensureMongo();
  const staggerSec = Math.min(
    MAX_STAGGER_SEC,
    Math.max(MIN_STAGGER_SEC, Math.round(opts.staggerSec ?? DEFAULT_STAGGER_SEC)),
  );
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const sentToday = await JobModel.countDocuments({
    userId: opts.userId,
    kind: "send",
    createdAt: { $gte: dayStart },
  }).catch(() => 0);
  // Warm-up cap for young lines (unknown age = mature — never throttle a
  // live line because of a DB blip).
  const age = await lineAgeDays(opts.userId).catch(() => null);
  const warmup = age !== null && age < WARMUP_DAYS;
  const cap = warmup ? Math.min(DAILY_BULK_CAP, WARMUP_DAILY_CAP) : DAILY_BULK_CAP;
  const empty: StaggeredResult = {
    queued: 0,
    queuedJids: [],
    skippedBlocked: 0,
    skippedUnknown: 0,
    skippedInvalid: 0,
    deferredForCap: opts.recipients.length,
    dailyCap: cap,
    warmupCapped: warmup,
    staggerSec,
    firstAt: new Date().toISOString(),
    lastAt: new Date().toISOString(),
  };
  if (sentToday >= cap) return empty;
  const room = Math.max(0, cap - sentToday);
  const capped = opts.recipients.slice(0, room);
  const deferred = opts.recipients.length - capped.length;
  let skippedBlocked = 0;
  let skippedUnknown = 0;
  const queuedJids: string[] = [];
  const now = Date.now();
  for (let i = 0; i < capped.length; i++) {
    const { jid, text } = capped[i];
    // Respect the dashboard block list — never message someone blocked.
    if (!(await isChatAllowed(opts.userId, jid))) {
      skippedBlocked++;
      continue;
    }
    // No cold blasts, ever: a 1:1 number the line has never heard from and
    // the owner never whitelisted is a stranger — messaging first is the
    // most-reported path to restrictions. Groups pass (membership implies
    // presence); the fix is one tap on the Link page or one inbound message.
    const isGroup = jid.endsWith("@g.us");
    if (!isGroup) {
      const inbound = await countMessages(opts.userId, jid, "user", new Date(0)).catch(() => -1);
      if (inbound === 0 && !(await isWhitelisted(opts.userId, jid).catch(() => false))) {
        skippedUnknown++;
        continue;
      }
    }
    const body = /Reply STOP to opt out/i.test(text) ? text : `${text}${STOP_FOOTER}`;
    await JobModel.create({
      userId: opts.userId,
      chatJid: jid,
      createdBy: opts.createdBy,
      createdByIsOwner: true,
      kind: "send",
      text: body,
      runAt: new Date(now + i * staggerSec * 1000),
      status: "pending",
      attempts: 0,
      lastError: "",
      repeatKey: opts.batchKey ?? "",
    });
    queuedJids.push(jid);
  }
  // Event-interrupt: first (due-now) sends dispatch immediately, the rest
  // fire on their exact timers — no polling.
  try {
    const m = await import("../task-queue.js");
    m.wake();
  } catch {
    /* dispatcher re-arms on its own */
  }
  const firstAt = new Date(now).toISOString();
  const lastAt = new Date(now + Math.max(0, queuedJids.length - 1) * staggerSec * 1000).toISOString();
  return {
    queued: queuedJids.length,
    queuedJids,
    skippedBlocked,
    skippedUnknown,
    deferredForCap: deferred,
    dailyCap: cap,
    warmupCapped: warmup,
    staggerSec,
    firstAt,
    lastAt,
  };
}

/**
 * WhatsApp-native broadcast, owner only.
 *
 * True broadcast lists have no stable Baileys API, so this does what a native
 * broadcast does on the wire: ONE private message per recipient (replies come
 * back privately, nobody sees anyone else). Sends are staggered through the
 * durable task queue — ban-safe pacing, survives restarts, never blocks the
 * agent loop past the 12s tool budget.
 */
export const broadcastTools: ToolDefinition[] = [
  {
    name: "send_broadcast",
    description:
      "OWNER ONLY. WhatsApp-native broadcast: send one private message to many customers (replies arrive privately, like a broadcast list). Delivery is staggered automatically (ban-safe pacing) through the task queue — use this for promos, restock alerts, price drops. NEVER loop send_whatsapp_message for bulk sends. Text only, max 50 recipients per call, daily account cap applies; split bigger campaigns across days. RULES: only message customers who know the shop (recent chats / opt-in) — WhatsApp only delivers broadcasts to people who saved the number, and spam reports get numbers banned. Every broadcast carries a STOP opt-out line; STOP/START requests are honored automatically.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Broadcast message text (max 1000 chars)." },
        to: {
          type: "array",
          items: { type: "string" },
          description:
            "Explicit recipients: phone numbers or JIDs (1-50) who know the shop — anyone the line never heard from and you never whitelisted is skipped to protect the number. Omit when audience='active'.",
        },
        audience: {
          type: "string",
          description:
            "How to pick recipients: 'listed' (default, use `to`) or 'active' (up to 50 most-recent chats seen since boot).",
        },
        staggerSec: {
          type: "number",
          description: `Seconds between deliveries, ${MIN_STAGGER_SEC}-${MAX_STAGGER_SEC} (default ${DEFAULT_STAGGER_SEC}). Slower = safer from bans.`,
        },
        tag: { type: "string", description: "Optional label for this blast (e.g. 'sallah-promo')." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const text = toolArgs.asString(args.text).trim().slice(0, MAX_TEXT);
      if (!text) return { error: "Broadcast text is empty." };
      const audience = toolArgs.asString(args.audience, "listed").trim().toLowerCase();
      const staggerSec = toolArgs.asNumber(args.staggerSec, DEFAULT_STAGGER_SEC);
      const tag = toolArgs.asString(args.tag).trim().slice(0, 60);

      // Resolve recipients.
      let raw: string[] = [];
      if (audience === "active") {
        // Most-recent chats first (needs the owner's full session view).
        const rows = [...ctx.messageLog.entries()]
          .filter(([jid]) => jid !== "status@broadcast")
          .map(([jid, log]) => ({ jid, ts: log.length > 0 ? log[log.length - 1].ts : 0 }))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, MAX_RECIPIENTS)
          .map((r) => r.jid);
        raw = rows;
      } else {
        raw = toolArgs.asStringArray(args.to);
      }
      if (raw.length === 0) {
        return {
          error:
            audience === "active"
              ? "No recent chats found to broadcast to."
              : "Pass 1-50 recipients in `to`, or set audience='active'.",
        };
      }

      // Normalize, dedupe, exclude self + status. Unparseable entries are
      // counted (not silently dropped) so the owner knows what didn't go.
      const selfJid = ctx.sock?.user?.id ?? "";
      const seen = new Set<string>();
      let skippedInvalid = 0;
      const withTag = tag ? `[${tag}] ${text}` : text;
      const recipients: StaggeredRecipient[] = [];
      for (const r of raw) {
        let jid: string;
        try {
          jid = normalizeJid(r);
        } catch {
          skippedInvalid++;
          continue;
        }
        if (jid === selfJid || jid === "status@broadcast" || seen.has(jid)) continue;
        seen.add(jid);
        recipients.push({ jid, text: withTag });
        if (recipients.length >= MAX_RECIPIENTS) break;
      }
      if (recipients.length === 0) {
        return {
          error: skippedInvalid > 0
            ? `${skippedInvalid} entr${skippedInvalid === 1 ? "y" : "ies"} couldn't be read as a phone number or contact — nothing valid to send to.`
            : "No valid recipients after cleanup.",
          ...(skippedInvalid > 0 ? { skippedInvalid } : {}),
        };
      }

      const res = await queueStaggeredSends({
        userId: ctx.userId,
        createdBy: ctx.customerJid,
        recipients,
        staggerSec,
      });
      if (res.queued === 0) {
        if (res.skippedUnknown >= recipients.length) {
          return {
            error: `All ${recipients.length} recipient(s) never messaged this line and aren't whitelisted — cold first messages are the fastest route to a restriction. Ask them to message you first, or whitelist them on the Link page, then retry.`,
            skippedUnknown: res.skippedUnknown,
          };
        }
        if (res.deferredForCap >= recipients.length) {
          return { error: `Daily broadcast cap reached (${res.dailyCap}/day${res.warmupCapped ? " — new-line warm-up cap" : ""}). Split the rest across days — this pacing keeps the number safe from bans.` };
        }
        return { error: `All ${recipients.length} recipient(s) are blocked — nothing queued.`, skippedBlocked: res.skippedBlocked };
      }
      return {
        queued: res.queued,
        skippedBlocked: res.skippedBlocked,
        skippedUnknown: res.skippedUnknown,
        ...(skippedInvalid > 0 ? { skippedInvalid } : {}),
        deferredForCap: res.deferredForCap,
        dailyCap: res.dailyCap,
        ...(res.warmupCapped ? { warmupCapped: true as const } : {}),
        staggerSec: res.staggerSec,
        firstAt: res.firstAt,
        lastAt: res.lastAt,
        note: `Staggered privately like a native broadcast — last delivery ${res.lastAt}. Track/cancel in list_scheduled.${res.deferredForCap > 0 ? ` ${res.deferredForCap} recipient(s) held for tomorrow by the daily cap.` : ""}${res.skippedUnknown > 0 ? ` ${res.skippedUnknown} stranger(s) skipped (never messaged you — whitelist or wait for inbound first).` : ""}${skippedInvalid > 0 ? ` ${skippedInvalid} unreadable number(s) ignored.` : ""}`,
      };
    },
  },
];
