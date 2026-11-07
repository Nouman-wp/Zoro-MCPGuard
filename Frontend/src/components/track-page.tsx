'use client';

/**
 * The sponsor-track pages (/tracks/ens, /tracks/world-id, /tracks/hedera). Each explains, from first principles,
 * why Zoro needs that technology, then exactly what Zoro does with it. Every record name, action string and file path
 * below comes from the code; live status comes from /api/public/verify-context.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, ChevronDown, FileCode, Lightbulb, NotebookPen, ScanFace, ThumbsDown, ThumbsUp } from 'lucide-react';
import { LinkButton, StatusPill } from './ui';
import { Reveal, Stagger } from './motion';
import { Chip, NumberBadge, TONE_BG, TONE_SOFT, type Tone } from './hardware';
import { GITHUB_URL } from './site';
import { Tip } from './tip';
import { useApi } from '@/lib/api';

export type TrackId = 'ens' | 'world-id' | 'hedera';

interface Track {
  id: TrackId;
  name: string;
  tone: Tone;
  role: string;
  summary: string;
  /** One sentence a newcomer understands. */
  plain: string;
  /** The everyday comparison, plus life without and with it. */
  analogy: { icon: ReactNode; title: string; body: string; without: string; with: string };
  principles: { q: string; plain: string; a: ReactNode }[];
  flow: { title: string; plain: string; body: ReactNode }[];
  glossary: { term: string; body: string }[];
  records: { title: string; head: [string, string]; rows: [string, string][] };
  usedFor: string[];
  limits: string[];
  code: { path: string; what: string }[];
}

const code = (s: string) => <code className="rounded-[4px] border border-obsidian bg-panel px-1.5 py-0.5 font-mono text-[0.88em] text-quartz">{s}</code>;

