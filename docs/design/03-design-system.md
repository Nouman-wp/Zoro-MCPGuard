# 03 — Design System

**Direction:** Modern Enterprise Security — Google Cloud clarity, Linear precision, Vercel developer experience.
Calm navy ground, tone-stepped surfaces, one blue for action, status colour only where state is meant.

**What the Console never uses:** glows, radial "aurora" backgrounds, gradient card fills, halftone textures,
looping animation (except the live/pending dot), neon cyan text blocks, shield illustrations as decoration.
The public marketing home may keep a restrained version of these (D-02).

Token names are semantic (`--bg`, `--text-secondary`). §11 maps them to the current token names in
`Frontend/src/app/globals.css` so implementation is a re-skin, not a rewrite.

---

## 1. Colour

### 1.1 Dark theme (default)

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0B1020` | Page background |
| `--bg-sidebar` | `#0E1526` | Sidebar, mobile drawer |
| `--surface` | `#141E30` | Cards, table container, header (at 92 % opacity + 12 px blur) |
| `--surface-elevated` | `#1B2940` | Popovers, menus, modals, drawers, toasts, hovered row inside elevated |
| `--surface-sunken` | `#0F1628` | Code blocks, inputs, nested panels inside cards |
| `--surface-hover` | `#18233A` | Hovered table row / list item on `--surface` |
| `--surface-selected` | `#1A2B4A` | Selected row, active nav item fill |
| `--scrim` | `rgba(3, 6, 15, 0.72)` | Behind modals and drawers |
| `--border-subtle` | `#1C2840` | Row rules, dividers inside cards |
| `--border` | `#24324D` | Card and control outlines |
| `--border-strong` | `#334765` | Hovered controls, table header bottom rule |
| `--border-focus` | `#3B82F6` | Focus ring (2 px, 2 px offset) |
| `--text-primary` | `#F8FAFC` | Titles, values, primary content |
| `--text-secondary` | `#94A3B8` | Descriptions, labels, metadata |
| `--text-tertiary` | `#7C8BA1` | Timestamps, hints, placeholder (never for essential info on `--surface-elevated`) |
| `--text-disabled` | `#4B5A70` | Disabled labels (decorative contrast only; disabled controls also lose their border) |
| `--text-inverse` | `#0B1020` | Text on light fills (e.g. white chip) |
| `--text-link` | `#60A5FA` | Links, inline actions |
| `--primary` | `#2563EB` | Primary button fill (white text 5.17 : 1) |
| `--primary-hover` | `#3B82F6` | Primary hover |
| `--primary-pressed` | `#1D4ED8` | Primary active |
| `--primary-subtle` | `rgba(59, 130, 246, 0.14)` | Selected tab underline background, info badge fill |
| `--brand` | `#3B82F6` | Logo mark, focus ring, chart series 1 |
| `--accent` | `#22D3EE` | Live indicator, fingerprint "match" highlight, chart series 2. Never body text on large areas |

### 1.2 Status colours (dark)

Every status = **fg** (text/icon) on **bg** (tinted fill) with optional **border**. Status text is always paired
with an icon and a word (§6).

| Status | fg | bg | border | Contrast fg on `--surface` |
| --- | --- | --- | --- | --- |
| Success | `#4ADE80` | `rgba(34, 197, 94, 0.12)` | `rgba(34, 197, 94, 0.32)` | 9.58 : 1 |
| Warning | `#FBBF24` | `rgba(245, 158, 11, 0.12)` | `rgba(245, 158, 11, 0.32)` | 10.00 : 1 |
| Danger | `#F87171` | `rgba(239, 68, 68, 0.12)` | `rgba(239, 68, 68, 0.36)` | 6.03 : 1 |
| High (orange) | `#FB923C` | `rgba(249, 115, 22, 0.12)` | `rgba(249, 115, 22, 0.32)` | 7.37 : 1 |
| Info | `#60A5FA` | `rgba(59, 130, 246, 0.14)` | `rgba(59, 130, 246, 0.32)` | 6.57 : 1 |
| Neutral | `#94A3B8` | `rgba(148, 163, 184, 0.10)` | `rgba(148, 163, 184, 0.24)` | 6.51 : 1 |
| Human Seal (violet) | `#C4B5FD` | `rgba(139, 92, 246, 0.16)` | `rgba(139, 92, 246, 0.36)` | 9.04 : 1 |
| Lab | `#C4B5FD` | transparent | `rgba(139, 92, 246, 0.5)` dashed | 9.04 : 1 |

Solid fills (danger button, critical toast edge): `--danger-solid #DC2626` (white text 4.83 : 1),
`--success-solid #16A34A`, `--warning-solid #D97706` (text `--text-inverse`).

### 1.3 Light theme

Same roles, cool off-white ground. Code blocks stay dark navy in light theme (`#0F1628`), as on developer sites.

