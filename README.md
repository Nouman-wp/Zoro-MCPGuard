# Zoro

Runtime integrity for MCP tools: a gateway that verifies every tool call against a public, tamper-evident seal.

## Layout

| Folder | Package | What it is |
| --- | --- | --- |
| `Frontend/` | `@zoro/web` | Next.js site and Console (port 3000) |
| `Backend/daemon/` | `@zoro/daemon` | MCP gateway, Sentinel auditor, Attack Lab, Console API (port 7420) |
| `Backend/core/` | `@zoro/core` | Shared engine (fingerprinting, Sentinel rules, policy). Runs in Node and in the browser |
| `Blockchain/` | `@zoro/blockchain` | ENSv2 registry (Ethereum Sepolia), Hedera ledger, the Auditor signing key, and setup scripts |

The root holds the pnpm workspace config, the shared `tsconfig.base.json`, and the one `.env` that every package reads.
Infrastructure lives in `render.yaml` (backend on Render) and `.github/workflows/` (CI and the keep-alive ping).
Decisions that deviate from the project guide are recorded in [`DECISIONS.md`](DECISIONS.md).

## Run locally

Requires Node.js 22.13 or newer (24 recommended) and pnpm 10 (`corepack enable pnpm`).

```sh
pnpm install
cp .env.example .env     # optional: AI, ENS, Hedera and World ID keys (each variable is described inside)
pnpm dev                 # daemon on :7420, web on :3000
```

The daemon prints a Console sign-in link when it starts. Local data (database, generated auditor key, tokens) lives
outside the repository: `%LOCALAPPDATA%\Zoro` on Windows, `~/Library/Application Support/Zoro` on macOS,
`~/.local/share/zoro` on Linux.

Other commands, run from the root:

```sh
pnpm typecheck           # all packages
pnpm test                # all packages
pnpm build               # production build of the web app
pnpm setup:ens           # provision the ENSv2 registry (Blockchain/), writes addresses into .env
pnpm setup:hedera        # create Hedera topics and the badge token (Blockchain/), writes IDs into .env
```

## Deploying

Both halves deploy from this repository's `main` branch.

### Backend on Render

`render.yaml` is a Render Blueprint: in the Render Dashboard choose **New → Blueprint**, pick this repository, and
enter the secret values it asks for (all described in `.env.example`; leave blank any you do not have yet). Render
generates `ZORO_CONSOLE_TOKEN` and `ZORO_GATEWAY_TOKEN`; read them from the service's **Environment** tab.

- Health check: `GET /healthz` (answers from memory; never touches the database, chain or auditor).
- Free instances sleep after 15 idle minutes and take about a minute to wake; the web app shows a "starting the
  backend" state meanwhile.
- Free instances have **no persistent disk**: local records (seals, audits, incidents, the audit log) reset on every
  restart or redeploy. The Console reports this as a degraded dependency. Verdicts anchored on Hedera are re-read
  from the ledger. See `DECISIONS.md` for the options to make storage durable.

### Frontend on Vercel

The Vercel project's root directory is `Frontend/`. Set `ZORO_DAEMON_URL` (Production and Preview) to the Render
backend URL; it is read at build time for the same-origin API rewrites, so redeploy after changing it. Production
deploys come from `main`; every other branch and pull request gets a preview deploy.

### Keep-alive

`.github/workflows/keep-alive.yml` pings `/healthz` every 10 minutes so the free instance never sleeps. It reads the
URL from the `ZORO_BACKEND_URL` repository variable (Settings → Secrets and variables → Actions → Variables) and can
be run by hand from the Actions tab. A backend that does not answer fails the run. GitHub disables scheduled workflows
in public repositories after 60 days without activity; re-enable it from the Actions tab if that happens.

### Connecting an MCP client to a hosted gateway

Use the bridge with the hosted URL and the gateway token from Render:

```sh
node Backend/daemon/bin/zoro-bridge.mjs --url https://<backend>/mcp --token <ZORO_GATEWAY_TOKEN> --client <name>
```

## Deployment record

Update this table whenever any of these change.

| Item | Value |
| --- | --- |
| Repository | https://github.com/Nouman-wp/Zoro-MCPGuard |
| Frontend (production) | https://zoro.caspx.in · https://zoro-seven-omega.vercel.app |
| Backend | pending: created from `render.yaml` (expected `https://zoro-backend.onrender.com`) |
| Health endpoint | `<backend>/healthz` |
| Keep-alive | GitHub Actions `keep-alive.yml`, every 10 minutes, URL from the `ZORO_BACKEND_URL` variable |
| ENS | Sepolia — not configured yet |
| Hedera | testnet — not configured yet |
| World ID | staging (test identities) — not configured yet |
| Last verified end to end | not yet |