const TRACKS: Record<TrackId, Track> = {
  ens: {
    id: 'ens',
    name: 'ENS',
    tone: 'mint',
    role: 'Public registry',
    plain: 'ENS is a public name book. Zoro gives every tool version a name in it and writes “checked: safe” or “checked: unsafe” next to that name, where anyone can read it but only Zoro’s auditor can write it.',
    analogy: {
      icon: <BookOpen />,
      title: 'Think of it as a public phone book with a safety rating',
      body: 'Every tool gets an entry, like a business in a phone book. Next to each entry is a rating sticker that only the official inspector is allowed to put there.',
      without: 'Ratings live in one company’s private database. You have to trust it, and nobody else can look them up.',
      with: 'Anyone, anywhere, can look up a tool by name and see the inspector’s verdict and signature.',
    },
    glossary: [
      { term: 'ENS', body: 'Ethereum Name Service: readable names (like zoro.eth) that live on the Ethereum blockchain instead of one company’s server.' },
      { term: 'Text record', body: 'A small labelled note attached to a name, like “verdict = sealed”.' },
      { term: 'Resolver', body: 'The contract that stores a name’s records and decides who may change them.' },
      { term: 'Sepolia', body: 'Ethereum’s free test network. Same rules as the real one, but the money is pretend.' },
    ],
    summary: 'Zoro gives every MCP server, tool and tool version an ENS name, and writes each verdict onto that name as text records that anyone can read, but that only the Auditor key is allowed to write.',
    principles: [
      { q: '1 · The problem', plain: 'A tool can quietly change, and there is no public place to check whether today’s version was ever approved.', a: <>An MCP tool is just text that a server sends to your agent. The same tool name can point at different text, and different code, tomorrow. A verdict like “this exact version was checked and is sealed” is only useful if anyone, anywhere, can look it up by name and see who said it.</> },
      { q: '2 · Why the obvious fix fails', plain: 'A private list can be edited secretly, and letting tool makers rate themselves is like students grading their own exams.', a: <>Keep the verdicts in Zoro’s own database? Then you have to trust Zoro, the records can be edited quietly, and no other client or gateway can find them. Let publishers sign their own manifests? Then publishers mark their own homework.</> },
      { q: '3 · What is actually needed', plain: 'A public list of names that anyone can read, where the rules about who may write are enforced by the system itself.', a: <>A public, human-readable namespace (server → tool → version) where each name resolves to data any client can read, and where <em>who may write</em> is enforced by the system itself, not by a promise in a README.</> },
      { q: '4 · Why ENS provides exactly that', plain: 'ENS names work like folders (tool.server.zoro.eth), anyone can read them, and the blockchain enforces who may write.', a: <>ENS names are hierarchical and resolve from any Ethereum client. Text records attach key–value data to a name. The ENSv2 Permissioned Resolver enforces write roles per name on-chain, so the key that may write verdicts can be separated from the key that owns the names.</> },
      { q: '5 · So Zoro uses ENS as', plain: 'The public name book of verdicts: one name per tool version, with the result written next to it.', a: <>The public registry of verdicts: one name per tool version, carrying its fingerprint, verdict, risk, capabilities and the auditor’s signature, written only by the Auditor role.</> },
    ],
    flow: [
      { title: 'Name every version', plain: 'Each server, tool and version gets its own address, like a street, house and flat number.', body: <>Each server becomes {code('<server>.<root>')}, each tool {code('<tool>.<server>.<root>')}, and each audited version {code('fp-<first 8 hex of fingerprint>.<tool>.<server>.<root>')}. {code('current.<tool>…')} points at the live version; Lab records live under {code('lab.<root>')}.</> },
      { title: 'Separate who may write', plain: 'The owner of the names and the inspector who writes verdicts hold different keys, so neither can fake the other.', body: <>The setup script deploys a Permissioned Resolver and grants the Auditor key only {code('ROLE_SET_TEXT')} and {code('ROLE_LINK')}. The operator who owns the names cannot forge a verdict with the auditor’s key, and the auditor cannot take the names. The auditor address is published on the root as {code('zoro.auditor')}.</> },
      { title: 'Write the verdict', plain: 'When a tool passes inspection, the result and the inspector’s signature are written onto its name.', body: <>When Sentinel seals a version, the outbox writes the {code('zoro.*')} text records listed below onto its version name, including the auditor’s signature over the verdict and a pointer to the Hedera message.</> },
      { title: 'Revoke in public', plain: 'If a tool turns bad later, its record changes to “revoked” for everyone at once. It can’t be quietly deleted.', body: <>If a sealed version turns bad, the same name is updated to {code('zoro.status = revoked')}. Any client that resolves the name sees the revocation; it cannot be hidden by deleting a row.</> },
    ],
    records: {
      title: 'Text records written on each version name',
      head: ['Record', 'What it holds'],
      rows: [
        ['zoro.fingerprint', 'Canonical fingerprint of every field the model can read'],
        ['zoro.verdict', 'sealed, sealed_with_warnings or unsafe'],
        ['zoro.risk', 'Risk score from the Sentinel audit'],
        ['zoro.capabilities', 'What the tool can do (send mail, move money, …)'],
        ['zoro.findings', 'Number of findings and the verdict hash'],
        ['zoro.attestation', 'Auditor signature over fingerprint + verdict hash'],
        ['zoro.verdictHash', 'Hash of the full verdict package'],
        ['zoro.auditor', 'Address of the key that signed'],
        ['zoro.audited / zoro.expires', 'When it was audited and when the seal expires'],
        ['zoro.ledger', 'hedera:<network>:<topic>:<sequence> of the matching ledger message'],
        ['zoro.status', 'active, or revoked once the version is revoked'],
        ['zoro.serverVersion', 'Version the server declared'],
      ],
    },
    usedFor: ['Verify page: look up a tool by ENS name and check the record against its signature', 'Registry explorer: browse servers, tools and versions', 'Every gateway: the first gateway to meet a bad version protects everyone who resolves the same name'],
    limits: ['By default Zoro writes to ENSv2 on Sepolia, the Ethereum test network (ENS_NETWORK can switch it).', 'Records describe tools only: never your prompts, files or identity.', 'A record says what the auditor checked and concluded. It never claims a tool is simply “safe”.'],
    code: [
      { path: 'Blockchain/src/ens.ts', what: 'ENSv2 contracts, roles, resolver writes' },
      { path: 'Backend/core/src/registry.ts', what: 'Name scheme and the Auditor record keys' },
      { path: 'Backend/daemon/src/registry/outbox.ts', what: 'Writes verdict and revocation records' },
      { path: 'Blockchain/scripts/setup-ens.ts', what: 'Deploys the resolver and separates the roles' },
    ],
  },
  'world-id': {
    id: 'world-id',
    name: 'World ID',
    tone: 'lavender',
    role: 'Human Seal',
    plain: 'Before something risky happens, a real person proves “it’s me, and I approve this exact action”, without revealing who they are. A bot can’t fake it and the proof can’t be reused.',
    analogy: {
      icon: <ScanFace />,
      title: 'Think of it as a bank’s “are you really you?” check, without showing your ID',
      body: 'For a big transfer, your bank asks you to confirm in person. World ID does that for your AI: a real human confirms, and the confirmation only works for that one action.',
      without: 'A “Confirm” button. The AI, a script or malware can click it just as easily as you.',
      with: 'Only a unique real person can approve, only this action, only once, and nobody learns who you are.',
    },
    glossary: [
      { term: 'World ID', body: 'A way to prove you are a unique real human online, without sharing your name or face with the website.' },
      { term: 'Zero-knowledge proof', body: 'Maths that proves something is true (“I am a verified human”) without revealing anything else.' },
      { term: 'Nullifier', body: 'A code that is always the same for the same person and the same action, so using a proof twice is easy to spot.' },
      { term: 'Digest', body: 'A short fingerprint of the exact action. Change any detail and the fingerprint changes.' },
    ],
    summary: 'For actions that can’t be undone or that weaken protection, Zoro asks for a Human Seal: a fresh World ID proof that a unique real person approved that exact action, usable once.',
    principles: [
      { q: '1 · The problem', plain: 'Some actions can’t be undone, and the one asking for permission is the AI, which is exactly what attackers try to trick.', a: <>Some actions are irreversible or lower your guard: forwarding a private file, paying an unknown recipient, switching a server to observe mode, overriding a block. The thing asking for approval is an AI agent, and the agent is exactly what an attacker is trying to trick.</> },
      { q: '2 · Why the obvious fix fails', plain: 'Buttons can be clicked by bots, and passwords or codes can be stolen and reused for something else.', a: <>A “Confirm” button only proves that <em>something</em> clicked: the agent, a script or malware with access to the session can click it too. A password or one-time code can be captured and replayed, and an approval token for one action can be reused for another.</> },
      { q: '3 · What is actually needed', plain: 'Proof that a real person approved this one action, which can’t be copied to another action and doesn’t reveal who they are.', a: <>Proof that a real, unique human approved <em>this specific action</em>, which cannot be replayed for a different action or used twice, and which does not reveal who that person is.</> },
      { q: '4 · Why World ID provides exactly that', plain: 'World ID proves “a unique human did this” for one named action, and spots any second use, while keeping the person anonymous.', a: <>A World ID proof is a zero-knowledge proof of personhood. It is bound to an <em>action</em> string and a <em>signal</em>, and yields a nullifier that is the same every time the same person proves for the same action, so reuse is detectable, while the person’s identity stays hidden.</> },
      { q: '5 · So Zoro uses World ID as', plain: 'The Human Seal: a one-time human signature for one exact risky action, using World ID Proof of Human.', a: <>The Human Seal. Zoro asks for World ID <em>Proof of Human</em> through IDKit: it needs to know that a real person approved and which distinct person (two approvers must be two people), and nothing about who they are. Each approval gets its own World ID action and the action’s digest is the signal, so the proof can only approve that one action, once.</> },
    ],
    flow: [
      { title: 'Digest the exact action', plain: 'Zoro writes down exactly what is about to happen and turns it into a short fingerprint.', body: <>Zoro builds a digest from the action itself (kind, request id, server and details). Changing any detail changes the digest.</> },
      { title: 'Bind the proof to it', plain: 'The human’s proof is tied to this one approval and its fingerprint, so it can only ever approve this one thing.', body: <>The World ID action becomes {code('zoro-human-seal:<approval id>')} and the signal {code('zoro-action:<digest>')}. One action per approval means the same person can approve the same command again next week. Zoro signs the request with its relying-party key, with a time limit no longer than the approval window.</> },
      { title: 'Verify, then check the binding', plain: 'World checks the person is real; Zoro double-checks the proof is for the right action.', body: <>The proof is sent to World’s verify API ({code('/api/v4/verify')}). Zoro then checks that the action, the signal hash and the environment match what it asked for, and that the credential is Proof of Human. A mismatch or a weaker credential is rejected even if World accepted the proof, because the browser, not World’s signature, chose the credential.</> },
      { title: 'Record the nullifier once', plain: 'Zoro remembers the proof was used, so trying it again is refused. If World ID is down, nothing risky happens.', body: <>The nullifier is stored against that approval. A second proof from the same person on the same approval is a replay and is refused. If World ID is not configured or not reachable, the action does not proceed: Zoro fails closed.</> },
    ],
    records: {
      title: 'What a Human Seal request carries',
      head: ['Field', 'Value'],
      rows: [
        ['action', 'zoro-human-seal:<approval id> (organization joins: one per organization)'],
        ['signal', 'zoro-action:<action digest> (hashed with World’s own hash_to_field)'],
        ['ttl', 'Up to the approval window; at least 30 seconds'],
        ['credential', 'World ID Proof of Human (IDKit proofOfHuman, World ID 4.0; the 3.0 Orb proof is accepted as fallback)'],
        ['environment', 'production (World App), sandbox (World ID Sandbox app) or staging (World ID Simulator); test identities are labelled in the UI'],
        ['nullifier', 'Stored once per approval, locally; never published'],
        ['status', 'awaiting_verification → verified, or cancelled / credential_unavailable / insufficient_credential / mismatched / invalid / expired / replay / service_unavailable'],
      ],
    },
    usedFor: ['Overriding a block on an unsealed tool version', 'Risky data flows, such as forwarding a private file to an outside address (the Lab’s exfiltration scenario)', 'Loosening policy on the Strict profile, switching a server to observe mode, and danger-zone actions'],
    limits: ['It proves a unique human approved the action, not that the human made a good decision.', 'Staging uses World’s test identities; the Console labels this clearly.', 'Zoro stores no identity: only the nullifier for that one approval, on your machine.'],
    code: [
      { path: 'Backend/daemon/src/humanseal.ts', what: 'Action and signal binding, verify call, nullifier' },
      { path: 'Backend/daemon/src/approvals.ts', what: 'Approvals that require a Human Seal' },
      { path: 'Backend/daemon/src/actions.ts', what: 'Policy, mode and danger-zone actions and their digests' },
      { path: 'Frontend/src/components/human-seal.tsx', what: 'The World ID widget in the Console and Lab' },
    ],
  },
  hedera: {
    id: 'hedera',
    name: 'Hedera',
    tone: 'peach',
    role: 'Verdict ledger',
    plain: 'Hedera is a public diary with time stamps nobody controls. Zoro writes every verdict into it, so anyone can see what was decided and when, and nobody, not even Zoro, can rewrite history.',
    analogy: {
      icon: <NotebookPen />,
      title: 'Think of it as a notary’s logbook that the whole world can read',
      body: 'Every entry gets a page number and an official time stamp. You can add new pages, but you can never tear one out or change an old one.',
      without: 'Zoro keeps its own log. After an incident, how would you know it wasn’t edited?',
      with: 'Every verdict and revocation has a public, network-assigned time and order that anyone can check.',
    },
    glossary: [
      { term: 'Hedera', body: 'A fast, low-cost public network that many independent organisations run together.' },
      { term: 'Topic', body: 'A public channel on Hedera. Messages in it get a sequence number and a time stamp from the network.' },
      { term: 'NFT badge', body: 'A one-of-a-kind digital token. Zoro creates one per approved tool and destroys it if the tool is revoked.' },
      { term: 'Merkle root', body: 'One short code that summarises a whole list. Change any item and the code changes, without revealing the items.' },
    ],
    summary: 'Zoro writes every verdict, revocation and dispute to a Hedera consensus topic, mints a badge token for each sealed version and burns it on revoke, and anchors its own audit log there as Merkle roots.',
    principles: [
      { q: '1 · The problem', plain: 'Knowing today’s verdict isn’t enough. You also need the history: when it was decided and whether anything was changed later.', a: <>A registry shows the current state. But trust also needs history: when was this verdict issued, was it ever revoked, and did anyone, Zoro included, rewrite the audit log after an incident?</> },
      { q: '2 · Why the obvious fix fails', plain: 'A signature proves who wrote something, not when. And putting everything on an expensive blockchain would leak your private activity.', a: <>Signing each log entry proves <em>who</em> wrote it, not <em>when</em> or <em>in what order</em>; a signer can re-sign a rewritten history. Writing every event to a general-purpose blockchain is slow, costly and would publish your private activity.</> },
      { q: '3 · What is actually needed', plain: 'A cheap, public, add-only log with time stamps nobody controls, that can vouch for private data without showing it.', a: <>An append-only, ordered record with timestamps nobody controls (not even Zoro), cheap enough for every verdict, and able to commit to private data without revealing it.</> },
      { q: '4 · Why Hedera provides exactly that', plain: 'Hedera gives every message an official time and order within seconds, for a fraction of a cent, and anyone can read it.', a: <>The Hedera Consensus Service gives every topic message a consensus timestamp and sequence number set by the network, with fast finality and low fees, readable by anyone through public mirror nodes. The Token Service adds NFTs that can be minted and burned.</> },
      { q: '5 · So Zoro uses Hedera as', plain: 'The public diary of every verdict, plus a badge per approved tool and a tamper-proof stamp on Zoro’s own log.', a: <>The verdict ledger: the public, ordered history of every verdict and revocation, a badge per sealed version, and a timestamped commitment to Zoro’s own log.</> },
    ],
    flow: [
      { title: 'Publish every verdict', plain: 'Each new verdict becomes a public message with an official time stamp.', body: <>When a version is sealed, the outbox sends a {code('verdict.issued')} message (or {code('verdict.reissued')}) to the registry topic; Lab runs use a separate Lab topic. The network assigns its timestamp and sequence number.</> },
      { title: 'Link both ways', plain: 'The ENS name points to the diary entry, so you can check the two agree.', body: <>The ENS record {code('zoro.ledger')} stores {code('hedera:<network>:<topic>:<sequence>')}, so a verifier can go from the name to the ledger message and check they agree.</> },
      { title: 'Badge on seal, burn on revoke', plain: 'An approved tool gets a badge; if it is revoked, the badge is destroyed so it can’t be shown off any more.', body: <>Each sealed version gets one badge NFT whose metadata is its fingerprint. Revocation burns it, so a revoked version can never keep showing a valid badge, and publishes a {code('seal.revoked')} message.</> },
      { title: 'Anchor Zoro’s own log', plain: 'Zoro regularly stamps a summary of its private log in public, proving it was never edited, without revealing what is in it.', body: <>Zoro’s audit log is a hash chain. Unanchored entries are committed as one Merkle root on the organization topic. Only the root is published, never the events, so the anchor proves the log wasn’t edited without leaking what happened.</> },
    ],
    records: {
      title: 'A verdict message on the topic (version 1, JSON)',
      head: ['Field', 'What it holds'],
      rows: [
        ['type', 'verdict.issued, verdict.reissued or seal.revoked (disputes have their own types)'],
        ['fp', 'Version fingerprint'],
        ['ens', 'ENS name of the version, when the registry is configured'],
        ['server / tool', 'Which server and tool'],
        ['verdict / risk / changeClass', 'The Sentinel result'],
        ['verdictHash / sig / auditor', 'Hash of the verdict package, the auditor’s signature and address'],
        ['ts', 'Zoro’s timestamp; the network adds its own consensus timestamp'],
      ],
    },
    usedFor: ['Verify page: reads the verdict back from the mirror node and checks the signature', 'Home page and registry counts, computed from the topic when it is configured', 'Revocations and disputes that every gateway can follow in order'],
    limits: ['By default Zoro uses the Hedera test network (HEDERA_NETWORK can switch it).', 'Verdict messages describe tools. Your own calls only ever appear as Merkle roots.', 'Hedera proves when and in what order; the auditor signature proves who.'],
    code: [
      { path: 'Blockchain/src/hedera.ts', what: 'Topic messages, badge mint and burn, mirror reads' },
      { path: 'Backend/daemon/src/registry/outbox.ts', what: 'Builds and sends verdict and revocation messages' },
      { path: 'Backend/daemon/src/anchors.ts', what: 'Merkle-root anchoring of the audit log' },
      { path: 'Blockchain/scripts/setup-hedera.ts', what: 'Creates the topics and the badge token' },
    ],
  },
};

