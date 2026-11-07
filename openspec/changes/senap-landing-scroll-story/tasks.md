## 1. Setup and foundations

- [x] 1.1 Inspect existing Next.js/React/TS/Tailwind/shadcn setup and record routes, tokens, components to reuse
- [x] 1.2 Install `gsap`, `@gsap/react`, `motion`, `lucide-react` (plus Recharts where charts needed) and verify build
- [x] 1.3 Define CSS variables and type scale per design (bg/surface/text/border/accent/success/warning/error, 1240/72-40-20, 72/48/24/16/12)
- [x] 1.4 Create `lib/demo/*` fixtures (business, products, orders, customers, tasks, messages) for Nala Bags / Everyday Tote / 5 @ ₦4,000 with consistent sales figures
- [x] 1.5 Implement demo state machine (idle→completed incl. discount_required/sharing_approval_required) with forward/back/reset/replay and no network side effects

## 2. Page shell

- [x] 2.1 Build sticky 76px nav (transparent→near-black, mobile panel, `Hire an employee` CTA)
- [x] 2.2 Build hero (~680px, eyebrow, two-line headline, support + trust lines, dual CTAs, small preview)
- [x] 2.3 Scaffold page order: nav/hero/story/capabilities/tools/memory/trust/CTA/footer with 1240px container

## 3. Scroll story core

- [x] 3.1 Build `ScrollStory` + `StoryStage` with 520svh wrapper, pinned 100svh stage, single ScrollTrigger (scrub 1, 16s labels, invalidateOnRefresh, cleanup)
- [x] 3.2 Build `WhatsAppPanel`, `OwnerMessage`, `EmployeeMessage` with timeline-derived typewriter and send activation
- [x] 3.3 Build thinking dots + `UNDERSTOOD · 4 TASKS IDENTIFIED` transition driven by timeline values
- [x] 3.4 Implement chat→workspace morph (shift −180px, 560→430 + 660px, connecting line, overlapping transitions)
- [x] 3.5 Build `TaskTimeline` with 4 sequential rows and status/progress indicators

## 4. Scene widgets and rail

- [x] 4.1 Build `InventoryWidget` (image, name, 5 units, ₦4,000, ₦20,000) with count reveal and COMPLETED check
- [x] 4.2 Build `MarketingWidget` draft (title/price/stock/caption, `DISCOUNT: NEEDS OWNER INPUT`, Set-discount/Keep-price controls, awaiting status)
- [x] 4.3 Build sales dashboard from fixtures (orders/revenue/best-seller/new/returning) with real charts labeled sample data
- [x] 4.4 Build `ReportWidget` + `ApprovalWidget` (spreadsheet preview, `SHARE WITH MR CHI?`, Approve/Review defaulting awaiting)
- [x] 4.5 Build capability rail + `StoryProgress` + `StoryAnnotations` (mute→bright per scene, mobile horizontal variant)

## 5. Post-story infographics

- [x] 5.1 Build customer-conversation mini-demo (ask→lookup→answer→delivery from fixtures)
- [x] 5.2 Build Hire→Understand→Delegate→Execute→Report SVG workflow with progressive line draw (vertical on mobile)
- [x] 5.3 Build tools diagram (employee centre → WhatsApp/records/inventory/orders/docs/reports) and memory illustration
- [x] 5.4 Build control/trust visuals (independent/approval/forbidden, logs, interrupt) and results previews (draft/approved/published split)
- [x] 5.5 Build pricing placeholders, FAQ (no unsupported promises), final CTA, and footer

## 6. Responsive, motion safety, and QA

- [x] 6.1 Implement mobile stepper and `prefers-reduced-motion` fallback rendering same states without pin/scrub
- [x] 6.2 Enforce transform/opacity-only animation, lazy-load offscreen, single ScrollTrigger, resize handling
- [ ] 6.3 Browser-inspect at 1440/1280/1024/768/390/360: capture 0/10/…/100% both directions, rapid scrub, jump-to-middle, resize-mid-pin; fix wrap/clip/z-index/overflow
- [ ] 6.4 Audit a11y/perf (contrast, focus, keyboard, touch targets, console/build/TS clean) and report files, timeline labels, limitations
