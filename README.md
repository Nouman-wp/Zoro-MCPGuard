# Zoro

Runtime integrity for MCP tools: a gateway that verifies every tool call against a public, tamper-evident seal.

**Try it live:** https://zoro-mcp-guard.vercel.app/ (Attack Lab, Verify, Registry and the docs; nothing to install)
**Repository:** https://github.com/Nouman-wp/Zoro-MCPGuard

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

## What Zoro protects

| Protection | What it does |
| --- | --- |
| Definition pinning and seals | Agents only ever read tool text that was audited and sealed; any change is quarantined until re-audited. |
| Sentinel auditor | Deterministic rules, differential analysis and AI review; signed verdicts published to Hedera (and ENS). |
| Secret-code decoder | Decodes Morse, base64, hex, URL encoding, ROT13, reversed text, leetspeak and invisible Unicode (two levels deep) in tool definitions and tool results, and withholds hidden instructions from the agent. |
| Undo-impossible brake | Deletes, drops, wipes, force-pushes and transfers always need a person’s yes (Human Seal and a cooldown in Strict). |
| Transaction decoder | Sign/send calls are explained in one sentence (“Gives UNLIMITED USDT spending to an unknown contract 0xab12…”); risky ones need a World ID Human Seal. |
| New-power alarm | When an agent gains a high-impact ability, its first use needs approval. |
| Package verification | npm/npx/pnpm/yarn/bun/pip/uvx installs are checked (OSV malware and CVEs, typosquats, publish age, install scripts, publisher changes, registry signatures); npx servers are pinned to the version that was verified. |
| Claude Code hook | Built-in tools (Bash, Write/Edit), package installs and skill/plugin additions go through the same checks as MCP tools. |
| Settings watchdog | Changes to AI client configs or skill folders made outside Zoro open an incident within a second, with one-click restore. |
| Recall checker | Each server’s package is checked against OSV.dev; Strict blocks critical CVEs. |
| Panic button | One tap freezes every agent; an organization admin can freeze every member device. |
| Global kill switch | A revocation on the public ledger blocks the version on every Zoro within seconds. |
| Organizations | Employees join with World ID (one verified human, one member, whatever AI seat they use); the manager sees which MCP servers, packages, skills and clients each person uses. |

## How Zoro uses Hedera

No smart contracts: everything goes through Hedera's native services.

| What | Hedera service | Code |
| --- | --- | --- |
| Public registry, Attack Lab and organization topics: signed verdicts, revocations, disputes, and Merkle roots of the audit log | Consensus Service (HCS), via `@hashgraph/sdk` | `Blockchain/src/hedera.ts`, `Backend/daemon/src/registry/outbox.ts`, `Backend/daemon/src/anchors.ts` |
| Seal badge: one NFT per sealed tool version, burned on revocation | Token Service (HTS) | `Blockchain/src/hedera.ts` |
| Global kill switch (gateways read revocations from the ledger) and the browser-side Verify page | Mirror Node REST API | `Backend/daemon/src/registry/watch.ts`, `Frontend/src/app/(site)/verify/page.tsx` |
| Ask Zoro answers questions about the ledger (“What did Zoro publish today?”, “How much HBAR is left for ledger writes?”) and cites HashScan | Hedera Agent Kit query plugins (`@hashgraph/hedera-agent-kit`) | `Backend/daemon/src/agentkit.ts`, `Backend/daemon/src/ask.ts` |

Ask Zoro's ledger access is read-only by construction: only five Agent Kit query tools are loaded (and each must be a query tool), the kit runs in `RETURN_BYTES` mode, and its SDK client has no operator key.

## How Zoro uses World ID (the Human Seal)

Built with IDKit 4 (`@worldcoin/idkit` in the browser, `@worldcoin/idkit-server` and `@worldcoin/idkit-core` in the daemon).
Code: `Backend/daemon/src/humanseal.ts`, `Frontend/src/components/human-seal.tsx`, tests in `Backend/daemon/test/humanseal.test.ts`.

### The trust moment

An AI agent is about to do something that cannot be taken back: send private data out, sign a transaction, delete a production
database, weaken Zoro's own protection, or lift a lockdown. Zoro holds the call and needs to know that **a real person approved this
exact action**. An "Approve" button is not enough: the agent itself, a script or malware on the same computer can click buttons
and read tokens. They cannot produce a World ID proof from the person's own World App.

### The credential: Proof of Human, and why it is the minimum

Zoro needs two facts and nothing else: a real human approved, and which *distinct* human it was. "Two approvers" must mean two
people, and an organization seat is one person, so one person with two accounts must count once.

- **Proof of Human** (IDKit `proofOfHuman`, World ID 4.0) proves both, and reveals no name, face or document. Each approval
  gets a nullifier that is the same for the same person and meaningless anywhere else.
