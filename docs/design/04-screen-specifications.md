# 04 — Screen Specifications

Conventions:
- Wireframes are drawn at **1440 px** on a 12-column grid (`c1–c12`). Sidebar (240 px) and header (56 px) are
  omitted from wireframes unless they change.
- Every screen lists: ID · route · status · priority · API · live events, then objective, layout, header,
  sections, tables, filters, actions, overlays, states, responsive notes, changes from today.
- Shared states (apply to **every** Console screen unless overridden):

| State | Treatment |
| --- | --- |
| Loading (first load) | Skeleton matching the layout, shown after 150 ms |
| Refetching | Keep data; 2 px indeterminate bar on top edge of the affected card |
| Error (request failed, daemon reachable) | `ErrorState` inside the card: "Couldn't load {thing}. {server message}." + **Try again** |
| Daemon unreachable | Global danger banner; cards show last data with "Last updated {time}"; actions disabled with tooltip "The daemon is not reachable" |
| Backend waking | Global neutral banner "Starting the backend — about a minute"; skeletons stay |
| Session expired | Redirect to S-01 `?next=` |
| Permission denied (future, Q-01) | Full-page: lock icon, "You don't have access to {page}", "Ask a System Owner", **Back to Dashboard** |
| Live updates disconnected | Chip in page header "Live updates paused · Reconnecting…" (+ **Refresh**) |

---

## S-01 Console sign-in

`/console/login` · EXISTING · P1 · `POST /auth/login` (Next route → `POST /api/auth/check`)

**Objective:** exchange the Console token for a session, quickly and safely.

```
        ┌──────────────── c5–c8 (400 px card, centred, 20vh from top) ────────────────┐
        │ [Zoro logo]                                                                  │
        │ Sign in to the Console                                    title-md          │
        │ Use the Console token printed when the daemon started,                      │
        │ or the ZORO_CONSOLE_TOKEN set for this deployment.        body-sm secondary │
        │ Console token  [•••••••••••••••••••••••  👁]                                │
        │ [            Sign in            ]  primary, full width                      │
        │ Where do I find it? ▸ (disclosure: local paths per OS, hosted: Render env)   │
        └──────────────────────────────────────────────────────────────────────────────┘
                     Public site · Verify a seal · Attack Lab   (links, caption)
```
- `?token=` prefills and auto-submits **only** if the user clicks Sign in (no silent auto-login; avoids token in
  history — the URL is replaced with `/console/login` after reading).
- Errors: invalid → "That token doesn't match this daemon." under the field; daemon down → danger notice with
  `daemonDownHint()`; backend waking → neutral "Starting the backend…".
- Success → `next` or `/console`.

---

## S-02 Setup (Onboarding)

`/console/onboarding` · EXISTING (renamed "Setup" in nav) · P1 · `GET /onboarding/state`, `POST /onboarding/scan`,
`/route`, `/restore`, `/complete` · events `server`, `tool`, `audit`, `seal`

**Objective:** protect the servers the person already uses without editing files.

Layout: 1120 px max width; left vertical stepper (c1–c3), step content (c4–c12).

| Step | Content | Primary action | Secondary |
| --- | --- | --- | --- |
| 1 Allow | What Zoro will read (list of known client config paths per OS) and what it will change (adds a Zoro entry, keeps backups) | **Allow and scan** | Add servers by hand instead |
| 2 Choose | One card per client (Claude Desktop, Cursor, …) with `path` in mono; rows per server: checkbox "Protect {name}", segmented Enforce / Observe (Enforce default), command preview | **Route through Zoro and start the baseline audit** | Rescan · Restore original configurations |
| 3 Baseline audit | Table: definition · server · layer progress · verdict · state, live | (auto-advances when all audits finish; **Continue** enabled once ≥ 1 verdict) | Review held-back tools → S-08 |
| 4 Protected | Posture summary (servers protected, definitions sealed / held back / unsafe, capabilities, gaps), optional card "Human Seal and alerts" → S-28 | **Go to the dashboard** | See my posture (report) · Configure notifications |

States: no configs found → empty state "No MCP client configurations found on this machine" + explanation for
hosted instances + **Add a server** + **Copy Bridge command** (with gateway URL); scan not permitted → warning
notice + retry; per-client write error row (danger) with the file path; observe chosen → inline warning
"Observe mode gives no protection. Use it only to tune policies on first rollout."

Responsive: stepper becomes a top progress bar "Step 2 of 4" below 1024 px.

---

## S-03 Dashboard

`/console` · EXISTING, CHANGED · **P0** · `GET /overview?hours=`, `GET /status`, `GET /approvals` (count), SSE
`call`, `incident`, `approval`, `seal`, `tool`, `server`, `status`

**Objective:** answer, top to bottom: *Is Zoro protecting right now? Does anything need me? Is anything attacking
me? Which servers and tools are trusted? Is the infrastructure healthy?*

