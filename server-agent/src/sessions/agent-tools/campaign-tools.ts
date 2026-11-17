import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { findProductByIdOrSku, normalizeJid } from "./store.js";
import { ensureMongo } from "../mongo.js";
import { queueStaggeredSends } from "./broadcast-tools.js";

const MAX_AUDIENCE = 30;
const MAX_ENTRIES = 15;
const MAX_MESSAGE = 1000;

interface CampaignEntry {
  jid: string;
  name: string;
  productId: string;
  productName: string;
  price: number;
  reason: string;
  message: string;
}

interface CampaignRow {
  userId: string;
  goal: string;
  status: "draft" | "done" | "cancelled";
  entries: CampaignEntry[];
  createdAt: Date;
}

const CampaignSchema = new Schema<CampaignRow>(
  {
    userId: String,
    goal: String,
    status: { type: String, default: "draft" },
    entries: [
      {
        jid: String,
        name: String,
        productId: String,
        productName: String,
        price: Number,
        reason: String,
        message: String,
      },
    ],
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "campaigns" },
);

const CampaignModel =
  mongoose.models.Campaign ?? mongoose.model<CampaignRow>("Campaign", CampaignSchema);

function entryPreview(m: { text: string; fromMe: boolean }): string {
  const t = m.text.length > 150 ? `${m.text.slice(0, 150)}…` : m.text;
  return `${m.fromMe ? "out" : "in"}: ${t}`;
}

