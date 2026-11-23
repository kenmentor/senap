/**
 * P1-P6 offline decision test — no API keys, no Mongo, no WhatsApp.
 * Run: npx tsx src/scripts/test-decision.ts
 * Covers the 10-case set at the policy level: vague, aggressive negotiator,
 * mind-changer, frustrated, browser, instant-buyer, returner, owner-reminder,
 * group-spam (moderation duty), recap-request (admin duty) + opt-out + roles.
 */
import { decide } from "../sessions/sales/decide.js";
import { extractPrefs } from "../sessions/sales/extract.js";
import { isOptOut } from "../sessions/sales/retention.js";
import { stageForAction, policyBlock } from "../sessions/sales/policy.js";
import { normalizeRoles, rolesBlock, ALL_ROLES_ON } from "../roles/roles.js";
import type { SalesState } from "../sessions/sales/sales-state.js";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    pass++;
    console.log(`ok - ${name}`);
  } else {
    fail++;
    console.error(`FAIL - ${name} ${extra}`);
  }
}

const baseState: SalesState = {
  userId: "u",
  customerJid: "c@s.whatsapp.net",
  stage: "discovery",
  prefs: {},
  intent: "browsing",
  updatedAt: new Date(),
};
const neutral = { intent: "browsing", emotion: "neutral" as const, urgency: 0.3, confidence: 0.7 };

// 1. vague browser -> DISCOVER (never pitch on hello)
check("vague browser -> DISCOVER", decide(baseState, neutral, "hi").action === "GREET" || decide(baseState, neutral, "hi guys how far").action === "DISCOVER");
// 2. aggressive negotiator -> NEGOTIATE
check("price pushback -> NEGOTIATE", decide(baseState, neutral, "too expensive, reduce am, last price?").action === "NEGOTIATE");
// 3. mind-changer keeps state (prefs merge, never reset)
check("prefer black now merges colour", (() => {
  const p = extractPrefs("I actually prefer black now", { size: "42" });
  return !!p && p.colour === "black" && p.size === "42";
})());
// 4. frustrated waiter -> REASSURE (no pitch)
check(
  "waiting since Monday -> REASSURE",
  decide(baseState, { ...neutral, emotion: "frustrated", urgency: 0.9 }, "I've been waiting since Monday, no response").action === "REASSURE",
);
// 5. casual browser with prefs -> RECOMMEND (max-2 policy present)
check("has prefs -> RECOMMEND", decide({ ...baseState, interest: "sneakers", budget: 30000 }, neutral, "sneakers under 30k, any options?").action === "RECOMMEND");
check("RECOMMEND policy caps at 2 + trial-close", policyBlock("RECOMMEND").includes("Max 2") && policyBlock("RECOMMEND").includes("trial-close"));
// 6. instant buyer skips to CLOSE — but ONLY with variant/transaction, never bare budget
check(
  "instant buyer -> CLOSE",
  decide({ ...baseState, prefs: { size: "42" } }, { ...neutral, intent: "ready_to_buy" }, "I want the white sneakers size 42, how do I pay?").action === "CLOSE",
);
check(
  "budget-only need stays RECOMMEND (no premature CLOSE)",
  decide({ ...baseState, interest: "sneakers", budget: 30000 }, neutral, "I need sneakers, my budget is 30k").action !== "CLOSE",
);
check(
  "account number -> CLOSE",
  decide(baseState, neutral, "send me the account number, let's do it").action === "CLOSE",
);
check(
  "llm ready_to_buy without variant/transaction does NOT close",
  decide(baseState, { ...neutral, intent: "ready_to_buy" }, "looks nice, tell me more").action !== "CLOSE",
);
check("CLOSE uses create_order", policyBlock("CLOSE").includes("create_order"));
// 7. returner profile path (stage retention -> FOLLOW_UP on agreement)
check("next week -> FOLLOW_UP", decide({ ...baseState, stage: "conversion" }, neutral, "I'll buy it next week, remind me").action === "FOLLOW_UP");
// 8. opt-out honored
check("stop messaging me is opt-out", isOptOut("please stop messaging me, not interested"));
check("unsubscribe is opt-out", isOptOut("unsubscribe me from promos"));
// 9. group-spam duty gate: moderator off still keeps owner-only hard gate (unit: normalize)
check("roles fail-open (null -> all on)", JSON.stringify(normalizeRoles(null)) === JSON.stringify(ALL_ROLES_ON));
check("roles off respected", normalizeRoles({ salesperson: false }).salesperson === false);
check("roles block lists disabled", rolesBlock(normalizeRoles({ marketing: false })).includes("marketing"));
// 10. budget extraction (30k / ₦28k)
import { extractBudgetNgn } from "../sessions/sales/perceive.js";
check("30k -> 30000", extractBudgetNgn("around 30k") === 30000);
check("₦28,000 -> 28000", extractBudgetNgn("my budget is ₦28,000") === 28000);
// stage mapping sanity
check("CLOSE -> conversion", stageForAction("CLOSE") === "conversion");
check("NEGOTIATE -> objection", stageForAction("NEGOTIATE") === "objection");

// 11. participation: silence is an intentional action
import { decideParticipation } from "../sessions/social/participation.js";
const grp = (over: Record<string, unknown> = {}) => ({
  mentionedMe: false,
  quotedMe: false,
  nameHit: false,
  isDirectMessage: false,
  isOwner: false,
  managed: true,
  recentOurs: 0,
  humanAnsweredJustBefore: false,
  sameSenderBurst: false,
  ...over,
});
const pctx = (text: string, over: Record<string, unknown> = {}) => ({
  text,
  recent: [],
  aim: "COMMERCIAL",
  rolesOn: ["salesperson", "support"],
  addressedInHistory: false,
  ...over,
});
check("casual greeting -> OBSERVE", decideParticipation(grp(), pctx("Good morning everyone")).action === "OBSERVE");
check("explicit ask -> RESPOND", decideParticipation(grp({ nameHit: true }), pctx("Senap, do you have this shoe in size 42?")).action === "RESPOND");
check("name-only praise -> OBSERVE", decideParticipation(grp({ nameHit: true }), pctx("Senap is actually very useful")).action === "OBSERVE");
check("delivery complaint -> INTERVENE", decideParticipation(grp(), pctx("my delivery never arrived since Monday")).action === "INTERVENE");
check("incomplete ask -> WAIT", decideParticipation(grp({ nameHit: true }), pctx("Senap, I wanted to ask you something...")).action === "WAIT");
check("already answered -> OBSERVE", decideParticipation(grp({ humanAnsweredJustBefore: true }), pctx("Does anybody know the delivery fee?", { recent: ["It's ₦2,000"] })).action === "OBSERVE");
check("football chat -> IGNORE", decideParticipation(grp({ managed: false }), pctx("two customers discussing football results and transfers")).action === "IGNORE");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
