# Senap dashboard — design record

Written on the dashboard Home cleanup (ui-ux skill, branch U, "just build it").

## Brief (U1)

- **Product:** Senap — a WhatsApp sales agent for small shops.
- **For:** shop owners selling over WhatsApp, mostly on phones.
- **Main jobs:** 1. link WhatsApp so the agent answers, 2. add products so it
  has something to sell, 3. glance that it's working.
- **Platform:** phone first (bottom tab bar, safe-area, PWA install nudge).
- **Differentiator:** the agent itself holds the conversation and imports
  products from status posts.

## Face + accent

- Keep the project's own style: dark flat WhatsApp theme (`#111b21` surfaces,
  `#00a884` accent). No new palette, no new font.
- Tokens live as CSS vars (`--bg`, `--accent`, …) in `tailwind.config.js`.

## Decisions (Home `app/dashboard/page.tsx`)

- New user (`lineCount === 0`): journey card ("Get selling in 3 steps") alone
  replaces the whole grid — no refresh row, no AgentAccess, no Needs
  attention, no Customers & growth. Per `dashboard.md`: a fresh workspace gets
  the getting-started frame instead of five "nothing yet" empties.
- Operational blocks render only once a line exists (`hasLine`).
- Sections auto-open only with content inside
  (`attention: count > 0`, `growth: chats/tools/traffic > 0`); an explicit
  tap is stored in `dashboard-home-sections` and always wins afterwards.
- No new copy, no logic/data changes: hiding is by relevance, counts and
  summaries are the existing strings.

## Follow-up: first-run gate on every tab

- New shared gate `components/dashboard/needs-line.tsx`: `useHasLine()`
  (`/api/accounts`, fail-open to `true` so a DB blip never locks anyone out)
  + `NeedsLineGate` card reusing the Home journey strings
  ("Link your WhatsApp", "Scan once — she replies from your number").
- Wired into Agent, Groups, Products, Store, Plugins, Settings: confirmed
  zero lines renders only the gate. While unknown, the real UI renders
  (no blank flash, no lockout). Link and Home keep their own logic.
- Still untouched (density for later): the Agent persona editor, Settings
  sections, and the Groups activate modal are heavy even for linked users —
  candidates for progressive disclosure next.
