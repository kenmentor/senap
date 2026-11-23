import mongoose, { Schema } from "mongoose";
import { ensureMongo } from "../mongo.js";

/**
 * Moderation intelligence: severity-based pipeline with a controlled action
 * lifecycle. Detection ≠ punishment:
 *
 *   DETECTED → CLASSIFIED → POLICY_CHECKED → AUTHORIZATION_CHECK
 *     → APPROVED/REJECTED → EXECUTED → AUDITED
 *
 * Levels 0-1 stay silent. Level 2 warns conversationally (once, brief, never
 * a lecture). Levels 3-4 never auto-act — they notify the owner with
 * evidence. Member removal is human-approved by default, always.
 */

export type Severity = 0 | 1 | 2 | 3 | 4;

export interface ModerationVerdict {
  severity: Severity;
  ruleId: string;
  reason: string;
  evidence: string;
  /** Quoted report of someone else's abuse — never punish the reporter. */
  isQuotedReport: boolean;
}

const SPAM_RE =
  /(https?:\/\/\S+|t\.me\/\S+|wa\.me\/\S+|dm me|inbox me|earn (daily|\$)|forex|bet9|double your|free (money|crypto|airtime)|giveaway.*click|click.*win|loan.*whatsapp|hookup)/i;
const AD_RE =
  /(for sale|promo|discount|order now|call 0\d+|my (shop|store|page|plug)|selling .*dm|available.*dm)/i;
const ABUSE_RE =
  /\b(idiot|fool|stupid|mumu|ode|oloshi|bastard|useless|shut up|curse you|thunder fire you|you (are|dey) (mad|crazy|dumb))\b/i;
const THREAT_RE =
  /(i will (kill|beat|harm|deal with|find|come for) you|you (will|go) (die|regret)|watch your back|threat|blood|gun|knife|juju)/i;
const REPORT_RE =
  /(report(ing|ed)?|forward(ing|ed)?|look at what .* (said|sent|posted)|quoting|as evidence)/i;

/** Someone quoting abuse to report it — the reporter is not the violator. */
function isQuotedReport(text: string, quotedText: string): boolean {
  if (quotedText && quotedText.trim().length > 0 && REPORT_RE.test(text)) return true;
  if (/^(reporting|forwarding|see what|look at)/i.test(text.trim())) return true;
  return false;
}

/**
 * Pure, deterministic severity analysis. Disagreement, jokes, criticism and
 * ordinary arguments are NOT violations — only clear signal classifies.
 */
export function analyzeModeration(
  text: string,
  opts?: { quotedText?: string; recentCount?: number; memberRecentViolations?: number },
): ModerationVerdict {
  const t = (text ?? "").trim();
  const quoted = (opts?.quotedText ?? "").trim();
  const quotedReport = isQuotedReport(t, quoted);
  const evidence = t.slice(0, 200);

  if (!t || t.length < 2) {
    return { severity: 0, ruleId: "", reason: "empty", evidence, isQuotedReport: false };
  }
  if (quotedReport && (ABUSE_RE.test(t) || ABUSE_RE.test(quoted) || THREAT_RE.test(quoted))) {
    return { severity: 0, ruleId: "", reason: "quoted-report-exempt", evidence, isQuotedReport: true };
  }
  if (THREAT_RE.test(t)) {
    return { severity: 4, ruleId: "THREAT_001", reason: "credible-threat", evidence, isQuotedReport: false };
  }
  if (ABUSE_RE.test(t)) {
    return { severity: 3, ruleId: "ABUSE_001", reason: "targeted-harassment", evidence, isQuotedReport: false };
  }
  if (SPAM_RE.test(t)) {
    const repeat = (opts?.recentCount ?? 0) >= 1 || (opts?.memberRecentViolations ?? 0) >= 1;
    return {
      severity: repeat ? 2 : 1,
      ruleId: "SPAM_001",
      reason: repeat ? "repeated-spam" : "possible-spam",
      evidence,
      isQuotedReport: false,
    };
  }
  if (AD_RE.test(t) && t.length < 120 && /https?:\/\/|dm|call|promo|sale/i.test(t)) {
    return { severity: 1, ruleId: "AD_001", reason: "unsolicited-ad", evidence, isQuotedReport: false };
  }
  return { severity: 0, ruleId: "", reason: "no-violation", evidence, isQuotedReport: false };
}

interface IncidentRow {
  userId: string;
  groupJid: string;
  messageId: string;
  senderJid: string;
  ruleId: string;
  severity: number;
  reason: string;
  evidence: string;
  status: string;
  action: string;
  createdAt: Date;
}

const IncidentSchema = new Schema<IncidentRow>(
  {
    userId: String,
    groupJid: String,
    messageId: String,
    senderJid: String,
    ruleId: String,
    severity: Number,
    reason: String,
    evidence: String,
    status: { type: String, default: "DETECTED" },
    action: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "groupincidents" },
);
IncidentSchema.index({ userId: 1, groupJid: 1, createdAt: -1 });
IncidentSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const IncidentModel =
  mongoose.models.GroupIncident ?? mongoose.model<IncidentRow>("GroupIncident", IncidentSchema);

interface ActionRow {
  userId: string;
  groupJid: string;
  incidentId: string;
  action: string;
  authorizedBy: string;
  outcome: string;
  createdAt: Date;
}

const ActionSchema = new Schema<ActionRow>(
  {
    userId: String,
    groupJid: String,
    incidentId: String,
    action: String,
    authorizedBy: String,
    outcome: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "groupactions" },
);
ActionSchema.index({ userId: 1, groupJid: 1, createdAt: -1 });
ActionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const ActionModel =
  mongoose.models.GroupAction ?? mongoose.model<ActionRow>("GroupAction", ActionSchema);

/** File an incident through the lifecycle in one auditable write. Never throws. */
export async function recordIncident(input: {
  userId: string;
  groupJid: string;
  messageId: string;
  senderJid: string;
  verdict: ModerationVerdict;
  action: string;
}): Promise<string | null> {
  try {
    await ensureMongo();
    const doc = await IncidentModel.create({
      userId: input.userId,
      groupJid: input.groupJid,
      messageId: input.messageId.slice(0, 120),
      senderJid: input.senderJid.slice(0, 120),
      ruleId: input.verdict.ruleId,
      severity: input.verdict.severity,
      reason: input.verdict.reason,
      evidence: input.verdict.evidence.slice(0, 200),
      status: "AUDITED",
      action: input.action.slice(0, 120),
      createdAt: new Date(),
    });
    const id = String(doc._id);
    await ActionModel.create({
      userId: input.userId,
      groupJid: input.groupJid,
      incidentId: id,
      action: input.action.slice(0, 120),
      authorizedBy: /^warn|observe|escalate|notify_owner/.test(input.action) ? "policy" : "owner",
      outcome: "done",
      createdAt: new Date(),
    }).catch(() => null);
    return id;
  } catch {
    return null;
  }
}

/** Recent incident count for a sender (repeat-offender signal, 7d window). */
export async function recentIncidentCount(userId: string, groupJid: string, senderJid: string): Promise<number> {
  try {
    await ensureMongo();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    return await IncidentModel.countDocuments({ userId, groupJid, senderJid, createdAt: { $gte: since } }).catch(() => 0);
  } catch {
    return 0;
  }
}
