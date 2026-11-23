import type { Perception } from "./perceive.js";
import type { SalesState } from "./sales-state.js";

export type Action =
  | "GREET"
  | "DISCOVER"
  | "CLARIFY"
  | "RECOMMEND"
  | "EXPLAIN"
  | "REASSURE"
  | "COMPARE"
  | "NEGOTIATE"
  | "CLOSE"
  | "FOLLOW_UP"
  | "SUPPORT"
  | "ESCALATE";

export interface Decision {
  action: Action;
  confidence: number;
  reason: string;
}

/**
 * Deterministic gate first (zero tokens), LLM judgment only for the rest.
 * Non-linear by design: ready_to_buy always beats stage; abuse/refund/fraud
 * always escalates; two stalled exchanges force decide-and-report.
 */
export function decide(state: SalesState | null, perception: Perception, text: string): Decision {
  const t = (text ?? "").toLowerCase();

  // Hard escalation: abuse, fraud, threats, refund demands, explicit human ask.
  if (
    /(scam|fraud|fake|report you|police|lawyer|curse|insult|stupid|idiot|refund me|chargeback)/.test(t) ||
    /(human|manager|owner|call me|come to (shop|store)|physical)/.test(t) ||
    perception.emotion === "frustrated" && perception.urgency >= 0.9
  ) {
    if (/(scam|fraud|refund|police|lawyer|human|manager|owner)/.test(t)) {
      return { action: "ESCALATE", confidence: 0.9, reason: "gate:human-needed" };
    }
  }

  // Post-purchase support beats selling.
  if (state?.purchaseCompleted && /(spoil|broken|wrong|defect|return|complain|not working|fault)/.test(t)) {
    return { action: "SUPPORT", confidence: 0.85, reason: "gate:post-purchase-issue" };
  }

  // Explicit ready-to-buy: transaction cue OR (buy verb + variant).
  // Bare budget numbers ("my budget is 30k") must NOT close — that's RECOMMEND.
  // Variant = size/storage/colour word, existing prefs, or "the/this/that" + known interest.
  {
    const hasTransaction =
      /(pay|deliver|send|pick ?up|reserve|account (number|details)|let's do it|\bdeal\b)/.test(t);
    const hasBuyVerb = /(i (want|need|go take)|i'll (take|buy)|send (me|it)|how do i pay)/.test(t);
    const hasVariant =
      /(size\s*\d|\b(3[6-9]|4[0-7])\b|\b(32|64|128|256|512)\s*gb\b|\b(black|white|blue|red|green|gold|silver|grey|gray|brown|pink|purple|orange|navy|beige)\b)/.test(t) ||
      (state?.prefs ? Object.keys(state.prefs).length > 0 : false) ||
      (!!state?.interest && /\b(the|this|that)\b/.test(t));
    const llmReady = perception.intent === "ready_to_buy";
    if (hasTransaction || (hasBuyVerb && hasVariant) || (llmReady && (hasTransaction || hasVariant))) {
      return { action: "CLOSE", confidence: 0.85, reason: "gate:ready-to-buy" };
    }
  }

  // Complaint without hard-escalation words still needs reassurance, not a pitch.
  if (perception.emotion === "frustrated" || perception.intent === "complaint" || /(waiting|delay|since (monday|yesterday)|no response|where is my)/.test(t)) {
    return { action: "REASSURE", confidence: 0.8, reason: "gate:frustrated" };
  }

  // Price pushback -> negotiate within rules (step-down, never invent discount).
  if (/(too (cost|expensive|high|much)|reduce|discount|last price|cheaper|negotiat)/.test(t)) {
    return { action: "NEGOTIATE", confidence: 0.8, reason: "gate:price-pushback" };
  }

  // Comparing two options.
  if (/(which (is )?better|vs\b|or this|compare|difference between|which one)/.test(t)) {
    return { action: "COMPARE", confidence: 0.75, reason: "gate:compare" };
  }

  // Follow-up agreement from an earlier turn.
  if (/(remind me|follow up|get back|will buy|next week|month end|salary)/.test(t)) {
    return { action: "FOLLOW_UP", confidence: 0.75, reason: "gate:follow-up" };
  }

  // Enough to recommend: interest + (budget or prefs).
  if (
    state &&
    state.interest &&
    (typeof state.budget === "number" || Object.keys(state.prefs ?? {}).length > 0)
  ) {
    return { action: "RECOMMEND", confidence: 0.7, reason: "gate:has-prefs" };
  }

  // Genuinely ambiguous one-liners.
  if (text.trim().length <= 12 || /^(hi+|hello+|hey+|how far|good (morning|afternoon|evening)|yo|sup)$/.test(t.trim())) {
    return { action: "GREET", confidence: 0.7, reason: "gate:greeting" };
  }

  return { action: "DISCOVER", confidence: 0.6, reason: "default:discover" };
}

/** System block that tells the model its job this turn. Short by design. */
export function decisionBlock(decision: Decision, perception: Perception): string {
  return (
    `Your job this turn: ${decision.action} (why: ${decision.reason}). ` +
    `Customer feels ${perception.emotion}, urgency ${perception.urgency.toFixed(1)}. ` +
    `Rules: 1-3 short sentences, max one question, no interrogation. ` +
    `RECOMMEND/COMPARE=CALL search tools first then send_media. ` +
    `CLOSE=confirm stock via tool then logistics. ` +
    `NEGOTIATE=compare like-for-like then step-down option, never invent a discount. ` +
    `REASSURE/SUPPORT/ESCALATE=no pitch; REASSURE checks the order, ESCALATE calls notify_owner.`
  );
}