| Token | Hex | | Token | Hex |
| --- | --- | --- | --- | --- |
| `--bg` | `#F6F8FB` | | `--text-primary` | `#0F172A` (17.85 : 1 on white) |
| `--bg-sidebar` | `#FFFFFF` | | `--text-secondary` | `#475569` (7.58 : 1) |
| `--surface` | `#FFFFFF` | | `--text-tertiary` | `#64748B` (4.76 : 1 on white; not on `--bg` for body text) |
| `--surface-elevated` | `#FFFFFF` + shadow-lg | | `--text-disabled` | `#94A3B8` |
| `--surface-sunken` | `#EEF2F7` | | `--text-link` | `#2563EB` (5.17 : 1) |
| `--surface-hover` | `#F1F5F9` | | `--primary` | `#2563EB` |
| `--surface-selected` | `#E8F0FE` | | `--primary-hover` | `#1D4ED8` |
| `--border-subtle` | `#EDF1F6` | | `--brand` | `#2563EB` |
| `--border` | `#E2E8F0` | | `--accent` | `#0E7490` |
| `--border-strong` | `#CBD5E1` | | `--scrim` | `rgba(15, 23, 42, 0.45)` |

| Status (light) | fg | bg | Contrast fg on white |
| --- | --- | --- | --- |
| Success | `#15803D` | `#DCFCE7` | 5.02 : 1 |
| Warning | `#B45309` | `#FEF3C7` | 5.02 : 1 |
| Danger | `#DC2626` | `#FEE2E2` | 4.83 : 1 |
| High | `#C2410C` | `#FFEDD5` | 5.18 : 1 |
| Info | `#2563EB` | `#DBEAFE` | 5.17 : 1 |
| Neutral | `#475569` | `#F1F5F9` | 7.58 : 1 |
| Human Seal | `#6D28D9` | `#EDE9FE` | 7.10 : 1 |

Rule: status text is never placed on `--surface-sunken` in light theme below 4.5 : 1 (danger is 4.30 there) — use
the status `bg` fill instead.

### 1.4 Chart colours

| Series | Dark | Light | Used for |
| --- | --- | --- | --- |
| Allowed | `#22C55E` | `#16A34A` | Decision bars |
| Asked | `#F59E0B` | `#D97706` | Decision bars |
| Blocked | `#EF4444` | `#DC2626` | Decision bars |
| Categorical 1–6 | `#3B82F6` `#22D3EE` `#A78BFA` `#F472B6` `#FB923C` `#94A3B8` | `#2563EB` `#0891B2` `#7C3AED` `#DB2777` `#EA580C` `#64748B` | Servers, agents, capabilities |
| Sequential | `#172554` → `#1E40AF` → `#3B82F6` → `#93C5FD` | `#DBEAFE` → `#3B82F6` → `#1E3A8A` | Heat/volume |
| Grid lines | `#1C2840` | `#EDF1F6` | Axes, gridlines |

Charts always include a legend with text labels and a table/aria alternative (`role="img"` + `aria-label` summary).

---

## 2. Typography

**Inter** (variable, `font-feature-settings: "cv11", "ss01", "tnum"` in tables) for all UI. **JetBrains Mono** for
fingerprints, hashes, digests, IDs (`INC-12`, `APR-4`), rule ids, tool names in technical context, JSON, args,
commands. Figtree remains only on the public marketing home (D-02).

| Token | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 32 / 40 | 600 | −0.02 em | Public page heroes only |
| `title-lg` | 24 / 32 | 600 | −0.015 em | Page title (H1) |
| `title-md` | 18 / 26 | 600 | −0.01 em | Section title (H2), modal title |
| `title-sm` | 15 / 22 | 600 | −0.005 em | Card title (H3) |
| `body` | 14 / 22 | 400 | −0.006 em | Default text |
| `body-strong` | 14 / 22 | 500 | −0.006 em | Emphasised values, table primary cell |
| `body-sm` | 13 / 20 | 400 | 0 | Table cells, descriptions, metadata |
| `caption` | 12 / 16 | 500 | 0 | Badges, helper text, chart labels |
| `overline` | 11 / 16 | 600 | +0.06 em, uppercase | Sidebar group labels, KV labels in dense panels |
| `kpi` | 28 / 34 | 600 | −0.02 em, tabular | Stat tiles |
| `table-header` | 12 / 16 | 500 | +0.01 em | Table column headers, `--text-secondary` |
| `mono-md` | 13 / 20 | 450 | 0 | Tool names, rule ids, inline code |
| `mono-sm` | 12 / 18 | 450 | 0 | Short fingerprints, digests in metadata |
| `code` | 12.5 / 20 | 400 | 0 | Code blocks, JSON |

Rules: max line length 72 ch for prose; numbers in tables and KPIs use tabular figures and right alignment;
never bold a whole sentence; sentence case everywhere (buttons included); no all-caps except `overline`.

---

## 3. Spacing, layout, radius, elevation, motion

### 3.1 Spacing scale (4 px base)

| Token | px | | Token | px |
| --- | --- | --- | --- | --- |
| `space-0` | 0 | | `space-6` | 24 |
| `space-0.5` | 2 | | `space-8` | 32 |
| `space-1` | 4 | | `space-10` | 40 |
| `space-2` | 8 | | `space-12` | 48 |
| `space-3` | 12 | | `space-16` | 64 |
| `space-4` | 16 | | | |
| `space-5` | 20 | | | |

### 3.2 Layout

