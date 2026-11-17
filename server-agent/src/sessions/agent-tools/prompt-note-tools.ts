import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { ensureMongo } from "../mongo.js";

interface PromptNoteRow {
  userId: string;
  /** "chat" = this person/group only, "house" = every chat on the line. */
  scope: string;
  chatJid: string;
  note: string;
  updatedAt: Date;
}

const PromptNoteSchema = new Schema<PromptNoteRow>(
  {
    userId: String,
    scope: String,
    chatJid: String,
    note: String,
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "promptnotes" },
);
PromptNoteSchema.index({ userId: 1, scope: 1, chatJid: 1 });

const PromptNoteModel =
  mongoose.models.PromptNote ?? mongoose.model<PromptNoteRow>("PromptNote", PromptNoteSchema);

const MAX_NOTES = 5;
const MAX_LEN = 300;

/** Keep the newest N notes per bucket, drop the oldest beyond that. */
async function addNote(userId: string, scope: "chat" | "house", chatJid: string, note: string): Promise<void> {
  await ensureMongo();
  await PromptNoteModel.create({ userId, scope, chatJid, note, updatedAt: new Date() });
  const extras = await PromptNoteModel.find({ userId, scope, chatJid })
    .sort({ updatedAt: -1 })
    .skip(MAX_NOTES)
    .select("_id")
    .lean();
  if (extras.length > 0) {
    await PromptNoteModel.deleteMany({ _id: { $in: extras.map((e) => e._id) } });
  }
}

/**
 * Durable per-chat + house manner notes, loaded into the system prompt on
 * every reply. Chat notes win over house notes; both ride as trusted
 * system context alongside the voice mirror.
 */
export async function getPromptNotesBlock(userId: string, chatJid: string): Promise<string | null> {
  try {
    await ensureMongo();
    const [house, chat] = await Promise.all([
      PromptNoteModel.find({ userId, scope: "house" }).sort({ updatedAt: 1 }).lean().catch(() => []),
      PromptNoteModel.find({ userId, scope: "chat", chatJid }).sort({ updatedAt: 1 }).lean().catch(() => []),
    ]);
    const parts: string[] = [];
    if (house.length > 0) {
      parts.push(`House manner (applies everywhere on this line): ${house.map((h) => h.note).join(" / ")}`);
    }
    if (chat.length > 0) {
      parts.push(`Standing instructions for THIS chat (override everything above for this person/group): ${chat.map((c) => c.note).join(" / ")}`);
    }
    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}

/**
 * The prompt-mutation tools: durable preferences about HOW the assistant talks
 * — per person/group (this chat) or line-wide (owner). The model calls these
 * the moment a human states a lasting preference, and the notes ride every
 * future reply in that scope automatically.
 */
export const promptNoteTools: ToolDefinition[] = [
  {
    name: "remember_style",
    description:
      "Save a DURABLE speaking preference for THIS chat only (the current person or group) — e.g. 'always call me Chief', 'no emojis with me', 'keep it short here', 'speak Yoruba with me'. Call it the moment someone states a lasting preference about how you talk to them, so every future reply here obeys it. Current-chat only; use remember_house_style for line-wide rules.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "The preference in plain words, max 300 chars." },
      },
      required: ["note"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const note = toolArgs.asString(args.note).trim().slice(0, MAX_LEN);
      if (!note) return { error: "Empty note." };
      await addNote(ctx.userId, "chat", ctx.customerJid, note);
      return { remembered: true, scope: "this chat" };
    },
  },
  {
    name: "remember_house_style",
    description:
      "OWNER ONLY. Save a line-wide manner rule that applies in EVERY chat — e.g. 'always confirm price before orders', 'never mention promos on Sundays'. Use sparingly for owner-taught house rules; personal quirks belong in remember_style instead.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "The house rule in plain words, max 300 chars." },
      },
      required: ["note"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const note = toolArgs.asString(args.note).trim().slice(0, MAX_LEN);
      if (!note) return { error: "Empty note." };
      await addNote(ctx.userId, "house", "", note);
      return { remembered: true, scope: "every chat on this line" };
    },
  },
  {
    name: "forget_style",
    description:
      "Clear saved speaking preferences. No args = forget everything you were told about THIS chat. Owner only: pass house=true to also clear the line-wide house rules.",
    scope: "customer",
    parameters: {
      type: "object",
      properties: {
        house: { type: "boolean", description: "Owner only: also clear line-wide house rules." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const house = toolArgs.asBoolean(args.house, false);
      if (house && !ctx.isOwner) return { error: "Only the owner can clear house rules." };
      const filter: Record<string, unknown> = house
        ? { userId: ctx.userId, scope: "house" }
        : { userId: ctx.userId, scope: "chat", chatJid: ctx.customerJid };
      const res = await PromptNoteModel.deleteMany(filter);
      return { forgotten: res.deletedCount ?? 0 };
    },
  },
];
