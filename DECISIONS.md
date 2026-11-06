# Decision log

Where Zoro deliberately differs from the project guide, or where the guide left a choice open, the decision and the
reason are recorded here. Newest first.

## 2026-11-06 — Organization identity is a World ID nullifier scoped to the organization

**Decision.** A member is identified by the World ID nullifier for the action “join this organization”, not by an
email, an SSO account or the AI account. Each person runs their own Zoro; one verified human is one member.

**Why.** Teams share AI plans (Claude Team, Max) and switch clients, so the AI account cannot say who did what. The
nullifier is stable per person per organization, cannot be registered twice, and reveals nothing about who the person
is (invariant 5). Organizations see inventory only by default; incident titles only by opt-in; never per-call data.

## 2026-11-06 — Organization credentials are signed tokens, so an ephemeral host heals itself

**Decision.** Invites and member device tokens are HMAC-signed (key `ZORO_ORG_SECRET`, or derived from the auditor
key). The host stores members, devices and inventory, but rebuilds them from the next device sync after a wipe.

**Why.** The hosted backend runs on Render’s free plan with no persistent disk (see below). Stateful sessions would
sign every member out on each redeploy. Limitation: removing a member is recorded in the host database, so on an
ephemeral host a removed member could re-appear after a wipe until removed again; durable storage closes this.

## 2026-11-06 — The Claude Code hook only tightens

**Decision.** The hook answers deny, ask, or nothing. It never answers “allow”, so Claude Code’s own permission flow
still applies. When Zoro is unreachable, the hook answers “ask” and says why.

**Why.** Zoro must not grant more than the client would (least privilege), and must fail closed without failing
silently (invariant 6): an unreachable Zoro neither blocks work invisibly nor lets actions through unchecked.

## 2026-11-06 — Encoded instructions are withheld, not annotated

**Decision.** Output Shield redacts any span that decodes to an instruction, even when policy says “annotate”.

**Why.** An annotated copy still reaches the model, which can decode it. The decoder raises findings only when the
decoded text matches an instruction, transfer or exfiltration pattern, so ordinary encoded data is never touched.

## 2026-11-06 — npx servers run the version that was verified

**Decision.** Servers launched through package runners are pinned to the exact version resolved and verified at first
launch; later releases are verified and offered as updates that run only after acceptance. Unsafe packages do not
launch.

**Why.** “npx some-server” otherwise runs whatever was published most recently, so a malicious release would run
with no change Zoro could see — the exact rug pull Zoro exists to stop.

## 2026-11-06 — Hosted backend on Render's free plan uses ephemeral storage (open)

**Decision.** The hosted backend keeps its SQLite database in `/tmp/zoro-data`, which Render wipes on every restart,
redeploy or spin-down. `ZORO_EPHEMERAL_STORAGE=true` makes the Console report "Local records" as a degraded
dependency, so the reset is never silent.

**Why.** Free Render web services cannot attach a persistent disk, and free Render Postgres expires after 30 days.
The daemon's storage layer uses Node's synchronous SQLite API throughout, so moving to a remote database is a
substantial rewrite rather than a configuration change.

**Impact.** This departs from §13.1 ("queued onchain writes survive restarts", "every protective state survives
restarts") on the hosted instance only. Public verdict events on Hedera are re-read from the Mirror Node after a
reset, but full verdict packages, local seals, incidents and the audit log are not. Local installs are unaffected.

**Options to close it.** (1) Render Starter plan with a persistent disk (paid). (2) Snapshot the database to free
object storage on a timer and restore it on boot (keeps the synchronous API; needs a storage account). (3) Move to a
hosted database with a durable free tier (largest change: the storage layer becomes asynchronous). Awaiting a decision.

## 2026-11-06 — The hosted instance is a shared public demo, not a personal gateway

**Decision.** The Render deployment serves the public pages (Home, Verify, Registry Explorer, Attack Lab, About the
auditor) and one Console protected by a fixed `ZORO_CONSOLE_TOKEN`.

**Why.** §2.1 places the Gateway on the user's own machine or infrastructure. A hosted gateway cannot read a
visitor's local MCP client configurations, so onboarding finds nothing there. The hosted Console is for the operator.

## 2026-11-06 — CORS allows only the production web origins

**Decision.** The API accepts cross-origin browser calls only from `ZORO_WEB_ORIGIN` and `ZORO_CORS_ORIGINS`
(`https://zoro-mcp-guard.vercel.app`). Preview domains are not listed.

**Why.** The web app reaches the API through same-origin Next.js rewrites, which are proxied server-side, so neither
production nor preview deploys need CORS. The list exists only for direct browser calls and is kept minimal.

## 2026-11-06 — Separate `/healthz` from `/api/public/health`

**Decision.** `/healthz` returns from memory only; the existing `/api/public/health` (which reads the database for
environment details) is unchanged.

**Why.** Render's health check and the keep-alive ping must stay fast and must not fail because a dependency is slow.

## 2026-11-06 — Keep-alive through a scheduled GitHub Actions workflow

**Decision.** Ping `/healthz` every 10 minutes at minutes 3, 13, 23, … of each hour.

**Why.** The repository is public, so scheduled runs cost nothing. Ten minutes leaves five minutes of slack against
Render's 15-minute idle limit for delayed runs, and offsetting from the top of the hour avoids GitHub's busiest
scheduling window. One always-on free service uses about 744 of the workspace's 750 free hours per month, so no
second free service can be kept awake in the same Render workspace.

## 2026-11-06 — Render region: Singapore

**Decision.** The backend runs in Render's Singapore region.

**Why.** The owner and expected early users are in South Asia. Render cannot move a service between regions; changing
it later means creating a new service from the Blueprint.

## 2026-11-06 — Commits go directly to `main`

**Decision.** Follow the repository's existing practice of committing to `main` (every earlier commit landed there),
with CI on every push and pull request.

**Why.** The guide asks to follow existing branching practice. Teammates who prefer pull requests can use them; CI
runs on those too.
