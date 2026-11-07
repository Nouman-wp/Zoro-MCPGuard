import Link from 'next/link';
import { CodeBlock } from '@/components/ui';
import { PageIntro } from '@/components/site';

export const metadata = { title: 'Documentation' };

const SITE_URL = 'https://zoro-mcp-guard.vercel.app/';
const REPO_URL = 'https://github.com/Nouman-wp/Zoro-MCPGuard.git';

const TOC = [
  ['quick-start', 'Quick start'],
  ['architecture', 'Architecture'],
  ['configuration', 'Configuration'],
  ['networks', 'Registry, ledger and Human Seal'],
  ['canonicalization', 'Canonicalization'],
  ['policy', 'Policy evaluation'],
  ['invariants', 'Product invariants'],
  ['threat-model', 'Threat model'],
  ['limits', 'Honest limits'],
  ['privacy', 'What leaves your machine'],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display scroll-mt-24 pt-12 text-[28px] font-medium leading-tight md:text-[32px]">
      {children}
    </h2>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-[16px] font-light leading-relaxed text-mist">{children}</p>;
const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] font-light leading-relaxed text-mist">
    {items.map((i, n) => (
      <li key={n}>{i}</li>
    ))}
  </ul>
);
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-deep-sea px-1.5 py-0.5 font-mono text-[13px] text-code-str">{children}</code>;

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-[14px]" aria-label="Documentation">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded-md px-2 py-1.5 text-ash hover:bg-ink/[0.03] hover:text-quartz">
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl">
        <PageIntro eyebrow="Documentation" a="Running Zoro" />
        <P>Zoro stands between AI agents and the MCP tools they use. Before an agent touches a tool, Zoro checks that the tool is exactly the version that was examined and approved. If anything has changed, the call does not happen, you see precisely what changed and why it matters, and the event is written to a public record.</P>
        <P>
          Try it live, with nothing to install: <a className="text-frosted" href={SITE_URL}>{SITE_URL}</a>. Launch an attack in the <Link className="text-frosted" href="/lab">Attack Lab</Link>, then check the verdict on <Link className="text-frosted" href="/verify">Verify</Link>.
        </P>

        <H2 id="quick-start">Quick start</H2>
        <P>Zoro runs on your own machine: a daemon (gateway, auditor, registry and ledger writers) and this web app (Console and public pages).</P>
        <P>
          Before you start, install Node.js 22.13 or newer (24 recommended) and pnpm 10 (<C>npm i -g pnpm</C>).
        </P>
        <CodeBlock
          className="mt-4"
          language="shell"
          filename="terminal"
          code={[`git clone ${REPO_URL} zoro && cd zoro`, 'pnpm install', 'cp .env.example .env        # optional: add keys for the AI layer, ENSv2, Hedera and World ID', 'pnpm dev                    # daemon on :7420, web on :3000'].join('\n')}
        />
        <UL
          items={[
            <>Your Console is at <C>http://localhost:3000/console</C>. When the daemon starts it prints a sign-in link (<C>Console login : http://localhost:3000/console/login?token=…</C>); open it to sign in. The token is also kept in <C>console.token</C> in Zoro’s data directory (<C>%LOCALAPPDATA%\Zoro</C> on Windows, <C>~/Library/Application Support/Zoro</C> on macOS, <C>~/.local/share/zoro</C> on Linux).</>,
            <>A local install has its own private Console and records on <C>localhost</C>. A hosted deployment runs a separate daemon with its own Console.</>,
            <>Open <Link className="text-frosted" href="/console/onboarding">Console → Onboarding</Link>. Zoro asks permission to read your MCP client configurations (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Cline), shows every server, and routes the ones you select through the gateway. Each original file is backed up first and can be restored in one action.</>,
            <>Restart your MCP client. It now talks to Zoro through the stdio bridge; every tool is fingerprinted, audited and sealed before the agent can see it.</>,
            <>Try the <Link className="text-frosted" href="/lab">Attack Lab</Link> to watch attacks go through the real enforcement path.</>,
          ]}
        />
        <P>Clients that speak Streamable HTTP can also connect directly to <C>http://127.0.0.1:7420/mcp</C> with the header <C>x-zoro-gateway-token</C> (from <C>gateway.token</C> in the data directory).</P>

        <H2 id="architecture">Architecture</H2>
        <UL
          items={[
            <><b className="font-medium text-quartz">Gateway</b> — an MCP server to your clients and an MCP client to each upstream server (stdio or Streamable HTTP). It aggregates and namespaces tools, serves only sealed definitions, and evaluates every call: seal and trust chain, policy, data flows, approvals, then Output Shield on the result.</>,
            <><b className="font-medium text-quartz">Sentinel</b> — deterministic rules, differential analysis against the last sealed version, AI review (two configurations for high-impact tools), dynamic detonation for Lab servers, and an EIP-191 attestation over the verdict package.</>,
            <><b className="font-medium text-quartz">Registry</b> — ENSv2 on Sepolia. Each server namespace gets its own Permissioned Resolver; the Auditor holds text and link roles, publishers only the descriptive keys. Version names resolve by wildcard and <C>current</C> is a record link.</>,
            <><b className="font-medium text-quartz">Ledger</b> — Hedera Consensus Service topics for public verdicts and Lab records, an organization topic for Merkle commitments over your local audit log, and Hedera Token Service badges burned on revocation.</>,
            <><b className="font-medium text-quartz">Human Seal</b> — World ID 4.0 Proof of Human requested with RP signatures, bound to one approval and its action digest, verified server-side (including the credential), single use.</>,
          ]}
        />

        <H2 id="configuration">Configuration</H2>
        <P>Everything is optional. Without keys Zoro still protects you locally; each missing dependency is shown as a degraded state rather than silently skipped.</P>
        <CodeBlock
          className="mt-4"
          language="shell"
          filename=".env"
          code={[
            '# Sentinel AI layer and Ask Zoro (Groq free tier, any OpenAI-compatible API works)',
            'GROQ_API_KEY=                 # free key from console.groq.com; enables AI review and Ask Zoro',
            'SENTINEL_MODEL=openai/gpt-oss-120b',
            'SENTINEL_REQUIRE_AI=true      # false = development mode (seals record that AI did not run)',
            '',
            '# ENSv2 registry (Sepolia)',
            'ZORO_ENS_ROOT=yourname.eth     # a .eth name you own on ENSv2',
            'ENS_OPERATOR_PRIVATE_KEY=      # owner of the root; then run: pnpm setup:ens',
            'ZORO_AUDITOR_PRIVATE_KEY=      # Auditor role + attestation key (generated if empty)',
            '',
            '# Hedera ledger',
            'HEDERA_OPERATOR_ID=0.0.x',
            'HEDERA_OPERATOR_KEY=           # then run: pnpm setup:hedera',
            '',
            '# World ID (Human Seal)',
            'WORLD_APP_ID=app_…',
            'WORLD_RP_ID=rp_…',
            'WORLD_SIGNING_KEY=…',
            'WORLD_ENVIRONMENT=staging      # staging = World ID Simulator; sandbox = World ID Sandbox app; production = World App',
          ].join('\n')}
        />

        <H2 id="networks">Registry, ledger and Human Seal</H2>
        <P>
          <C>pnpm setup:hedera</C> creates the registry, Lab and organization topics and the badge token, and writes their IDs to <C>.env</C>. <C>pnpm setup:ens</C> deploys a UserRegistry and Permissioned Resolver for your root name through the ENSv2 VerifiableFactory, grants the Auditor role, and registers the Lab namespace. Both are idempotent.
        </P>
        <P>Writes are asynchronous and retried; enforcement never waits for them. Every onchain record in the Console links to its explorer entry (Sepolia Etherscan, the ENS app, HashScan).</P>

        <H2 id="canonicalization">Canonicalization (zoro-canon/1)</H2>
        <UL
          items={[
            'The whole definition object is covered — every field the server sent, not a chosen subset.',
            'Object keys are sorted by UTF-16 code unit order (as in RFC 8785); undefined members are dropped; arrays keep their order; numbers use the shortest round-trip form; null is kept.',
            'Strings are JSON-escaped only. There is no Unicode normalization, trimming or whitespace folding: invisible, direction-override and homoglyph characters are part of the fingerprint (and are reported separately as findings).',
            <>fingerprint = sha256(<C>&quot;zoro-canon/1\n&quot; + kind + &quot;\n&quot; + canonicalJson(definition)</C>), where kind is tool, prompt or resource_template.</>,
            'The manifest root commits to the sorted list of (kind, name, fingerprint) plus the declared server name, version and artifact identity, so added, removed and renamed entries change it.',
          ]}
        />
        <P>The implementation is <C>Backend/core/src/canonical.ts</C>; Zoro Verify runs the same code in your browser.</P>

        <H2 id="policy">Policy evaluation</H2>
        <P>Rules are evaluated in this order and the strictest outcome wins; the first rule that produced it is recorded as the deciding rule, with the full trace kept for every call: server mode → seal and trust chain → verdict handling → tool permissions → agent rules → high-impact asks → argument constraints → rate limits → time windows → data flows. Observe mode records what would have been decided but never blocks.</P>
        <P>Any change that weakens protection — a relaxed action, an expanded allowlist, a raised threshold, a removed rule, observe mode — needs explicit confirmation, and a Human Seal where the policy requires one. Policy simulation replays your recorded calls against a proposed policy before you save it.</P>

        <H2 id="invariants">Product invariants</H2>
        <UL
          items={[
            'No unverified tool text reaches the model.',
            'No call runs against an unsealed tool version, unless a verified human overrides that specific action, and the override is recorded.',
            'Every verdict is independently verifiable.',
            'Every enforcement decision is explainable.',
            'User data stays with the user.',
            'Fail closed, never fail silent.',
            'No overclaiming.',
          ]}
        />

        <H2 id="threat-model">Threat model</H2>
        <UL
          items={[
            'Rug pulls through description changes: definition pinning and quarantine.',
            'Rug pulls through code changes on local servers: artifact identity re-checked on every start.',
            'Tool poisoning and shadowing: deterministic and AI findings; cross-server collision radar.',
            'Cross-server exfiltration: the data-flow guard labels sources and sinks and holds risky flows for a person.',
            'Poisoned tool output: Output Shield annotates, redacts or blocks instruction-like content.',
            'Forged seals and a compromised auditor: role-restricted registry writes, attestations, ledger cross-checks and public disputes.',
            'Replayed or downgraded approvals: Human Seals are bound to one approval and its action digest, are single use, and must be World ID Proof of Human (checked on the server, not in the browser).',
          ]}
        />

        <H2 id="limits">Honest limits</H2>
        <UL
          items={[
            'A remote server can change what its code does without changing any definition or version string. Zoro cannot see inside another party’s server; it narrows the gap with identity checks, behavioral baselines, Output Shield, argument constraints and network revocations.',
            'The data-flow guard sees tool inputs and outputs, not the model’s reasoning. Transformed or encoded data can evade matching.',
            'Content injection cannot be fully solved by filtering. Output Shield reduces and exposes risk; it does not prevent all prompt injection.',
            'Dynamic detonation is available only for Attack Lab servers on this platform.',
            'Out of scope: a fully compromised host, a compromised model inside the client, and clients that connect to servers without going through Zoro (Zoro flags those configurations).',
          ]}
        />

        <H2 id="privacy">What leaves your machine</H2>
        <UL
          items={[
            'ENS and Hedera receive information about tools — fingerprints, verdicts, hashes, signatures — never your prompts, arguments, results, files or identity.',
            'Your own activity is anchored only as Merkle roots over your local audit log; individual calls are never written onchain.',
            'The AI layer receives public tool definitions. Ask Zoro sends your question and the records it reads to the AI provider only when you use it.',
            'World ID receives the action digest as the proof signal — never the action itself — and Zoro stores only the nullifier for that approval.',
            'Exposure reports are generated entirely on your machine.',
          ]}
        />
      </article>
    </div>
  );
}
