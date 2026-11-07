## Why

Senap sells trust in an AI employee, not software features. Visitors need to *see* an owner delegating by voice/text on WhatsApp and Amaka turning it into planned, approved, visible work within seconds. A static feature grid cannot convey reversible delegation → planning → execution → approval.

## What Changes

- Add a premium dark landing page with nav, hero intro, scroll-controlled story, capability sections, trust/controls, final CTA, and footer.
- Add a reversible scroll-driven story (pinned stage, single master timeline): WhatsApp-style owner instruction → Amaka thinking/response → chat morphs into workspace → 4-task plan → inventory check → promo draft awaiting discount → sales review → report awaiting sharing approval.
- Add a capability rail that illuminates (Conversations, Planning, Inventory, Marketing, Analytics, Reports) as each scene activates, plus post-story infographics (workflow, business tools diagram, memory, control model) built from real React/SVG, not video/images.
- Add local demo fixtures and an interactive state machine (forward/back/reset/replay, real approval controls) with all figures derived from seeded sample data labeled `INTERACTIVE PRODUCT PREVIEW · SAMPLE BUSINESS DATA`.
- Add scroll-motion rules: GSAP ScrollTrigger owns the pinned story (scrub-reversible), Motion owns micro-interactions only; mobile stepper and `prefers-reduced-motion` fallback; transform/opacity-only animation with QA across 1440/1280/1024/768/390/360.

## Capabilities

### New Capabilities
- `scroll-story`: Reversible pinned story, scenes 00–10, master timeline labels, morph layout, rail illumination, progress and annotations.
- `landing-composition`: Page structure (nav/hero/story/capabilities/tools/memory/trust/CTA/footer), design tokens, responsive rules, honest-demo constraints.
- `demo-fixtures`: Sample business (Nala Bags / Everyday Tote / 5 @ ₦4,000), datasets, state machine states/transitions, approval interaction semantics, no-backend guarantees.

### Modified Capabilities
- None (greenfield; no existing specs in `openspec/specs/`).

## Impact

- New Next.js landing route and `components/story/*`, `lib/demo/*`, SVG infographics; new deps `gsap`, `@gsap/react`, `motion`, `lucide-react` (Recharts where charts needed).
- No backend, no real WhatsApp sends, no live customer data; scroll must never trigger external side effects.
- Performance/a11y surface: pinning, scrub smoothness, resize handling, reduced-motion, keyboard/touch targets.
