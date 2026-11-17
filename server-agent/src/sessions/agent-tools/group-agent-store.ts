import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";
import { JobModel } from "./jobs.js";

/**
 * Per-group agent config: created when the owner activates the agent for a
 * group from the dashboard (or via setup_group_agent). The agent then works
 * that group independently: persona + style + recurring engagement jobs.
 */

export interface GroupAgentConfig {
  userId: string;
  groupJid: string;
  enabled: boolean;
  name: string;
  role: string;
  personality: string;
  duty: string;
  intervalHours: number;
  maxPerDay: number;
  /** Reply confidence threshold 0..1 (lower = chattier). Default 0.3 (active). */
  replyThreshold: number;
  /** Group display name at activation (for rules + status displays). */
  subject: string;
  /** True when activation auto-added the allow-list entry (removed on disable). */
  autoWhitelisted: boolean;
  styleExamples: string[];
  styleUpdatedAt: Date;
  repeatKey: string;
  jobId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface GroupAgentRow extends Omit<GroupAgentConfig, "createdAt" | "updatedAt"> {
  createdAt: Date;
  updatedAt: Date;
}

const GroupAgentSchema = new Schema<GroupAgentRow>(
  {
    userId: String,
    groupJid: String,
    enabled: { type: Boolean, default: true },
    name: { type: String, default: "" },
    role: { type: String, default: "" },
    personality: { type: String, default: "" },
    duty: { type: String, default: "" },
    intervalHours: { type: Number, default: 6 },
    maxPerDay: { type: Number, default: 4 },
    replyThreshold: { type: Number, default: 0.3 },
    subject: { type: String, default: "" },
    autoWhitelisted: { type: Boolean, default: false },
    styleExamples: { type: [String], default: [] },
    styleUpdatedAt: { type: Date, default: () => new Date() },
    repeatKey: { type: String, default: "" },
    jobId: { type: String, default: "" },
  },
  { collection: "groupagents", timestamps: true },
);
GroupAgentSchema.index({ userId: 1, groupJid: 1 }, { unique: true });

const GroupAgentModel =
  mongoose.models.AgentGroupAgent ??
  mongoose.model<GroupAgentRow>("AgentGroupAgent", GroupAgentSchema);

async function ensureConn(): Promise<void> {
  await ensureMongo();
}

export function repeatKeyFor(userId: string, groupJid: string): string {
  return `grp:${userId}:${groupJid}`;
}

export async function getGroupAgent(userId: string, groupJid: string): Promise<GroupAgentConfig | null> {
  await ensureConn();
  const doc = await GroupAgentModel.findOne({ userId, groupJid }).lean();
  if (!doc) return null;
  return {
    userId: doc.userId,
    groupJid: doc.groupJid,
    enabled: doc.enabled,
    name: doc.name ?? "",
    role: doc.role ?? "",
    personality: doc.personality ?? "",
    duty: doc.duty ?? "",
    intervalHours: doc.intervalHours ?? 6,
    maxPerDay: doc.maxPerDay ?? 4,
    replyThreshold: typeof doc.replyThreshold === "number" ? doc.replyThreshold : 0.45,
    subject: doc.subject ?? "",
    autoWhitelisted: doc.autoWhitelisted ?? false,
    styleExamples: doc.styleExamples ?? [],
    styleUpdatedAt: doc.styleUpdatedAt ?? new Date(),
    repeatKey: doc.repeatKey ?? "",
    jobId: doc.jobId ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function saveGroupAgent(
  input: Omit<GroupAgentConfig, "createdAt" | "updatedAt" | "styleUpdatedAt"> & { styleUpdatedAt?: Date },
): Promise<GroupAgentConfig> {
  await ensureConn();
  const doc = await GroupAgentModel.findOneAndUpdate(
    { userId: input.userId, groupJid: input.groupJid },
    {
      $set: {
        ...input,
        styleUpdatedAt: input.styleUpdatedAt ?? new Date(),
      },
    },
    { upsert: true, new: true },
  ).lean();
  const out = doc as unknown as GroupAgentRow;
  return {
    userId: out.userId,
    groupJid: out.groupJid,
    enabled: out.enabled,
    name: out.name ?? "",
    role: out.role ?? "",
    personality: out.personality ?? "",
    duty: out.duty ?? "",
    intervalHours: out.intervalHours ?? 6,
    maxPerDay: out.maxPerDay ?? 4,
    replyThreshold: typeof out.replyThreshold === "number" ? out.replyThreshold : 0.45,
    subject: out.subject ?? "",
    autoWhitelisted: out.autoWhitelisted ?? false,
    styleExamples: out.styleExamples ?? [],
    styleUpdatedAt: out.styleUpdatedAt ?? new Date(),
    repeatKey: out.repeatKey ?? "",
    jobId: out.jobId ?? "",
    createdAt: out.createdAt,
    updatedAt: out.updatedAt,
  };
}

export async function setGroupAgentEnabled(userId: string, groupJid: string, enabled: boolean): Promise<void> {
  await ensureConn();
  await GroupAgentModel.updateOne({ userId, groupJid }, { $set: { enabled } });
}

/**
 * Boot repair: every ENABLED group agent implies its group is allowed through.
 * Fixes setups made before auto-whitelisting existed (or rules deleted by
 * hand) — one cheap pass per boot, no polling.
 */
export async function repairManagedAccess(): Promise<number> {
  await ensureConn();
  const { ensureGroupAllowed } = await import("../chat-access.js");
  const cfgs = await GroupAgentModel.find({ enabled: true }).select("userId groupJid subject autoWhitelisted").lean();
  let fixed = 0;
  for (const c of cfgs) {
    try {
      const r = await ensureGroupAllowed(c.userId, c.chatJid, c.subject || "group");
      if (r.whitelisted) {
        await GroupAgentModel.updateOne(
          { userId: c.userId, chatJid: c.chatJid },
          { $set: { autoWhitelisted: true } },
        );
        fixed++;
      }
    } catch {
      /* best effort — next boot retries */
    }
  }
  return fixed;
}

/** Cancel every pending job in a repeat chain (disable / re-schedule). */
export async function deletePendingChain(userId: string, repeatKey: string): Promise<number> {
  if (!repeatKey) return 0;
  await ensureConn();
  const res = await JobModel.updateMany(
    { userId, status: "pending", repeatKey },
    { $set: { status: "failed", lastError: "superseded" } },
  );
  return res.modifiedCount ?? 0;
}

/** Next pending run of a repeat chain (for status displays). */
export async function nextPendingRun(userId: string, repeatKey: string): Promise<Date | null> {
  if (!repeatKey) return null;
  await ensureConn();
  const doc = await JobModel.findOne({ userId, status: "pending", repeatKey })
    .select("runAt")
    .sort({ runAt: 1 })
    .lean();
  if (!doc?.runAt) return null;
  return doc.runAt instanceof Date ? doc.runAt : new Date(doc.runAt as unknown as string);
}
