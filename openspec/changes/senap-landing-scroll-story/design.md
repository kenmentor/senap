## Context

Greenfield Next.js + React + TypeScript landing page for Senap (AI employee). No existing routes, tokens, or components to reuse — `openspec/specs/` is empty. The centrepiece is a scroll-scrubbed, fully reversible product story: owner WhatsApp-style instruction → Amaka response → chat morphs into workspace → 4 tasks → inventory / promo-draft / sales / report with two approval gates. Everything must be real React/SVG elements fed by local fixtures, not video or fake screenshots. Desktop reference 1440×900, max width 1240px.

## Goals / Non-Goals

**Goals:**
- One master GSAP timeline driving all story state from scroll progress (reversible, no timers).
- Chat → workspace morph that reads as "conversation opened work", plus rail illumination and post-story SVG infographics.
- Honest demo: seeded Nala Bags data, labeled sample, no external sends, approvals default to awaiting-input.
- Smooth on desktop, usable stepper on mobile / reduced-motion, transform/opacity-only animation.

**Non-Goals:**
- No backend, auth, billing, real WhatsApp (Baileys/Cloud API), or live analytics in this change.
- No multi-employee, campaign sending, or supplier negotiation — draft/awaiting states only.
- No final pricing numbers; placeholders only.
- No claiming browser QA without running the browser.

## Decisions

- **Single master timeline + one ScrollTrigger (scrub: 1) over per-message triggers.** Why: only a single progress source guarantees reverse parity and jump-to-middle consistency. Alternative (independent triggers per bubble) rejected — desyncs on fast scrub. Config: wrapper ~520svh, pinned 100svh stage, 16s duration, labels per Scene 00–10, `invalidateOnRefresh`, recalc on resize, cleanup on unmount.
- **GSAP owns story transforms; Motion owns micro only.** GSAP: pin, panel morph (560px→430px + 660px workspace + connecting line), SVG draw, scrubbed typewriter (char-count mapping, no timers). Motion: nav bg 200ms, CTA hover 160ms, dialog/pop. Never both on same element. Rationale: avoids fighting transforms and keeps scrub deterministic.
- **Typewriter as progress function, thinking dots as timeline values.** Owner ~28–35 chars/timeline-sec, employee slightly slower; cursor visibility derived from progress. Three-dot "thinking" opacity/Y from timeline, not infinite CSS loop, so reverse hides them.
- **Separation: scroll presentation vs business action state.** `lib/demo/*` fixtures are source of truth (product, orders, customers, tasks, messages); a small state machine (`idle → owner_typing → sent → thinking → responded → plan → inventory → promo(awaiting) → sales → report(awaiting) → completed`) supports forward/back/reset/replay + real approval buttons. Scroll sets presentation progress; clicks set intent flags that do not fire network calls. Open decision captured in spec: approvals reset on scroll-back for demo clarity (default) vs persist — default to reset, document explicitly.
- **Cinematic single-focus staging: one scene owns the viewport at a time.** No annotation + chat + rail crowding. Each scene fades/slides in large, holds, then animates out before the next enters (strict sequencing, generous whitespace). Chat is exact WhatsApp dark: bg #0B141A, panels #111B21/#1F2C34, outgoing #005C4B, incoming #1F2C34, accent #00A884. Chat panel is large (720–800px, 18–20px message text, 28px padding, radius 18–22) so it reads professional, not static. Rail collapses to minimal bottom dots/progress; captions are single-line overlays that swap per scene.
- **Mobile + reduced-motion as stepper, not shrunk pin.** Under ~768px (and whenever `prefers-reduced-motion`): no long pin; step pager with Next/Back/Replay rendering same components at discrete states. Rationale: pin + scrub is unusable with small viewport, touch scroll hijack, and low-end Android/3G constraints.
- **Components split by responsibility.** `components/story/ScrollStory / StoryStage / WhatsAppPanel / OwnerMessage / EmployeeMessage / EmployeeWorkspace / TaskTimeline / InventoryWidget / MarketingWidget / ReportWidget / ApprovalWidget / StoryAnnotations / StoryProgress` plus section components (Nav, Hero, WorkflowDiagram, Demos, Capability, Integration, Memory, Trust, Results, Pricing, FAQ, Footer). SVG via viewBox for lines/nodes; Recharts only where charts genuinely visualize demo data.

## Risks / Trade-offs

- [Risk] Fast scrub / jump-to-middle desyncs typewriter and card overlap → Mitigation: char-count mapping, overlapping (not abrupt) transitions, QA at 0/10/…/100% both directions + rapid + resize-mid-pin.
- [Risk] Pin jank from layout thrash or heavy DOM → Mitigation: transform/opacity only, lazy-load offscreen sections, no huge images, SVG over raster, single ScrollTrigger instance.
- [Risk] Approval semantics confuse (click then scroll back) → Mitigation: default reset-on-back, label as demo control, never show published/sent.
- [Risk] Discount unspecified + Naira formatting + voice-amount ambiguity misread as completed work → Mitigation: `DISCOUNT: NEEDS OWNER INPUT`, promo stays draft, report stays awaiting-share.
- [Risk] Generic SaaS look (shadcn default + purple gradients) → Mitigation: own the tokens, rounded chat geometry, restrained shadows, no glass/floaters/emoji-icons; Frontend/UIUX/Infographic/Motion/Guidelines skills gate visual reviews.
- [Risk] Overpromising autonomy or ban safety → Mitigation: copy guardrails — draft/approved/published distinguished, no bulk-send claims, no testimonials/stats fabrication.
