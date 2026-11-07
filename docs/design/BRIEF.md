# Zoro — Advanced Design Brief (v2)

> This is the expanded, micro-detailed version of the original "Zoro — Complete UI/UX Design Blueprint" prompt.
> It is the brief the documents in `docs/design/` were written against. Keep it beside them: when a document and
> this brief disagree, the document records why in `09-design-decisions.md`.

---

## 0. Role and stance

Act as a combined design team: Principal Product Designer, Design Systems Lead, Security UX specialist,
Information Architect, Accessibility lead and Front-end Architect, working to the standard of Google Cloud Console,
Stripe Dashboard, Linear and Vercel.

The output is a **design blueprint, not code**. No application file is created, edited or deleted. The only
files written are under `docs/design/`.

Three non-negotiable principles govern every decision:

1. **Truthful security UI.** A screen never shows a stronger guarantee than the system confirmed. "Sealed" appears only
   when a verdict package with that verdict exists; "Anchored" only when a Hedera message was observed; "Verified human"
   only when a World ID proof was checked. Everything else is "Pending", "Not configured", "Not available" or
   "Unknown", each with its own visual.
2. **The protective choice is the default.** Primary buttons, keyboard default (`Enter`), and pre-selected options
   always resolve toward blocking, keeping something quarantined, or denying. Weakening protection is a secondary
   action and frequently needs a Human Seal.
3. **Evidence over adjectives.** Every verdict, incident, finding or decision shows the exact evidence: the span of
   text, the fingerprint, the rule id, the source → sink chain, the ledger reference.

---

## 1. Phase 1 — Inspect (mandatory before any design)

Produce an inventory with **file-level citations**. For each item record: route, file path, API endpoint(s),
live-event types it listens to, components used, and whether it is public or behind the Console token.

| Inspect | What to capture |
| --- | --- |
| Monorepo layout | packages, ports, deploy targets, environment variables that change UI behaviour |
| Frontend framework | Next.js version and its non-standard conventions (read `Frontend/AGENTS.md`), styling system (Tailwind v4 `@theme` tokens), motion library, icon set |
| Routes | every `page.tsx` under `Frontend/src/app`, grouped into public site and Console |
| Shell | sidebar groups and order, header contents, global overlays (command palette, search, notifications, Ask Zoro, toasts) |
| Components | every export of `components/ui.tsx`, `components/security.tsx`, `components/console/*`, `human-seal.tsx`, `charts.tsx` |
| Tokens | colours, fonts, radii, shadows, motion easings in `globals.css`, both themes |
| API | every route in `Backend/daemon/src/api/console.ts` and `public.ts`; the SSE event types |
| Vocabulary | every enum the UI must render: verdicts, seal statuses, decisions, server modes, severities, tool states, incident types/statuses, approval kinds/statuses, policy rule types, finding categories, capabilities, dependency states, publish statuses |
| Integrations | ENS (Sepolia), Hedera (testnet), World ID (staging), AI review layer — configured, optional, or planned, per `README.md` deployment record and `status.ts` |
| Auth model | how a person signs in, whether users/roles/workspaces exist |
| Decision log | `DECISIONS.md`, especially constraints that surface in the UI (ephemeral storage, hosted demo) |

Deliver **Current Product Assessment** with these sub-sections, each item tagged `EXISTING`, `PARTIAL`, `PROPOSED` or
`UNKNOWN`:

- Feature inventory (one row per feature: name, route, API, status tag).
- Page inventory (one row per route).
- Current user journeys as they actually work today.
- UX problems, each with: location, severity (`Blocker`, `Major`, `Minor`, `Polish`), evidence, recommendation.
- Missing screens, each with the backend dependency it needs.
- Features needing clarification → open questions with an id (`Q-xx`).

---

## 2. Phase 2 — Analyse

- Map every concept in the original prompt (Bridge, Gateway, Sentinel, Fingerprinting, Seals, Output Shield, Data
  Flow, Human Approval, ENS, Hedera, World ID, Attack Lab) to the code that implements it. If a prompt concept has no
  implementation, say so; do not design as if it exists.
- Map every implemented feature the prompt does **not** mention (e.g. Quarantine, Agents, Publisher, Disputes, Diff
  viewer, Ask Zoro, Auditor transparency page, onboarding scan of local AI clients) and give it a home in the IA.
- Score each UX problem on **frequency × impact on safety** to drive priorities.

---

## 3. Phase 3 — Architect

### 3.1 Information architecture

Start from the prompt's sitemap (Overview / Protection / Monitoring / Trust & Identity / Testing / Configuration)
and reconcile it with the real routes. Rules:

- One concept, one home. If two pages show the same records, merge them into tabs of one page.
- Every page has: ID (`S-xx`), route, purpose, primary user, primary information (ranked), primary action (exactly
  one), secondary actions, entry points, exit points, related pages, data source (API), live events, priority.
