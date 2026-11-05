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

## Run locally

```sh
pnpm install
cp .env.example .env     # optional: AI, ENS, Hedera and World ID keys
pnpm dev                 # daemon on :7420, web on :3000
```

Other commands, run from the root:

```sh
pnpm typecheck           # all packages
pnpm test                # all packages
pnpm setup:ens           # provision the ENSv2 registry (Blockchain/)
pnpm setup:hedera        # create Hedera topics and the badge token (Blockchain/)
```

## Deploying

- **Frontend**: set the project root to `Frontend/`. Set `ZORO_DAEMON_URL` to the backend's public URL; it is read at build time.
- **Backend**: install from the repo root (`pnpm install --filter @zoro/daemon...`), then run `node --import tsx src/main.ts` in `Backend/daemon`. Set `ZORO_HOST=0.0.0.0`, `ZORO_WEB_ORIGIN`, `ZORO_PUBLIC_URL`, `ZORO_ALLOWED_HOSTS` and fixed `ZORO_CONSOLE_TOKEN` / `ZORO_GATEWAY_TOKEN`.
