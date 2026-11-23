import { ensureMongo } from "../mongo.js";
import { JobModel } from "../agent-tools/jobs.js";
import { saveCustomerProfile } from "../customer/profile.js";

const OPT_OUT_RE =
  /(not interested|don't (message|text|disturb|call)|stop (messaging|texting|contacting)|remove me|unsubscribe|leave me alone|no more (message|promo|promotion|adverts?))/i;

/** "stop messaging me", "not interested", "unsubscribe" — explicit opt-out. */
export function isOptOut(text: string): boolean {
  return OPT_OUT_RE.test((text ?? "").toLowerCase());
}

/**
 * P5 retention guard: one proactive nudge per chat per 24h max, never when
 * opted out. Checks durable queue (agentjobs send/agent in last 24h) so the
 * cap survives restarts. Customer consent lives on the profile.
 */
export async function canFollowUp(
  userId: string,
  customerJid: string,
  followUpConsent: boolean | undefined,
): Promise<{ ok: boolean; reason: string }> {
  if (followUpConsent === false) return { ok: false, reason: "opted-out" };
  try {
    await ensureMongo();
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const recent = await JobModel.countDocuments({
      userId,
      chatJid: customerJid,
      createdAt: { $gte: since },
    }).catch(() => 0);
    if (recent >= 1) return { ok: false, reason: `nudged in last 24h (${recent})` };
    return { ok: true, reason: "clear" };
  } catch {
    return { ok: true, reason: "check-failed-open" };
  }
}

/**
 * Honor an opt-out immediately: flip consent + cancel pending jobs for this
 * chat so nothing else goes out. Fire-and-forget safe.
 */
export async function honorOptOut(userId: string, customerJid: string): Promise<void> {
  try {
    await ensureMongo();
    await saveCustomerProfile(userId, customerJid, { followUpConsent: false }).catch(() => {});
    await JobModel.updateMany(
      { userId, chatJid: customerJid, status: "pending" },
      { $set: { status: "failed", lastError: "customer opted out" } },
    ).catch(() => {});
  } catch {
    /* best effort */
  }
}

/** Retention system block: caps + post-delivery check-in guidance. */
export function retentionBlock(followUpConsent: boolean | undefined): string | null {
  if (followUpConsent === false) {
    return "Retention: this customer OPTED OUT of proactive messages — never schedule, remind, or pitch unprompted. Only answer what they ask.";
  }
  return "Retention: max ONE proactive nudge per chat per 24h; stop on 'not interested'. Post-delivery: one check-in only ('everything arrived alright?'). New arrivals: only for opted-in interest, never blast.";
}