```
c1 ─────────────────────────────────────────────────────────────────────────────────────── c12
Dashboard                                              [Last 24 hours ▾]  [Generate report]
Standard policy · computed from this machine's records

┌ c1–c12  PROTECTION BANNER ─────────────────────────────────────────────────────────────────┐
│ [ShieldCheck] Protected — 6 servers enforced, 41 of 44 definitions sealed, gateway online   │
│ (or) [OctagonAlert] Attention needed — 1 critical incident, 2 approvals expire in < 10 min │
│                                                   [Review now →]  (only when attention)    │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌ c1–c3 Waiting for you ┐┌ c4–c6 Open incidents ┐┌ c7–c9 Held back ──┐┌ c10–c12 Protected servers┐
│ 2   pending approvals ││ 3  1 critical · 2 med ││ 3  of 44 defs     ││ 6/7  1 observe           │
│ next expires in 08:41 ││ newest 4 min ago      ││ 1 audit running   ││ 1 offline                │
└───────────────────────┘└───────────────────────┘└───────────────────┘└──────────────────────────┘
┌ c1–c7 Needs your attention (ranked list, max 7) ┐┌ c8–c12 Activity ─────────────────────────────┐
│ ● APR-12 Send email with private file  ⏱ 08:41  ││ 1,204 calls · 1,170 allowed · 22 asked · 12  │
│ ● INC-31 Critical · Unsafe verdict postmail/send ││ blocked                                       │
│ ● postmail/send held back · changed fingerprint  ││ [stacked bars per hour: allowed/asked/blocked]│
│ … and 4 more → (links to the filtered page)      ││ Live traffic →                                │
└──────────────────────────────────────────────────┘└───────────────────────────────────────────────┘
┌ c1–c7 Your tools ────────────────────────────────┐┌ c8–c12 Infrastructure ───────────────────────┐
│ Seal coverage [████████████▒▒░] 41 sealed …      ││ Gateway            Connected  6/7 online · 3 │
│ Sealed 38 · Warnings 3 · Pending 2 · Unsafe 1 ·  ││ Sentinel auditor   Connected  D+Δ+AI · 0 q   │
│ Revoked 0                                        ││ ENSv2 registry     Not configured  [Set up]  │
│ What your tools can do: Send communication ⚠ 4 … ││ Hedera ledger      Not configured  [Set up]  │
│ Gaps: "1 client bypasses Zoro: cursor/github"    ││ Human Seal         Test identities           │
│ Servers →                                        ││ Local records      Degraded · ephemeral      │
└──────────────────────────────────────────────────┘└───────────────────────────────────────────────┘
┌ c1–c12 Recent security events (last 8 from audit log + public events) ─────────────────────────┐
│ 14:02 Seal revoked  postmail/send  ledger #182 ↗ │ 13:58 Policy changed by console  …          │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Sections in priority order**

| # | Section | Content | Source field | Link |
| --- | --- | --- | --- | --- |
| 1 | Protection banner | Status icon + label (§03 4.11) + one-line headline from `status.headline` + "Review now" when `attention` | `/status` | First attention item |
| 2 | KPI tiles (4) | Waiting for you (`approvals.length`, next expiry) · Open incidents (sum `bySeverity`, breakdown) · Held back (`posture.quarantined` of `toolCount`) · Protected servers (enforce count / total, observe and offline counts) | `/overview` | S-13 · S-11 · S-08 · S-04 |
| 3 | Needs your attention | Ranked: approvals by expiry asc → incidents by severity then recency → held-back tools. Each row: severity/state dot + icon, title, meta (ref · type · time), chevron | `/overview` | Item page |
| 4 | Activity | Totals by decision + stacked bars per bucket (hour ≤ 24 h, day otherwise); hover tooltip with counts | `decisions`, `series` | S-15 filtered by bucket |
| 5 | Your tools | Seal coverage bar + legend counts; top 6 capabilities with "high impact" marker; gaps list (warning) | `posture` | S-04 |
| 6 | Infrastructure | One Integration status row per dependency (§03 6.16) | `/status.dependencies` | S-28 Networks |
| 7 | Recent security events | Last 8: incidents opened, seals revoked, policy changes, public ledger events | `/overview.publicEvents` + audit log (needs `GET /log?limit=8`, exists) | S-20 |

KPI tile spec: 112 px tall, label (`caption` secondary) · value (`kpi`) · hint (`body-sm`) · whole tile is a link;
tone only on value colour when > 0 and actionable (warning/danger), never on zero.

**Filters:** period select (24 h / 7 d / 30 d) → `?hours=`; persists in URL.
**Actions:** Generate report (secondary) → S-21 with `kind=posture`.
**States:**
- No servers → replaces sections 2–7 with empty state "No servers protected yet — Import the MCP servers your AI
  clients already use, or add one by hand. Zoro audits every tool before your agent can see it." **Import from my
  AI clients** (primary) · **Add a server**.
- All clear → section 3 shows `CircleCheck` "All clear — no approvals, open incidents or held-back tools."
- No calls in period → section 4 "No calls in this period."
- Observe mode → banner (global) + tile 4 hint in warning.

**Changes from today:** add protection banner, Infrastructure card, Recent events card; reorder KPI tiles to put
"Waiting for you" first; remove quarantine terminology in favour of "Held back".

---

## S-04 MCP Servers

`/console/servers` · EXISTING · **P0** · `GET /servers`, `POST /servers`, `PATCH /servers/:id/mode` · events
`server`, `tool`, `seal`

**Objective:** see every upstream server, whether it is protected and trusted, and add more.

```
MCP Servers                                    [Import from AI clients]  [+ Add server]
Every upstream MCP server Zoro connects to on your behalf.
[Search servers…]  [Mode: All ▾] [Connection: All ▾] [Coverage: All ▾]        7 servers
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Server              Transport  Mode       Connection  Seal coverage      Issues  Changed │
│ postmail            stdio      Enforce    ● Online    ████▒░ 5/6 · 1 held  1 crit 4m ago │
│ lab: npx -y @x/mail                                                                      │
│ github              http       Observe ⚠  ● Online    ██████ 12/12         —     2d ago │
│ files               stdio      Enforce    ○ Offline   ███▒▒▒ 3/5           1 high 1h ago │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| Column | Field | Width | Align | Format | Sort | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Server | `name`, 2nd line `ensName ?? label` + command/URL (mono, truncated) | 28 % | left | link to S-06 | ✓ | P1 |
| Transport | `transport` | 96 px | left | `stdio` → "Local process", `http` → "Remote", `lab` → LAB marker | ✓ | P3 |
| Mode | `mode` | 120 px | left | Badge §03 4.6; inline segmented menu on click (see actions) | ✓ | P1 |
| Connection | `online`, `last_error` | 120 px | left | dot + label; tooltip `last_error` | ✓ | P2 |
| Seal coverage | `sealed/total`, `quarantined` | 200 px | left | mini 5-colour bar + "5/6 · 1 held" | ✓ by % | P1 |
| Issues | open incidents by max severity | 96 px | left | severity badge + count, "—" | ✓ | P2 |
| Changed | last definition change | 96 px | right | relative time | ✓ (default desc) | P3 |
| ⋯ | | 40 px | | Re-read definitions · Restart · Change mode · Remove | | P1 |

**Filters:** search (name/label/command), Mode, Connection, Coverage (all sealed / has held back / has unsafe) →
URL params. **Primary action:** Add server (opens S-05). **Mode change:** to Enforce = immediate (L1 toast);
to Observe or Disabled = L2 confirm stating "Calls to {server} will no longer be blocked" and, if policy requires,
creates an approval (`mode_change` kind) → S-14.

