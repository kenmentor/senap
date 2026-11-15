import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "./mongo.js";

/**
 * Fire-and-forget tally of every tool call ("functions used so far" on the
 * dashboard). Tiny docs, 90-day TTL — never blocks a reply.
 */
interface ToolUseRow {
  userId: string;
  name: string;
  at: Date;
}

const ToolUseSchema = new Schema<ToolUseRow>(
  {
    userId: String,
    name: String,
    at: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 90 },
  },
  { collection: "tooluses" },
);
ToolUseSchema.index({ userId: 1, name: 1 });

const ToolUseModel =
  mongoose.models.AgentToolUse ?? mongoose.model<ToolUseRow>("AgentToolUse", ToolUseSchema);

export function logToolUse(userId: string, name: string): void {
  void (async () => {
    try {
      await ensureMongo();
      await ToolUseModel.create({ userId, name });
    } catch {
      /* usage stats must never break a reply */
    }
  })();
}

export async function toolUseCounts(userId?: string): Promise<{ name: string; count: number }[]> {
  await ensureMongo();
  const match = userId ? { userId } : {};
  const rows = await ToolUseModel.aggregate([
    { $match: match },
    { $group: { _id: "$name", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
  ]);
  return rows.map((r) => ({ name: String(r._id), count: Number(r.count) }));
}
