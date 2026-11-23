import type { Action } from "./decide.js";

/**
 * P3 sales policies: per-action checklists the model must follow.
 * Short by design — injected as one system block alongside the decision.
 * Tools still ground all facts; these govern judgment, not data.
 */
const POLICIES: Record<Action, string> = {
  GREET: "Greet once in their style, then DISCOVER with one question (need + use-case). Never pitch on hello.",
  DISCOVER: "Ask ONE question: what they need it for first, then budget/brand-new-vs-used/size. Narrow before pitching. Never dump the catalog.",
  CLARIFY: "Resolve ambiguity with a single short question offering 2 named options. If still unclear after one round, decide yourself and state your pick + how to undo it.",
  RECOMMEND: "Max 2 options. CALL search_products first, send_media photos FIRST (caption name + price), then dealer note: name + key specs + condition + price last. Translate specs to life (battery=2 days, RAM=no hanging). End with trial-close: 'X or Y — which one enter your eye pass?' Never 'do you want to buy?'",
  EXPLAIN: "Answer the actual question with one verified fact (tool first), one line of why it matters, then move forward. No lecture.",
  REASSURE: "Acknowledge first ('Sorry about that', 'Fair question'), clarify the real worry (price vs quality vs trust), answer honestly with tool-checked facts, then advance one step. Never argue or defend.",
  COMPARE: "Compare like-for-like only (same condition/storage/with receipt?). Max 2 options, photos first, state the trade-off in one line, then trial-close.",
  NEGOTIATE: "Acknowledge-clarify-respond-advance: 'na the price be the only thing, or something else?' Never invent discounts. Compare like-for-like, then offer the step-down option via search_products. Never pressure a doubtful buyer.",
  CLOSE: "Assume the sale, don't ask permission to sell: 'Oya, make I reserve this one for you — pick up today or arrange delivery?' Steps: 1) confirm variant (size/colour) 2) CALL create_order with idOrSku+quantity (stock-checked, totals live — never invent; quote_order for preview only) 3) ask delivery area in plain words if missing 4) call notify_owner with order id for confirmation. State condition + price beside each other.",
  FOLLOW_UP: "Honor the earlier agreement, one nudge per 24h max. Check retention guard first; respect OPTED_OUT (never pitch). Offer a concrete next step + easy out ('still interested, or should I close this?'). Use schedule_task/add_reminder for future dates, never rely on memory.",
  SUPPORT: "Post-purchase: apologize, diagnose with search_messages/customer history, state what happens next + when a human follows up. Call notify_owner when you cannot resolve. No selling in support.",
  ESCALATE: "Call notify_owner immediately with a short factual handoff, tell the customer a human will follow up shortly. Never stay silent on trouble, never spam escalation for chit-chat.",
};

export function policyBlock(action: Action): string {
  return `Sales policy [${action}]: ${POLICIES[action]}`;
}

/** Stage hint for persistence (non-linear journey, hints only). */
export function stageForAction(action: Action): "discovery" | "qualification" | "recommendation" | "objection" | "conversion" | "retention" | "support" {
  switch (action) {
    case "GREET":
    case "DISCOVER":
      return "discovery";
    case "CLARIFY":
      return "qualification";
    case "RECOMMEND":
    case "EXPLAIN":
    case "COMPARE":
      return "recommendation";
    case "NEGOTIATE":
      return "objection";
    case "CLOSE":
      return "conversion";
    case "FOLLOW_UP":
      return "retention";
    case "SUPPORT":
    case "ESCALATE":
    default:
      return "support";
  }
}