const ORDER: TrackId[] = ['ens', 'world-id', 'hedera'];

/** Technical detail, folded away by default so the plain version leads. */
function More({ children, label = 'Show the technical version' }: { children: ReactNode; label?: string }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-obsidian px-3 py-1 text-[13px] font-semibold text-ash transition-colors hover:border-sapphire hover:text-quartz [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        {label}
      </summary>
      <div className="mt-3 rounded-[10px] border border-dashed border-obsidian bg-elevated p-4 text-[14.5px] leading-[1.65] text-ash">{children}</div>
    </details>
  );
}

/** The everyday comparison: a big card with a before/after pair. */
function Analogy({ t }: { t: Track }) {
  return (
    <div className="overflow-hidden rounded-[18px] border-2 border-sapphire bg-panel shadow-[6px_6px_0_var(--border-strong)]">
      <div className={`flex items-center gap-3 border-b-2 border-sapphire px-5 py-3 text-on-pastel ${TONE_BG[t.tone]}`}>
        <span className="flex size-9 items-center justify-center rounded-[10px] border border-sapphire bg-panel text-quartz [&_svg]:size-5">{t.analogy.icon}</span>
        <span className="text-[12.5px] font-bold uppercase tracking-[0.12em]">Explain it like I’m new</span>
      </div>
      <div className="p-6 md:p-8">
        <p className="font-display text-[26px] leading-[1.15] md:text-[34px]">{t.analogy.title}</p>
        <p className="mt-3 max-w-[760px] text-[17px] leading-[1.6] text-ash">{t.analogy.body}</p>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[12px] border border-sapphire bg-[color:var(--danger-bg)] p-4 text-on-pastel">
            <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.1em] text-[color:var(--danger)]">
              <ThumbsDown className="size-4" aria-hidden /> Without {t.name}
            </p>
            <p className="mt-2 text-[15.5px] leading-[1.55] text-[color:var(--text)]">{t.analogy.without}</p>
          </div>
          <div className="rounded-[12px] border border-sapphire bg-[color:var(--ok-bg)] p-4">
            <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.1em] text-[color:var(--ok)]">
              <ThumbsUp className="size-4" aria-hidden /> With {t.name}
            </p>
            <p className="mt-2 text-[15.5px] leading-[1.55] text-[color:var(--text)]">{t.analogy.with}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="font-semibold text-quartz">Words you’ll see, hover for meaning:</span>
          {t.glossary.map((g) => (
            <Tip key={g.term} content={{ title: g.term, body: g.body }}>
              <button type="button" className={`cursor-help rounded-full border border-dashed border-sapphire px-3 py-1 font-medium text-on-pastel ${TONE_SOFT[t.tone]}`}>
                {g.term}
              </button>
            </Tip>
          ))}
        </div>
      </div>
    </div>
  );
}
const HREF: Record<TrackId, string> = { ens: '/tracks/ens', 'world-id': '/tracks/world-id', hedera: '/tracks/hedera' };
const WRAP = 'mx-auto w-full max-w-[1100px] px-4 sm:px-6';

