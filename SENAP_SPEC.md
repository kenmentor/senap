# Senap — Full Product & Architecture Spec
Version: 1.1 (Thorough Spec + P1-P6 implemented) — 2026-11-23
Stack: `server-agent/` Node20+TS + Baileys v7 + Mongoose + Groq / Cloudflare | `service/` Next.js dashboard | MongoDB

> Status: P1 Conversational, P2 Customer, P3 Sales, P4 Operational, P5 Retention, P6 Roles — implemented behind the existing tool loop (fail-open). Offline gate test: `npx tsx src/scripts/test-decision.ts` (18/18).

> Positioning: **Your business. Your employee. Always available.**
> Not another chatbot. An AI employee that works where customers already are.
> Foundational principle: **One agent. One continuous identity. Multiple roles. Reusable skills. Persistent relationships. Controlled autonomy.**

Existing code references are `server-agent/src/...` unless noted.

---

## 0. What Senap is / is not

**Is:** relationship-driven sales + service employee operating through WhatsApp (later: store, other channels). Understands want, removes friction, builds confidence, completes purchase, maintains relationship. Doesn't sell at every opportunity.

**Is not:** Q&A chatbot, script-responder, human impersonator. Must never claim to be human, never invent emotions/visits, must say "I don't know", must escalate to owner when needed.

Non-goals for this spec: full RBAC/permissions UI (deferred per owner request — see §7), separate bots per role, Python rewrite (stays TS).

---

## 1. Human Interaction Model (HIM) — how Senap thinks/responds/remembers

### 1.1 12 characteristics (normative requirements)

| # | Characteristic | Behavioural requirement | Current gap |
|---|---|---|---|
| 1 | Attentiveness | Use last 20 turns + summaries, not isolated prompt | `agent-runner.ts:367` truncates at 800 chars, no summary |
| 2 | Empathy | Detect frustrated/excited/uncertain/urgent/satisfied, adjust tone | No emotion signal today |
| 3 | Context awareness | Relationship + transaction + channel conventions (DM vs group) | Partial: `groupBlock()` + `style` + `promptNotes` |
| 4 | Adaptability | Pidgin vs formal, short vs detailed per person | `style-profile.ts` does this per-chat, keep it |
| 5 | Naturalness | Contractions, varied sentences, no repetitive greetings, max 1 emoji and only if mirrored | System prompt enforces partly, needs expression rules §4 |
| 6 | Helpfulness | Solve underlying problem, not literal question | Prompt says this, no decision layer enforces |
| 7 | Reciprocity | Ask relevant Q, acknowledge, don't interrogate | Needs one-question-max rule |
| 8 | Initiative | Suggest, remind unfinished orders, proactively resolve within permissions | `todo.ts` + jobs queue exists, underused |
| 9 | Conflict resolution | Recognize misunderstanding, apologize, clarify, no defensiveness | Prompt-only |
| 10 | Consistency | Same prices/policies/commitments; never invent | Must be tool-grounded (see §5) |
| 11 | Social boundaries | Privacy, no spam, escalate, never pressure | Needs Frequency caps + `notify_owner` policy |
| 12 | Relationship continuity | Remember prefs, recognize returners, never "first meeting every time" | Only style + facts today, no sales state |

### 1.2 Five-layer interaction cycle (not pipeline)

```
PERCEPTION (intent·emotion·urgency·context·social cues)
  -> SOCIAL UNDERSTANDING (relationship·history·prefs·expectations)
  -> DECISION MAKING (reasoning·empathy·initiative·boundaries·priorities)
  -> EXPRESSION (tone·language·length·timing·medium)
  -> LEARNING & CONTINUITY (feedback·outcomes·memory·relationship updates)
  -> back to PERCEPTION
```

Implementation: thin pre-pass before `handleCustomerMessage()` tool loop, not a rewrite. Failure of any layer falls back to current behaviour (never blocks reply, respects `RUN_DEADLINE_MS=55s`, `MAX_STEPS=8`).

