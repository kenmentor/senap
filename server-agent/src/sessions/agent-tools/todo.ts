import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { nowIn, loadBusiness } from "./store.js";
import { ensureMongo } from "../mongo.js";
import { JobModel } from "./jobs.js";

interface ReminderRow {
  userId: string;
  /** The customer chat this reminder belongs to — strict per-customer isolation. */
  customerJid: string;
  text: string;
  dueAt: string;
  done: boolean;
  reminded: boolean;
  createdAt: Date;
}

const ReminderModel =
  mongoose.models.AgentReminder ??
  mongoose.model<ReminderRow>(
    "AgentReminder",
    new Schema<ReminderRow>(
      {
        userId: String,
        customerJid: String,
        text: String,
        dueAt: String,
        done: { type: Boolean, default: false },
        reminded: { type: Boolean, default: false },
        createdAt: { type: Date, default: () => new Date() },
      },
      { collection: "reminders" },
    ),
  );

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

export interface DueReminder {
  id: string;
  userId: string;
  text: string;
  dueAt: string;
}

/** Overdue reminders for THIS customer only. Never leaks other chats' reminders. */
export async function takeDueReminders(userId: string, customerJid: string): Promise<DueReminder[]> {
  await ensureConn();
  const now = new Date().toISOString();
  const docs = await ReminderModel.find({
    userId,
    customerJid,
    done: false,
    reminded: false,
    dueAt: { $lte: now },
  }).lean();
  if (docs.length === 0) return [];
  // Single-delivery rule: reminders now ride the durable task queue (see
  // add_reminder). Only hand-deliver here when NO queue job owns the reminder
  // (legacy rows from before the queue wiring). Otherwise just retire the row
  // — the queue delivers exactly once, on time, even if nobody writes first.
  const out: DueReminder[] = [];
  const retire: unknown[] = [];
  for (const d of docs) {
    const key = `reminder:${String(d._id)}`;
    const job = await JobModel.findOne({ repeatKey: key }).select("status").lean().catch(() => null);
    if (job && (job.status === "pending" || job.status === "running")) {
      retire.push(d._id);
      continue;
    }
    if (job && job.status === "done") {
      retire.push(d._id);
      continue;
    }
    retire.push(d._id);
    out.push({ id: String(d._id), userId: d.userId, text: d.text, dueAt: d.dueAt });
  }
  if (retire.length > 0) {
    await ReminderModel.updateMany({ _id: { $in: retire } }, { $set: { reminded: true } });
  }
  return out;
}

/** Fills the other session's todo.ts placeholder: real reminders in Mongo. */
export const todoTools: ToolDefinition[] = [
  {
    name: "add_reminder",
    description:
      "Save a reminder for the current customer, e.g. 'call the supplier tomorrow morning' or 'follow up with me on Friday'. It is delivered as a WhatsApp message exactly when due — even if nobody writes first — and shows on the dashboard until then. dueAt must be an ISO datetime string; if the customer only says 'tomorrow morning', first call get_current_time and build the ISO datetime yourself (e.g. next day 09:00 in the shop timezone).",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind about." },
        dueAt: { type: "string", description: "ISO datetime when it is due, e.g. '2026-11-13T09:00:00'." },
      },
      required: ["text", "dueAt"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureConn();
      const text = toolArgs.asString(args.text).trim();
      const dueAt = toolArgs.asString(args.dueAt).trim();
      if (!text) return { error: "Reminder text is empty." };
      const runAt = new Date(dueAt);
      if (Number.isNaN(runAt.getTime())) {
        return { error: `I could not understand the time "${dueAt}". Ask for a clearer time.` };
      }
      const doc = await ReminderModel.create({
        userId: ctx.userId,
        customerJid: ctx.customerJid,
        text,
        dueAt: runAt.toISOString(),
        done: false,
        reminded: false,
      });
      const id = String(doc._id);
      // Deliver through the durable task queue — NOT on next-message. The job
      // fires on time even if the customer never writes again, survives
      // restarts, retries when the line is offline, and shows on the
      // dashboard (same agentjobs collection as schedule_task).
      await JobModel.create({
        userId: ctx.userId,
        chatJid: ctx.customerJid,
        createdBy: ctx.customerJid,
        createdByIsOwner: ctx.isOwner,
        kind: "send",
        text: `Reminder: ${text}`.slice(0, 1000),
        runAt,
        status: "pending",
        attempts: 0,
        lastError: "",
        repeatKey: `reminder:${id}`,
      });
      try {
        const m = await import("../task-queue.js");
        m.wake();
      } catch {
        /* dispatcher re-arms on its own */
      }
      const business = await loadBusiness(ctx.userId).catch(() => null);
      const { stamp } = nowIn(business?.timezone);
      return { id, text, dueAt: runAt.toISOString(), savedAt: stamp };
    },
  },
  {
    name: "list_reminders",
    description: "List the current customer's open (not done) reminders with their ids and due times. Only ever shows this chat's reminders.",
    scope: "customer",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => {
      await ensureConn();
      const docs = await ReminderModel.find({ userId: ctx.userId, customerJid: ctx.customerJid, done: false })
        .sort({ dueAt: 1 })
        .lean();
      return {
        reminders: docs.map((d) => ({
          id: String(d._id),
          text: d.text,
          dueAt: d.dueAt,
          reminded: d.reminded,
        })),
      };
    },
  },
  {
    name: "complete_reminder",
    description: "Mark one of the current customer's reminders as done by its id (from list_reminders).",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureConn();
      const id = toolArgs.asString(args.id).trim();
      const res = await ReminderModel.updateOne(
        { _id: id, userId: ctx.userId, customerJid: ctx.customerJid },
        { $set: { done: true } },
      );
      if (res.matchedCount === 0) return { error: "Reminder not found." };
      // Stop the queued delivery too (already-sent messages can't be unsent).
      await JobModel.updateMany(
        { repeatKey: `reminder:${id}`, status: "pending" },
        { $set: { status: "failed", lastError: "reminder completed" } },
      );
      return { done: true };
    },
  },
];