**States:** empty → "No servers yet" (Import / Add); filtered empty → "No servers match these filters" + Clear
filters; offline row → danger dot + `last_error` second line in danger fg.

---

## S-05 Add server (drawer)

`/console/servers?add=1` · EXISTING (modal today → drawer) · **P0** · `POST /servers`

480 px right drawer.

| Field | Control | Validation / help |
| --- | --- | --- |
| Transport | Segmented: Local process (stdio) · Remote (HTTP) | Default stdio |
| Name | Text, placeholder `filesystem` | Required, `[a-z0-9-]`, unique; becomes the label agents see |
| Command (stdio) | Mono text, placeholder `npx` | Required |
| Arguments (stdio) | Mono text, placeholder `-y @modelcontextprotocol/server-filesystem /path/to/folder` | Split on spaces; quoted segments preserved |
| URL (HTTP) | Mono text, placeholder `https://example.com/mcp` | Required, `https://` (warn on `http://` non-localhost) |
| Environment variables (stdio) / Headers (HTTP) | Key–value repeater; values password-type | "Values are stored locally and never shown again" |
| Private seals | Checkbox "Internal server: nothing is published" | Default off |
| Start in observe mode | Checkbox | Inline warning when checked |

Footer: Cancel (secondary) · **Add and audit** (primary). Loading label "Connecting…" then "Reading
definitions…". Success → navigate to S-06 with toast "Added {name}. Auditing {n} definitions." Failure → drawer
stays, error notice at top with message + stderr excerpt (code block, 6 lines), fields preserved.

---

## S-06 Server details

`/console/servers/:id` · EXISTING · **P0** · `GET /servers/:id`, `POST /servers/:id/refresh|restart`,
`DELETE /servers/:id`, `PATCH /servers/:id/mode` · events `server`, `tool`, `seal`, `audit`

```
MCP Servers › postmail
postmail  [Enforce ▾]                       [Re-read definitions] [Restart] [⋯ Remove]
lab-postmail.zoro.eth · local process · imported via claude-desktop
(notices: Observe mode / Code changed / Remote server limitation — when applicable)
┌ Connection ─────┐┌ Definitions ──────┐┌ Sealed ─────────┐┌ Publisher ─────────┐
│ ● Online        ││ 6                 ││ 5/6             ││ verified (github)  │
│ since 2h ago    ││ 4 tools · 1 prompt││ 1 held back     ││                    │
└─────────────────┘└───────────────────┘└─────────────────┘└────────────────────┘
[Definitions 6] [Change history 14] [Identity] [Policy] [Connection log]
┌───────────────────────────────────────────────────────────────────────────────┐
│ Name            Kind    State         Verdict         Capabilities   Calls Last│
│ send_message    tool    Held back 🔒  Unsafe          Send comm. ⚠   142  4m  │
│ 0x9f2c…a41b                                                                    │
└───────────────────────────────────────────────────────────────────────────────┘
```

Tabs:

| Tab | Content |
| --- | --- |
| Definitions | Table: Name (mono link to S-07 + inline fingerprint) · Kind · State (§03 4.3) · Verdict (§03 4.1/4.2) · Capabilities (2 chips + "+n") · Calls (right) · Last used. Held-back rows have warning left rule. Sorted: blocked → held back → awaiting → released |
| Change history | Table: When · Definition · Fingerprint (inline) · Change class · Verdict; each row links to S-10 diff with its predecessor |
| Identity | KV: Declared name, Declared version, Manifest root (block fingerprint), Artifact identity, Approved artifact (compare fingerprint when they differ), Command/Endpoint, Secrets (key names only), Added. Artifact JSON code block |
| Policy | Rules that target this server (id mono + plain-language reading + enabled state) + "Only global rules apply" + Edit policy → S-17 |
| Connection log | Timestamped list + stderr code block (last 15 lines, "in memory only") |

Notices (top, in this order): **Code changed** (danger) "The code behind this server changed. Its artifact identity
no longer matches the approved one. Tools stay unavailable until the new code is reviewed." + **Review** → S-13
filtered `artifact_release`; **Observe mode** (warning); **Remote server limitation** (info, dismissible per
server).

Remove: L2 confirm "Remove postmail? Agents will lose access to its tools through Zoro. Its history, calls and
verdicts stay in the audit log." [Cancel] [Remove server (danger)].

---

## S-07 Tool details

`/console/tools/:serverId/:kind/:name` · EXISTING · **P0** · `GET /tools/…`, `POST /tools/…/:action`
(`reaudit`, `keep-blocked`, `human-release`, `revoke`) · events `tool`, `audit`, `seal`, `call`

```
MCP Servers › postmail › send_message
send_message  [Held back 🔒] [Unsafe]                 [Re-audit] [Verify independently ↗] [⋯]
tool on postmail · first seen 6 Nov 2026 · 142 calls
(banner when held: "This version is not visible to agents. The text below was never shown to the model.")
┌ c1–c8 ────────────────────────────────────────────┐┌ c9–c12 Action rail ───────────────┐
│ Security verdict card (§03 6.1)                   ││ What you can do                   │
│ Findings (finding cards §03 6.6)                  ││ [Keep blocked]            primary │
│ Risk factors (list with points)                   ││ [Release with Human Seal]  seal   │
│ Live definition (DefinitionView, mono)            ││ [Re-audit]             secondary  │
│ Versions table: First seen · Fingerprint ·        ││ View diff with previous →         │
│   Change · Verdict · Risk  (compare A/B selects)  ││ ─────────────                     │
│ Recent calls: When · Agent · Decision · Rule ·    ││ Public record                     │
│   Overhead · Latency · Shield                     ││ ENS · Ledger · Badge badges       │
└───────────────────────────────────────────────────┘│ ─────────────                     │
                                                     │ Fingerprint (block) ⧉             │
                                                     │ [Revoke seal] danger-secondary    │
                                                     └───────────────────────────────────┘
```

Action availability:

