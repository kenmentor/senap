## ADDED Requirements

### Requirement: Seeded demo dataset is source of truth
The system SHALL source all story figures from local fixtures (`lib/demo/business`, `products`, `orders`, `customers`, `tasks`, `messages`) for Nala Bags / Everyday Tote / 5 units @ ₦4,000 / ₦20,000 potential, with internally consistent sales charts, and SHALL label the stage `INTERACTIVE PRODUCT PREVIEW · SAMPLE BUSINESS DATA`.

#### Scenario: Figures match fixtures
- **WHEN** inventory, sales, and report widgets render
- **THEN** stock, price, value, order counts, revenue, and customer splits equal fixture values with no invented changes.

### Requirement: Demo state machine supports forward/back/reset
The system SHALL implement states `idle, owner_typing, sent, thinking, responded, plan, inventory, promo_draft, discount_required, sales_reviewed, report_created, sharing_approval_required, completed` with transitions forward, backward, reset, and replay, keeping scroll presentation separate from business intent.

#### Scenario: Replay restores start
- **WHEN** visitor triggers Replay from completed
- **THEN** machine returns to idle with empty conversation, dim rail, and awaiting-state approvals.

### Requirement: Approvals are real controls with safe defaults
The system SHALL render `Set discount / Keep original price` and `Approve sharing / Review first` as functional controls defaulting to awaiting-input; scrolling back SHALL reset demo approval flags and the story SHALL never display promo as published nor report as sent.

#### Scenario: Approval does not send externally
- **WHEN** visitor clicks Approve sharing in the demo
- **THEN** UI reflects approved intent locally with no network call, no real message, and no customer data access.

### Requirement: Honest-demo constraints hold
The system SHALL NOT claim live WhatsApp connection, SHALL NOT trigger real API sends on scroll, SHALL NOT fabricate testimonials or performance stats, and SHALL keep discount unspecified until owner input and external sharing gated on approval.

#### Scenario: Audit finds no false claims
- **WHEN** copy and states are reviewed
- **THEN** no screen asserts completion before its scene, no live-connection badge appears, and sample labels remain present.
