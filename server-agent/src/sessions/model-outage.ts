import { JobModel } from "./agent-tools/jobs.js";
import { loadBusiness, normalizeJid } from "./agent-tools/store.js";
import { ensureMongo } from "./mongo.js";

/**
 * Thrown when the actual AI model call fails (timeout, quota/429, bad token,
 * 5xx) as opposed to a tool or plumbing error. Callers must stay SILENT
 * toward the customer on this — no fallback bubble that could give away that
 * a model is behind the line — and surface the failure to the owner instead.
 */
export class ModelOutageError extends Error {
  shortCause: string;
  constructor(cause: unknown) {
    super("model outage");
    this.name = "ModelOutageError";
    this.shortCause = shortCause(cause);
  }
}

/** Anything thrown by the model client counts as an outage (transport/model). */
export function isModelOutage(err: unknown): boolean {
  if (err instanceof ModelOutageError) return true;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timed?\s?out|429|401|403|unauthorized|forbidden|quota|neuron|allocation|rate.?limit|overloaded|5\d\d|model|cloudflare|fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT/i.test(
    msg,
  );
}

/** One-line, owner-safe cause — never pasted into a customer chat. */
export function shortCause(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const status = (err as { status?: unknown } | null)?.status;
  const code = typeof status === "number" ? ` (HTTP ${status})` : "";
  if (/timed?\s?out/i.test(msg)) return `model timed out${code}`;
  if (/429|quota|neuron|allocation|rate.?limit/i.test(msg)) return `Cloudflare free quota exhausted${code || " (429)"}`;
  if (/401|403|unauthorized|forbidden|invalid.*(token|key)|api key/i.test(msg))
    return `Cloudflare token rejected${code || " (401/403)"}`;
  if (/5\d\d|overloaded|server error/i.test(msg)) return `model server error${code}`;
  if (/fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT/i.test(msg)) return "network error reaching model";
  return msg.slice(0, 120).trim() || "unknown model error";
}

/** Owner's private channel: verified admin line → shop phone → own chat. */
export async function resolveOwnerJid(userId: string, selfJid?: string | null): Promise<string> {
  let ownerJid = "";
  try {
    const b = await loadBusiness(userId).catch(() => null);
    if (b?.adminVerified && b?.adminPhone) {
      try {
        ownerJid = normalizeJid(b.adminPhone);
      } catch {
        /* try next */
      }
    }
    if (!ownerJid && b?.phone) {
      try {
        ownerJid = normalizeJid(b.phone);
      } catch {
        /* try next */
      }
    }
  } catch {
    /* fall through to self-chat */
  }
  if (!ownerJid && selfJid) ownerJid = selfJid;
  return ownerJid;
}

/** Repeat key scoping owner alerts per line (dedupe + dashboard feed). */
export function alertRepeatKey(userId: string, kind: string): string {
  return `${kind}:${userId}`;
}

export interface OutageAlert {
  userId: string;
  /** Chat the customer message arrived in (group or DM). */
  chatJid: string;
  /** Human label for the chat, e.g. group subject or contact name/phone. */
  chatLabel: string;
  /** Who sent the message that went unanswered (may be ""). */
  senderLabel?: string;
  /** Snippet of the unanswered customer text (may be ""). */
  customerText?: string;
  cause: unknown;
  /** Own JID string for self-chat fallback (owner DM of last resort). */
  selfJid?: string | null;
}

/**
 * File one owner-visible alert and stay quiet everywhere else:
 * - Creates a `send`-kind job to the OWNER's private chat (never the group,
 *   never the customer) — it shows up in the dashboard "Lined up" feed and
 *   lands on the owner's WhatsApp even while the model is down.
 * - Dedupes: at most one alert row per line per 6h, so a quota outage during
 *   a busy hour doesn't spam the owner or the feed.
 * - Returns the job id, or null when there is nowhere to send / DB is down.
 */
