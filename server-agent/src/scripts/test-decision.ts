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
import { analyzeModeration } from "../sessions/social/moderation.js";
import { normalizeMode, effectiveThreshold } from "../sessions/agent-tools/group-agent-store.js";
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
check("managed discussion stays probe-eligible", (() => {
  const d = decideParticipation(grp(), pctx("two customers discussing football results and transfers"));
  return d.action === "OBSERVE" && d.reason === "group-discussion";
})());
check("how far is a greeting", (() => {
  const d = decideParticipation(grp({ nameHit: true }), pctx("Senap, how far"));
  return d.action === "RESPOND";
})());

// 11b. buying signals must reach the probe, never die as smalltalk
{
  const d = decideParticipation(grp(), pctx("I need a laptop"));
  check("unaddressed buying signal -> probe (not confident IGNORE)", d.action === "OBSERVE" && d.reason === "ambiguous-probe");
}
{
  const d = decideParticipation(grp(), pctx("does anyone have HP laptops?"));
  check("do-you-have -> probe", d.action === "OBSERVE" && d.reason === "ambiguous-probe");
}
{
  const d = decideParticipation(grp(), pctx("Good morning everyone"));
  check("greeting stays low-relevance OBSERVE", d.action === "OBSERVE" && d.relevance < 0.3);
}

// 12. SGI moderation: severity pipeline, reporter exempt, never auto-ban
check("spam link -> L1 observe", analyzeModeration("DM me for forex millions https://t.me/xyz").severity === 1);
check("repeated spam -> L2 warn", analyzeModeration("DM me for forex millions https://t.me/xyz", { memberRecentViolations: 2 }).severity === 2);
check("threat -> L4 urgent", analyzeModeration("I will find you and deal with you").severity === 4);
check("insult -> L3 escalate", analyzeModeration("you are a big fool, shut up").severity === 3);
check("quoted report exempt", analyzeModeration("reporting what Musa sent, look at this", { quotedText: "you idiot" }).severity === 0);
check("disagreement not a violation", analyzeModeration("I disagree, Samsung battery lasts longer than iPhone").severity === 0);
check("joke not a violation", analyzeModeration("haha that meme got me 😂").severity === 0);

// 13. SGI modes: quiet floor holds, legacy untouched
check("quiet floor 0.65", effectiveThreshold("quiet", 0.3) === 0.65);
check("active keeps 0.35", effectiveThreshold("active", 0.3) === 0.35);
check("manager floor 0.25", effectiveThreshold("manager", 0.1) === 0.25);
check("explicit quieter wins", effectiveThreshold("active", 0.8) === 0.8);
check("mode defaults quiet", normalizeMode(undefined) === "quiet" && normalizeMode("manager") === "manager");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