| State / verdict | Primary | Secondary | Hidden |
| --- | --- | --- | --- |
| Held back, verdict pending, audit running | — (Audit layer progress shown) | Re-audit (disabled "Audit in progress") | Release |
| Held back, unsafe | Keep blocked | Re-audit | Release (never offered for unsafe) |
| Held back, sealed with warnings / awaiting release | Keep blocked | Release (Seal variant if policy needs Human Seal) | — |
| Released, sealed | Re-audit | Revoke seal (L2 + reason "published") | — |
| Revoked | Keep blocked (state) | Exposure report → S-21 | Release |

Trust-chain contradiction notice (danger) when local seal disagrees with registry. Pending notice (warning) with
`pendingReason`.

---

## S-08 Sentinel Audits

`/console/audits?tab=held|history` · **PROPOSED** (absorbs `/console/quarantine`) · **P0** · `GET /quarantine`
(held), **`GET /audits` (new, Q-02)** for history, `POST /tools/…/:action` · events `tool`, `audit`, `seal`,
`approval`

**Objective:** one home for "what has Sentinel judged, and what is held back right now".

```
Sentinel Audits                                                      [Run corpus check ▾]
Every new or changed definition is audited before an agent can see it.
┌ Held back 3 ┐┌ Audits today 18 ┐┌ Unsafe (30d) 2 ┐┌ Auto-released (30d) 11 ┐   ← summary strip
[Held back 3] [History]
── Held back tab ───────────────────────────────────────────────────────────────────────────
┌ postmail/send_message  [Held back] [Unsafe] [capability expansion]  changed fingerprint · 4m ┐
│ Layer progress / pending reason / "Sealed. Waiting for release."                              │
│                                   [View diff] [Re-audit] [Keep blocked] [Release w/ Seal]     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
── History tab ─────────────────────────────────────────────────────────────────────────────
[Search tool/fingerprint] [Verdict ▾] [Change ▾] [Layer ▾] [Server ▾] [Include lab ☐]
│ Audited  Definition            Change          Verdict          Risk  Layers     Duration │
│ 4m ago   postmail/send_message capability exp. Unsafe           87   D Δ AI     4.2 s    │
```

History columns: Audited (rel, sort default desc) · Definition (`label/name` mono → S-09) · Change class ·
Verdict (+ seal status) · Risk (indicator compact) · Layers (D Δ AI ⚡ with ✓/—/✕) · Duration · Findings count by
max severity. Priority: Definition P1, Verdict P1, Audited P1, Risk P2, Change P2, Findings P2, Layers P3,
Duration P3.

Held-back card = Quarantine state component (§03 6.14). Sort: blocked/unsafe → awaiting release → pending →
running.

**Run corpus check** (secondary dropdown): "Deterministic corpus" (`POST /corpus/run`) · "With AI layer"
(`POST /corpus/run-ai`, disabled without AI key) → results drawer with detection rate and false blocks. P2.

States: held empty → "Nothing held back. New and changed tools land here while Sentinel audits them; most honest
updates are sealed and released automatically." History unavailable (endpoint not built) → info notice "Audit
history needs the audits list endpoint" — **design-time only; do not ship without Q-02 resolved**.

---

## S-09 Audit result

`/console/audits/:id` · PROPOSED (endpoint exists) · **P0** · `GET /audits/:id`, `GET /diff`

Breadcrumb Sentinel Audits › `postmail/send_message` › Audit `a7c2…`. Layout identical to S-07's main column but
scoped to one audit: Verdict card (with attestation: scheme, auditor address mono, signature inline fingerprint,
signed at), Layer progress with per-layer duration and per-layer findings count, Findings, Capability profile
(capability + signals), Risk factors, Auditor configuration (ruleset, canonicalization, AI configs, detonation),
Publication (ENS/Ledger/Badge), link "How Sentinel decides ↗" → S-31. Action rail as S-07 when the version is
currently held back; otherwise "This version is {state}" + link to S-07.

Export: **Download verdict package (JSON)**.

---

## S-10 Diff viewer

`/console/diff?serverId&kind&a&b&from=` · EXISTING · P0 (component) · `GET /diff`

Header: breadcrumb from `from` param; title "What changed"; description "`0x41de…` → `0x9f2c…` · {change class}"
+ "The new text was never shown to the agent" when held. Controls: Split / Unified segmented, "Show unchanged"
toggle, "Reveal invisible characters" (on by default). Body: Diff view (§03 6.8) c1–c8; Findings for the newer
version c9–c12 sticky, clicking a finding scrolls/highlights the span. Empty (no params) → "Open the diff viewer
from an incident, a held-back tool or a tool's history."

---

## S-11 Incidents

`/console/incidents?status=&severity=&type=&q=&seq=` · EXISTING · **P0** · `GET /incidents`,
`POST /incidents/bulk-ack` · events `incident`

```
Incidents                                                           [Export ▾]
Security-relevant events, grouped so repeated events are one incident.
[Open 3] [Acknowledged 1] [Resolved] [Dismissed]   [Severity ▾] [Type ▾] [Server ▾] [Search] [☐ Include lab]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ☐  Incident                                   Severity   Type           Status  Upd. │
│ ☐  INC-31 Unsafe verdict for postmail/send    ⬣ Critical Unsafe verdict Open    4m  │
│     postmail · ×3 events grouped                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
(bulk bar when selected: "2 selected · Acknowledge · Clear")
```

| Column | Field | Notes | Priority |
| --- | --- | --- | --- |
| ☐ | | bulk select (open only) | P2 |
| Incident | `ref` (mono) + `title`; 2nd line server · `×count` · LAB | link S-12 | P1 |
| Severity | §03 4.4 | sort default: severity desc then updated desc | P1 |
| Type | human label of `type` (15 types: blocked call, unsafe verdict, revocation, data flow, output shield, trust contradiction, bypass config, artifact changed, shadowing, drift, Human Seal invalid, flapping, observe would block, server offline, malformed manifest) | | P2 |
| Status | §03 4.7 | | P2 |
| Updated | relative | | P3 |

Status tabs show counts. `?seq=31` (from palette "INC-31") opens S-12 directly.
Empty (Open) → `CircleCheck` "Nothing needs your attention right now." + link "View resolved incidents".
Filtered empty → "No incidents match" + Clear filters.

