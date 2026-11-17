import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { normalizeJid, nowIn, loadBusiness } from "./store.js";
import { ensureMongo } from "../mongo.js";

export type JobKind = "send" | "agent";
export type JobStatus = "pending" | "running" | "done" | "failed";

interface JobRow {
  /** WhatsApp session id (the linked business line that runs the job). */
  userId: string;
  /** Chat the job acts in. */
  chatJid: string;
  /** Who scheduled it (for per-chat isolation of non-owners). */
  createdBy: string;
  /** Scheduler privilege at enqueue time — stops customer tasks running as owner. */
  createdByIsOwner: boolean;
  kind: JobKind;
  /** Exact message (kind=send) or instruction for the agent (kind=agent). */
  text: string;
  runAt: Date;
  /** Recurrence: when > 0 the dispatcher re-enqueues the next run this many ms later. */
  repeatMs: number;
  /** Groups a repeat chain (e.g. one group's engagement loop) for cancel/replace. */
  repeatKey: string;
  status: JobStatus;
  attempts: number;
  lastError: string;
  createdAt: Date;
}

const JobSchema = new Schema<JobRow>(
  {
    userId: String,
    chatJid: String,
    createdBy: String,
    createdByIsOwner: { type: Boolean, default: false },
    kind: String,
    text: String,
    runAt: Date,
    repeatMs: { type: Number, default: 0 },
    repeatKey: { type: String, default: "" },
    status: { type: String, default: "pending" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "agentjobs" },
);
JobSchema.index({ status: 1, runAt: 1 });
JobSchema.index({ userId: 1, status: 1, runAt: 1 });
JobSchema.index({ userId: 1, chatJid: 1, status: 1 });
JobSchema.index({ userId: 1, repeatKey: 1, status: 1 });

export const JobModel =
  mongoose.models.AgentJob ?? mongoose.model<JobRow>("AgentJob", JobSchema);

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

/** Chat a tool call acts in: explicit target or the current conversation. */
function targetChat(ctxJid: string, raw: string): string {
  const to = raw.trim();
  if (!to) return ctxJid;
  try {
    return normalizeJid(to);
  } catch {
    return to;
  }
}

/**
 * The queue: the agent pushes { runAt, details } jobs here, and the
 * background worker calls the agent back with those details when the time
 * comes — no incoming message needed to trigger it.
 */
export const jobTools: ToolDefinition[] = [
  {
    name: "schedule_task",
    description:
      "Schedule future work WITHOUT waiting for the next customer message: a follow-up, a promo blast at 9am, a stock check tonight. The job server will call the agent back with your instructions when runAt arrives. runAt must be an ISO datetime — if the customer says 'tomorrow morning', first call get_current_time and build it yourself. compose=false delivers text word-for-word; compose=true lets the agent re-check live data (prices, stock) and compose the message at run time.",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => targetChat(ctx.customerJid, toolArgs.asString(args.chatJid ?? args.to)),
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "Message to deliver, or instruction for the agent when compose=true." },
        runAt: { type: "string", description: "ISO datetime when it should run, e.g. '2026-11-15T09:00:00'." },
        chatJid: { type: "string", description: "Chat JID/phone to act in. Defaults to the current chat. Other chats: owner only." },
        compose: { type: "boolean", description: "True = agent composes fresh at run time. False = deliver task text as-is (default false)." },
      },
      required: ["task", "runAt"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureConn();
      const text = toolArgs.asString(args.task).trim().slice(0, 1000);
      const runAtRaw = toolArgs.asString(args.runAt).trim();
      const runAt = new Date(runAtRaw);
      if (!text) return { error: "Task text is empty." };
      if (Number.isNaN(runAt.getTime())) {
        return { error: `I could not understand the time "${runAtRaw}". Ask for a clearer time.` };
      }
      if (runAt.getTime() < Date.now() - 60_000) {
        return { error: "That time is in the past — pick a future time." };
      }
      const chatJid = targetChat(ctx.customerJid, toolArgs.asString(args.chatJid ?? args.to));
      const doc = await JobModel.create({
        userId: ctx.userId,
        chatJid,
        createdBy: ctx.customerJid,
        createdByIsOwner: ctx.isOwner,
        kind: toolArgs.asBoolean(args.compose, false) ? "agent" : "send",
        text,
        runAt,
        status: "pending",
        attempts: 0,
        lastError: "",
      });
      // Interrupt path: if the task is due now/imminently, wake the task
      // server so the owning session picks it up without waiting for poll.
      // Dynamic import avoids a jobs <-> task-queue import cycle.
      try {
        const m = await import("../task-queue.js");
        m.wake();
      } catch {
        /* dispatcher wakes on its own poll fallback */
      }
      const business = await loadBusiness(ctx.userId).catch(() => null);
      const { stamp } = nowIn(business?.timezone);
      return {
        id: String(doc._id),
        scheduledFor: runAt.toISOString(),
        chat: chatJid,
        kind: doc.kind,
        savedAt: stamp,
      };
    },
  },
  {
    name: "list_scheduled",
    description:
      "List pending scheduled tasks (job queue). Customers only ever see their own chat's jobs; the owner sees everything (or pass chatJid to filter).",
    scope: "owner",
    allowCurrentChat: true,
    targetOf: (args, ctx) => targetChat(ctx.customerJid, toolArgs.asString(args.chatJid ?? "")),
    parameters: {
      type: "object",
      properties: {
        chatJid: { type: "string", description: "Optional chat to filter by (owner only)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureConn();
      const filter: Record<string, unknown> = { userId: ctx.userId, status: "pending" };
      const onlyJid = toolArgs.asString(args.chatJid).trim();
      if (!ctx.isOwner) filter.chatJid = ctx.customerJid;
      else if (onlyJid) filter.chatJid = targetChat(ctx.customerJid, onlyJid);
      const docs = await JobModel.find(filter).sort({ runAt: 1 }).limit(20).lean();
      return {
        jobs: docs.map((d) => ({
          id: String(d._id),
          chat: d.chatJid,
          kind: d.kind,
          text: d.text,
          runAt: d.runAt instanceof Date ? d.runAt.toISOString() : String(d.runAt),
          ...(d.repeatMs > 0 ? { repeatsEveryHours: Math.round((d.repeatMs / 3_600_000) * 10) / 10 } : {}),
        })),
      };
    },
  },
  {
    name: "cancel_scheduled",
    description: "Cancel a pending scheduled task by its id (from list_scheduled). Customers can only cancel their own chat's jobs.",
    scope: "owner",
    allowCurrentChat: true,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Job id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureConn();
      const filter: Record<string, unknown> = {
        _id: toolArgs.asString(args.id),
        userId: ctx.userId,
        status: "pending",
      };
      if (!ctx.isOwner) {
        filter.chatJid = ctx.customerJid;
        filter.createdBy = ctx.customerJid;
      }
      const res = await JobModel.updateOne(filter, { $set: { status: "failed", lastError: "cancelled" } });
      return res.matchedCount > 0 ? { cancelled: true } : { error: "Job not found." };
    },
  },
];
