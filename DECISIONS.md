# Decision log

Where Zoro deliberately differs from the project guide, or where the guide left a choice open, the decision and the
reason are recorded here. Newest first.

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
(`https://zoro.caspx.in` and `https://zoro-seven-omega.vercel.app`). Preview domains are not listed.

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
