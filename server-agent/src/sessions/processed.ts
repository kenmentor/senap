import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

/**
 * Processed-message ledger: { userId, chatJid, msgId } only — no message
 * content is ever stored here. Lets a restarted agent tell "already
 * answered" apart from "arrived while I was down" so backlog catch-up
 * never double-replies and never drops anything. Auto-expires in 7 days.
 */
interface ProcessedRow {
  userId: string;
  chatJid: string;
  msgId: string;
  ts: Date;
  createdAt: Date;
}

const ProcessedSchema = new Schema<ProcessedRow>(
  {
    userId: String,
    chatJid: String,
    msgId: String,
    ts: Date,
    createdAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 7 },
  },
  { collection: "processedmsgs" },
);
ProcessedSchema.index({ userId: 1, chatJid: 1, msgId: 1 }, { unique: true });

const ProcessedModel =
  mongoose.models.AgentProcessed ??
  mongoose.model<ProcessedRow>("AgentProcessed", ProcessedSchema);

export async function wasProcessed(userId: string, chatJid: string, msgId: string): Promise<boolean> {
  try {
    await ensureMongo();
    const doc = await ProcessedModel.findOne({ userId, chatJid, msgId })
      .select("_id")
      .lean();
    return !!doc;
  } catch {
    // DB down: fall back to in-memory dedupe only (better to risk a
    // duplicate than to drop a customer's message).
    return false;
  }
}

export async function markProcessed(
  userId: string,
  chatJid: string,
  msgId: string,
  ts: Date,
): Promise<void> {
  try {
    await ensureMongo();
    await ProcessedModel.updateOne(
      { userId, chatJid, msgId },
      { $setOnInsert: { ts, createdAt: new Date() } },
      { upsert: true },
    );
  } catch {
    /* best effort — in-memory dedupe still protects this boot */
  }
}
