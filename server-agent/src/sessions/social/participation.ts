/**
 * Social Awareness & Participation Intelligence.
 *
 * A human employee doesn't answer every sentence they hear. Before generating
 * a response, Senap answers the more fundamental question: should I
 * participate at all? Silence (WAIT/OBSERVE/IGNORE) is an intentional action,
 * not a failure — unnecessary responses are a negative metric.
 *
 * Hybrid by design: deterministic metadata (mention, quote, DM, sender, chat
 * type) decides the clear cases with zero tokens; the aim-aware LLM probe
 * (`probeGroupIntent`) only resolves the ambiguous middle; roles/policies own
 * responsibility, never the model alone.
 */

export type ParticipationAction =
  | "RESPOND" // directed at Senap, or clear duty to answer
  | "INTERVENE" // not addressed, but responsibility requires it (complaint, misinfo, owner order)
  | "WAIT" // addressed but incomplete / conversation still unfolding — expect to speak shortly
  | "OBSERVE" // possibly useful context, no reason to interrupt
  | "IGNORE"; // irrelevant, private, unrelated, or outside duties

export interface ParticipationSignals {
  /** @mention of the line, quote-reply of our message, or name hit. Deterministic. */
  mentionedMe: boolean;
  quotedMe: boolean;
  nameHit: boolean;
  /** 1:1 chat (always respond, unchanged). */
  isDirectMessage: boolean;
  /** Owner command — always respond, unchanged. */
  isOwner: boolean;
  /** Group has an active managed persona. */
  managed: boolean;
  /** Our last messages in a row (anti-flood / turn-taking). */
  recentOurs: number;
  /** A human (owner or member) already answered just before. */
  humanAnsweredJustBefore: boolean;
  /** Same sender sent 2+ messages in a burst (aggregation candidate). */
  sameSenderBurst: boolean;
}

export interface ParticipationContext {
  text: string;
  recent: string[];
  aim: string;
  rolesOn: string[];
  addressedInHistory: boolean;
}

export interface ParticipationDecision {
  action: ParticipationAction;
  directedToAgent: boolean;
  confidence: number;
  intent: string;
  relevance: number;
  urgency: number;
  reason: string;
}

/** Name alone is not a request: "Senap is actually very useful" ≠ addressing us. */
function isNameOnlyMention(text: string, nameHit: boolean, addressed: boolean): boolean {
  if (!nameHit || addressed) return false;
  const t = text.toLowerCase();
  // Third-person appreciation / gossip about the bot, no verb aimed at it.
  return /(is|seems|sounds) ((actually|really|very|quite|so|pretty) )*(useful|helpful|good|great|nice|cool|fast|slow|annoying|okay|ok)\b/.test(t);
}

/** Trailing ellipsis / "I wanted to ask..." — the thought isn't finished. */
function isIncomplete(text: string): boolean {
  const t = text.trim();
  return /(\.\.\.|…|,$)\s*$/.test(t) || /^(senap[,\s])?.*(wanted to ask|quick question|one question|wait|hold on|brb|typing)\b/i.test(t);
}