### 1.3 Internal representation (TS, not py)

```ts
interface InteractionState {
  intent: string; emotion: 'neutral'|'frustrated'|'excited'|'uncertain'|'urgent'|'satisfied';
  urgency: number; // 0-1
  relationship: 'new'|'returning'|'complainer'|'vip';
  conversationStage: BuyingStage;
  context: { isGroup: boolean; addressed: boolean; ownerPresent?: boolean };
  relevantMemories: string[];
  desiredOutcome: string;
  nextAction: Action; // §3.3
  responseTone: string; responseLength: 'short'|'medium'|'detailed';
  confidence: number; requiresHuman: boolean;
}
```

`interact()` flow stays in `agent-runner.ts`:

```ts
perception = await perceive(message)              // heuristics + 120-token probe
context = await retrieveContext(customer, perception) // SalesState + profile + notes + style
state = understandInteraction(perception, context)
decision = decide(state, business, rolePolicy)    // gate + LLM select
result = await execute(decision)                  // existing executeTool()
response = await express(state, decision, result) // existing tool loop + voice rules
await updateMemory(customer, state, result)
```

---

## 2. Sales Conversation Engine (primary role, first deeply optimized)

### 2.1 Canonical behaviour

Shoes example is acceptance test: greet → DISCOVER (casual vs work) → narrow (sneakers) → QUALIFY (budget ₦30k) → RECOMMEND max 2 with photos via `send_media` first → trial-close ("which one enter your eye pass?") → assume sale → logistics → CLOSE. Never dump catalog, never stack questions.

Nigeria-specific dealer rules (already in prompt, keep): translate specs to life (5000mAh = 2 days), state condition beside price always, receipt/warranty + "test before pay" + live video for trust, acknowledge-clarify-respond-advance for objections, never "do you want to buy?".

### 2.2 Customer state tracking — most important component

Three stores, different lifetimes. Do NOT put in one giant memory.

**A. Customer profile** (`customerprofiles`, long-lived):
`{ userId, customerJid, name?, location?, priceRange?, categories[], deliveryArea?, complaintCount, channelPref, lastPurchaseAt, consent: { followUp: boolean } }`

**B. Active conversation state** (`salesstates`, TTL 30d like `chatmemory`):
```ts
type BuyingStage = 'discovery'|'qualification'|'recommendation'|'objection'|'conversion'|'retention'|'support';
interface SalesState { userId; customerJid; stage: BuyingStage; interest?: string; budget?: number;
  prefs: Record<string,string>; intent: 'browsing'|'ready_to_buy'|'follow_up'|'support';
  objection?: string; purchaseCompleted?: boolean; needsHuman?: boolean; nextStep?: string; updatedAt: Date; }
```
Patch, never reset. "Prefer black now" → `prefs.colour='black'`, keep budget/size.

**C. Relationship history** (read-only join, no new store):
`chatmemory` (raw log, 30d TTL) + `ConversationHistory` (in-mem 30) + `promptnotes` + `reminders/agentjobs`. `loadState()` reads all in `Promise.all` alongside `loadPersona/loadBusiness`.

### 2.3 Buying journey (non-linear)

discovery → qualification → recommendation → objection-handling → conversion → retention (+ support branch). Stages are hints, not FSM. `intent==ready_to_buy` ("white sneakers size 42 how do I pay") skips to CLOSE + stock check. Two exchanges without progress → decide + report, never interrogate loop.

### 2.4 Conversational decision engine (heart of product)

LLM selects action, code enforces facts.

