# 09 — Design Decisions, Open Questions & Assumptions

Newest decisions are numbered in order of importance, not date. All dated 2026-11-06.

## 1. Decisions

### D-01 — Adopt the brief's navy enterprise palette and JetBrains Mono for the Console
**Decision.** Replace the agentql-derived near-black palette (`#0a0b0c` ground, white gradient primary button) with
the brief's navy palette (`#0B1020` ground, blue primary) and switch mono to JetBrains Mono.
**Why.** The brief asks for "Google Cloud clarity + Linear precision" and explicitly rejects decorative gradients
and glows; the current palette leans on them. Navy keeps dark-mode calm while giving surfaces enough separation.
**Cost.** A re-skin through tokens (`03` §10 migration map); no layout changes needed for the first wave.

### D-02 — Public marketing home keeps its expressive style; the Console and public tool pages do not
**Decision.** Glows, aurora and Figtree display type remain only on `/`. Verify, Registry, Lab, Auditor and the
whole Console use the Console system.
**Why.** Marketing benefits from atmosphere; operational and verification pages need calm and trust.

### D-03 — Quarantine becomes the "Held back" tab of a new Sentinel Audits page
**Why.** Quarantine lists audit states (pending, unsafe, awaiting release). One concept, one home. The word
"Quarantine" stays in documentation; UI copy says "Held back" because it tells users what it means for agents.
`/console/quarantine` redirects.

### D-04 — Approvals sit directly under Dashboard
**Why.** Pending approvals pause an agent and expire; they are the most time-sensitive object.

### D-05 — Verify, Registry and Attack Lab render inside the Console shell when reached from the Console
**Why.** Today they open in the public shell and the operator loses status, navigation and notifications (U-03).
Same page body, two shells; public URLs are unchanged.

### D-06 — The protective action is the primary button, including "Deny"
**Why.** The product principle "the protective choice is the default" (already stated in the incident page copy).
Red is reserved for destruction (remove, danger zone), not for refusing. Confirm dialogs focus the protective
button.

### D-07 — Severity gets five distinct visuals; High becomes orange
**Why.** Critical and High currently share red; Low uses the link blue (U-04). Each level now has its own icon,
and colour is never the only cue.

### D-08 — Truthful-status rule is a design-system rule, not a per-screen choice
**Why.** Users of a security product will rely on badges as facts. Every status maps 1:1 to a backend value
(`03` §4); "Verified", "Anchored" and "Sealed" appear only when the backend confirms them.

### D-09 — Integration states: six UI states from four backend states
**Decision.** Connected, Degraded, Pending writes, Not configured, Unavailable, Test mode. The brief's
"Disconnected" is "Unavailable"; "Pending" is derived from the outbox.
**Why.** The backend emits `ok`, `degraded`, `not_configured`, `down`; the outbox and World ID environment carry the
rest. No invented states.

### D-10 — Integrations are set up by guided instructions, not forms
**Why.** ENS, Hedera and World ID are configured through environment variables and `pnpm setup:*` scripts. A form
would pretend to configure something it cannot (A-07). If the backend later accepts configuration, the drawer
becomes a form (Q-05).

### D-11 — Personas and the role matrix are designed but marked as proposals
**Why.** There is one Console token and no user model. Designing roles now keeps layouts ready (disabled-with-reason
pattern), without shipping a fake permission UI.

### D-12 — Journey A follows the real install flow, not sign-up
**Why.** There is no sign-up or workspace. The brief's journey is preserved as S-29 (P2) pending Q-01.

### D-13 — Mobile bottom bar with Dashboard, Approvals, Incidents, More
**Why.** Deciding approvals (often with World App on the same phone) is the main mobile task.

### D-14 — Tables become card lists below 768 px; no page-level horizontal scroll
**Why.** Hashes and statuses must stay readable; horizontal scrolling hides the status column first.

### D-15 — Lab records are excluded from Dashboard counts and always marked
**Why.** Mixing demo and production data undermines trust in the numbers.

## 2. Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A-01 | Single operator per Console | Role matrix moves from proposal to P0 |
| A-02 | Hosted storage stays ephemeral until `DECISIONS.md` option is chosen | Remove the reset banners |
| A-03 | ENS/Hedera/World ID unconfigured on the current deployment | Seed data and prototype show published states |
| A-04 | World ID staging | Test-identity notes disappear in production |
| A-05 | AI layer optional | Verdict card layer row simplifies |
| A-06 | Render free tier sleeps | Backend-waking state stays |
| A-07 | Integration setup is CLI-only | D-10 revisited |
| A-08 | Bridge has no UI | Settings › Gateway shows the command |
| A-09 | Next.js version's conventions (see `Frontend/AGENTS.md`) don't constrain the visual design | Implementation plan, not design, changes |

## 3. Open questions

| # | Question | Blocks | Proposed answer |
| --- | --- | --- | --- |
| Q-01 | Will Zoro get user accounts, roles and workspaces? If so, local-only or hosted? | S-29, role matrix, "Decided by" names | Defer; keep single-token Console for local installs |
| Q-02 | Can the daemon expose `GET /api/console/audits` (list with filters: verdict, change class, server, lab, before)? | S-08 History tab | Yes — paginated by `before` like `/log` |
| Q-03 | On the hosted demo, should the Console be visible to visitors (read-only demo token) or operator-only? | Hosted onboarding copy | Operator-only (current); Lab stays public |
| Q-04 | Should Dashboard counts include lab records when the instance is the public demo? | S-03 | Exclude by default, toggle "Include lab" |
| Q-05 | Will integrations ever be configurable from the UI? | D-10 | Not now |
| Q-06 | Is a notification "Send test" endpoint wanted? | S-28 Notifications | Nice to have |
| Q-07 | Should audit log entries record an actor (console / World ID nullifier / zoro / agent)? | S-20 Actor column | Yes, if Q-01 lands |
| Q-08 | Is "Approve" (without Human Seal) ever allowed for `tool_call` approvals in Strict profile? | S-13 button logic | Follow policy response; UI renders whatever the approval says |
| Q-09 | Should the public Registry hide lab records by default? | S-22 | Yes, with "Include lab" toggle |
| Q-10 | Product name in UI: "Zoro" vs "Zoro MCPGuard"? | Titles, logo | "Zoro" (current code) |
| Q-11 | Retention: how long are calls/incidents kept locally? | Empty/"older records" copy | Unknown — needs an answer before writing retention copy |

## 4. Out of scope

- Implementation, code changes, new endpoints (listed only as dependencies).
- Marketing home redesign (beyond D-02).
- Documentation site (`/docs`) content.