export async function reportModelOutage(alert: OutageAlert): Promise<string | null> {
  const { userId, chatJid } = alert;
  if (!userId) return null;
  try {
    await ensureMongo();
  } catch {
    return null;
  }
  // Storm guard: one alert per line per 6h is enough for the owner to act.
  try {
    const recent = await JobModel.findOne({
      userId,
      repeatKey: alertRepeatKey(userId, "model-outage"),
      createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60_000) },
    })
      .select("_id")
      .lean();
    if (recent) return String((recent as { _id?: unknown })._id ?? "");
  } catch {
    /* dedupe best-effort — still file the alert */
  }
  // Owner's private channel: verified admin line → shop phone → own chat.
  const ownerJid = await resolveOwnerJid(userId, alert.selfJid);
  if (!ownerJid) {
    console.error(`[model-outage] line ${userId}: no owner channel, alert dropped (chat ${chatJid})`);
    return null;
  }
  const snippet = (alert.customerText ?? "").trim().slice(0, 140);
  const who = (alert.senderLabel ?? "").trim().slice(0, 40);
  const where = (alert.chatLabel ?? "").trim().slice(0, 60) || chatJid.split("@")[0];
  const text =
    `[agent] \u26A0\uFE0F Model outage \u2014 stayed quiet in "${where}"` +
    (who || snippet ? ` (${[who, snippet ? `"${snippet}"` : ""].filter(Boolean).join(": ")})` : "") +
    `. Cause: ${shortCause(alert.cause)}. Fix: check Cloudflare plan/token (npm run test:cloudflare). ` +
    `The customer got no reply \u2014 follow up by hand.`;
  try {
    const { enqueueTask } = await import("./task-queue.js");
    const id = await enqueueTask({
      userId,
      chatJid: ownerJid,
      createdBy: ownerJid,
      createdByIsOwner: true,
      kind: "send",
      text: text.slice(0, 1000),
      runAt: new Date(),
    });
    // Tag the chain so the dashboard feed + dedupe can find it.
    await JobModel.updateOne({ _id: id }, { $set: { repeatKey: alertRepeatKey(userId, "model-outage") } }).catch(() => {});
    try {
      const m = await import("./task-queue.js");
      m.wake();
    } catch {
      /* dispatcher re-arms on its own */
    }
    console.error(`[model-outage] line ${userId}: alert filed (${id}) for chat ${chatJid}`);
    return id;
  } catch (e) {
    console.error(`[model-outage] line ${userId}: could not file alert:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Duplicate-client fight: another WhatsApp client keeps taking over this
 * line (dev server + production running at once, or a second hosted copy).
 * Each takeover looks like automation from WhatsApp's side and both sides
 * burn reconnect storms — tell the owner once a day until it stops.
 */
export async function reportSessionConflict(userId: string, selfJid?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    await ensureMongo();
  } catch {
    return null;
  }
  try {
    const recent = await JobModel.findOne({
      userId,
      repeatKey: alertRepeatKey(userId, "session-conflict"),
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60_000) },
    })
      .select("_id")
      .lean();
    if (recent) return String((recent as { _id?: unknown })._id ?? "");
  } catch {
    /* dedupe best-effort */
  }
  const ownerJid = await resolveOwnerJid(userId, selfJid);
  if (!ownerJid) {
    console.error(`[session-conflict] line ${userId}: no owner channel, alert dropped`);
    return null;
  }
  const text =
    `[agent] \u26A0\uFE0F Two agents are fighting over this line \u2014 another WhatsApp client keeps taking over the connection ` +
    `(often a dev server left running alongside production, or two hosted copies). ` +
    `While they fight, replies stall and the number looks automated to WhatsApp \u2014 shut one copy down.`;
  try {
    const { enqueueTask } = await import("./task-queue.js");
    const id = await enqueueTask({
      userId,
      chatJid: ownerJid,
      createdBy: ownerJid,
      createdByIsOwner: true,
      kind: "send",
      text: text.slice(0, 1000),
      runAt: new Date(),
    });
    await JobModel.updateOne({ _id: id }, { $set: { repeatKey: alertRepeatKey(userId, "session-conflict") } }).catch(() => {});
    try {
      const m = await import("./task-queue.js");
      m.wake();
    } catch {
      /* dispatcher re-arms on its own */
    }
    console.error(`[session-conflict] line ${userId}: alert filed (${id})`);
    return id;
  } catch (e) {
    console.error(`[session-conflict] line ${userId}: could not file alert:`, e instanceof Error ? e.message : e);
    return null;
  }
}
