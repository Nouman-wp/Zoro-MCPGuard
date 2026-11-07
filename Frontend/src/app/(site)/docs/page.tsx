import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, Boxes, Fingerprint, Landmark, Lightbulb, ScrollText, ShieldCheck, UserCheck, Wrench } from 'lucide-react';
import { CodeBlock } from '@/components/ui';
import { PageIntro } from '@/components/site';
import { DocsNav } from '@/components/docs-nav';

export const metadata = { title: 'Documentation' };

/** Class joiner (the shared cx lives in a client module, and this page renders on the server). */
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

const TOC = [
  ['quick-start', 'Quick start'],
  ['architecture', 'How Zoro is built'],
  ['configuration', 'Configuration'],
  ['networks', 'Registry, ledger, Human Seal'],
  ['canonicalization', 'Fingerprints'],
  ['policy', 'How a call is judged'],
  ['invariants', 'Promises Zoro keeps'],
  ['threat-model', 'Attacks it handles'],
  ['limits', 'Honest limits'],
  ['privacy', 'What leaves your machine'],
] as const;

// ---------- building blocks ----------

function Section({ id, n, title, plain, children }: { id: string; n: number; title: ReactNode; plain?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-obsidian pt-12 first:border-t-0 lg:scroll-mt-24">
      <p className="font-mono text-[12px] font-semibold text-slate">{String(n).padStart(2, '0')}</p>
      <h2 className="font-display mt-1 text-[28px] font-medium leading-tight md:text-[34px]">{title}</h2>
      {plain && <Plain>{plain}</Plain>}
      {children}
    </section>
  );
}

/** The one-paragraph, no-jargon version of a section, shown before the details. */
function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 flex gap-3 rounded-[12px] border border-sapphire bg-mint-soft p-4 text-on-pastel">
      <Lightbulb className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="text-[15.5px] leading-[1.6]">
        <span className="font-semibold">In plain words: </span>
        {children}
      </p>
    </div>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[16px] leading-[1.7] text-mist">{children}</p>;
const UL = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-4 space-y-2.5">
    {items.map((i, n) => (
      <li key={n} className="flex gap-3 text-[15.5px] leading-[1.65] text-mist">
        <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[color:var(--text-dim)]" aria-hidden />
        <span className="min-w-0">{i}</span>
      </li>
    ))}
  </ul>
);
/** Inline code: dark text on a tinted chip, readable in both themes. */
const C = ({ children }: { children: ReactNode }) => <code className="break-words rounded-[5px] border border-obsidian bg-cobalt px-1.5 py-[1px] font-mono text-[0.86em] text-quartz">{children}</code>;
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link className="font-semibold text-accent underline decoration-[color:var(--accent-tint-edge)] underline-offset-2 hover:decoration-current" href={href}>
    {children}
  </Link>
);

function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="mt-6 space-y-3">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-[12px] border border-sapphire bg-panel p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-sapphire bg-lavender font-semibold text-on-pastel">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-quartz">{s.title}</p>
            <div className="mt-1 text-[15px] leading-[1.6] text-ash">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const PARTS: { icon: ReactNode; tone: string; name: string; plain: string; detail: ReactNode }[] = [
  { icon: <ShieldCheck />, tone: 'bg-mint', name: 'Gateway', plain: 'The door every tool call walks through.', detail: <>An MCP server to your clients and an MCP client to each upstream server (stdio or Streamable HTTP). It serves only sealed definitions and checks every call: seal, policy, data flows, approvals, then Output Shield on the result.</> },
  { icon: <Fingerprint />, tone: 'bg-lavender', name: 'Sentinel', plain: 'The inspector that checks each new tool version.', detail: <>Rule-based checks, a diff against the last sealed version, AI review (two configurations for high-impact tools), sandbox detonation for Lab servers, and a signed (EIP-191) attestation over the verdict.</> },
  { icon: <Landmark />, tone: 'bg-mint', name: 'Registry (ENS)', plain: 'A public name book where verdicts are written.', detail: <>ENSv2 on Sepolia. Each server gets its own Permissioned Resolver; only the Auditor may write verdicts. Version names resolve by wildcard and <C>current</C> points at the live one.</> },
  { icon: <ScrollText />, tone: 'bg-peach', name: 'Ledger (Hedera)', plain: 'A public diary with time stamps nobody can change.', detail: <>Hedera Consensus Service topics for verdicts and Lab records, Merkle commitments over your local audit log, and badge tokens that are burned when a seal is revoked.</> },
  { icon: <UserCheck />, tone: 'bg-lavender', name: 'Human Seal (World ID)', plain: 'Proof that a real person approved one exact action.', detail: <>World ID proofs bound to a digest of the action, verified on the server, usable once per action.</> },
];