- Navigation badges only for things that need a person: pending approvals, open critical/high incidents, held-back
  tools. Never badge counts of healthy things.
- Public pages (Verify, Registry, Lab, Auditor) must stay reachable without a token; define how they appear when
  reached from inside the Console.

### 3.2 Personas and permissions

Personas: AI Developer, Security Administrator, System Owner (+ Public Verifier, Server Publisher if the code
supports them). For each: goals, top tasks, frequency, technical depth, pages used, success metric.

Produce a **role × capability matrix** (View / Act / Configure / None) for every page and every security-sensitive
action. Because the current product has a single Console token and no user model, the matrix is a **proposal**,
clearly labelled, with the backend dependencies it would need. Design the "Permission denied" state anyway.

### 3.3 Journeys

For journeys A–F from the original prompt, plus any journey the code supports that the prompt missed, produce:

- a Mermaid flowchart with decision diamonds,
- a step table: `# | Screen (S-xx) | User action | System response | API | Next`,
- goal, start, success state, failure states, empty state, errors with exact copy,
- where the journey as written in the prompt differs from what the product does (e.g. there is no sign-up), and the
  corrected journey.

---

## 4. Phase 4 — Design system

Design direction: **Modern Enterprise Security — Google Cloud clarity + Linear precision + Vercel developer
experience.** Calm, dense, legible. No neon, no glowing shields, no fake terminals, no decorative charts.

### 4.1 Tokens (must be expressed as named tokens, both themes, with hex values)

- **Colour**: background, sidebar, surface, elevated, sunken, overlay/scrim; border subtle/default/strong/focus; text
  primary/secondary/tertiary/disabled/inverse/link; primary (rest/hover/pressed/subtle bg); accent cyan; status
  success/warning/danger/info/neutral/violet (Human Seal) each with fg, bg, border; severity scale (5); verdict
  scale; decision scale; chart categorical (6) and sequential.
- Start from the given dark palette: `#0B1020` bg, `#0E1526` sidebar, `#141E30` card, `#1B2940` elevated,
  `#3B82F6` primary, `#22D3EE` cyan, `#22C55E` success, `#F59E0B` warning, `#EF4444` danger, `#F8FAFC` text,
  `#94A3B8` secondary text. Derive the rest. Provide a light theme with the same roles.
- **Contrast**: report the WCAG ratio of every text token on every surface it is used on. Body text ≥ 4.5:1,
  large text and UI glyphs ≥ 3:1.
- **Typography**: Inter for UI, JetBrains Mono for fingerprints, hashes, ids, rule ids, JSON, args. Give a named
  scale (size/line-height/weight/tracking) for: page title, section title, card title, body, body-small, caption,
  overline, KPI number, table header, table cell, mono-md, mono-sm, code. Numbers in tables use tabular figures.
- **Spacing**: 4 px base scale with names. **Layout**: grid, max content width, sidebar width (expanded/collapsed),
  header height, card padding, section gaps, breakpoints.
- **Radius, elevation, motion**: named tokens; durations and easings; reduced-motion behaviour.
- **Iconography**: icon set, sizes, stroke width, and the fixed icon for every status.

### 4.2 Components

For each component: anatomy, variants, sizes, every state (default, hover, focus-visible, active, disabled,
loading, error, selected), keyboard behaviour, ARIA role/labels, content rules (max lengths, truncation), do/don't.

Generic: Sidebar, Header, Breadcrumbs, Page header, Buttons (primary, secondary, ghost, subtle, danger, link,
icon), Inputs, Textarea, Select/Dropdown, Combobox, Search, Tabs, Segmented control, Toggle, Checkbox, Cards, Stat
tile, Tables (sorting, selection, row actions, sticky header, density), Badges, Status dot, Tooltips, Popovers,
Modals, Drawers, Toasts, Inline notices/banners, Pagination, Charts, Empty states, Skeletons, Confirmation dialogs,
Typed-phrase danger dialogs, Code block, Key-value list, Copy button.

Security-specific: Security verdict card, Fingerprint display, Trust seal / publication badges, Risk indicator,
Severity label, Sentinel finding card (with evidence spans), Audit layer progress, Diff view, Approval request card,
Human Seal flow, Security event timeline, Data-flow chain, Verification result panel (per-check), Quarantine state,
Revocation state, Integration/dependency status row, Protection status indicator, Observe-mode banner,
Daemon-unreachable banner, Ephemeral-storage banner, Lab record marker.

**Every status must be understandable without colour**: colour + icon + text label, always.

---

## 5. Phase 4b — Screens