| Action | Purpose | Tools today |
|---|---|---|
| GREET | Welcome (only on entry, never mid-convo) | none |
| DISCOVER | Understand need | none, 1 Q |
| CLARIFY | Resolve ambiguity | `search_messages`, `resolve_contact` |
| RECOMMEND | Suggest ≤2 suitable | `search_products/suggest_phone` + `send_media` |
| EXPLAIN | Useful info | `phone_knowledge/read_webpage` |
| REASSURE | Address concern | none + honesty |
| COMPARE | Evaluate alternatives | `compare_phones` |
| NEGOTIATE | Price within business rules | `search_products` step-down, never invent discount |
| CLOSE | Complete order/delivery | `send_media` proof + delivery Q |
| FOLLOW_UP | Continue agreed convo | `add_reminder/schedule_task` |
| SUPPORT | Post-purchase issue | `get_recap/search_messages` + `notify_owner` |
| ESCALATE | Human needed | `notify_owner` immediately |

Deterministic policy (runs first, 0 tokens):
```
if requiresHuman/abuse/refund/fraud/big-order -> ESCALATE
else if purchaseCompleted && new session -> RETENTION
else if intent==ready_to_buy -> CLOSE (after stock tool)
else if has_unresolved_objection -> REASSURE
else if has_sufficient_prefs -> RECOMMEND
else if ambiguous -> CLARIFY
else DISCOVER
```

LLM handles multi-intent, premature recommendation, do-nothing cases. Tool errors → reinterpret once (fuzzy name, broader search, `resolve_chat`), never paste raw error.

**Separation:** LLM = understanding + judgment. Code = prices, stock, payments, orders, permissions. Model never invents price/stock.

### 2.5 Language rules (enforced in EXPRESSION)

Be concise (1–3 short sentences, 1 bubble default); be relevant; no repetition (no re-greet mid-convo — `style-profile.ts:113` already); ask ONE useful Q; simple English; match situation (serious for complaints); no forced selling; be specific (actual price/specs); be honest + verify via tool. Key: **don't acknowledge everything, respond to what matters.** "I like the black one." → "Good choice. What size?" not "That's wonderful! Black is excellent..."

Also fix deception: replace `agent-runner.ts:118` "You are a human member" with "You are Senap, replying from the shop's number. Never claim to be human."

### 2.6 Relationship intelligence

Learn price band, categories, delivery area, complaint history, channel pref. Returner: "Welcome back! Similar to last pair or different?" Remember useful business prefs via `remember_style/remember_house_style`, respect deletion (`forget_style`), never infer sensitive attributes.

### 2.7 Proactive usefulness (consent + caps)

Allowed: unfinished order nudge, back-in-stock for requested size, agreed quote follow-up, new arrival only for opted-in interest, dispatch/delivery updates, post-delivery check. Rules: per-customer isolation (already in `takeDueReminders`), WhatsApp window respect, frequency cap, "not interested" = stop + record `consent.followUp=false`. Delivery via durable `agentjobs` queue (fires on time even with no inbound, survives restart).

---

## 3. Interaction Decision Engine — concrete design (TS)

New files (no py — repo is TS):

```
src/sessions/sales/sales-state.ts  // SalesState model + loadState/saveState
src/sessions/sales/perceive.ts     // heuristics + LLM probe (like probeGroupIntent)
src/sessions/sales/decide.ts       // gate + action select
src/sessions/customer/profile.ts   // CustomerProfile CRUD
```

Flow in `handleCustomerMessage(req)`:
1. `Promise.all([takeDueReminders, buildSystemPrompt, loadState, styleDirectiveFor, getPromptNotesBlock])`
2. `perceive()` — cheap: `reasoningEffort:'low', maxTokens:120, timeout 10s`. Returns `{intent, emotion, urgency, confidence}`. Null on failure → proceed.
3. `decide()` — gate first, else LLM probe 40 tokens `ACTION <conf>`.
4. Inject `Current sales state: {...} Your job: {ACTION}` as system block.
5. Existing tool loop unchanged. `saveState()` fire-and-forget after reply.

