import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid } from "./store.js";
import { ensureMongo } from "../mongo.js";
import { isChatAllowed } from "../chat-access.js";
import { JobModel } from "./jobs.js";

const MAX_RECIPIENTS = 50;
const MAX_TEXT = 1000;
const MIN_STAGGER_SEC = 20;
const MAX_STAGGER_SEC = 300;
const DEFAULT_STAGGER_SEC = 45;
// WhatsApp guideline guardrail: cap bulk sends per account per day (env-tunable).
// Keeps a new/warm number far from spam thresholds; split bigger campaigns across days.
const DAILY_CAP = Math.max(1, Number(process.env.BROADCAST_DAILY_CAP ?? 250) || 250);
const STOP_FOOTER = "\n\nReply STOP to opt out.";

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
            "Explicit recipients: phone numbers or JIDs (1-50). Omit when audience='active'.",
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
      const staggerSec = Math.min(
        MAX_STAGGER_SEC,
        Math.max(MIN_STAGGER_SEC, Math.round(toolArgs.asNumber(args.staggerSec, DEFAULT_STAGGER_SEC))),
      );
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

      // Normalize, dedupe, exclude self + blocked chats.
      const selfJid = ctx.sock?.user?.id ?? "";
      const seen = new Set<string>();
      const targets: string[] = [];
      for (const r of raw) {
        let jid: string;
        try {
          jid = normalizeJid(r);
        } catch {
          continue;
        }
        if (jid === selfJid || jid === "status@broadcast" || seen.has(jid)) continue;
        seen.add(jid);
        targets.push(jid);
        if (targets.length >= MAX_RECIPIENTS) break;
      }
      if (targets.length === 0) return { error: "No valid recipients after cleanup." };

      // Daily account guardrail: count today's bulk sends for this session.
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const sentToday = await JobModel.countDocuments({
        userId: ctx.userId,
        kind: "send",
        createdAt: { $gte: dayStart },
      }).catch(() => 0);
      if (sentToday >= DAILY_CAP) {
        return {
          error: `Daily broadcast cap reached (${sentToday}/${DAILY_CAP} sends today). Split the rest across days — this pacing keeps the number safe from bans.`,
        };
      }
      const room = Math.min(targets.length, Math.max(0, DAILY_CAP - sentToday));
      if (room <= 0) {
        return { error: `Daily broadcast cap reached (${DAILY_CAP}/day). Try again tomorrow.` };
      }
      const capped = targets.slice(0, room);
      const deferred = targets.length - capped.length;

      let skippedBlocked = 0;
      const queued: string[] = [];
      const now = Date.now();
      for (let i = 0; i < capped.length; i++) {
        const jid = capped[i];
        // Respect the dashboard block list — never blast someone blocked.
        if (!(await isChatAllowed(ctx.userId, jid))) {
          skippedBlocked++;
          continue;
        }
        // Guideline compliance: every blast carries an opt-out line (unless the
        // owner already wrote their own STOP wording).
        const withTag = tag ? `[${tag}] ${text}` : text;
        const body = /stop/i.test(withTag) ? withTag : `${withTag}${STOP_FOOTER}`;
        await JobModel.create({
          userId: ctx.userId,
          chatJid: jid,
          createdBy: ctx.customerJid,
          createdByIsOwner: true,
          kind: "send",
          text: body,
          runAt: new Date(now + i * staggerSec * 1000),
          status: "pending",
          attempts: 0,
          lastError: "",
        });
        queued.push(jid);
      }

      // Event-interrupt: first (due-now) sends dispatch immediately, the rest
      // fire on their exact timers — no polling.
      try {
        const m = await import("../task-queue.js");
        m.wake();
      } catch {
        /* dispatcher re-arms on its own */
      }

      if (queued.length === 0) {
        return { error: `All ${capped.length} recipient(s) are blocked — nothing queued.`, skippedBlocked };
      }
      const firstAt = new Date(now).toISOString();
      const lastAt = new Date(now + (queued.length - 1) * staggerSec * 1000).toISOString();
      return {
        queued: queued.length,
        skippedBlocked,
        deferredForCap: deferred,
        dailyCap: DAILY_CAP,
        staggerSec,
        firstAt,
        lastAt,
        note: `Staggered privately like a native broadcast — last delivery ${lastAt}. Track/cancel in list_scheduled.${deferred > 0 ? ` ${deferred} recipient(s) held for tomorrow by the daily cap.` : ""}`,
      };
    },
  },
];