For every screen (at least: Login, Onboarding, Dashboard, MCP Servers, Add Server, Server Details, Tool Details,
Sentinel Audits, Audit Result, Diff Viewer, Incidents, Incident Details, Human Approvals, Human Seal flow, Live
Traffic, Call Details, Policies, Data Flows, Agents, Audit Log, Reports, Trust Registry, Tool Dossier, Verify Seal,
Publisher, Disputes, Attack Lab, Settings incl. integrations, Account & Workspace, global overlays) specify:

1. ID, route, status tag (EXISTING / CHANGED / PROPOSED), priority, API endpoints, live events.
2. Objective, primary question it answers.
3. ASCII wireframe at 1440 px with exact column spans on a 12-column grid.
4. Header: breadcrumb, title, description copy, actions (left to right, with variants).
5. Sections in priority order; for each card: title, subtitle, content, footer link.
6. Tables: every column with header text, data field, width, alignment, format, sortable?, truncation.
7. Filters/search: control, options, default, URL param, persistence.
8. Actions: label, variant, confirmation, API call, success feedback, failure feedback.
9. Modals/drawers opened from the screen.
10. States: loading (skeleton shape), empty (icon, title, body, CTA), error (copy, retry), permission denied,
    offline/daemon down, partial data, plus screen-specific states.
11. Responsive behaviour at 1280, 768, 375.
12. Changes from the current implementation and why.

The Dashboard must answer, in this order: Is Zoro protecting right now? Is anything waiting for me? Is anything
attacking me? Which servers and tools are trusted? Is the infrastructure (integrations) healthy?

---

## 6. Phase 5 — Specify

- **States catalogue**: Default, Hover, Focus, Active, Disabled, Loading, Empty, Success, Warning, Error,
  Permission denied, Offline, Expired, Pending, Unavailable — defined once as patterns, then applied per component.
  Explicit specs for: server connection failure, failed Sentinel audit, changed fingerprint, quarantined tool,
  revoked seal, expired approval, unavailable blockchain network, failed identity verification, empty incident
  history, no connected servers, observe mode, daemon unreachable, backend waking, ephemeral storage, lab records.
- **Interactions**: for Add server, Run/Re-run audit, Inspect finding, Quarantine/Keep blocked/Release, Approve,
  Deny, Approve with Human Seal, Investigate/Acknowledge/Resolve/Dismiss incident, Create/edit/save policy with
  preview & loosening check, Launch Lab scenario, Verify a fingerprint/ENS name, Configure an integration, Revoke a
  seal, Danger-zone operations — give trigger, action, behaviour, loading, success, failure, confirmation, navigation
  result, keyboard path, analytics-free audit record.
- **Responsive**: 1440 / 1280 / 768 / 375 rules for sidebar, tables (column priority list per table), cards,
  filters, modals → sheets, navigation, and how long hashes stay readable.
- **Prototype plan**: the 11-step story (dashboard → server → audit → finding → incident → evidence → approval →
  decision → dashboard updated). For each step: frame, hotspot, transition, overlay, the data shown, and the data
  change that the next frame must reflect. Specify seed data so the prototype is internally consistent.
- **Accessibility**: WCAG 2.2 AA; focus order per screen; keyboard shortcuts; live-region policy for streaming data;
  reduced motion; screen-reader text for hashes and status.
- **Content design**: voice, tense, terminology glossary (one term per concept), number/time/hash formatting,
  error-message pattern ("what happened → why → what you can do").

---

## 7. Phase 6 — Validate

Cross-check every document: same screen IDs, same route names, same terms, same token names, same priorities.
Produce a QA checklist for design review and for implementation review. List every place the blueprint depends on
backend work that does not exist yet.

## 8. Phase 7 — Report

Summarise files produced, the ten most important decisions, and the open questions that block implementation.

---

## 9. Deliverables

```
docs/design/
  README.md                              index, reading order, ID conventions, status legend
  BRIEF.md                               this file
  00-product-understanding.md            product, current assessment, principles, limitations
  01-information-architecture.md         sitemap, nav, page registry, role access
  02-user-journeys.md                    personas, journeys A–H, edge cases
  03-design-system.md                    tokens, type, spacing, components, status system, themes
  04-screen-specifications.md            every screen in detail
  05-interaction-specifications.md       interactions, overlays, forms, feedback, confirmations
  06-responsive-design.md                1440 / 1280 / 768 / 375
  07-prototype-plan.md                   story, frames, hotspots, seed data
  08-design-priorities-and-roadmap.md    P0/P1/P2, dependencies, order, QA checklist
  09-design-decisions.md                 decisions, reasons, open questions, assumptions
```

Use tables wherever they help, Mermaid for IA, journeys, navigation and key interaction flows. Never invent
backend behaviour, API responses, integrations or guarantees: unknowns become open questions.