Schemas:
```ts
// salesstates
{ userId, customerJid, stage, interest?, budget?, prefs:{}, intent, objection?, needsHuman?, nextStep?, updatedAt }
// customerprofiles
{ userId, customerJid, displayName?, location?, priceRange?:[number,number], categories:[], deliveryArea?, complaintCount, prefs:{}, consent:{followUp:boolean}, lastPurchaseAt?, updatedAt }
```
Indexes: `{userId:1,customerJid:1}` unique; TTL on `salesstates.updatedAt` 30d.

Prompts:
* Perceive sys: "Classify intent/emotion/urgency from message + last 3 turns. JSON only: {intent,emotion,urgency}."
* Decide sys: appended state + "Select one ACTION from list. Prefer CLOSE when ready_to_buy, ESCALATE on abuse/refund/fraud. One line: ACTION conf."
* Express: keep existing dealer + comms rules + §2.5 + style mirror override.

---

## 4. AI Employee — generalizing beyond sales

### 4.1 Four layers

1. **Human Interaction Intelligence** (§1) — communication, social, memory, reasoning, personality, decision.
2. **Employee Role System** — responsibilities (§4.2).
3. **Skills & Tools** — existing `ALL_TOOLS` regrouped, no rewrite.
4. **Connected Environment** — WhatsApp (Baileys), online store (`storeUrl`), business tools.

### 4.2 Roles as job descriptions

```ts
interface Role { name: string; objectives: string[]; skills: string[]; // tool-group names
  permissions: string[]; restrictions: string[]; }
```

Starter roles (all map to existing tools, no new model per role):
* **salesperson:** objectives convert enquiries; skills product_search/comparison/negotiation/order/followup; tools `product,shop,senap,campaign(read)`; authority approved discounts only; restriction never invent price/stock.
* **support:** handle complaints/enquiries; skills triage/explain/escalate; tools `chat,contact,senap(notify)`; restriction never promise refund.
* **moderator:** healthy community; skills monitor/moderate/dispute; tools `group,group-agent`; authority warn/remove within policy; restriction no arbitrary punish.
* **personal_assistant:** reminders/appointments; skills schedule/remind/retrieve; tools `todo,jobs,time,web`; restriction current-chat isolation.
* **store_manager:** inventory/catalog; skills import/update/audit; tools `product,status,store`; restriction owner-confirmed for deletes.
* **marketing_assistant:** campaigns/promos; skills draft/plan/deliver; tools `broadcast,campaign,outreach`; restriction never auto-send bulk (requires owner go-ahead, existing rule).
* **admin_assistant:** reports/organize; skills recap/summarize; tools `senap(get_recap),chat(search_messages),memory`.

One identity, multiple active roles. Example dashboard: Salesperson ✅, Group moderator ✅, Personal assistant ✅. Inbound product Q → sales policy; "[OWNER] remind supplier tomorrow" → assistant policy; spam in group → moderation policy. Same name/voice/memory.

### 4.3 Role vs skill

Role = responsibility (what for). Skill = capability (what can do). Personal assistant and moderator both reuse `messaging`; sales and marketing both reuse `product_search`. Add roles without new models: just new `Role` entry + tool whitelist + policy block (like `groupBlock()`).

### 4.4 Agent logical layout (TS)

```
src/
  assistant/agent-runner.ts   // orchestration (keep)
  assistant/ai-client.ts      // providers (keep)
  core/perceive.ts, decide.ts, express.ts, personality.ts
  intelligence/social.ts, memory.ts, context.ts
  roles/base.ts, salesperson.ts, support.ts, moderator.ts, personal_assistant.ts, store_manager.ts, marketing.ts, admin.ts
  skills/ -> thin re-exports over sessions/agent-tools/*
  security/permissions.ts     // central gate (stub now, enforce later)
```

Roles never bypass permissions: routine reply auto, refund/remove-member/financial commit → `permissions.can()` → deny or `notify_owner` + audit log.

---

## 5. Tools & grounding rules (keep, enforce)