---

## S-12 Incident details

`/console/incidents/:id` · EXISTING, CHANGED · **P0** · `GET /incidents/:id`, `GET /diff`,
`POST /incidents/:id/status|override|disable-server`, `POST /disputes` · events `incident`, `approval`, `audit`,
`seal`

```
Incidents › INC-31
Unsafe verdict for postmail/send_message                                  [Export report ▾]
[⬣ Critical] [Open] [Unsafe verdict] [×3 events] [LAB?]   opened 6 Nov 2026, 14:02
┌ What happened (notice, severity tone) ─────────────────────────────────────────────────────┐
│ summary text · Resolution: … (when resolved)                                               │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌ c1–c8 Evidence (in this order, only those present) ┐┌ c9–c12 Action rail (sticky) ─────────┐
│ 1 What changed  — Diff (compact) → Open in viewer   ││ What you can do                      │
│ 2 Sentinel verdict — verdict card + findings        ││ The protective choice is the default │
│ 3 Data-flow chain — §03 6.12                        ││ [Keep blocked & resolve]   primary   │
│ 4 Exposure report — n calls while trusted,          ││ [Acknowledge]              secondary │
│   guidance list, call list, Download                ││ [Disable postmail]   danger-secondary│
│ 5 Raw evidence — code block (collapsed)             ││ [Override this call with Human Seal] │
│                                                     ││ [Challenge this seal]  (link style)  │
│                                                     ││ [Dismiss…]                 ghost     │
│                                                     ││ Verify the public record →           │
│                                                     │├ Affected ───────────────────────────┤
│                                                     ││ Server postmail → S-06               │
│                                                     ││ Tool send_message → S-07             │
│                                                     ││ Fingerprint 0x9f2c…a41b ⧉            │
│                                                     │├ Public record (badges) ─────────────┤
│                                                     │├ Timeline (§03 6.11) ────────────────┤
│                                                     │├ Calls in this incident (5) ─────────┤
│                                                     │├ Approvals (APR-12 pending) ─────────┤
└─────────────────────────────────────────────────────┘└──────────────────────────────────────┘
```

Action rules:
- Header keeps only **Export report** (Markdown / JSON) — all decisions live in the rail (fixes U-06).
- **Keep blocked & resolve** → L1 (toast with Undo 6 s → reopens), note "Kept blocked; resolved from the Console".
- **Acknowledge** shown only when `open`.
- **Disable {server}** → L2 confirm; shown when server mode ≠ disabled.
- **Override this call with Human Seal** shown only when `evidence.overridable` and no pending approval; if pending
  → "Continue APR-12 (Human Seal)".
- **Challenge this seal** only when the verdict is sealed / sealed with warnings → Challenge modal → Human Seal.
- **Dismiss…** → modal with required textarea "Why is this not a problem? (recorded in the audit log)"; button
  disabled until non-empty.
- Resolved/dismissed incidents: rail shows status, who/when, note, and **Reopen** (secondary).

Errors: inline danger notice at the top of the rail; buttons re-enabled; no optimistic state.

---

## S-13 Human Approvals

`/console/approvals` and `/console/approvals/:id` · EXISTING, CHANGED · **P0** · `GET /approvals`,
`GET /approvals/:id`, `POST /approvals/:id/decide|cancel` · events `approval`, `human_seal`

```
Approvals
Actions waiting for a person. Each approval is bound to the exact action and works once.
(notice when World ID not configured: "Human Seal unavailable — actions that need one can only be denied")
[Pending 2] [History]                          [Kind ▾] [Agent ▾]   sorted by: expires soonest
┌ Approval card (§03 6.9) c1–c6 ┐┌ Approval card c7–c12 ┐
└───────────────────────────────┘└──────────────────────┘
```

- Cards: 2 columns ≥ 1280, 1 column below. Human-Seal-required cards have a violet top border.
- Kinds (label): Tool call · Override a block · Weaken policy · Release a version · Namespace claim · Open a dispute
  · Danger zone · Observe mode · Accept new code.
- Buttons: **Deny** (primary, protective) · **Approve** (secondary → L2 "Approve this exact action once?") or
  **Approve with Human Seal** (Seal variant → S-14). Approve disabled with tooltip when Human Seal is required and
  World ID is not configured.
- Keyboard: focus a card, `D` deny, `A` approve (opens confirm), `↑/↓` move between cards.
- History tab: table Approval (summary + ref + requested at) · Kind (+ Human Seal) · Outcome badge (§03 4.8) ·
  Decided · By (`console` or "World ID · nullifier 0x…" mono). Paginated 50.
- `/approvals/:id` renders a single card full width + timeline + linked incident; used by toasts and deep links.
- Empty pending → "Nothing waiting for you. When policy needs a person to decide, the request appears here with
  the exact action and the evidence."
- Concurrency: if already decided elsewhere, card animates out and a toast says "APR-12 was already {outcome}".

---

## S-14 Human Seal flow (modal)

EXISTING component, CHANGED · **P0** · `POST /human-seal/start`, `GET /human-seal/:id`,
`POST /human-seal/:id/complete|cancel` (console) · `POST /lab/approvals/:id/human-seal`,
`POST /lab/human-seal/:sid/complete` (lab)

760 px modal, stepper per §03 6.10.

| Step | Shows | Actions |
| --- | --- | --- |
| 1 Review | Approval summary, kind, exact action (code block), digest (block fingerprint), expiry countdown, "This proof works once, for this action only." | Cancel · **Continue to World ID** |
| 2 Verify | QR code (260 px) bound to `actionStringFor(digest)` + "Open World App" (mobile) + waiting spinner + window countdown | Cancel |
| 3 Verifying | Spinner "Checking the proof…" | — |
| 4 Done | Success "Approved with a Human Seal" + nullifier (mono) + "The action will run once." | Close |
| Error | Invalid proof (danger) / Timeout (neutral) / Cancelled | Try again · Close |

Test identities: violet notice on steps 1–2 "Staging: test identities from the World ID Simulator. Not
production identity assurance."

---

## S-15 Live Traffic

`/console/traffic` · EXISTING, CHANGED · P1 · `GET /calls?agent&server&decision&since&limit` · events `call`

