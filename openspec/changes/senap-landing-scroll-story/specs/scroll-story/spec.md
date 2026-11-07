## ADDED Requirements

### Requirement: Master scrubbed timeline is single source of truth
The system SHALL drive the entire story from one GSAP master timeline with one ScrollTrigger (scrub) so scroll position alone determines visual state and reverse scroll restores prior states.

#### Scenario: Scrub forward reveals then scrub back retracts
- **WHEN** visitor scrolls from 0% to 100% then back to 0%
- **THEN** messages, plans, cards, and statuses appear in order on the way down and retract in reverse order on the way up with no stuck states.

#### Scenario: Jump to middle lands in consistent state
- **WHEN** visitor jumps directly to ~60% progress
- **THEN** inventory scene is visible with prior chat intact and later scenes (promo/sales/report) hidden.

### Requirement: Typewriter and thinking states are timeline-derived
The system SHALL reveal owner and employee text as a function of timeline progress (stable char-count mapping, cursor while revealing) and SHALL render thinking dots from timeline values, never from independent timers.

#### Scenario: Text matches progress
- **WHEN** timeline is at 50% of the owner-typing window
- **THEN** approximately half the owner characters are visible and the send control is not yet activated.

### Requirement: Cinematic single-focus scenes
The system SHALL display exactly one scene at a time centred large (720–880px stage, 18–24px message text, generous padding), each scene animating in, holding, then animating out before the next enters, with WhatsApp-dark styling (bg #0B141A, outgoing #005C4B, incoming #1F2C34, accent #00A884) and Apple/WhatsApp system type.

#### Scenario: One scene owns the viewport
- **WHEN** progress is inside any scene window
- **THEN** only that scene is visible centred with ample whitespace, caption + dots reflect it, and no annotation, rail, or second panel crowds the stage.

### Requirement: Task plan and scene widgets appear sequentially
The system SHALL show four tasks (inventory, promotion, sales review, report) top-to-bottom then activate InventoryWidget, MarketingWidget, sales dashboard, and ReportWidget at their scene windows with status transitions (e.g. COMPLETED, AWAITING APPROVAL).

#### Scenario: Promotion stays draft without discount
- **WHEN** story reaches 80% without owner discount input
- **THEN** promo shows draft copy, current ₦4,000 price, 5 available, `DISCOUNT: NEEDS OWNER INPUT`, and status `PROMOTION DRAFTED · AWAITING APPROVAL`, never published.

#### Scenario: Report gates sharing on approval
- **WHEN** story reaches 95%
- **THEN** spreadsheet preview is visible with `SHARE WITH MR CHI?` and Approve/Review controls defaulting to awaiting approval, with no simulated external send.

### Requirement: Capability rail illuminates with scenes
The system SHALL keep a right-side rail (Conversations, Planning, Inventory, Marketing, Analytics, Reports) muted initially and brighten each item with accent indicator as its scene activates; on mobile it SHALL render as compact horizontal progress.

#### Scenario: Rail tracks story
- **WHEN** inventory scene is active
- **THEN** Inventory is primary text/bright icon with accent marker while inactive items remain muted and the rail itself does not shift layout.