const POLICY = ['Server mode', 'Seal & trust chain', 'Verdict handling', 'Tool permissions', 'Agent rules', 'High-impact asks', 'Argument limits', 'Rate limits', 'Time windows', 'Data flows'];

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[250px_1fr] lg:gap-12">
      <DocsNav items={TOC} />
      <article className="min-w-0 max-w-3xl">
        <PageIntro eyebrow="Documentation" a="Running Zoro" />
        <p className="mt-5 text-[18px] leading-[1.65] text-mist">
          Zoro stands between AI agents and the tools they use. Before an agent touches a tool, Zoro checks that the tool is exactly the version that was examined and approved. If anything changed, the call does not happen, you see what changed and why it matters, and the event goes into a public record.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: <Wrench />, t: 'Set it up', d: 'Five minutes, on your own machine.', href: '#quick-start' },
            { icon: <Boxes />, t: 'Understand it', d: 'The five parts and what each does.', href: '#architecture' },
            { icon: <BookOpen />, t: 'Trust it', d: 'Promises, limits and privacy.', href: '#invariants' },
          ].map((c) => (
            <a key={c.t} href={c.href} className="tabcard group rounded-[12px] border border-sapphire bg-panel p-4">
              <span className="flex size-9 items-center justify-center rounded-[10px] border border-sapphire bg-lavender text-on-pastel [&_svg]:size-4">{c.icon}</span>
              <p className="mt-3 font-semibold text-quartz">{c.t}</p>
              <p className="mt-0.5 text-[14px] text-ash">{c.d}</p>
            </a>
          ))}
        </div>

        <div className="mt-6 space-y-0">
          <Section id="quick-start" n={1} title="Quick start" plain="You run two small programs on your computer: the Zoro daemon (the guard) and this website (your control panel). Then you point your AI app at Zoro instead of straight at its tools.">
            <P>
              You need Node.js 22.13 or newer (24 recommended) and pnpm 10 (<C>npm i -g pnpm</C>). If <C>pnpm</C> is not found after that, <C>npx pnpm@10 &lt;command&gt;</C> works too.
            </P>
            <CodeBlock className="mt-4" language="shell" filename="terminal" code={['git clone https://github.com/Nouman-wp/Zoro-MCPGuard zoro && cd zoro', 'pnpm install', 'cp .env.example .env        # optional: keys for the AI layer, ENSv2, Hedera and World ID', 'pnpm dev                    # daemon on :7420, web on :3000'].join('\n')} />
            <Steps
              items={[
                { title: 'Sign in to your Console', body: <>The daemon prints a link when it starts (<C>Console login : http://localhost:3000/console/login?token=…</C>). Open it. The token is also saved as <C>console.token</C> in Zoro’s data folder: <C>%LOCALAPPDATA%\Zoro</C> on Windows, <C>~/Library/Application Support/Zoro</C> on macOS, <C>~/.local/share/zoro</C> on Linux.</> },
                { title: 'Connect your AI apps', body: <>Open <A href="/console/onboarding">Console → Onboarding</A>. Zoro asks permission to read your MCP client settings (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI, Cline), lists every server, and routes the ones you pick through the gateway. Each original file is backed up first and can be restored in one click.</> },
                { title: 'Restart your AI app', body: <>It now talks to Zoro through a small bridge. Every tool is fingerprinted, checked and sealed before the agent can see it.</> },
                { title: 'Watch it work', body: <>Open the <A href="/lab">Attack Lab</A> and launch a real attack against demo servers.</> },
              ]}
            />
            <P>
              Apps that speak Streamable HTTP can connect directly to <C>http://127.0.0.1:7420/mcp</C> with the header <C>x-zoro-gateway-token</C> (value in <C>gateway.token</C> in the data folder). A local install has its own private Console; a hosted deployment runs a separate daemon with its own Console.
            </P>
          </Section>

          <Section id="architecture" n={2} title="How Zoro is built" plain="Five parts. A gateway that every call passes through, an inspector that checks tools, a public name book and a public diary where verdicts are recorded, and a human check for risky actions.">
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PARTS.map((p, i) => (
                <div key={p.name} className={cx('overflow-hidden rounded-[12px] border border-sapphire bg-panel', i === 0 && 'sm:col-span-2')}>
                  <div className={cx('flex items-center gap-2.5 border-b border-sapphire px-4 py-2.5 text-on-pastel [&_svg]:size-4', p.tone)}>
                    {p.icon}
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-[15.5px] font-semibold text-quartz">{p.plain}</p>
                    <p className="mt-1.5 text-[14.5px] leading-[1.6] text-ash">{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="configuration" n={3} title="Configuration" plain="Everything is optional. With no keys at all Zoro still protects you on your own machine; each missing piece shows up in the Console as “not configured” instead of being silently skipped.">
            <P>
              Copy <C>.env.example</C> to <C>.env</C> at the repository root and fill in what you have. The most useful one is <C>GROQ_API_KEY</C> (free): without it, clean tool versions stay “pending” because Zoro never guesses that something is safe.
            </P>
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
                'WORLD_ENVIRONMENT=staging      # staging = test identities (World ID Simulator)',
              ].join('\n')}
            />
          </Section>

          <Section id="networks" n={4} title="Registry, ledger and Human Seal" plain="Two setup commands create Zoro’s public records for you. After that, every verdict is published automatically in the background; your agent never waits for it.">
            <Steps
              items={[
                { title: 'Hedera', body: <><C>pnpm setup:hedera</C> creates the registry, Lab and organization topics and the badge token, and writes their IDs into <C>.env</C>.</> },
                { title: 'ENS', body: <><C>pnpm setup:ens</C> deploys a registry and resolver for your root name through the ENSv2 factory, gives the Auditor its writing role, and registers the Lab namespace.</> },
              ]}
            />
            <P>Both commands are safe to run twice. Writes are retried if a network is slow, and every onchain record in the Console links to its explorer page (Sepolia Etherscan, the ENS app, HashScan). Read more on the <A href="/tracks/ens">ENS</A>, <A href="/tracks/hedera">Hedera</A> and <A href="/tracks/world-id">World ID</A> track pages.</P>
          </Section>

          <Section id="canonicalization" n={5} title="Fingerprints (zoro-canon/1)" plain="Zoro turns every tool description into a short unique code, its fingerprint. Change a single character, even an invisible one, and the fingerprint changes. That is how Zoro notices a tool was swapped.">
            <UL
              items={[
                'The whole definition is covered: every field the server sent, not a chosen subset.',
                'Object keys are sorted by UTF-16 code unit order (as in RFC 8785); undefined members are dropped; arrays keep their order; numbers use the shortest round-trip form; null is kept.',
                'Strings are only JSON-escaped. No Unicode normalization, trimming or whitespace folding, so invisible, direction-override and look-alike characters are part of the fingerprint (and reported separately as findings).',
                <>fingerprint = sha256(<C>&quot;zoro-canon/1\n&quot; + kind + &quot;\n&quot; + canonicalJson(definition)</C>), where kind is tool, prompt or resource_template.</>,
                'The manifest root commits to the sorted list of (kind, name, fingerprint) plus the server name, version and artifact identity, so added, removed and renamed entries change it.',
              ]}
            />
            <P>
              The code is in <C>Backend/core/src/canonical.ts</C>; <A href="/verify">Zoro Verify</A> runs the same code in your browser.
            </P>
          </Section>

          <Section id="policy" n={6} title="How a call is judged" plain="Every call goes through the same checklist, in the same order. The strictest answer wins, and Zoro records which rule decided, so you can always see why.">
            <ol className="mt-6 flex flex-wrap items-center gap-y-2">
              {POLICY.map((p, i) => (
                <li key={p} className="flex items-center">
                  {i > 0 && <span className="mx-1.5 text-slate" aria-hidden>→</span>}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sapphire bg-panel px-3 py-1 text-[13px] font-medium text-quartz">
                    <span className="font-mono text-[11px] text-slate">{i + 1}</span> {p}
                  </span>
                </li>
              ))}
            </ol>
            <P>The full trace is kept for every call. Observe mode records what would have been decided but never blocks.</P>
            <P>Any change that weakens protection (a relaxed action, a wider allowlist, a higher threshold, a removed rule, observe mode) needs explicit confirmation, and a Human Seal where the policy requires one. Policy simulation replays your recorded calls against a proposed policy before you save it.</P>
          </Section>

          <Section id="invariants" n={7} title="Promises Zoro keeps" plain="Seven rules Zoro never breaks, whatever the configuration.">
            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {['No unverified tool text reaches the model.', 'No call runs against an unsealed tool version, unless a verified human overrides that one action, and the override is recorded.', 'Every verdict can be checked by anyone.', 'Every decision can be explained.', 'Your data stays with you.', 'Fail closed, never fail silent.', 'No overclaiming.'].map((t, i) => (
                <div key={t} className="flex gap-3 rounded-[10px] border border-sapphire bg-panel p-3.5 text-[15px] leading-[1.5] text-mist">
                  <span className="font-mono text-[12px] font-semibold text-slate">{i + 1}</span>
                  {t}
                </div>
              ))}
            </div>
          </Section>

          <Section id="threat-model" n={8} title="Attacks it handles" plain="Each attack below is something a bad tool can try. Next to it: what Zoro does about it. You can launch most of them yourself in the Attack Lab.">
            <div className="mt-6 overflow-hidden rounded-[12px] border border-sapphire bg-panel">
              {[
                ['A tool quietly changes its description (rug pull)', 'Pins the approved version and quarantines any change.'],
                ['A local tool changes its code', 'Re-checks the program’s identity on every start.'],
                ['Hidden or manipulative instructions (poisoning, shadowing)', 'Rule-based and AI findings, plus a radar for tools that collide across servers.'],
                ['Private data leaking to another server', 'The data-flow guard tracks where data comes from and holds risky flows for a person.'],
                ['A tool returns instructions in its output', 'Output Shield marks, redacts or blocks them.'],
                ['Forged seals or a compromised auditor', 'Role-restricted registry writes, signatures, ledger cross-checks and public disputes.'],
                ['Reusing an approval for something else', 'Human Seals are tied to one exact action and work once.'],
              ].map(([a, z], i) => (
                <div key={a} className={cx('grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1fr_1.2fr] sm:gap-6', i > 0 && 'border-t border-obsidian')}>
                  <p className="text-[15px] font-semibold text-quartz">{a}</p>
                  <p className="text-[15px] leading-[1.55] text-ash">{z}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="limits" n={9} title="Honest limits" plain="Zoro is strong, not magic. Here is what it cannot do.">
            <UL
              items={[
                'A remote server can change what its code does without changing any description or version. Zoro cannot see inside someone else’s server; it narrows the gap with identity checks, behaviour baselines, Output Shield, argument limits and network revocations.',
                'The data-flow guard sees tool inputs and outputs, not the model’s thinking. Data that is transformed or encoded can slip past matching.',
                'Content injection cannot be fully solved by filtering. Output Shield lowers and exposes the risk; it does not stop every prompt injection.',
                'Sandbox detonation is only available for Attack Lab servers.',
                'Out of scope: a fully compromised computer, a compromised model inside the client, and apps that connect to servers without going through Zoro (Zoro flags those settings).',
              ]}
            />
          </Section>

          <Section id="privacy" n={10} title="What leaves your machine" plain="Only facts about tools are ever published. Your prompts, files, results and identity stay on your computer.">
            <UL
              items={[
                'ENS and Hedera receive information about tools (fingerprints, verdicts, hashes, signatures), never your prompts, arguments, results, files or identity.',
                'Your own activity is anchored only as Merkle roots over your local audit log; individual calls are never written onchain.',
                'The AI layer receives public tool definitions. Ask Zoro sends your question and the records it reads to the AI provider only when you use it.',
                'World ID receives the action digest as the proof signal, never the action itself, and Zoro stores only the nullifier for that action.',
                'Exposure reports are generated entirely on your machine.',
              ]}
            />
          </Section>
        </div>
      </article>
    </div>
  );
}