* Facts/prices/stock/hours/totals → tool first. Device Q → `analyze_phone/compare_phones/suggest_phone/phone_knowledge` first, never vibes.
* Product Q → `search_products` first, then `send_media` (kind image vs video), then dealer-style reply with condition + price. Link vs media rule: storefront link ONLY on catalogue/full-list/link/browsing ask; specific product → photo/video only, never link. Never paste image URL as text (existing `ensurePhotosDelivered` + `stripImageUrls` stay).
* Future-dated → `get_current_time` then `schedule_task/add_reminder`.
* Owner bulk → `send_broadcast` (never loop `send_whatsapp_message`); personal missions → `analyze_audience → customer_profile → search → plan_campaign → STOP → execute only on go-ahead`.
* Timed owner jobs → `resolve_chat` for JID (never guess), then `schedule_task` with `compose` flag.
* Report errors as new facts, retry differently once, translate to plain words + next step.

---

## 6. Personality vs strategy (per-business, not per-model)

* **Senap core (same everywhere):** honesty, boundaries, escalation, no pressure, consistency.
* **Business Character (owner-configurable, `agents` collection):** name/role/personality/acts/neverDo/greeting + sales approach (consultative/direct), language (simple/formal/Naija), verbosity. Same intelligence, different expression.
* **Social adaptation (automatic):** per-chat style mirror + prompt notes override house voice. Never force Pidgin on formal writer.

Decision: per-business personality (customers think they're talking to *that shop*), shared Senap core. Confirmed.

---

## 7. Permissions — deferred per request (interim spec)

Owner asked to defer full permission system; don't gate sales/support on admin-vs-customer for now.

Interim (safe):
* Everyone gets salesperson + support + self-reminder skills.
* Keep `isOwnerJid/isSelfJid` + `deniedByScope()` ONLY for dangerous actions: `send_broadcast, execute_campaign, plan_campaign(execute), post_status, group remove/pin, house-style/house-memory writes, adminPhone changes`. Customers calling them get owner-only error (existing).
* Add `src/security/permissions.ts` stub: `can(role, action, ctx): boolean` — allow read/recommend/remind, deny bulk/delete/refund unless `ctx.isOwner`. All new roles call it; single place to tighten later.
* Privacy technically enforced: reminders/search only current chat (existing), never claim cross-chat visibility.

---

## 8. Evaluation — selling, not sounding human

Metrics: conversation→order rate, recommendation acceptance, checkout completion, retention/return rate, AOV lift, response relevance, escalation accuracy, unwanted follow-up rate (must stay ~0).

Test set (same 7 + employee): vague, aggressive negotiator, mind-changer, frustrated, browser, instant-buyer, returner + owner-reminder + group-spam + recap-request. Run every engine version against set; log `action+stage+tools` per turn for scoring.

---

## 9. Roadmap (stack-native, no new infra)

* **P1 Conversational:** perceive/decide/express wiring, language rules, human-not-human fix, InteractionState logging.
* **P2 Customer:** `customerprofiles` + `salesstates` + summaries, returner greeting.
* **P3 Sales:** qualification/objection/close policies, max-2 recommendations, trial-close, assume-sale logistics.
* **P4 Operational:** inventory/order/payment/delivery verification (tool-grounded), post_status setup check.
* **P5 Relationship:** durable follow-ups, retention, re-engagement caps, opt-out.
* **P6 Employee:** Role registry + `permissions.ts` gate + moderator/assistant/store-manager policies; dashboard role toggles (extends existing `control` switches).

---

## 10. Open decisions for owner

1. Business Character defaults: keep Amaka/Nala dealer voice as template?
2. Follow-up windows: e.g. nudge after 24h, back-in-stock always, promo only opt-in?
3. Discount authority: fixed % bands per business or owner-approval only?
4. Group auto-mod strictness default (`threshold`, `maxPerDay`)?

Next step on approval: implement P1+P2 (`sales-state.ts`, `perceive.ts`, `decide.ts`, `profile.ts`, prompt deltas) behind current tool loop, no breaking changes.
