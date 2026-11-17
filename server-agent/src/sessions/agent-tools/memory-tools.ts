import mongoose, { Schema } from "mongoose";
import type { ToolDefinition } from "./tool-types.js";
import { toolArgs } from "./tool-types.js";
import { ensureMongo } from "../mongo.js";

interface MemoryRow {
  userId: string;
  key: string;
  value: string;
  updatedAt: Date;
}

const MemorySchema = new Schema<MemoryRow>(
  {
    userId: String,
    key: String,
    value: String,
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "memory" },
);
MemorySchema.index({ userId: 1, key: 1 }, { unique: true });

const MemoryModel =
  mongoose.models.Memory ?? mongoose.model<MemoryRow>("Memory", MemorySchema);

/**
 * The shop's long-term brain: supplier numbers, owner preferences, prices
 * promised, procedures the owner taught. Survives restarts; scoped per line.
 */
export const memoryTools: ToolDefinition[] = [
  {
    name: "remember_fact",
    description:
      "OWNER ONLY. Save something the shop must never forget: a supplier's number, the owner's preference, a price you promised, a procedure ('we deliver to Lekki on Fridays'). Recall it later with recall_facts. Overwrites the same key.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short label, e.g. 'supplier_charger' or 'friday_delivery'." },
        value: { type: "string", description: "The fact itself (max 500 chars)." },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const key = toolArgs.asString(args.key).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
      const value = toolArgs.asString(args.value).trim().slice(0, 500);
      if (!key || !value) return { error: "Both `key` and `value` are required." };
      await MemoryModel.findOneAndUpdate(
        { userId: ctx.userId, key },
        { $set: { value, updatedAt: new Date() } },
        { upsert: true },
      );
      return { remembered: true, key };
    },
  },
  {
    name: "recall_facts",
    description:
      "OWNER ONLY. Search the shop's saved memory by keyword ('supplier', 'friday', 'price'). Call this when the owner references something established earlier ('use the usual supplier', 'what price did we promise?') instead of asking them to repeat themselves.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search keys and values. Empty lists everything (max 20)." },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const q = toolArgs.asString(args.query).trim();
      const filter: Record<string, unknown> = { userId: ctx.userId };
      if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ key: rx }, { value: rx }];
      }
      const docs = await MemoryModel.find(filter).sort({ updatedAt: -1 }).limit(20).lean();
      return {
        facts: docs.map((d) => ({ key: d.key, value: d.value })),
        count: docs.length,
      };
    },
  },
  {
    name: "forget_fact",
    description: "OWNER ONLY. Delete one saved fact by its exact key.",
    scope: "owner",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Exact key from recall_facts." },
      },
      required: ["key"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      await ensureMongo();
      const key = toolArgs.asString(args.key).trim().toLowerCase();
      if (!key) return { error: "Empty key." };
      const res = await MemoryModel.deleteOne({ userId: ctx.userId, key });
      return res.deletedCount > 0 ? { forgotten: true, key } : { error: `No fact saved under "${key}".` };
    },
  },
];
