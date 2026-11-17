import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

/**
 * Durable per-chat memory — cheap quality tradeoff.
 * Cost: 1 fire-and-forget write per message (~200-500 bytes, capped), 1 read
 * only on cold start (first message after restart/eviction). Zero RAM held.
 * Storage: TTL 30 days + compound index, so old chats self-clean.
 */

interface ChatMemoryRow {
  userId: string;
  chatJid: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

const ChatMemorySchema = new Schema<ChatMemoryRow>(
  {
    userId: String,
    chatJid: String,
    role: String,
    content: String,
    ts: { type: Date, default: () => new Date() },
  },
  { collection: "chatmemory" },
);
ChatMemorySchema.index({ userId: 1, chatJid: 1, ts: 1 });
ChatMemorySchema.index({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const ChatMemoryModel =
  mongoose.models.AgentChatMemory ??
  mongoose.model<ChatMemoryRow>("AgentChatMemory", ChatMemorySchema);

const MAX_STORED = 1000;

/** Fire-and-forget durable append. Never throws, never blocks the hot path. */
export function appendChatMemory(userId: string, chatJid: string, role: "user" | "assistant", content: string): void {
  const text = content.trim().slice(0, MAX_STORED);
  if (!text) return;
  void (async () => {
    try {
      await ensureMongo();
      await ChatMemoryModel.create({ userId, chatJid, role, content: text, ts: new Date() });
    } catch {
      /* best effort — in-memory history still works this boot */
    }
  })();
}

/** Count durable messages for a chat since a point in time (quota checks). */
export async function countMessages(
  userId: string,
  chatJid: string,
  role: "user" | "assistant",
  since: Date,
): Promise<number> {
  try {
    await ensureMongo();
    return await ChatMemoryModel.countDocuments({ userId, chatJid, role, ts: { $gte: since } });
  } catch {
    return 0;
  }
}

/** Load the most recent durable messages for a chat (cold-start refill). */
export async function loadChatMemory(
  userId: string,
  chatJid: string,
  limit = 20,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  await ensureMongo();
  const docs = await ChatMemoryModel.find({ userId, chatJid })
    .select("role content ts")
    .sort({ ts: -1 })
    .limit(Math.min(Math.max(limit, 1), 30))
    .lean();
  return docs
    .reverse()
    .filter((d) => d.role === "user" || d.role === "assistant")
    .map((d) => ({ role: d.role as "user" | "assistant", content: String(d.content ?? "").slice(0, MAX_STORED) }));
}