```
Live Traffic  ● Live                                     [Pause live view] [Density ▾]
Every tool call through the Gateway. Pausing the view does not stop recording.
[Agent ▾] [Server ▾] [Decision ▾] [Time ▾] [Search tool/rule]          1,204 in period
(▲ 12 new calls — Show)   ← appears when scrolled down or paused
│ Time      Agent        Tool                     Decision           Rule          Shield  Overhead  Latency │
│ 14:02:11  claude-code  postmail/send_message    Blocked            unsafe-verdict —       0.8 ms    —     │
│ 14:02:05  cursor       files/read_file          Allowed · flow ⚠   —              —       0.6 ms    42 ms │
```

- Columns: Time (absolute `HH:mm:ss`, date on hover) P1 · Agent P2 · Tool (`label/tool` mono → S-07, version
  fingerprint inline on hover) P1 · Decision (§03 4.5, + `flow` chip, + outcome line when not executed e.g.
  "approval APR-12: denied") P1 · Rule (mono) P2 · Shield action P3 · Overhead P3 · Latency P3.
- Row click → right drawer 640 px with Call details summary + "Open full page" → S-16.
- Blocked rows: danger 3 px left rule; Asked: warning rule.
- New rows insert at top with a 220 ms fade/slide; if the user has scrolled or paused, rows are buffered and the
  "▲ n new calls" pill appears instead.
- Empty → "No calls yet. Calls appear here as soon as an agent uses a tool through Zoro."
- Live dot states: live (accent, pulsing), paused (neutral "Paused — new calls are still recorded"),
  disconnected (warning "Reconnecting").

---

## S-16 Call details

`/console/traffic/:id` · EXISTING · P1 · `GET /calls/:id`, `POST /calls/:id/reveal`

Header: breadcrumb; title `postmail/send_message` with Decision badge; meta "6 Nov 2026 14:02:11 · claude-code ·
overhead 0.8 ms · latency —". Cards (c1–c8): **Why** (decision + reason + rule) · **Arguments** (masked KV; masked
values show `••••` + **Reveal** → L2 "Revealing is recorded in the audit log" ; secret-named values show "never
stored") · **Policy evaluation trace** (table # · Rule · Type · Outcome · Detail; deciding row highlighted) ·
**Output Shield** (findings in the result, action taken) · **Data flow** (chain component) · **Result summary
(untrusted tool output)** (code block, mono, with "This is untrusted text from the tool" label). Side (c9–c12):
links to Incident, Approval, Tool, Agent.

---

## S-17 Policies

`/console/policies?tab=rules|preview|history` · EXISTING · P1 · `GET /policy`, `POST /policy/describe|preview|save`,
`GET /policy/export` · events `policy`

```
Policies                                           [Export] [Import JSON] [Save policy]
How strict Zoro is, per server, tool, agent and action. Weakening protection is a protected action.
Profile: (•) Standard  ( ) Strict  ( ) Lab            ← segmented; switching shows a diff preview
[Rules 18] [Preview & simulate] [History]
── Rules ───────────────────────────────────────────────────────────────────────────────────
[+ Add rule ▾]  [Type ▾] [Search]
│ On  Rule id               Type                 Reads as                                  │
│ ◉   lab-flow-private      Data flow            Private content to email/network → Ask    │
│                                                + Human Seal                       [Edit] │
```

Rule types and their editors (drawer 480 px, plain-language preview at top updated live via `/policy/describe`):

| Type | Label | Key fields |
| --- | --- | --- |
| `verdict_handling` | Verdict handling | Sealed → decision; Sealed with warnings → decision |
| `auto_release` | Auto-release | cosmetic / documentation / functional: auto or ask; capability expansion: ask (fixed) |
| `tool_permission` | Tool permission | server, tool (or `*`), action |
| `argument_constraint` | Argument constraint | server, tool, argument, constraint (allowlist / pattern / …), action, Human Seal |
| `rate_limit` | Rate limit | server, tool, max calls, window seconds, action |
| `agent_rule` | Agent rule | agent, deny capabilities, action |
| `data_flow` | Data flow | from (untrusted external / private sensitive), to sinks (multi), action, Human Seal |
| `time_window` | Time window | capabilities, days, start/end hour, outside action |
| `network_grace` | Registry unreachable | mode strict/grace, high-impact mode, grace minutes |
| `human_seal` | Require a Human Seal for | triggers (multi) |
| `output_shield` | Output Shield | server, tool, action |
| `high_impact_ask` | High-impact tools | capabilities, Human Seal |

