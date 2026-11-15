import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { nowIn, loadBusiness } from "./store.js";
import { ensureMongo } from "../mongo.js";

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
  const ids = docs.map((d) => d._id);
  await ReminderModel.updateMany({ _id: { $in: ids } }, { $set: { reminded: true } });
  return docs.map((d) => ({ id: String(d._id), userId: d.userId, text: d.text, dueAt: d.dueAt }));
}

/** Fills the other session's todo.ts placeholder: real reminders in Mongo. */
export const todoTools: ToolDefinition[] = [
  {
    name: "add_reminder",
    description:
      "Save a reminder for the current customer, e.g. 'call the supplier tomorrow morning' or 'follow up with me on Friday'. It is delivered as a WhatsApp message once due. dueAt must be an ISO datetime string; if the customer only says 'tomorrow morning', first call get_current_time and build the ISO datetime yourself (e.g. next day 09:00 in the shop timezone).",
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
      if (Number.isNaN(Date.parse(dueAt))) {
        return { error: `I could not understand the time "${dueAt}". Ask for a clearer time.` };
      }
      const doc = await ReminderModel.create({
        userId: ctx.userId,
        customerJid: ctx.customerJid,
        text,
        dueAt,
        done: false,
        reminded: false,
      });
      const business = await loadBusiness().catch(() => null);
      const { stamp } = nowIn(business?.timezone);
      return { id: String(doc._id), text, dueAt, savedAt: stamp };
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
      const res = await ReminderModel.updateOne(
        { _id: toolArgs.asString(args.id), userId: ctx.userId, customerJid: ctx.customerJid },
        { $set: { done: true } },
      );
      return res.matchedCount > 0 ? { done: true } : { error: "Reminder not found." };
    },
  },
];