| Element | Value |
| --- | --- |
| Sidebar | 240 px expanded · 64 px collapsed (icons + tooltips) · user toggle `[`, remembered per browser |
| Header | 56 px, sticky, `--surface` at 92 % + blur, bottom `--border-subtle` |
| Content padding | 32 px ≥ 1280 · 24 px 768–1279 · 16 px < 768 |
| Content max width | 1440 px for list/dashboard pages; 1120 px for forms/settings; detail pages full width up to 1440 |
| Grid | 12 columns, 24 px gutter (16 px < 768) |
| Page header → content | 24 px |
| Card → card | 16 px |
| Section → section | 32 px |
| Card padding | 20 px (16 px dense, 24 px for hero/verdict cards); card header 16 px top, 12 px bottom |
| Breakpoints | `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1440 |

### 3.3 Radius

`radius-sm 6` (badges' inner chips, kbd) · `radius-md 8` (inputs, buttons, menu items) · `radius-lg 12` (cards,
popovers, toasts) · `radius-xl 16` (modals, drawers' inner edge, command palette) · `radius-full` (pills, dots).

### 3.4 Elevation

| Token | Dark | Light | Used by |
| --- | --- | --- | --- |
| `elev-0` | none, `--border` | none, `--border` | Cards |
| `elev-1` | `0 1px 2px rgba(0,0,0,.4)` | `0 1px 2px rgba(15,23,42,.06)` | Buttons, inputs |
| `elev-2` | `0 8px 24px rgba(0,0,0,.45)` | `0 8px 24px rgba(15,23,42,.10)` | Popovers, menus, toasts |
| `elev-3` | `0 24px 48px -8px rgba(0,0,0,.55)` | `0 24px 48px -12px rgba(15,23,42,.18)` | Modals, drawers, palette |

Surfaces in dark mode rise by **tone** first (`surface → elevated`), shadow second.

### 3.5 Motion

| Token | Value | Use |
| --- | --- | --- |
| `dur-instant` | 100 ms | Press, toggle |
| `dur-fast` | 160 ms | Hover, focus, tooltip |
| `dur-base` | 220 ms | Popover, tab indicator, row insert |
| `dur-slow` | 320 ms | Modal, drawer, toast enter |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Enter |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exit (exit = 70 % of enter duration) |

Reduced motion: all transforms become opacity-only fades ≤ 120 ms; live dot stops pulsing (stays solid); count-up
numbers render final value.

### 3.6 Iconography

`lucide-react`, stroke 1.75. Sizes: 14 (inline in badges), 16 (buttons, nav, table), 20 (card headers, empty
states inside cards), 24 (empty state hero). Icons never stand alone for meaning; icon-only buttons have
`aria-label` and a tooltip.

---

## 4. Status system (single source of truth)

Every status in the product maps to exactly one visual. Colour + icon + label, always.

### 4.1 Verdict (Sentinel)

| Value | Label | Tone | Icon |
| --- | --- | --- | --- |
| `sealed` | Sealed | Success | `ShieldCheck` |
| `sealed_with_warnings` | Sealed · warnings | Warning | `ShieldAlert` |
| `unsafe` | Unsafe | Danger | `ShieldX` |
| `pending` | Pending | Neutral | `ShieldQuestion` + pulsing dot if audit running |
| *(no verdict)* | Not audited | Neutral, outlined | `Shield` |

### 4.2 Seal status (overrides verdict when present)

| Value | Label | Tone | Icon |
| --- | --- | --- | --- |
| `active` | (verdict label) | per verdict | per verdict |
| `superseded` | `{verdict} · superseded` | Neutral | `History` |
| `revoked` | Revoked | Danger, **solid** badge | `Ban` |
| `expired` | Expired | Neutral | `CalendarX` |
| `disputed` | Disputed | Warning | `Scale` |

### 4.3 Tool state (Gateway)

| Value | Label | Tone | Icon | Agent can see it? |
| --- | --- | --- | --- | --- |
| `released` | Released | Success | `CircleCheck` | Yes |
| `quarantined` | Held back | Warning | `Lock` | No |
| `awaiting_release` | Awaiting release | Human Seal violet | `Hourglass` | No |
| `blocked` | Blocked | Danger | `OctagonX` | No |
| `removed` | Removed | Neutral | `MinusCircle` | No |

The tooltip on every non-released state reads "Not visible to agents".

### 4.4 Severity

| Value | Label | Tone | Icon | Weight |
| --- | --- | --- | --- | --- |
| `critical` | Critical | Danger | `OctagonAlert` | 600 |
| `high` | High | High (orange) | `TriangleAlert` | 500 |
| `medium` | Medium | Warning | `CircleAlert` | 500 |
| `low` | Low | Info | `Info` | 500 |
| `info` | Info | Neutral | `Dot` | 500 |

### 4.5 Decision (policy)

| Value | Label | Tone | Icon | Observe variant |
| --- | --- | --- | --- | --- |
| `allow` | Allowed | Success | `Check` | — |
| `ask` | Asked | Warning | `MessageCircleQuestion` | "Would ask (observe)" outlined |
| `block` | Blocked | Danger | `Ban` | "Would block (observe)" outlined |

### 4.6 Server mode and connection

| Mode | Label | Tone | Note |
| --- | --- | --- | --- |
| `enforce` | Enforce | Success | Default |
| `observe` | Observe | Warning | Always shows "no protection" hint |
| `disabled` | Disabled | Neutral | Agents lose access |

| Connection | Label | Tone | Icon |
| --- | --- | --- | --- |
| `online` | Online | Success | filled dot |
| `offline` / error | Offline | Danger | hollow dot + `last_error` tooltip |
| connecting | Connecting | Neutral | pulsing dot |

### 4.7 Incident status

`open` (Warning, `CircleDot`) · `acknowledged` (Info, `Eye`) · `resolved` (Success, `CircleCheck`) ·
`dismissed` (Neutral, `CircleSlash`). Timeline events add `recurred` and `escalated`.

### 4.8 Approval status

`pending` (Warning, `Hourglass`, with countdown) · `approved` (Success) · `executed` (Success, "Approved and used") ·
`denied` (Danger) · `cancelled` (Neutral) · `expired` (Neutral, `CalendarX`) · `invalid` (Danger, "Proof invalid").

### 4.9 Integration / dependency state

The backend emits `ok`, `degraded`, `not_configured`, `down`. The UI adds two derived states. Mapping:

| UI state | From backend | Label | Tone | Icon | Next step shown |
| --- | --- | --- | --- | --- | --- |
| Connected | `ok` | Connected | Success | `PlugZap` | Link to explorer (ENS app, HashScan) |
| Degraded | `degraded` | Degraded | Warning | `TriangleAlert` | Detail text + "Retry failed writes" if outbox has failures |
| Pending | `ok` but outbox has `pending`/`retrying` items for it | Pending writes | Info | `Loader` | "{n} writes queued" |
| Not configured | `not_configured` | Not configured | Neutral, outlined | `PlugOff` | The exact CLI command (`pnpm setup:ens`) and env vars |
| Unavailable | `down` or request failed | Unavailable | Danger | `CloudOff` | Detail + retry |
| Test mode | World ID `staging` | Test identities | Human Seal violet | `FlaskConical` | "Not production identity assurance" |

"Disconnected" from the brief = **Unavailable** (D-09).

### 4.10 Publication status (per seal, per network)

`written` / `anchored` / `minted` → Success · `pending` / `retrying` → Info with spinner · `failed` → Danger ·
`burned` → Danger "Burned (revoked)" · `not_configured` → Neutral outlined "Local only" · `not_applicable` →
Neutral "n/a" · `lab_unpublished` → Lab marker "Lab · not published".

### 4.11 Protection status (global header)

| State | Label | Dot | Pulse |
| --- | --- | --- | --- |
| `protected` | Protected | Success | no |
| `attention` | Attention needed | Danger | yes |
| `degraded` | Degraded | Warning | yes |
| `observe` | Observe mode | Warning | yes |
| `not_configured` | Not protecting yet | Neutral | no |
| daemon down | Not protecting | Danger | yes |

---

## 5. Generic components

Each entry: anatomy · variants · sizes · states · keyboard/ARIA · content rules.

### 5.1 Sidebar
- Anatomy: logo row (56 px, matches header) · groups (overline label 11 px, 24 px top margin) · items (36 px tall,
  8 px radius, 16 px icon, 14 px label, right badge) · footer (Public site, Sign out, collapse toggle).
- States: rest `--text-secondary`; hover `--surface-hover` + `--text-primary`; active `--surface-selected` fill +
  2 px `--brand` left bar inside the item + `--text-primary` + `aria-current="page"`; focus ring.
- Collapsed (64 px): icons only, tooltip on hover/focus with label + badge count; badges become 8 px dots.
- Keyboard: `Tab` through items; `G` then a letter navigates (G D dashboard, G A approvals, G S servers, G U audits,
  G I incidents, G T traffic, G P policies, G L log).

### 5.2 Header
See `01` §2.2. Status pill: 32 px tall, full radius, dot + label + chevron. Popover 360 px.

### 5.3 Page header
- Breadcrumb (detail pages only, `body-sm`, `--text-secondary`, `›` separators, last item not a link).
- Row: title (`title-lg`) + inline status badges (e.g. severity, status) · right-aligned actions (max 1 primary,
  2 secondary; more go into a `⋯` overflow menu).
- Description (`body`, `--text-secondary`, max 1 line on list pages, 2 on detail).
- Optional meta row (`body-sm`): "opened 14:02 · ×3 events grouped · LAB".

### 5.4 Buttons

| Variant | Fill | Text | Border | Use |
| --- | --- | --- | --- | --- |
| Primary | `--primary` | white | none | One per view: the protective or main action |
| Secondary | `--surface` | `--text-primary` | `--border` | Alternatives |
| Ghost | transparent | `--text-primary` | none | Toolbars, low emphasis |
| Danger | `--danger-solid` | white | none | Irreversible destruction (remove server, danger zone) — **not** for "Deny" |
| Danger-secondary | transparent | danger fg | danger border | Revoke, Disable server |
| Seal | `rgba(139,92,246,.16)` | violet fg | violet border | "Approve with Human Seal", "Release with Human Seal" |
| Link | none | `--text-link` | none | "View diff →" |

Sizes: `sm` 28 px (12 px x-pad, 13 px text) · `md` 36 px (14 px, 14 px) · `lg` 44 px (18 px, 15 px).
States: hover (fill step), active (pressed tone, 1 px translate-y), focus-visible ring, disabled (40 % opacity,
`cursor: not-allowed`, keeps tooltip explaining why), loading (spinner replaces icon, label becomes progressive
verb "Releasing…", width locked, `aria-busy`).
Icon buttons: square, `aria-label` required, tooltip.

**"Deny" vs "Approve":** Deny is the protective action — rendered **Primary**. Approve is Secondary; Approve with
Human Seal uses the Seal variant. (D-06)

### 5.5 Inputs, textarea, select, combobox
- 36 px tall, `--surface-sunken`, `--border`, 8 px radius, 12 px x-pad, `body` text.
- Label above (13 px, 500, `--text-primary`), helper below (12 px `--text-tertiary`), error below replaces helper
  (12 px danger fg + `CircleAlert` 14 px), `aria-describedby` links both.
- States: hover `--border-strong`; focus `--border-focus` + 3 px ring `rgba(59,130,246,.25)`; error danger border;
  disabled `--text-disabled`, no border change on hover; read-only no border, sunken fill.
- Mono inputs (fingerprint, URL, command, JSON) use `mono-md`.
- Select: native `<select>` styled for simple lists ≤ 10; combobox (type-ahead, `role="combobox"`) for servers,
  tools, agents.
- Secrets (env values, headers): input type password with "Show" toggle; once saved shown as `••••••` + "stored
  locally, never shown again".

### 5.6 Search
Header search: 280 px (≥ 1440), 224 px (1280), icon-only (< 1024, opens full-width overlay). Placeholder
"Search servers, tools, fingerprints, incidents". Results popover 440 px: grouped by type, max 8, keyboard ↑ ↓ ⏎,
`Esc` closes. Page-level search: inline in filter bar, 320 px, debounced 200 ms, synced to `?q=`.

### 5.7 Tabs
Underline style, 40 px tall, 14 px label + optional count chip; active = `--text-primary` + 2 px `--brand`
underline animated (`dur-base`). Synced to `?tab=`. `role="tablist"`, arrow keys move, `Home`/`End`.
Segmented control (2–4 options, e.g. Enforce/Observe, time range) — 32 px, pill container.

### 5.8 Cards
`--surface`, 1 px `--border`, `radius-lg`, no shadow. Header: title-sm + optional subtitle + right action (link or
ghost button). Body padding 20 px. Footer (optional) separated by `--border-subtle`, right-aligned link "View all →".
Interactive card (whole card is a link): hover `--border-strong` + `--surface-hover`, focus ring, no lift.
Highlighted card (e.g. action rail): 1 px `--brand` border at 40 %.

### 5.9 Tables
- Container: card with no body padding; optional toolbar row above (filters, search, density, bulk actions).
- Header: 40 px, `table-header` type, `--text-secondary`, bottom `--border-strong`, sticky on scroll.
- Rows: 48 px comfortable / 36 px compact; `body-sm`; bottom `--border-subtle`; hover `--surface-hover`; selected
  `--surface-selected` + checkbox checked.
- Columns: text left, numbers right (tabular), status centre-left, actions right (`⋯` menu, appears on hover and
  always on focus).
- Primary cell: link to the object, `body-strong`, optional second line `caption` `--text-tertiary`.
- Sorting: click header → asc → desc → none; arrow icon; `aria-sort`.
- Selection: checkbox column 40 px; header checkbox tri-state; bulk bar replaces toolbar ("3 selected · Acknowledge
  · Clear").
- Pagination: footer 48 px: "1–50 of 312" + prev/next + page size (25/50/100). Live tables use "Load older"
  instead.
- Truncation: single line + ellipsis + full value in `title` and tooltip; fingerprints use the Fingerprint
  component, never raw truncation.
- Empty rows: the table is replaced by an Empty state inside the card (headers hidden).
- Column priority (`P1` always visible → `P3` first to hide) is defined per table in `04` and applied in `06`.

### 5.10 Badges and status dots
Badge: 22 px tall, `radius-full`, 8 px x-pad, `caption`, icon 12 px left. Variants: soft (status bg + fg),
outlined (transparent + status border + fg), solid (status solid + white; only `Revoked` and `Critical` in
toasts). Status dot: 8 px; pulse only for live/pending.

### 5.11 Tooltip and popover
Tooltip: `--surface-elevated`, `caption`, max 280 px, 8 px radius, delay 400 ms in / 0 out, appears on focus too.
Never put actions in tooltips. Popover: `radius-lg`, `elev-2`, 16 px padding, `Esc` closes, focus returns to
trigger.

### 5.12 Modal
Widths: 440 (confirm), 560 (form), 760 (wide: Human Seal, diff preview). `radius-xl`, `elev-3`, scrim, 24 px
padding. Header: title-md + close (×). Footer: right-aligned, secondary left of primary, protective action on the
right. Focus trap; initial focus on the first field or on the **protective** button for confirmations (D-06);
`Esc` and scrim click close only when no input has been changed (otherwise "Discard changes?").

### 5.13 Drawer
Right side, 480 px (forms) or 640 px (details), full height, `elev-3`. Header sticky with title + close; footer
sticky with actions. Used for: Add server, Event details from Live Traffic, Rule editor in Policies, Notification
settings. On < 768 px becomes a full-screen sheet.

### 5.14 Toast
Bottom-right, 360 px, stack max 4, newest at bottom. Anatomy: severity badge · title (link) · optional body ·
dismiss ×. Left edge 3 px in severity colour. Durations: critical 15 s, high 8 s, success 4 s, error stays until
dismissed. Hover pauses the timer. `role="status"` (`assertive` only for critical). Lab events never toast.

### 5.15 Inline notice / banner
Notice inside content: icon + title (500) + body + optional action, status bg + 1 px status border, `radius-lg`.
Global banner (below header, full width of content): daemon down (danger), observe mode (warning), backend waking
(neutral), ephemeral storage (info, dismissible per session).

### 5.16 Empty state
Centred in its container; 40 px icon tile (`--surface-sunken`, 20 px icon); title (`title-sm`); one-sentence body
(`body`, `--text-secondary`, max 48 ch); up to two actions (primary + secondary). Copy states what will appear
here and how to make it appear. Never "No data".

### 5.17 Loading skeleton
Matches the final layout's shapes (stat tiles, table rows with column widths, card headers). Shimmer at 1.6 s,
disabled under reduced motion. Show after 150 ms (avoid flash); keep stale data on refetch with a 2 px top
progress line in the card instead of skeletons.

### 5.18 Confirmation dialogs — three levels

| Level | When | Pattern |
| --- | --- | --- |
| L1 — Inline undo | Reversible, low-risk (acknowledge, mark read) | No dialog; toast "Acknowledged · Undo" 6 s |
| L2 — Confirm dialog | Changes protection or is hard to undo (approve, release, disable server, remove server, restore configs, revoke) | Modal 440 px: title states the action and object; body states the consequence; protective button focused; destructive button names the action ("Remove server") |
| L3 — Typed phrase (+ Human Seal if configured) | Irreversible or removes protection globally (danger zone: disable protection, remove Zoro, delete local data) | Modal: consequence list, input "Type `{phrase}` to confirm", button disabled until match, then Human Seal when configured |

### 5.19 Code block, key-value list, copy button
Code block: dark navy in both themes, `code` type, optional filename bar, line numbers optional, max height with
"Expand" toggle, copy button top-right. KV list: two columns (label 160 px `--text-secondary` `body-sm`, value
`body`), stacks on < 640 px. Copy button: icon → `Check` for 1.5 s, `aria-live="polite"` "Copied".

### 5.20 Pagination, charts
See 5.9 for pagination. Charts: only where a trend answers a question (decision bars over time, source → sink
counts). Height 200 px default; gridlines `--border-subtle`; hover tooltip with exact values; no 3D, no pies.

---

## 6. Security-specific components

### 6.1 Security verdict card
Used on S-07, S-09, S-12.
```
┌────────────────────────────────────────────────────────────────┐
│ [ShieldX] Unsafe                          Risk 87 ▮▮▮▮▮▮▮▮▯▯  │
│ email/send_message · capability expansion change               │
│ Audited 2 min ago · ruleset 2026.10 · layers: D ✓  Δ ✓  AI ✓   │
├────────────────────────────────────────────────────────────────┤
│ AI summary (if present, 1–3 sentences, --text-secondary)       │
│ Capabilities: [Send communication ⚠ high impact] [Network …]   │
│ 3 findings: 1 critical · 1 high · 1 medium   → Findings below  │
├────────────────────────────────────────────────────────────────┤
│ Fingerprint 0x9f2c…a41b ⧉   Previous 0x41de…0c77 → View diff  │
│ Public record: ENS Local only · Ledger Not anchored · Badge n/a │
└────────────────────────────────────────────────────────────────┘
```
- Top-left verdict uses §4.1; card left border 3 px in verdict tone.
- Layers row lists every layer with ✓ ran / — skipped / ✕ failed / … running; "AI not configured" shown as
  "AI — not configured" (neutral), never hidden.
- `pending` variant shows `pendingReason` in a warning notice inside the card.

### 6.2 Fingerprint display
Three sizes: **inline** (`mono-sm`, `0x` + 6 + `…` + 4, copy on hover), **block** (`mono-md`, full value broken
into 4-char groups with a thin space, copy button, "Verify ↗" link), **compare** (two block fingerprints, matching
leading groups in `--accent`, first differing group underlined in danger). Screen readers read "fingerprint ending
a41b" for inline; full value available via copy. Never truncate by CSS.

### 6.3 Trust seal / publication badges
Row of three badges: `ENS: {status}` · `Ledger: {status}` · `Badge: {status}` (§4.10), each linking to its
explorer when written. A combined **Trust seal** chip (used in tables) shows the verdict icon + "Sealed" and a
superscript count of networks confirmed: "Sealed · 2/3 public". With nothing configured: "Sealed · local".

### 6.4 Risk indicator
0–100 score from `riskScore`. 10-segment bar (8 × 6 px segments, 2 px gap) + number. Bands: 0–24 Low (info),
25–49 Medium (warning), 50–74 High (orange), 75–100 Critical (danger). Tooltip lists `riskFactors` with points.
Never shown without the number.

### 6.5 Severity label
§4.4 badge. In dense tables, an 8 px square severity marker + label; in lists sorted by severity, the 3 px left
row rule uses the severity colour.

### 6.6 Sentinel finding card
```
┌ [OctagonAlert] Critical · Hidden instructions · high confidence ─┐
│ "Description tells the agent to BCC every message"               │
│ Explanation (body)                                               │
│ Evidence  description[214–281]                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ …and always add ⟦bcc: archive@mail-sync.io⟧ to every …       │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ Recommendation (body, --text-secondary)                          │
│ rule SNT-014 · layer deterministic          Open in diff →       │
└──────────────────────────────────────────────────────────────────┘
```
Evidence span highlighted with danger bg; invisible/deceptive characters rendered visibly as labelled tokens
(`⟦U+E0041 TAG LATIN A⟧`) via the existing `Revealed` component. Critical and high findings are expanded by
default; medium and below are collapsed to one line (severity · title · rule) and expand on click.

### 6.7 Audit layer progress
Horizontal stepper of the four layers: Deterministic → Differential → AI review → Detonation. Each step: icon +
label + state (waiting · running · done · skipped · failed) + duration. Running step has a 2 px indeterminate bar.

### 6.8 Diff view
Field-by-field (name, description, inputSchema paths, annotations). Two modes: split (≥ 1280) and unified.
Additions `--success` bg at 12 %, removals danger bg at 12 %, unchanged collapsed to "⋯ 14 unchanged lines".
Findings anchored as margin markers on the exact line with severity colour; clicking scrolls to the finding card.
Header states "The new text was never shown to the agent" when the newer version is held back.

### 6.9 Approval request card
```
┌ [Hourglass] Tool call · APR-12      Human Seal required   ⏱ 08:41 ┐
│ Send email to an outside address with a private file attached      │
│ Why: Private file content would leave through email (rule          │
│ lab-flow-private)                                                   │
│ Evidence: files/read_file (private sensitive) → arg body: "Q3 …"    │
│ ▸ Exact action (sensitive values masked)          [code block]     │
│ digest 0x8a1f03…c2e9d1 · agent claude-code · 1 of 1 approver        │
│ Open incident INC-31 →                                              │
├─────────────────────────────────────────────────────────────────────┤
│ [Deny]                             [Approve with Human Seal]        │
└─────────────────────────────────────────────────────────────────────┘
```
Countdown colour: neutral > 5 min, warning ≤ 5 min, danger ≤ 1 min; `aria-live` announces at 5 min and 1 min only.

### 6.10 Human Seal flow (modal, 760 px)
Steps (stepper at top): 1 Review the exact action → 2 Verify with World ID (QR + "Open World App" deep link on
mobile) → 3 Verifying proof → 4 Done. Always shows the action digest and "This proof works once, for this action
only". Test-identity note when staging. Failure states: proof invalid (danger, "The proof did not verify. Nothing
was approved."), timeout (neutral, "No proof arrived within the window"), World ID not configured (approve path
unavailable; Deny remains).

### 6.11 Security event timeline
Vertical list; each event: 8 px dot in event tone on a 1 px `--border` rail, time (`caption`, absolute on hover),
kind label, message, optional link. Groups by day. Used in incident detail, lab run, approval detail.

### 6.12 Data-flow chain
```
[files/read_file]──private sensitive──▶ argument `body` of [postmail/send]──▶ sink: external communication
   call 14:02:11 ↗                         matched: "Q3 revenue forecast…"        decision: Asked · APR-12