export const campaignTools: ToolDefinition[] = [
  {
    name: "analyze_audience",
    description:
      "OWNER ONLY. Look at every customer chat on this account and summarize buying signals: recent questions, topics, what was already pitched, last active. This is step 1 of any personalized outreach mission ('recommend products my customers might like'). Returns compact per-customer signals — reason over them, then build the plan with plan_campaign.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max customers to profile (1-30, default 20). Most-recently-active first." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const limit = Math.min(Math.max(toolArgs.asNumber(args.limit, 20), 1), MAX_AUDIENCE);
      const rows = [...ctx.messageLog.entries()]
        .filter(([jid]) => jid !== "status@broadcast" && !jid.endsWith("@g.us") && !jid.endsWith("@newsletter"))
        .map(([jid, log]) => ({ jid, log, ts: log.length > 0 ? log[log.length - 1].ts : 0 }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);
      const customers = rows.map(({ jid, log }) => {
        const incoming = log.filter((m) => !m.fromMe);
        const shown = [...new Set(
          log.filter((m) => m.fromMe && m.text.startsWith("[photo]")).map((m) => m.text.replace(/^\[photo\]\s*/, "").slice(0, 80)),
        )].slice(0, 5);
        return {
          jid,
          name: ctx.contacts.get(jid)?.name ?? "unknown",
          lastActive: log.length > 0 ? new Date(log[log.length - 1].ts).toISOString() : null,
          messageCount: log.length,
          recentQuestions: incoming.slice(-5).map(entryPreview),
          alreadyPitched: shown,
        };
      });
      return {
        customers,
        count: customers.length,
        note: "Reason customer-by-customer: match their questions to catalog products with search_products, draft ONE personal message each, then save with plan_campaign (max 15 entries per call).",
      };
    },
  },
  {
    name: "plan_campaign",
    description:
      "OWNER ONLY. Save a personalized outreach plan as a DRAFT (nothing sends yet). Step 2 after analyze_audience: one entry per customer with the product you matched and the personal message you drafted for THEM (use their name, reference what they asked about, dealer tone). Present the plan to the owner and run execute_campaign only on explicit go-ahead. Max 15 entries per call — split bigger audiences across calls.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What this campaign is for, e.g. 'personalized new-arrival picks'." },
        entries: {
          type: "array",
          description: "One entry per customer (max 15).",
          items: {
            type: "object",
            properties: {
              jid: { type: "string", description: "Customer JID from analyze_audience." },
              productId: { type: "string", description: "Product id or SKU from search_products." },
              reason: { type: "string", description: "Why THIS product for THIS person (1 line)." },
              message: { type: "string", description: "The personal message to send them (max 1000 chars)." },
            },
            required: ["jid", "reason", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["goal", "entries"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const goal = toolArgs.asString(args.goal).trim().slice(0, 200) || "personalized picks";
      const raw = toolArgs.asArray(args.entries).slice(0, MAX_ENTRIES);
      if (raw.length === 0) return { error: "No entries given." };
      const entries: CampaignEntry[] = [];
      const skipped: { jid: string; why: string }[] = [];
      const seen = new Set<string>();
      for (const r of raw) {
        const rec = toolArgs.asRecord(r);
        let jid = toolArgs.asString(rec.jid).trim();
        if (!jid) {
          skipped.push({ jid: "", why: "missing JID" });
          continue;
        }
        try {
          jid = normalizeJid(jid);
        } catch {
          skipped.push({ jid, why: "bad JID/phone" });
          continue;
        }
        if (jid.endsWith("@g.us") || seen.has(jid)) {
          skipped.push({ jid, why: jid.endsWith("@g.us") ? "groups excluded — personal pitches go to DMs" : "duplicate" });
          continue;
        }
        seen.add(jid);
        const message = toolArgs.asString(rec.message).trim().slice(0, MAX_MESSAGE);
        if (!message) {
          skipped.push({ jid, why: "empty message" });
          continue;
        }
        let productId = "";
        let productName = "";
        let price = 0;
        const pidRaw = toolArgs.asString(rec.productId).trim();
        if (pidRaw) {
          const p = await findProductByIdOrSku(pidRaw, ctx.userId).catch(() => null);
          if (!p) {
            skipped.push({ jid, why: `product "${pidRaw}" not found` });
            continue;
          }
          if (p.quantity <= 0) {
            skipped.push({ jid, why: `"${p.name}" is out of stock` });
            continue;
          }
          productId = p.id;
          productName = p.name;
          price = p.unitPrice;
        }
        entries.push({
          jid,
          name: ctx.contacts.get(jid)?.name ?? "unknown",
          productId,
          productName,
          price,
          reason: toolArgs.asString(rec.reason).trim().slice(0, 200),
          message,
        });
      }
      if (entries.length === 0) return { error: "No valid entries.", skipped };
      const doc = await CampaignModel.create({
        userId: ctx.userId,
        goal,
        status: "draft",
        entries,
      });
      return {
        campaignId: String(doc._id),
        goal,
        planned: entries.length,
        skipped,
        entries: entries.map((e) => ({ to: e.name, product: e.productName || "(no product)", reason: e.reason, message: e.message })),
        note: "DRAFT saved — nothing sent. Show this plan to the owner and run execute_campaign only on explicit go-ahead.",
      };
    },
  },
  {
    name: "execute_campaign",
    description:
      "OWNER ONLY. Send an approved campaign draft (from plan_campaign). Delivers each personal message privately, staggered ban-safe through the task queue with STOP opt-out and block-list respect. Run ONLY after the owner explicitly approved the plan.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Campaign id from plan_campaign." },
        staggerSec: { type: "number", description: "Seconds between deliveries (default 45, slower is safer)." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const id = toolArgs.asString(args.id).trim();
      const doc = await CampaignModel.findOne({ _id: id, userId: ctx.userId }).lean();
      if (!doc) return { error: "Campaign not found." };
      if (doc.status !== "draft") return { error: `Campaign is already ${doc.status} — nothing to send.` };
      if (doc.entries.length === 0) return { error: "Campaign has no entries." };
      const res = await queueStaggeredSends({
        userId: ctx.userId,
        createdBy: ctx.customerJid,
        recipients: doc.entries.map((e: CampaignEntry) => ({ jid: e.jid, text: e.message })),
        staggerSec: toolArgs.asNumber(args.staggerSec, 45),
        batchKey: `campaign:${id}`,
      });
      if (res.queued === 0) {
        return { error: "Nothing queued (daily cap reached or all recipients blocked).", skippedBlocked: res.skippedBlocked, deferredForCap: res.deferredForCap };
      }
      await CampaignModel.updateOne({ _id: doc._id }, { $set: { status: "done" } });
      const byJid = new Map<string, CampaignEntry>(doc.entries.map((e: CampaignEntry) => [e.jid, e]));
      return {
        campaignId: id,
        queued: res.queued,
        skippedBlocked: res.skippedBlocked,
        deferredForCap: res.deferredForCap,
        lastAt: res.lastAt,
        deliveries: res.queuedJids.map((jid, i) => {
          const e = byJid.get(jid);
          return { to: e?.name ?? jid, product: e?.productName || "(no product)", scheduledFor: new Date(Date.now() + i * res.staggerSec * 1000).toISOString() };
        }),
        note: `Personal messages sending staggered — last lands ${res.lastAt}. Track/cancel in list_scheduled.${res.deferredForCap > 0 ? ` ${res.deferredForCap} held for tomorrow by the daily cap.` : ""}`,
      };
    },
  },
  {
    name: "cancel_campaign",
    description:
      "OWNER ONLY. Cancel a campaign draft, or stop a sent campaign's still-pending deliveries (already-delivered messages cannot be unsent).",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Campaign id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const id = toolArgs.asString(args.id).trim();
      const doc = await CampaignModel.findOne({ _id: id, userId: ctx.userId });
      if (!doc) return { error: "Campaign not found." };
      if (doc.status === "draft") {
        doc.status = "cancelled";
        await doc.save();
        return { cancelled: true, note: "Draft discarded — nothing was ever sent." };
      }
      const { JobModel } = await import("./jobs.js");
      const res = await JobModel.updateMany(
        { repeatKey: `campaign:${id}`, status: "pending" },
        { $set: { status: "failed", lastError: "campaign cancelled" } },
      );
      doc.status = "cancelled";
      await doc.save();
      return { cancelled: true, stoppedPending: res.modifiedCount ?? 0 };
    },
  },
];
