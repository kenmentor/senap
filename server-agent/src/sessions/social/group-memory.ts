import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

/**
 * Senap Group Intelligence — social memory. Structured, proportionate, and
 * retention-aware. Stores what the group is FOR and how Senap should behave
 * in it — never secret personality profiles, never permanent troublemaker
 * labels. Moderation history lives in groupincidents/groupactions, judged on
 * specific behaviour + evidence, not reputation.
 */

export type GroupMode = "quiet" | "active" | "manager";

export interface GroupRule {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  action: "observe" | "warn" | "escalate" | "urgent_admin_review";
}

export interface GroupSocial {
  userId: string;
  groupJid: string;
  purpose: string;
  groupType: string;
  style: string;
  /** Owner-approved intro, sent once on first participation. */
  intro: string;
  introSent: boolean;
  rules: GroupRule[];
  updatedAt: Date;
}

interface GroupSocialRow {
  userId: string;
  groupJid: string;
  purpose: string;
  groupType: string;
  style: string;
  intro: string;
  introSent: boolean;
  rules: GroupRule[];
  updatedAt: Date;
}

const GroupSocialSchema = new Schema<GroupSocialRow>(
  {
    userId: String,
    groupJid: String,
    purpose: { type: String, default: "" },
    groupType: { type: String, default: "" },
    style: { type: String, default: "" },
    intro: { type: String, default: "" },
    introSent: { type: Boolean, default: false },
    rules: { type: Schema.Types.Mixed, default: [] },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: "groupcontext" },
);
GroupSocialSchema.index({ userId: 1, groupJid: 1 }, { unique: true });

const GroupSocialModel =
  mongoose.models.GroupSocial ?? mongoose.model<GroupSocialRow>("GroupSocial", GroupSocialSchema);

interface GroupMemberRow {
  userId: string;
  groupJid: string;
  memberJid: string;
  name: string;
  isAdmin: boolean;
  welcomed: boolean;
  lastSeenAt: Date;
}

const GroupMemberSchema = new Schema<GroupMemberRow>(
  {
    userId: String,
    groupJid: String,
    memberJid: String,
    name: { type: String, default: "unknown" },
    isAdmin: { type: Boolean, default: false },
    welcomed: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { collection: "groupmembers" },
);
GroupMemberSchema.index({ userId: 1, groupJid: 1, memberJid: 1 }, { unique: true });
GroupMemberSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const GroupMemberModel =
  mongoose.models.GroupMember ?? mongoose.model<GroupMemberRow>("GroupMember", GroupMemberSchema);

export async function loadGroupSocial(userId: string, groupJid: string): Promise<GroupSocial | null> {
  try {
    await ensureMongo();
    const doc = await GroupSocialModel.findOne({ userId, groupJid }).lean().catch(() => null);
    if (!doc) return null;
    return {
      userId: doc.userId,
      groupJid: doc.groupJid,
      purpose: doc.purpose || "",
      groupType: doc.groupType || "",
      style: doc.style || "",
      intro: doc.intro || "",
      introSent: !!doc.introSent,
      rules: Array.isArray(doc.rules) ? (doc.rules as GroupRule[]).slice(0, 10) : [],
      updatedAt: doc.updatedAt ?? new Date(),
    };
  } catch {
    return null;
  }
}

export async function saveGroupSocialPatch(
  userId: string,
  groupJid: string,
  patch: Partial<Pick<GroupSocial, "purpose" | "groupType" | "style" | "intro" | "introSent" | "rules">>,
): Promise<void> {
  try {
    await ensureMongo();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.purpose !== undefined) set.purpose = patch.purpose.slice(0, 300);
    if (patch.groupType !== undefined) set.groupType = patch.groupType.slice(0, 60);
    if (patch.style !== undefined) set.style = patch.style.slice(0, 300);
    if (patch.intro !== undefined) set.intro = patch.intro.slice(0, 500);
    if (patch.introSent !== undefined) set.introSent = patch.introSent;
    if (patch.rules !== undefined) set.rules = patch.rules.slice(0, 10);
    await GroupSocialModel.findOneAndUpdate({ userId, groupJid }, { $set: set }, { upsert: true });
  } catch {
    /* memory is best-effort */
  }
}

/** Touch a member row: name, admin flag, liveness. No profiling, no labels. */
export function touchGroupMember(
  userId: string,
  groupJid: string,
  memberJid: string,
  name: string,
  isAdmin: boolean,
): void {
  void (async () => {
    try {
      await ensureMongo();
      await GroupMemberModel.findOneAndUpdate(
        { userId, groupJid, memberJid },
        { $set: { name: name.slice(0, 60) || "unknown", isAdmin, lastSeenAt: new Date() } },
        { upsert: true },
      );
    } catch {
      /* best effort */
    }
  })();
}

/** System block: who Senap is here + owner-approved intro (once only). */
export function groupSocialBlock(social: GroupSocial | null): string | null {
  if (!social) return null;
  const bits: string[] = [];
  if (social.purpose) bits.push(`purpose: ${social.purpose.slice(0, 200)}`);
  if (social.style) bits.push(`house style: ${social.style.slice(0, 200)}`);
  if (social.rules.length > 0) {
    bits.push(`agreed rules: ${social.rules.map((r) => `${r.id}=${r.description.slice(0, 80)}`).join(" | ")}`);
  }
  if (social.intro && !social.introSent) {
    bits.push(`FIRST impression (send once, then never repeat): "${social.intro.slice(0, 300)}"`);
  }
  if (bits.length === 0) return null;
  return `Group memory: ${bits.join(" | ")}. Be a member, never the centre: brief, no announcements, no repeated intros.`;
}
