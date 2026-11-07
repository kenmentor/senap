## ADDED Requirements

### Requirement: Page composition follows defined structure
The system SHALL provide nav, hero intro, pinned scroll story, capabilities infographic, business-tools diagram, memory section, control/trust section, final CTA, and footer in that order.

#### Scenario: Visitor understands product without long reads
- **WHEN** visitor scrolls the page top to bottom
- **THEN** each section presents a short heading with visual composition (demo, diagram, or preview) and body copy stays within narrow measure.

### Requirement: Design tokens and typography are consistent
The system SHALL define reusable CSS variables for backgrounds (#090A0C/#101216/#171A20), texts (#F5F5F2/#A0A4AD/#6F7580), border, accent (#FF8A3D configurable), success/warning/error, and SHALL apply the type scale (hero 72 / section 48 / sub 24 / body 16 / label 12) with max widths 1240px content, 900px hero, 620px body.

#### Scenario: Accent retheme without component edits
- **WHEN** accent variable value changes
- **THEN** all accent treatments update without modifying component code.

### Requirement: Navigation and hero direct into story
The system SHALL render a 76px sticky nav (logo left, links centre, Sign in + `Hire an employee` right; transparent → near-black + border on scroll) with accessible mobile panel, and a ~680px hero (`YOUR BUSINESS, WITH AN EXTRA EMPLOYEE`, two-line `Meet the employee who gets things done.`, support line, `Meet your employee` + `See how it works`, trust line) with a small non-competing preview.

#### Scenario: Mobile nav is usable
- **WHEN** viewport is 390px wide
- **THEN** logo + menu control show, panel opens full-width with keyboard focus support and no horizontal overflow.

### Requirement: Post-story sections are visual, not walls of text
The system SHALL render connected SVG workflow (Hire→Understand→Delegate→Execute→Report), tools diagram (employee centre linked to WhatsApp/records/inventory/orders/docs/reports), memory illustration, permission model (independent / approval / forbidden + logs/interrupt), and results previews with draft/approved/published distinguished.

#### Scenario: Workflow draws with scroll
- **WHEN** workflow section enters view
- **THEN** nodes appear in reading order and SVG connectors draw progressively, reorganised vertically on mobile.

### Requirement: Responsive and reduced-motion fallbacks exist
The system SHALL serve desktop pin (1240px/72px padding, tablet 40px, mobile 20px) and SHALL replace long scrub with an accessible stepper (Back/Next/Replay) on small screens and whenever `prefers-reduced-motion` is set, preserving all story content without pinning.

#### Scenario: Reduced-motion visitor gets stepper
- **WHEN** reduced-motion is preferred
- **THEN** no pin/scrub runs and the visitor steps through identical states via controls with full keyboard support.