interface VerifyContext {
  ens: { network: string; root: string; explorer: string } | null;
  hedera: { network: string; registryTopic: string; badgeToken: string | null } | null;
}

function LiveStatus({ id }: { id: TrackId }) {
  const ctx = useApi<VerifyContext>('/api/public/verify-context');
  if (id === 'world-id') return <StatusPill state="pending">Live status is shown in the Console</StatusPill>;
  if (!ctx.data) return <StatusPill state="pending">{ctx.error ? 'Daemon unreachable' : 'Checking…'}</StatusPill>;
  if (id === 'ens') return ctx.data.ens ? <StatusPill state="sealed">{`Live · ${ctx.data.ens.network} · ${ctx.data.ens.root}`}</StatusPill> : <StatusPill state="pending">Not configured on this instance</StatusPill>;
  return ctx.data.hedera ? <StatusPill state="sealed">{`Live · ${ctx.data.hedera.network} · topic ${ctx.data.hedera.registryTopic}`}</StatusPill> : <StatusPill state="pending">Not configured on this instance</StatusPill>;
}

function TryIt({ id }: { id: TrackId }) {
  const ctx = useApi<VerifyContext>('/api/public/verify-context');
  const external = id === 'ens' ? (ctx.data?.ens ? { href: `${ctx.data.ens.explorer}`, label: 'Etherscan' } : { href: 'https://sepolia.etherscan.io', label: 'Etherscan' }) : id === 'hedera' ? (ctx.data?.hedera ? { href: `https://hashscan.io/${ctx.data.hedera.network}/topic/${ctx.data.hedera.registryTopic}`, label: 'Topic on HashScan' } : { href: 'https://hashscan.io', label: 'HashScan' }) : { href: 'https://docs.world.org', label: 'World ID docs' };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {id === 'world-id' ? (
        <LinkButton href="/lab">Try it in the Attack Lab</LinkButton>
      ) : (
        <LinkButton href="/verify">Verify a tool</LinkButton>
      )}
      <LinkButton href={id === 'world-id' ? '/console/approvals' : '/registry'} variant="secondary">
        {id === 'world-id' ? 'Approvals in the Console' : 'Open the registry'}
      </LinkButton>
      <a href={external.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-[15px] font-semibold text-accent hover:underline">
        {external.label} <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}

export function TrackPage({ id }: { id: TrackId }) {
  const t = TRACKS[id];
  const others = ORDER.filter((o) => o !== id).map((o) => TRACKS[o]);
  return (
    <>
      {/* Header band */}
      <section className={`border-b border-sapphire ${TONE_BG[t.tone]} text-on-pastel`}>
        <div className={`${WRAP} py-14 md:py-20`}>
          <Reveal>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="plain">Sponsor track</Chip>
              <Chip tone="plain">{t.role}</Chip>
            </div>
            <h1 className="font-display mt-5 text-[42px] leading-[1.03] md:text-[64px]">How Zoro uses {t.name}</h1>
            <p className="mt-5 max-w-[760px] text-[19px] leading-[1.6]">{t.plain}</p>
            <p className="mt-3 max-w-[760px] text-[15px] leading-[1.6] opacity-75">
              <span className="font-semibold">Technically: </span>
              {t.summary}
            </p>
            <div className="mt-6">
              <LiveStatus id={id} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Analogy */}
      <section className={`${WRAP} pt-14 md:pt-16`}>
        <Reveal>
          <Analogy t={t} />
        </Reveal>
      </section>

      {/* First principles */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <Reveal>
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">From first principles</p>
          <h2 className="font-display mt-3 text-[32px] leading-[1.08] md:text-[44px]">
            Why Zoro needs {t.name} <span className="tone-accent">at all.</span>
          </h2>
        </Reveal>
        <p className="mt-3 max-w-[680px] text-[16px] text-ash">Five short steps, from the problem to the answer. Each card has a plain version; open “technical version” for the details.</p>
        <Stagger className="relative mt-10 grid grid-cols-1 gap-5" gap={0.06}>
          {t.principles.map((p, i) => {
            const last = i === t.principles.length - 1;
            const [num, ...rest] = p.q.split(' · ');
            return (
              <div key={p.q} className="relative grid grid-cols-[44px_1fr] gap-4 md:grid-cols-[56px_1fr] md:gap-6">
                {/* the path that connects the steps */}
                {!last && <span className="absolute bottom-[-22px] left-[21px] top-[48px] w-0 border-l-2 border-dashed border-sapphire md:left-[27px] md:top-[58px]" aria-hidden />}
                <span className={`flex size-11 items-center justify-center rounded-full border-2 border-sapphire font-display text-[20px] md:size-14 md:text-[24px] ${last ? TONE_BG[t.tone] : 'bg-panel'} text-quartz`}>{num}</span>
                <div className={`rounded-[14px] border border-sapphire p-5 md:p-6 ${last ? `${TONE_SOFT[t.tone]} shadow-[4px_4px_0_var(--border-strong)]` : 'bg-panel'}`}>
                  <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-slate">{rest.join(' · ')}</p>
                  <p className="mt-1.5 text-[19px] font-semibold leading-[1.4] text-quartz md:text-[21px]">{p.plain}</p>
                  <More>{p.a}</More>
                </div>
              </div>
            );
          })}
        </Stagger>
      </section>

      {/* How it works in Zoro */}
      <section className="border-y border-sapphire bg-elevated">
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">Inside Zoro</p>
            <h2 className="font-display mt-3 text-[32px] leading-[1.08] md:text-[44px]">
              What happens, <span className="tone-accent">step by step.</span>
            </h2>
          </Reveal>
          <Stagger className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2" gap={0.06} itemClassName="h-full">
            {t.flow.map((f, i) => (
              <div key={f.title} className="tabcard relative flex h-full flex-col overflow-hidden rounded-[14px] border border-sapphire bg-panel">
                <div className={`flex items-center justify-between border-b border-sapphire px-5 py-2.5 text-on-pastel ${TONE_SOFT[t.tone]}`}>
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em]">Step {i + 1} of {t.flow.length}</span>
                  <NumberBadge n={i + 1} tone={t.tone} />
                </div>
                <div className="flex-1 p-5 md:p-6">
                  <h3 className="text-[19px] font-semibold text-quartz">{f.title}</h3>
                  <p className="mt-2 text-[16px] leading-[1.6] text-mist">{f.plain}</p>
                  <More label="How exactly?">{f.body}</More>
                </div>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Records */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <Reveal>
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">For developers</p>
          <h2 className="font-display mt-3 text-[28px] leading-[1.1] md:text-[36px]">{t.records.title}</h2>
          <p className="mt-3 flex max-w-[720px] gap-2 text-[15.5px] leading-[1.6] text-ash">
            <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
            You don’t need this to use Zoro. It is the exact data Zoro writes, so anyone can check it independently.
          </p>
        </Reveal>
        <Reveal className="mt-8 overflow-x-auto rounded-[12px] border border-sapphire bg-panel">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead>
              <tr className={`${TONE_BG[t.tone]} text-on-pastel`}>
                <th className="border-b border-sapphire px-5 py-3 font-semibold">{t.records.head[0]}</th>
                <th className="border-b border-sapphire px-5 py-3 font-semibold">{t.records.head[1]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian">
              {t.records.rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-[13.5px] text-quartz">{k}</td>
                  <td className="px-5 py-3 text-ash">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* Used for + limits */}
      <section className={`${WRAP} grid grid-cols-1 gap-4 pb-16 md:grid-cols-2 md:pb-20`}>
        <Reveal className="rounded-[12px] border border-sapphire bg-panel p-6">
          <h2 className="text-[19px] font-semibold">Where you see it in Zoro</h2>
          <ul className="mt-4 space-y-3">
            {t.usedFor.map((u) => (
              <li key={u} className="flex gap-3 text-[15.5px] leading-[1.55] text-ash">
                <span className={`mt-2 size-2 shrink-0 rounded-full border border-sapphire ${TONE_BG[t.tone]}`} aria-hidden />
                {u}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.06} className="rounded-[12px] border border-sapphire bg-panel p-6">
          <h2 className="text-[19px] font-semibold">What it does not do</h2>
          <ul className="mt-4 space-y-3">
            {t.limits.map((u) => (
              <li key={u} className="flex gap-3 text-[15.5px] leading-[1.55] text-ash">
                <span className="mt-2 size-2 shrink-0 rounded-full border border-sapphire bg-panel" aria-hidden />
                {u}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Code + try it */}
      <section className="border-y border-sapphire bg-elevated">
        <div className={`${WRAP} grid grid-cols-1 gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-20`}>
          <div>
            <Reveal>
              <h2 className="font-display text-[28px] leading-[1.1] md:text-[36px]">Read the code</h2>
            </Reveal>
            <ul className="mt-6 divide-y divide-obsidian rounded-[12px] border border-sapphire bg-panel">
              {t.code.map((c) => (
                <li key={c.path}>
                  <a href={`${GITHUB_URL}/blob/main/${c.path}`} target="_blank" rel="noreferrer" className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-ink/[0.03]">
                    <FileCode className="mt-0.5 size-5 shrink-0 text-quartz" strokeWidth={1.6} aria-hidden />
                    <span className="min-w-0">
                      <span className="block break-all font-mono text-[13.5px] text-quartz">{c.path}</span>
                      <span className="mt-0.5 block text-[14.5px] text-ash">{c.what}</span>
                    </span>
                    <ArrowUpRight className="ml-auto size-4 shrink-0 text-ash" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Reveal>
              <h2 className="font-display text-[28px] leading-[1.1] md:text-[36px]">Try it</h2>
              <p className="mt-3 text-[16px] leading-[1.6] text-ash">See {t.name} doing its job inside Zoro.</p>
            </Reveal>
            <Reveal delay={0.06} className="mt-6">
              <TryIt id={id} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Other tracks */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-slate">The other tracks</p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {others.map((o) => (
            <Link key={o.id} href={HREF[o.id]} className="tabcard group block overflow-hidden rounded-[12px] border border-sapphire bg-panel">
              <div className="p-6">
                <Chip tone={o.tone}>{o.role}</Chip>
                <p className="mt-4 text-[22px] font-semibold">How Zoro uses {o.name}</p>
              </div>
              <div className={`card-foot flex items-center justify-between px-6 py-3 text-[14.5px] font-semibold ${TONE_BG[o.tone]}`}>
                Read the {o.name} track <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