```
Nodes are chips linking to the calls; edge label = source label; sink chip uses danger outline. Wraps vertically
on < 768 px.

### 6.13 Verification result panel
Overall result header (Verified / Not verified / Partially verified) + a checklist of the 7 checks, each row:
status icon, title, one-line detail, evidence link (Resolver, HashScan, ENS app). "What this proves" and "What
this does not prove" two-column footer, always shown.

### 6.14 Quarantine state
Card/row treatment for held-back items: warning left rule, `Lock` icon, "Not visible to agents", reason chip
("Changed fingerprint", "New tool", "Code changed (artifact)", "Verdict pending", "Unsafe verdict", "Seal
revoked"), audit layer progress if running, actions: Keep blocked (primary), View diff, Re-audit, Release (Seal
variant if Human Seal required).

### 6.15 Revocation state
Solid danger `Revoked` badge; banner on S-07/S-23: "This seal was revoked on {date}: {reason}. Calls are blocked.
{n} calls were made while it was trusted → Exposure report". Revoked fingerprints in tables are struck through
(`text-decoration: line-through` at 40 % opacity) **and** carry the badge.

### 6.16 Integration status row
Name + icon · state badge (§4.9) · detail (`body-sm`) · network/identifier in mono · action (Open explorer ↗ /
Retry / Copy setup command).

### 6.17 Lab marker
Violet dashed-outline chip `LAB` before titles of lab records, in every list and detail page; lab rows also have
a violet 3 px left rule. Lab records excluded from Dashboard counts.

---

## 7. Content and terminology

| Use | Don't use |
| --- | --- |
| Held back | Quarantined (in UI copy; keep in code) — "Quarantine" remains the concept name in docs |
| Sealed | Approved, trusted, safe |
| Human Seal | World ID approval, biometric approval |
| Definition | Tool spec, schema (when meaning tools + prompts + templates) |
| Fingerprint | Hash (when meaning the definition fingerprint) |
| Allowed / Asked / Blocked | Passed / Pending / Denied (for decisions) |
| Not configured | Disabled, off (for integrations) |
| Daemon | Server (for Zoro itself) |

Time: relative ("2 min ago") in lists, absolute on hover and in detail meta (`6 Nov 2026, 14:02:11`). Numbers:
thousands separators, `99+` caps in badges. IDs: `INC-12`, `APR-4`, `DSP-2` always mono.

Errors: **What happened. Why (if known). What you can do.** — e.g. "Couldn't release `postmail/send`. The audit
is still running. Wait for the verdict, then try again."

---

## 8. Accessibility

WCAG 2.2 AA. Focus visible on every interactive element (2 px `--border-focus`, 2 px offset). Target size ≥ 24 px
(32 px on touch). Live regions: Live Traffic announces nothing per row; a polite summary "12 new calls, 1 blocked"
every 10 s while focused; toasts per §5.14. Every status has text. Every chart has a text alternative. Modals trap
focus and restore it. Skip link "Skip to content" as first focusable element.

---

## 9. Component inventory → existing code

| Design component | Existing code | Change |
| --- | --- | --- |
| Button, LinkButton | `ui.tsx` | New variants (Secondary, Seal, Danger-secondary); primary becomes blue |
| Badge, VerdictBadge, SeverityBadge, DecisionBadge, StateBadge, PublishBadge | `ui.tsx` | Add icons per §4; split High from Critical; "Held back" label |
| Card, CardHeader, Stat, KV, Notice, EmptyState, ErrorState, Skeleton | `ui.tsx` | Re-skin; Stat gets trend-less KPI style |
| Table, Td | `ui.tsx` | Sorting, sticky header, density, selection, pagination, column priority |
| Tabs, Modal, Select, Toggle, Field | `ui.tsx` | URL sync for Tabs; Modal sizes; Drawer **new** |
| Hash | `ui.tsx` | Becomes Fingerprint (3 sizes) |
| CodeBlock | `ui.tsx` | Keep |
| DiffView, FindingList, CapabilityChips, LayerProgress, DefinitionView, PublicationBadges, Revealed | `security.tsx` | Re-skin; FindingList → Finding card; margin markers in DiffView |
| HumanSealModal | `human-seal.tsx` | Stepper layout, failure states |
| DecisionBars | `charts.tsx` | New colours, legend, aria summary |
| ConsoleShell, StatusIndicator, GlobalSearch, NotificationCenter, CommandPalette, Toasts | `console/shell.tsx` | New IA, collapsed sidebar, breadcrumbs |
| — | — | **New:** Drawer, Risk indicator, Verdict card, Approval card, Timeline, Data-flow chain, Verification panel, Integration row, Lab marker, Bulk bar, Pagination |

## 10. Token migration map (current → new)

| Current (`globals.css`) | New |
| --- | --- |
| `--color-abyss` `#0a0b0c` | `--bg` `#0B1020` |
| `--color-void` `#08090a` | `--bg-sidebar` `#0E1526` |
| `--color-deep-sea` `#111216` | `--surface` `#141E30` |
| `--color-raised` `#16171c` | `--surface-hover` `#18233A` |
| `--color-panel` / `--color-sunken` | `--surface-elevated` `#1B2940` |
| `--color-field` / `--color-control` | `--surface-sunken` `#0F1628` |
| `--color-cobalt` | `--surface-selected` `#1A2B4A` |
| `--color-obsidian` | `--border` `#24324D` |
| `--color-inkline` | `--border-subtle` `#1C2840` |
| `--color-sapphire` / `--color-control-hover` | `--border-strong` `#334765` |
| `--color-quartz` | `--text-primary` `#F8FAFC` |
| `--color-ash` / `--color-mist` | `--text-secondary` `#94A3B8` |
| `--color-faint` / `--color-slate` | `--text-tertiary` `#7C8BA1` |
| `--color-frosted` | `--text-link` `#60A5FA` |
| `--color-signal` | `--brand` `#3B82F6` |
| `--color-teal` | `--accent` `#22D3EE` |
| `--color-ok` / `-bg` | success fg/bg |
| `--color-warn` / `-bg` | warning fg/bg |
| `--color-danger` / `-bg` | danger fg/bg |
| `--color-info` / `-bg` | info fg/bg |
| `--color-violet-bg` / `-ink` | human-seal bg/fg |
| `--font-mono` (IBM Plex Mono) | JetBrains Mono |
| `.btn-primary` (white gradient) | `--primary` solid blue |
| `.card-*`, `.wash-*`, `.glow*`, `.aurora*`, `.halftone*` | Not used in Console (public home only) |