- **Passport/NFC and Identity Check** would collect identity attributes Zoro has no use for. Knowing *who* someone is does not
  make an approval safer than knowing it is one unique, verified human.
- **Selfie Check** is medium assurance. These approvals gate actions that cannot be undone and count distinct approvers, so Zoro
  takes the strongest uniqueness guarantee available. A device-level credential does not prove a unique human at all.

Zoro also accepts the World ID 3.0 Orb proof as a fallback (`allow_legacy_proofs`), because World App versions and the World ID
Simulator can still return 3.0 proofs.

### What the server checks

The browser only relays World's proof. Nothing is authorized until the daemon has checked it.

1. **Signs the request.** The daemon signs each request (`rp_context`) with the relying-party signing key, which never reaches the browser.
2. **Binds the proof to the action.** Every approval gets its own World ID action string. The signal is the action's digest,
   and the proof's `signal_hash` must match it.
3. **Asks World.** The proof is forwarded unchanged to `POST https://developer.world.org/api/v4/verify/{rp_id}`, and the
   environment in World's answer must match.
4. **Checks the credential.** The credential World verified must be Proof of Human (`proof_of_human`, or `orb` for 3.0).
   The browser chooses the preset and World's signature does not cover it, so a modified page could ask for a weaker
   credential and still get a valid proof. The daemon refuses that proof and opens an incident.
5. **Stores the nullifier once per approval.** A proof cannot be reused, and a second proof from the same person on one
   approval counts as the same person.
6. **Approves only its own request.** A verified seal approves only the approval it was started for, and only that exact action, once.

### When it does not work

Every path below leaves the action blocked and is written to the audit log.

| Situation | What Zoro does |
| --- | --- |
| The approver cancels, or declines in World App | Recorded as cancelled. The approval stays open for another verified person, or for Deny. |
| The person has no Proof of Human (`credential_unavailable`) | "This person cannot approve." Nothing runs. |
| A valid proof from a weaker credential | Refused (`insufficient_credential`), and an incident is opened. |
| A proof for a different action, or one used before | Refused (`mismatched` or `replay`). A mismatch opens an incident. |
| World ID is not configured or World's API is unreachable | Fails closed: the action does not run. |
| The approval window closes first | Expired. |

### Where the Human Seal is required

- risky tool calls held at Approvals: private data leaving, risky transactions, and actions that cannot be undone (Strict profile);
- weakening policy or switching a server to observe mode;
- danger-zone actions;
- lifting a lockdown;
- joining an organization.

### Try it (about two minutes)

1. Open https://zoro-mcp-guard.vercel.app/lab and launch **Cross-server exfiltration**. A poisoned email tells the agent to
   mail a private `.env` file to an outside address.
2. Zoro holds the `send_email` call. Under **Waiting for you**, click **Approve with World ID** on the request, then **Approve with World ID** again in the Human Seal window.
3. In the World ID window, choose **Use the simulator**, then **Continue**. The live site runs World's staging environment,
   where the World ID Simulator stands in for World App.
4. Zoro verifies the proof on its server, and the agent's held call runs once. The timeline reads "A verified human approved
   this exact call with World ID, so it ran once".
5. Other path: launch it again and click **Deny** or **Cancel**. The timeline reads "The file contents were not sent".

The lab agent waits 90 seconds for a decision (`ZORO_LAB_APPROVAL_WAIT_SEC`). After that the call is refused, and approving it later runs nothing.

### Environments

Set `WORLD_ENVIRONMENT` in `render.yaml` rather than the Render dashboard, because the next Blueprint sync overwrites dashboard edits.

| `WORLD_ENVIRONMENT` | Who verifies | Notes |
| --- | --- | --- |
| `staging` (live demo) | World ID Simulator, https://simulator.worldcoin.org | Test identities. A real World App silently ignores staging requests. |
| `sandbox` | The World ID Sandbox app (TestFlight or Google Play testing) | Request access in the Developer Portal → World ID Sandbox. |
| `production` | World App | Real people with Orb-verified World ID. |

### Integration debrief

- **Time to first successful verification:** _owner to fill in before submitting_.
- **Friction we hit:**
  1. **Silent failure.** A staging request scanned with the real World App does nothing at all, with no error, which looks like a bug in the site.
  2. **Preset names.** `orbLegacy` looks like the obvious "Orb" choice but returns only World ID 3.0 proofs. The 4.0 credential is `proofOfHuman`. We shipped `orbLegacy` first.
  3. **Nullifiers last forever.** World ID gives one person the same nullifier for the same action, always. Deriving the action from the action's digest meant a person could never approve the same command twice. One action per approval, with the digest in the signal, fixed it.
  4. **The verify API does not check the credential.** It does not confirm that the proof is the credential the app asked for: a page that requests a Device proof gets a valid proof. Every integrator has to check the credential identifier on the server.
  5. **Unclear test environments.** The docs describe the Simulator (`staging`) and the newer World ID Sandbox (`sandbox`) separately, and do not say how they relate. In our tests the Simulator returns World ID 4.0 proofs and offers a 3.0 toggle. Its Cancel button did not end the request; IDKit only reported a timeout.
