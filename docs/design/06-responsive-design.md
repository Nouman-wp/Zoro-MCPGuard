# 06 — Responsive Design

Zoro is **desktop-first** (a security operations tool), but every task must be completable on a phone — in
particular deciding an approval and running a Human Seal, which is often done away from the desk.

## 1. Breakpoints and shell

| Width | Name | Sidebar | Header | Content padding | Grid |
| --- | --- | --- | --- | --- | --- |
| ≥ 1440 | Desktop | 240 px expanded | full: status, breadcrumb, search 280 px, bell, theme, Ask | 32 px | 12 col, 24 gutter, max 1440 |
| 1280–1439 | Laptop | 240 px (user may collapse to 64) | breadcrumb shown, search 224 px | 32 px | 12 col, 24 gutter |
| 1024–1279 | Small laptop | 64 px collapsed by default (tooltips) | breadcrumb hidden (page eyebrow instead), search 200 px | 24 px | 12 col, 20 gutter |
| 768–1023 | Tablet | hidden; hamburger opens 280 px drawer | status pill (dot + short label), search icon, bell, Ask icon | 24 px | 8 col, 16 gutter |
| < 768 (375 ref) | Mobile | hidden; hamburger → full-height drawer | menu, status dot only (tap → popover as bottom sheet), search icon, bell | 16 px | 4 col, 16 gutter |

Mobile adds a **bottom bar** (56 px, safe-area aware) with 4 items: Dashboard · Approvals (badge) · Incidents
(badge) · More (opens drawer). Rationale: the two decision queues must be one tap away.

## 2. Component behaviour

| Component | ≥ 1280 | 768–1279 | < 768 |
| --- | --- | --- | --- |
| Page header actions | inline, max 1 primary + 2 secondary | primary + `⋯` overflow | primary full-width below title if it is the page's main task; others in `⋯` |
| KPI tiles | 4 across | 2 × 2 | 2 × 2 (value 24 px) |
| Two-column detail (main + action rail) | 8 / 4 | stacked: action rail **first** (after summary) | stacked; action rail becomes a sticky bottom action bar with the primary action + `More actions` sheet |
| Cards | grid per spec | 1–2 columns | 1 column |
| Filters | inline bar | inline, wraps; search full width on its own row | "Filters (n)" button → bottom sheet; active filters as removable chips below |
| Tabs | full labels | full labels, horizontal scroll with fade edges | horizontal scroll; or select dropdown when > 4 tabs |
| Modal | centred, spec width | centred, max 90 vw | bottom sheet, full width, max 92 vh, drag handle; L3 and Human Seal are full screen |
| Drawer | right 480/640 | right 480 / full width under 640 | full-screen sheet |
| Toasts | bottom-right 360 | bottom-right 360 | top, full width minus 16 px, above bottom bar |
| Command palette | 640 centred | 90 vw | full screen |
| Diff viewer | split | unified | unified; long lines wrap; margin finding markers become inline chips |
| Charts | full | full | simplified: totals row + chart 160 px tall; tap for tooltip |
| Code blocks | max-height 420 | 320 | 240, horizontal scroll inside the block only |

## 3. Tables

Tables follow the column priorities in `04-screen-specifications.md`.

| Width | Behaviour |
| --- | --- |
| ≥ 1280 | All columns |
| 1024–1279 | Hide P3 columns; their values move into the primary cell's second line |
| 768–1023 | Hide P2 + P3; second line carries the most important hidden value (e.g. severity for incidents → already P1) |
| < 768 | **Card list**: each row becomes a card — line 1: primary cell + status badge (right); line 2: 2 most important secondary values; line 3: time. Row actions in a `⋯` on the card. Bulk selection via long-press is **not** supported; bulk actions are desktop-only |

Never horizontal-scroll the whole page. Horizontal scroll is allowed only inside a table container on tablet when
the user explicitly toggles "Show all columns".

Per-table mobile card mapping:

| Table | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| MCP Servers | name · mode badge | coverage bar + "5/6 · 1 held" · connection dot | last change |
| Incidents | `INC-n` title · severity | type · status | updated |
| Approvals history | summary · outcome | kind · Human Seal | decided |
| Live Traffic | `label/tool` · decision | agent · rule | time |
| Audit history | `label/name` · verdict | change class · risk | audited |
| Audit log | summary | kind · ref | time · anchored |
| Registry | tool · verdict | capabilities (2) | audited |

## 4. Security information on small screens

- **Fingerprints** use the inline size (`0x9f2c…a41b`) everywhere on mobile; tapping opens a sheet with the block
  fingerprint (grouped in 4s, wraps), copy, and Verify. Never break a fingerprint by CSS truncation mid-group.
- **Statuses** keep icon + label; labels never shorten to icon only. Long labels may abbreviate in a fixed list:
  "Sealed · warnings" → "Warnings", "Awaiting release" → "Awaiting".
- **Approval card** on mobile: summary, reason, countdown always visible; evidence and exact action collapsed
  behind "Show exact action"; sticky bottom: **Deny** (primary) · **Approve…**.
- **Human Seal** on mobile shows "Open World App" button first and the QR second (the user is likely on the
  same phone).
- **Verification panel**: checks stack; each check row 56 px, detail truncated to 2 lines with "More".

## 5. Touch and input

- Hit targets ≥ 44 × 44 px on touch (row actions, chips, icon buttons get padded hit areas).
- Hover-only affordances (row `⋯`, copy-on-hover) are always visible on touch devices (`@media (hover: none)`).
- Keyboard shortcuts hidden from help on touch-only devices.
- Pull-to-refresh is not implemented (live data); a **Refresh** item lives in `⋯`.

## 6. Per-screen notes

| Screen | Tablet | Mobile |
| --- | --- | --- |
| S-03 Dashboard | Banner; KPI 2×2; Needs attention full width; Activity full; Tools + Infrastructure stacked | Banner; KPI 2×2; Needs attention (max 5); Infrastructure collapsed to one line "5 of 6 healthy ›"; Activity simplified; Tools coverage bar only |
| S-06 Server details | Tabs scroll; 4 summary tiles 2×2 | Summary tiles become a KV list; tabs → select |
| S-07 / S-09 | Action rail first after verdict card | Verdict card → sticky bottom actions → findings |
| S-12 Incident | Summary → action rail → evidence | Summary → evidence → sticky bottom "Keep blocked & resolve" + More |
| S-13 Approvals | 1 column | 1 column, sticky actions per card when expanded |
| S-15 Live Traffic | Hide Overhead, Latency, Shield | Card list; "▲ n new" pill sticks under header |
| S-17 Policies | Rule list single column; drawer full width | Rule cards; editor full screen; simulation table → card list |
| S-24 Verify | — | Input full width, Verify button below |
| S-27 Attack Lab | Scenario list 2 columns; timeline full width | Scenario horizontal carousel (snap); timeline; panels collapsed accordions |