/** Complaint / delivery problem / fraud — responsibility may require intervention. */
function isTrouble(text: string): boolean {
  return /(waiting|delay|days? now|no response|wrong|broken|spoil|defect|fraud|scam|refund|where is my|not (working|delivered|received|arrived)|never (arrived|came|delivered|received)|since (monday|yesterday)|failed delivery|didn'?t (arrive|deliver|come))/i.test(text);
}

/** An answer-like message from a member (price/figure/confirmation) just before us. */
export function looksAnswered(recent: string[]): boolean {
  if (recent.length === 0) return false;
  const last = recent[recent.length - 1] ?? "";
  return /₦|NGN|\d[\d,]{3,}|yes[, ]|no[, ]|it's \S+|it is \S+|delivered|available/i.test(last) && last.length < 160;
}

function intentOf(text: string): string {
  const t = text.toLowerCase();
  if (/(scam|fraud|refund|police|human|manager|owner)/.test(t)) return "escalation";
  if (isTrouble(text)) return "complaint";
  // Buying signals count as product enquiries even without price/stock words —
  // "I need a laptop" must reach the probe, never die as smalltalk.
  if (/(price|cost|how much|stock|available|do you have|do you sell|anyone (selling|have)|i (need|want)|looking for)/.test(t)) return "product_enquiry";
  if (/\?\s*$/.test(text.trim())) return "question";
  if (/^(good (morning|afternoon|evening)|hello|hi|hey|morning|how far)\b/.test(t)) return "greeting";
  if (text.trim().length <= 30) return "smalltalk";
  return "discussion";
}

function urgencyOf(text: string, intent: string): number {
  if (intent === "escalation") return 0.95;
  if (intent === "complaint") return 0.8;
  if (/(urgent|asap|now now|today)/i.test(text)) return 0.8;
  if (intent === "product_enquiry" || intent === "question") return 0.5;
  return 0.2;
}

/**
 * Pure, synchronous participation decision. Deterministic signals first;
 * ambiguous product/context questions return OBSERVE so the caller can run
 * the aim-aware LLM probe before committing to speak.
 */
export function decideParticipation(
  signals: ParticipationSignals,
  ctx: ParticipationContext,
): ParticipationDecision {
  const text = ctx.text ?? "";
  const addressed = signals.mentionedMe || signals.quotedMe || signals.nameHit;
  const intent = intentOf(text);
  const urgency = urgencyOf(text, intent);
  const base = { intent, urgency, directedToAgent: addressed };

  // Owner and DMs: unchanged behaviour — always respond.
  if (signals.isOwner) {
    return { ...base, action: "RESPOND", confidence: 1, relevance: 1, reason: "owner-command" };
  }
  if (signals.isDirectMessage) {
    // Incomplete DM ("I wanted to ask...") waits for the rest, not silence.
    if (isIncomplete(text)) {
      return { ...base, action: "WAIT", confidence: 0.7, relevance: 0.6, reason: "dm-incomplete" };
    }
    return { ...base, action: "RESPOND", confidence: 0.95, relevance: 0.9, reason: "direct-message" };
  }

  // Name-only mention with no request: observe, don't pounce.
  if (isNameOnlyMention(text, signals.nameHit, signals.mentionedMe || signals.quotedMe)) {
    return { ...base, action: "OBSERVE", confidence: 0.7, relevance: 0.2, reason: "name-only-mention" };
  }

  // Explicit addressing: respond — unless the thought is unfinished.
  if (addressed) {
    if (isIncomplete(text)) {
      return { ...base, action: "WAIT", confidence: 0.75, relevance: 0.7, reason: "addressed-incomplete" };
    }
    // Don't compete with a human already handling it.
    if (signals.humanAnsweredJustBefore && intent !== "complaint" && intent !== "escalation") {
      return { ...base, action: "OBSERVE", confidence: 0.65, relevance: 0.4, reason: "human-handling" };
    }
    return { ...base, action: "RESPOND", confidence: 0.9, relevance: 0.85, reason: "explicitly-addressed" };
  }

  // Responsibility without addressing: complaints/misinformation the shop owns.
  if (isTrouble(text) && (ctx.rolesOn.includes("support") || ctx.rolesOn.includes("salesperson"))) {
    return { ...base, action: "INTERVENE", confidence: 0.8, relevance: 0.8, reason: "responsibility-complaint" };
  }

  // Burst from the same sender: wait for them to finish, don't reply per line.
  if (signals.sameSenderBurst && !/\?\s*$/.test(text.trim())) {
    return { ...base, action: "WAIT", confidence: 0.65, relevance: 0.5, reason: "sender-burst" };
  }

  // Follow-up in a thread we own ("can you check the price?" after our pitch).
  if (ctx.addressedInHistory && (intent === "product_enquiry" || intent === "question")) {
    return { ...base, action: "RESPOND", confidence: 0.7, relevance: 0.7, reason: "thread-continuation" };
  }

  // Unaddressed product question in a managed group: ambiguous — probe decides.
  if ((intent === "product_enquiry" || intent === "question") && signals.managed) {
    if (signals.humanAnsweredJustBefore && looksAnswered(ctx.recent)) {
      return { ...base, action: "OBSERVE", confidence: 0.7, relevance: 0.35, reason: "already-answered" };
    }
    return { ...base, action: "OBSERVE", confidence: 0.5, relevance: 0.55, reason: "ambiguous-probe" };
  }

  // Greetings / smalltalk / background chatter between members: observe.
  if (intent === "greeting" || intent === "smalltalk") {
    return { ...base, action: "OBSERVE", confidence: 0.75, relevance: 0.15, reason: "casual-chatter" };
  }
  // Open discussion in a managed group stays probe-eligible (score safety net
  // may still consult the probe) — hard IGNORE would bury unaddressed but
  // relevant messages. Unmanaged chatter is ignored confidently.
  if (signals.managed) {
    return { ...base, action: "OBSERVE", confidence: 0.55, relevance: 0.3, reason: "group-discussion" };
  }
  return { ...base, action: "IGNORE", confidence: 0.7, relevance: 0.1, reason: "unrelated" };
}

/** Caller mapping: which participation outcomes may speak. WAIT/OBSERVE/IGNORE stay silent. */
export function maySpeak(action: ParticipationAction): boolean {
  return action === "RESPOND" || action === "INTERVENE";
}