- **Missing capability:** a way to pin the required credential in the signed `rp_context`, so the verify API rejects anything else.
- **The one improvement with the greatest impact:** credential pinning, because it closes a downgrade every integrator must
  otherwise remember to block. The close second is World App telling people "this is a test request, use the Simulator"
  instead of staying silent.

## Organizations

1. On the Zoro your team can reach (the hosted one), open **Console → Organization**, create the organization and click **Create invite**.
2. Each employee runs Zoro on their own machine, opens **Console → Organization**, pastes the organization server address and invite code, and verifies with World ID. They see exactly what will be shared before verifying.
3. Members’ Zoro instances sync every minute. Inventory only by default: MCP servers, packages, skills, AI clients and Zoro’s verdicts. Incident titles only if the organization opts in. Prompts, tool arguments, results and files never leave a member’s machine.

## Run locally

Requires Node.js 22.13 or newer (24 recommended) and pnpm 10 (`corepack enable pnpm`).

```sh
git clone https://github.com/Nouman-wp/Zoro-MCPGuard.git zoro && cd zoro
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

### Connecting Claude to the hosted gateway

The hosted gateway's MCP endpoint is `https://zoro-backend-r4qd.onrender.com/mcp`. Copy the gateway token from
**Console → Settings → Gateway** (the value after `--token`) or from `ZORO_GATEWAY_TOKEN` in Render's Environment tab.
Agents then see only the sealed tools of the servers added in that Console.

Claude Code (one command):

```sh
claude mcp add --transport http zoro https://zoro-backend-r4qd.onrender.com/mcp --header "x-zoro-gateway-token: <GATEWAY_TOKEN>"
```

Claude Desktop (Settings → Developer → Edit Config; needs this repository cloned and `pnpm install` run), then
restart Claude Desktop:

```json
{
  "mcpServers": {
    "zoro": {
      "command": "node",
      "args": ["<path to zoro>/Backend/daemon/bin/zoro-bridge.mjs", "--url", "https://zoro-backend-r4qd.onrender.com/mcp",
               "--token", "<GATEWAY_TOKEN>", "--client", "claude-desktop"]
    }
  }
}
```

To protect the servers already on your own machine instead, run Zoro locally (`pnpm dev`) and use
**Console → Onboarding**: it rewrites your clients' configurations for you, with a backup.

## Deployment record

Update this table whenever any of these change.

| Item | Value |
| --- | --- |
| Repository | https://github.com/Nouman-wp/Zoro-MCPGuard |
| Frontend (production) | https://zoro-mcp-guard.vercel.app |
| Backend | https://zoro-backend-r4qd.onrender.com (Render Blueprint from `render.yaml`, Singapore, free plan) |
| Health endpoint | https://zoro-backend-r4qd.onrender.com/healthz |
| Keep-alive | GitHub Actions `keep-alive.yml`, every 10 minutes, URL from the `ZORO_BACKEND_URL` variable |
| ENS | Sepolia — root `zoro-registry.eth` (operator 0xC751A280EB180B25DBAdd9b9CAB93dc97adf5727): UserRegistry 0x0C060388fB376C1CfD77ae070f4fD30d2B20F0ea, root resolver 0x5d5E256Abc73487a76D1B76f7769C92b07cc52Ac, Lab namespace `lab.zoro-registry.eth` resolver 0xabc17D74D77c3E3a467567F74B4d8f1302e1f466; auditor 0xD7ce942A01b80652f2B781Ee7aEd0bf92A771C7b |
| Hedera | testnet — operator 0.0.11329412; registry topic 0.0.11329769, Lab topic 0.0.11329770, organization topic 0.0.11329771, badge token 0.0.11329772 |
| World ID | staging (World ID Simulator), Proof of Human through IDKit 4 — app app_72e44df4d18c8dae291e479c4baedbf0, RP rp_1a49119b2c0262d1 |
| Last verified end to end | 2026-11-06 on the hosted deployment: Attack Lab and DeepWiki verdicts AI-reviewed, signed, written to ENS (namespace registered by the operator) and Hedera, and read back; MCP clients connected over HTTP and through the bridge. 2026-11-07: a World ID Human Seal completed in the Simulator on the hosted Attack Lab, verified by World's v4 API, and the held call ran once |