**Save flow:** Save policy → automatic preview: "Changes" list + **Loosening** list (danger notice "This draft
weakens protection in {n} places") + optional simulation "Replay recorded calls from [last 24 h ▾]" → table When ·
Agent · Tool · Before · After · Why. Change note required. If loosening: Save creates a `policy_change` approval
→ S-14 (Human Seal when configured). If only tightening: L2 confirm then save.

History tab: When · By · Loosening (yes/no) · Human Seal · Note.

---

## S-18 Data Flows

`/console/flows` · EXISTING · P1 · `GET /flows` · events `call`

Header description: "Content returned by one tool that showed up in the arguments of another — the pattern behind
cross-server exfiltration." Action: **Tune data-flow rules** → S-17 filtered `type=data_flow`.

1. **Source → sink summary** (c1–c12): table Source label · Sink type · Times · Asked · Blocked; plus a compact
   flow diagram (left column sources, right column sinks, edges weighted by count, labelled). Diagram is optional
   and only rendered when ≥ 2 distinct edges.
2. **Detected flows** list: each item = data-flow chain (§03 6.12) + decision + approval status + time. Filters:
   source label, sink, decision, period.

Empty → "No flows observed. Zoro labels untrusted and private sources, then watches for their content reaching
sinks such as email, network or payments."

---

## S-19 Agents

`/console/agents` · EXISTING · P1 · `GET /agents`, `PUT /agents/:id/declaration`

Grid of agent cards (3 per row ≥ 1280): name, client, first/last seen, tools used table (Tool · Calls · Last),
declaration state ("Declared: 4 tools, enforced" / "No declaration"). Action **Declare tools** → drawer with
textarea "One server/tool per line" + preview of what would be blocked + **Save and enforce** · **Remove
declaration**. Empty → "No agents yet. Agents appear here when a client connects to the Zoro gateway and calls a
tool."

---

## S-20 Audit Log

`/console/log?q=&kind=` · EXISTING · P1 · `GET /log`, `GET /log/verify`, `GET /log/:seq/proof`, `POST /anchors`

```
Audit Log                                            [Verify the chain] [Anchor now]
Every local event, append-only and hash-chained. Batches are anchored as Merkle roots.
┌ Chain integrity: ✓ Verified 1,882 entries · last anchor #41 2h ago (Hedera ↗ / local) ┐
[Search summaries] [Kind ▾] [☐ Include lab]
│ #     When        Kind             Ref      Summary                       Entry hash  Anchored │
│ 1882  14:02:11    incident.opened  INC-31   Unsafe verdict for postmail/… 0x3be1…   #41 ✓    │
```
Columns: # (mono, right) P2 · When P1 · Kind (mono chip) P2 · Ref (`INC-n`, `APR-n`, … linked) P2 ·
Summary P1 · Entry hash (inline fingerprint) P3 · Anchored (anchor # + ✓ / "pending") P3. Row click → drawer:
full entry JSON, prev hash, entry hash, **Inclusion proof** (Merkle path list + root + anchor link). Anchors card
(bottom): table of anchors (root, range, ledger ref/local). Verify chain → result notice (success / danger with
first broken seq). Ephemeral storage banner here always (info, not dismissible).

> `GET /log` already supports `q`, `kind`, `lab` and `before` (load older). An **Actor** column/filter would need
> an actor field on log entries, which does not exist (Q-07). Pagination is "Load older" via `before`.

---

## S-21 Reports

`/console/reports?kind=` · EXISTING · P2 · `GET /reports/:kind?format=md|json&…`

Left (c1–c4) generator card: Report select (Posture · Audit evidence pack · Incident · Exposure · Tool dossier),
contextual fields (Range 7/30/90 d; Incident ID; Revoked fingerprint; Server label + Tool name), **Generate**.
Right (c5–c12) preview: rendered Markdown, header with title, "Generated {time}", **Download Markdown** ·
**Download JSON**, and two fixed sections "Data sources" and "How to verify". Empty → "Choose a report and generate
it to preview here." Ephemeral storage → warning inside preview "This instance resets its records on restart; the
report covers only data since {last start}."

---

## S-22 Trust Registry

`/console/registry` (Console shell) · `/registry` (public) · EXISTING · P1 · `GET /api/public/registry`,
`GET /api/public/feed`

Header "Trust Registry — every version this auditor has judged". Search ("Search tools, servers, fingerprints, ENS
names"), filters Verdict, Capability, Status (active/revoked/disputed), Include lab. Table: Tool (`label/name` →
S-23, ENS name 2nd line) P1 · Verdict P1 · Capabilities P2 · Public record (Trust seal chip) P2 · Audited P3.
Right rail (≥ 1280): **Live ledger feed** (new verdicts and revocations from Hedera) or "No public ledger is
configured on this instance."

---

## S-23 Tool dossier

`/registry/:label/:name` · EXISTING · P1 · `GET /api/public/dossier/:label/:name`

Header: tool name (mono), current verdict + seal status, ENS name, **Verify this version** → S-24. Sections:
Revoked banner (when applicable) · Changes from the previous version (diff) / Definition (first version) ·
Findings ("every finding points to the exact text it is based on") · Every version seen (table) · Disputes.

---

## S-24 Verify Seal

`/console/verify?q=` · `/verify?q=` · EXISTING · P1 · `GET /api/public/lookup`, `/verdict/:fp`, `/verify-context`;
checks run client-side with `@zoro/core`

```
Verify a seal — from first principles
[ ENS name, fingerprint (0x…), Hedera reference (0.0.123#4), badge (0.0.456/7), or raw JSON ]  [Verify]
Detected: Fingerprint ✓
┌ Result: ✓ Verified — Sealed · postmail/send_message ┐   or ✕ Not verified / ◐ Partially verified
│ Checks                                              │
│ ✓ Recompute the fingerprint from the raw definition │ detail · evidence link
│ ✓ Resolve the ENS name and read the seal records    │ Resolver ↗ · ENS app ↗
│ ✓ Records written by the Auditor role               │
│ ✓ Verify the attestation signature                  │ signer 0xA1…
│ ◌ Find the matching Hedera ledger message           │ Not available: no ledger configured
│ ✓ Check for later revocations and disputes          │
│ – Check the badge token                             │ Not available
├ What this proves ──────────┬ What this does not prove ┤
└─────────────────────────────────────────────────────┘
[Full verdict package ▸]   [Attack Lab record ▸ (if lab)]
```
Overall rule: Verified only when every check is `passed`; any `failed` → Not verified (and the failing check is
expanded); any `not available` with no failure → "Verified as far as this instance can check" (◐). Error →
"Verification could not run: {reason}" + retry.

---

## S-25 Publisher

`/console/publisher` · EXISTING · P2 · `GET /publisher`, `POST /publisher/claims`, `/claims/:label/verify`,
`/releases`

Sections: **What publishers can and cannot do** (two-column info card) · **Your namespaces** (table: namespace,
method, status, verified at) + **Claim a namespace** card (Namespace, Proof method GitHub/npm/DNS/ENS, target
field label changes per method, optional Ethereum address; Start claim → instructions + Check proof → Human Seal)
· **Pre-release audits** (Submit a release: version, manifest JSON → Submit for audit; table Version ·
Definition · Verdict · Risk · Seen by gateways · Audited; per row "Remediation guidance").

---

## S-26 Disputes

`/console/disputes` · EXISTING · P2 · `GET /disputes`, `POST /disputes`

Header + **Open a dispute** (Kind: Challenge a seal / Appeal a verdict, Fingerprint, evidence note → Human Seal).
Table: Ref (`DSP-n`) · Kind · Fingerprint · Status (Awaiting Human Seal / Open / Reviewing / Resolved, with outcome) · Ledger open/resolve
references · Opened. Empty → "No disputes. Anyone with evidence can challenge a seal; publishers can appeal a
verdict."

---

## S-27 Attack Lab

`/console/lab` · `/lab` · EXISTING, CHANGED · **P0** · `GET /api/public/lab`, `POST /lab/start|reset`,
`POST /lab/approvals/:id/deny|human-seal`, SSE `lab`, `lab_event`

```
Attack Lab — Launch an attack. Watch it fail.            [Reset lab]  run: ● running (Rug pull)
(notice: Development mode: AI review layer not configured — when applicable)
┌ Scenario library (c1–c12, horizontal list of 10 cards, 2 rows at 1440) ───────────────────┐
│ [Rug pull] [Invisible-ink poisoning] [Tool shadowing] [Cross-server exfiltration]          │
│ [Code swap, same description] [Auditor injection] [Typosquat server] [Honest update]       │
│ [Revocation after the fact] [Wallet recipient swap]                                        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌ c1–c5 Selected scenario ─────────┐┌ c6–c12 Timeline · Rug pull ──────────────────────────┐
│ What the attacker does           ││ 14:02:01 attacker  Publishes new email tool version   │
│ What Zoro should show            ││ 14:02:02 gateway   Fingerprint changed → held back    │
│ Servers involved: lab-postmail   ││ 14:02:03 sentinel  Unsafe: exfiltration channel (crit)│
│ [Launch scenario]   primary      ││ 14:02:04 agent     Calls send_message → Blocked        │
└──────────────────────────────────┘└───────────────────────────────────────────────────────┘
┌ Sentinel (latest lab audits) ┐┌ Incidents (lab only) ┐┌ Waiting for a person ┐┌ Public records ┐
┌ What actually happened: Emails delivered 0 · Requests to attacker hosts 0 · Transfers 0 ──┐
┌ Lab servers (connected through the Zoro Gateway) ───────────────────────────────────────────┐
```
Scenario card: title, one-line attack, servers chips, state (idle / running / done / failed). Launch disabled while
another run is active ("A scenario is running. Reset or wait."). "What actually happened" counters: 0 shows
success tone with "nothing left the lab"; > 0 shows danger (would indicate a failed defense — must be shown
truthfully). Waiting for a person: approval cards in lab mode (Deny / Approve with Human Seal (lab)). All records
carry the LAB marker. In the Console shell, the page keeps the Console sidebar; on the public site, the public nav.

---

## S-28 Settings

`/console/settings?tab=` · EXISTING · P2 (Networks & identity P1) · `GET /settings`, `PUT /settings/notifications`,
`PUT /settings/auditor`, `GET /outbox`, `POST /outbox/retry`, `POST /republish`, `POST /danger/:op`,
`POST /onboarding/restore`

Layout: left vertical tab list (c1–c3), content (c4–c10, 1120 max).

| Tab | Content |
| --- | --- |
| Gateway | MCP endpoint URL (mono + copy), gateway token location, **Bridge command** (mono + copy: `node Backend/daemon/bin/zoro-bridge.mjs --url … --token … --client <name>`), connected client sessions, **Restore original client configurations** (L2), Setup link |
| Auditor | Read-only: auditor address (mono), ruleset version, AI layer state + model, "Require AI layer" state (set by environment; explains that without the AI layer new versions without deterministic findings stay pending), detonation, seal lifetime; link to S-31 |
| Networks & identity (= Blockchain connections) | Integration rows (§03 6.16) for ENSv2 registry, Hedera ledger, Human Seal (World ID), AI review; for each **Not configured**: the env vars and `pnpm setup:ens` / `pnpm setup:hedera` command with copy; "Private lookups" explanation ("Chain reads go through …"); **Onchain write queue** table Queued · Kind · Status · Attempts · Next try · Last error + **Retry failed** + **Publish unpublished verdicts** |
| Human Seal | World ID state, environment (staging/production), test identities notice, which triggers require a Human Seal (link S-17) |
| Notifications | Webhook URL, minimum severity, quiet hours from/to, **Send test** (proposed), Save |
| Privacy | "What is ever sent outside this machine" list; toggle "Publish verdicts for public tool definitions to the registry (collective immunity). Private servers are never published." (`PUT /settings/auditor {publicSubmission}`) |
| Danger zone | Three rows: Disable protection · Remove Zoro · Delete local activity data — each L3 (typed phrase, then Human Seal when configured) |

UI never pretends to configure ENS/Hedera/World ID: these are environment-level settings (A-07, Q-05).

---

## S-29 Account & Workspace

`/console/account` · **PROPOSED, blocked by Q-01** · P2

Designed for when a user model exists: Profile (name, email, World ID linked state) · Sessions (device, last
active, revoke) · Members (name, role, last active; Invite) · Roles (read-only matrix from `01` §5) · Workspace
(name, instance URL, data location, ephemeral storage state). Until then: the sidebar shows no entry; Settings ›
Gateway shows "Single-operator Console: access is controlled by the Console token. Rotate it by changing
`ZORO_CONSOLE_TOKEN` and restarting."

---

## S-30 Global overlays

| Overlay | Spec |
| --- | --- |
| Command palette | 640 px, top 12 vh, input 48 px "Type a command, a page, an ENS name or a fingerprint…"; sections: Suggested (verify detected input, open INC-/APR-), Navigation, Actions; ↑↓ ⏎ Esc; recent commands remembered per browser |
| Search popover | §03 5.6 |
| Notifications | 400 px popover: header "Notifications · Mark all read"; items with severity badge, time, title (link), body (2 lines); unread have `--surface-hover` fill + 6 px brand dot; empty "No notifications." |
| Protection status popover | 360 px: headline + dependency rows + "Open Settings › Networks" |
| Ask Zoro | Right drawer 480 px; disabled state explains "Ask Zoro needs an AI key (ZORO_AI_*). Nothing is sent anywhere until it is configured."; answers cite records with links |
| Toasts | §03 5.14 |

---

## S-31 Auditor transparency (public)

`/auditor` · EXISTING · P2 · `GET /api/public/auditor`

Keep current content (Identity and configuration, Deterministic rules table, Combination rules, AI review
configurations, Malicious corpus, Clean corpus, metrics tiles) re-skinned. Link from every verdict card ("How
Sentinel decides").
