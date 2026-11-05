'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CircleSlash, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle } from 'lucide-react';
import { createPublicClient, http, keccak256, parseAbi, recoverMessageAddress, stringToHex, type Hex } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import { AUDITOR_KEYS, attestationMessage, fingerprintDefinition, parseDefinitionsInput, verdictHash, type VerdictPackage } from '@zoro/core';
import { Badge, Button, Card, CodeBlock, Notice, cx, inputCls } from '@/components/ui';
import { CapabilityChips, FindingList } from '@/components/security';
import { PageIntro } from '@/components/site';
import { api } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

type StepState = 'pending' | 'running' | 'pass' | 'fail' | 'skip' | 'warn';
interface Step {
  id: string;
  title: string;
  state: StepState;
  detail: string;
  source?: { label: string; href: string };
}

interface VerifyContext {
  auditor: string;
  canonicalizationVersion: string;
  ens: { network: 'sepolia' | 'mainnet'; root: string; rootResolver: string; rpcUrl: string; explorer: string } | null;
  hedera: { network: string; registryTopic: string; labTopic: string | null; badgeToken: string | null; mirror: string } | null;
}

interface VerdictResponse {
  found: boolean;
  seal: { fingerprint: string; ens_name: string | null; verdict: string; status: string; badge_token: string | null; badge_serial: number | null; ledger_topic: string | null; ledger_seq: number | null; lab: number; name: string; server_label: string } | null;
  package: VerdictPackage | null;
  definition: Record<string, unknown> | null;
}

const STEPS: Omit<Step, 'state' | 'detail'>[] = [
  { id: 'fingerprint', title: 'Recompute the fingerprint from the raw definition' },
  { id: 'ens', title: 'Resolve the ENS name and read the seal records' },
  { id: 'role', title: 'Check the records were written by the Auditor role' },
  { id: 'attestation', title: 'Verify the attestation signature' },
  { id: 'ledger', title: 'Find the matching Hedera ledger message' },
  { id: 'revocation', title: 'Check for later revocations and disputes' },
  { id: 'badge', title: 'Check the badge token' },
];

const resolverAbi = parseAbi(['function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)']);
const ROLE_SET_TEXT = 1n << 4n;

function StepIcon({ s }: { s: StepState }) {
  if (s === 'pass') return <CheckCircle2 className="size-5 text-ok" aria-label="passed" />;
  if (s === 'fail') return <XCircle className="size-5 text-danger" aria-label="failed" />;
  if (s === 'warn') return <ShieldAlert className="size-5 text-warn" aria-label="warning" />;
  if (s === 'running') return <Loader2 className="size-5 animate-spin text-frosted" aria-label="running" />;
  if (s === 'skip') return <CircleSlash className="size-5 text-slate" aria-label="not available" />;
  return <span className="block size-5 rounded-full border border-obsidian" aria-label="waiting" />;
}

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(params.get('q') ?? '');
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ state: 'verified' | 'not_sealed' | 'revoked' | 'inconsistent' | 'unverifiable'; text: string } | null>(null);
  const [pkg, setPkg] = useState<VerdictPackage | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (id: string, patch: Partial<Step>) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const run = useCallback(async (raw: string) => {
    setError(null);
    setSummary(null);
    setPkg(null);
    const q = raw.trim();
    if (!q) return;
    setRunning(true);
    setSteps(STEPS.map((s) => ({ ...s, state: 'pending', detail: '' })));
    const contradictions: string[] = [];
    let revoked = false;
    try {
      const ctx = await api<VerifyContext>('/api/public/verify-context');
      // 1. Recompute from a pasted definition, entirely in this browser.
      let fp: string | null = null;
      let pastedFp: string | null = null;
      if (q.startsWith('{') || q.startsWith('[')) {
        set('fingerprint', { state: 'running' });
        const defs = parseDefinitionsInput(q);
        if (!defs.length) throw new Error('No definition found in the pasted JSON.');
        pastedFp = fingerprintDefinition(defs[0].kind, defs[0].definition);
        fp = pastedFp;
        set('fingerprint', { state: 'pass', detail: `Computed in your browser with ${ctx.canonicalizationVersion}: ${pastedFp}${defs.length > 1 ? ` (first of ${defs.length} definitions)` : ''}. The definition never left this page.` });
      } else {
        set('fingerprint', { state: 'skip', detail: 'No raw definition pasted. Paste the tool definition from the server to recompute its fingerprint here.' });
        const look = await api<{ fingerprint: string | null; ens?: string | null }>(`/api/public/lookup?q=${encodeURIComponent(q)}`);
        fp = look.fingerprint;
        if (!fp && look.ens && ctx.ens) {
          // Resolve the fingerprint straight from ENS for names this auditor does not know.
          const client = createPublicClient({ chain: ctx.ens.network === 'mainnet' ? mainnet : sepolia, transport: http(ctx.ens.rpcUrl) });
          fp = (await client.getEnsText({ name: normalize(look.ens), key: 'zoro.fingerprint' }).catch(() => null)) ?? null;
        }
      }
      if (!fp) {
        setSummary({ state: 'not_sealed', text: 'No seal exists for this identifier on this registry.' });
        setSteps((p) => p.map((s) => (s.state === 'pending' ? { ...s, state: 'skip', detail: 'Nothing to check.' } : s)));
        return;
      }
      const v = await api<VerdictResponse>(`/api/public/verdict/${fp}`).catch(() => ({ found: false, seal: null, package: null, definition: null }) as VerdictResponse);
      if (!v.found || !v.package) {
        setSummary({ state: 'not_sealed', text: `Fingerprint ${shortHash(fp)} has never been audited by this registry.` });
        setSteps((p) => p.map((s) => (s.state === 'pending' ? { ...s, state: 'skip', detail: 'No verdict exists for this fingerprint.' } : s)));
        return;
      }
      setPkg(v.package);
      router.replace(`/verify?q=${fp}`, { scroll: false });
      if (pastedFp && pastedFp !== v.package.fingerprint) contradictions.push('pasted definition does not match the sealed fingerprint');

      // 2–3. ENS records and the Auditor role, read directly from the chain.
      let records: Record<string, string | null> = {};
      if (!ctx.ens || !v.seal?.ens_name) {
        set('ens', { state: 'skip', detail: ctx.ens ? 'This version has no ENS record (private or not yet published).' : 'This Zoro instance has no ENSv2 registry configured; the seal is local only.' });
        set('role', { state: 'skip', detail: 'No registry record to check.' });
      } else {
        set('ens', { state: 'running' });
        const client = createPublicClient({ chain: ctx.ens.network === 'mainnet' ? mainnet : sepolia, transport: http(ctx.ens.rpcUrl) });
        const name = normalize(v.seal.ens_name);
        const entries = await Promise.all(AUDITOR_KEYS.map(async (k) => [k, await client.getEnsText({ name, key: k }).catch(() => null)] as const));
        records = Object.fromEntries(entries);
        const appUrl = `${ctx.ens.network === 'mainnet' ? 'https://app.ens.domains' : 'https://sepolia.app.ens.domains'}/${name}`;
        if (!records['zoro.fingerprint']) set('ens', { state: 'warn', detail: `${name} has no records yet (the registry write may still be pending).`, source: { label: 'ENS app', href: appUrl } });
        else {
          const mism = [records['zoro.fingerprint'] !== v.package.fingerprint && 'fingerprint', records['zoro.verdict'] !== v.package.verdict && 'verdict'].filter(Boolean);
          if (mism.length) contradictions.push(`ENS ${mism.join(' and ')} differ from the verdict package`);
          if (records['zoro.status'] === 'revoked') revoked = true;
          set('ens', { state: mism.length ? 'fail' : 'pass', detail: `${name}: verdict ${records['zoro.verdict']}, status ${records['zoro.status']}, risk ${records['zoro.risk']}, audited ${records['zoro.audited']}, expires ${records['zoro.expires']}.`, source: { label: 'ENS app', href: appUrl } });
        }
        set('role', { state: 'running' });
        const resolver = await client.getEnsResolver({ name }).catch(() => null);
        const writer = records['zoro.auditor'] ?? v.package.attestation?.auditor;
        if (!resolver || !writer) set('role', { state: 'warn', detail: 'Could not determine the resolver or the auditor address.' });
        else {
          const ok = await client.readContract({ address: resolver, abi: resolverAbi, functionName: 'hasRoles', args: [BigInt(keccak256(stringToHex('zoro.verdict'))), ROLE_SET_TEXT, writer as Hex] }).catch(() => null);
          if (ok === false) contradictions.push('the auditor address does not hold the Auditor role on the resolver');
          set('role', { state: ok ? 'pass' : ok === false ? 'fail' : 'warn', detail: ok ? `${writer} holds ROLE_SET_TEXT for zoro.verdict on resolver ${resolver}.` : ok === false ? `${writer} does not hold the Auditor role on ${resolver}.` : 'The role check call failed.', source: { label: 'Resolver', href: `${ctx.ens.explorer}/address/${resolver}` } });
        }
      }

      // 4. Attestation: recompute the verdict hash here and recover the signer.
      set('attestation', { state: 'running' });
      const att = v.package.attestation;
      if (!att) {
        set('attestation', { state: 'fail', detail: 'The verdict package carries no attestation.' });
        contradictions.push('missing attestation');
      } else {
        const h = verdictHash(v.package);
        const signer = await recoverMessageAddress({ message: attestationMessage(att.verdictHash), signature: att.signature as Hex }).catch(() => null);
        const hashOk = h === att.verdictHash;
        const sigOk = Boolean(signer && signer.toLowerCase() === att.auditor.toLowerCase());
        const ensOk = !records['zoro.verdictHash'] || records['zoro.verdictHash'] === h;
        if (!hashOk || !sigOk || !ensOk) contradictions.push('attestation does not verify');
        set('attestation', { state: hashOk && sigOk && ensOk ? 'pass' : 'fail', detail: `Verdict hash recomputed in your browser: ${shortHash(h, 10, 6)} (${hashOk ? 'matches' : 'DOES NOT match'} the attestation${records['zoro.verdictHash'] ? `; ${ensOk ? 'matches' : 'does not match'} ENS` : ''}). Signer recovered: ${signer ?? 'invalid signature'} (${sigOk ? 'matches' : 'does not match'} ${att.auditor}).` });
      }

      // 5–6. Ledger message and later events, straight from the Hedera mirror node.
      const ledgerRef = records['zoro.ledger']?.match(/^hedera:\w+:(\d+\.\d+\.\d+):(\d+)$/);
      const topic = ledgerRef?.[1] ?? v.seal?.ledger_topic ?? null;
      const seq = ledgerRef ? Number(ledgerRef[2]) : v.seal?.ledger_seq ?? null;
      if (!ctx.hedera || !topic || !seq) {
        set('ledger', { state: 'skip', detail: ctx.hedera ? 'This verdict has not been anchored on the ledger yet.' : 'This Zoro instance has no Hedera ledger configured.' });
        set('revocation', { state: 'skip', detail: 'No ledger to check.' });
      } else {
        set('ledger', { state: 'running' });
        const msg = await fetch(`${ctx.hedera.mirror}/api/v1/topics/${topic}/messages/${seq}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const url = `https://hashscan.io/${ctx.hedera.network}/topic/${topic}/message/${seq}`;
        if (!msg) set('ledger', { state: 'fail', detail: `Message ${topic} #${seq} was not found on the mirror node.`, source: { label: 'HashScan', href: url } });
        else {
          const body = JSON.parse(atob(msg.message)) as { fp?: string; verdict?: string; verdictHash?: string };
          const ok = body.fp === v.package.fingerprint && body.verdictHash === att?.verdictHash;
          if (!ok) contradictions.push('ledger message does not match the verdict');
          set('ledger', { state: ok ? 'pass' : 'fail', detail: `${topic} #${seq}, consensus ${fmtDate(msg.consensus_timestamp)}: ${body.verdict} for ${shortHash(body.fp ?? '')} (${ok ? 'matches' : 'does not match'}).`, source: { label: 'HashScan', href: url } });
        }
        set('revocation', { state: 'running' });
        const later: { type: string; seq: number }[] = [];
        let next: string | null = `/api/v1/topics/${topic}/messages?order=asc&limit=100&sequencenumber=gt:${seq}`;
        for (let page = 0; next && page < 5; page++) {
          const r: { messages: { message: string; sequence_number: number }[]; links?: { next: string | null } } | null = await fetch(`${ctx.hedera.mirror}${next}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
          if (!r) break;
          for (const m of r.messages) {
            try {
              const b = JSON.parse(atob(m.message)) as { type: string; fp?: string };
              if (b.fp === v.package.fingerprint) later.push({ type: b.type, seq: m.sequence_number });
            } catch {
              /* not a Zoro message */
            }
          }
          next = r.links?.next ?? null;
        }
        if (later.some((l) => l.type === 'seal.revoked')) revoked = true;
        const disputes = later.filter((l) => l.type.startsWith('dispute.'));
        set('revocation', { state: revoked ? 'fail' : disputes.length ? 'warn' : 'pass', detail: later.length ? later.map((l) => `#${l.seq} ${l.type}`).join(', ') : 'No later revocation or dispute on the ledger.' });
      }

      // 7. Badge
      if (!ctx.hedera || !v.seal?.badge_token || !v.seal.badge_serial) set('badge', { state: 'skip', detail: 'No badge was minted for this version.' });
      else {
        const nft = await fetch(`${ctx.hedera.mirror}/api/v1/tokens/${v.seal.badge_token}/nfts/${v.seal.badge_serial}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const meta = nft ? atob(nft.metadata) : null;
        const ok = nft && !nft.deleted && meta === v.package.fingerprint;
        if (nft?.deleted) revoked = true;
        set('badge', { state: ok ? 'pass' : nft?.deleted ? 'fail' : 'warn', detail: nft ? `${v.seal.badge_token} #${v.seal.badge_serial}: ${nft.deleted ? 'burned (revoked)' : 'active'}, metadata ${meta === v.package.fingerprint ? 'matches' : 'does not match'} the fingerprint.` : 'Badge not found.', source: { label: 'HashScan', href: `https://hashscan.io/${ctx.hedera.network}/token/${v.seal.badge_token}/${v.seal.badge_serial}` } });
      }

      const localOnly = !ctx.ens && !ctx.hedera;
      if (contradictions.length) setSummary({ state: 'inconsistent', text: `Inconsistent: ${contradictions.join('; ')}.` });
      else if (revoked || v.seal?.status === 'revoked') setSummary({ state: 'revoked', text: 'This version was sealed, and the seal was later revoked.' });
      else if (v.package.verdict === 'sealed' || v.package.verdict === 'sealed_with_warnings') setSummary({ state: localOnly ? 'unverifiable' : 'verified', text: localOnly ? 'The attestation verifies, but this instance publishes nothing publicly, so the seal cannot be checked against a public record.' : `Verified: ${v.package.verdict.replace(/_/g, ' ')} by ${att?.auditor}.` });
      else setSummary({ state: 'not_sealed', text: `Not sealed: Sentinel’s verdict is “${v.package.verdict}”.` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setSteps((p) => p.map((s) => (s.state === 'pending' || s.state === 'running' ? { ...s, state: 'skip', detail: s.detail || 'Not reached.' } : s)));
    }
  }, [router]);

  useEffect(() => {
    const q = params.get('q');
    if (q) void run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const SummaryIcon = summary?.state === 'verified' ? ShieldCheck : summary?.state === 'revoked' || summary?.state === 'inconsistent' ? ShieldAlert : ShieldQuestion;
  const tone = summary?.state === 'verified' ? 'ok' : summary?.state === 'revoked' || summary?.state === 'inconsistent' ? 'danger' : 'warn';
  const shareUrl = useMemo(() => (pkg && typeof window !== 'undefined' ? `${window.location.origin}/verify?q=${pkg.fingerprint}` : null), [pkg]);

  return (
    <div className="relative">
      <div className="aurora-top pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="relative mx-auto max-w-[960px] px-4 py-16 sm:px-6">
        <PageIntro eyebrow="Zoro Verify" a="Check a seal" b="from first principles" />
        <p className="mt-4 max-w-2xl text-[17px] font-light text-mist">No account, no trust in Zoro. Each step runs in your browser against the public source and links to it. Pasted definitions never leave this page.</p>
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            void run(input);
          }}
        >
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={input.trim().startsWith('{') ? 8 : 2} placeholder="ENS name, fingerprint (0x…), Hedera reference (0.0.123#4), badge (0.0.456/7), or paste a raw tool definition JSON" className={cx(inputCls, 'h-auto py-3 font-mono text-[13px]')} aria-label="What to verify" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={running}>
              Verify
            </Button>
            {shareUrl && (
              <span className="text-[13px] text-ash">
                Shareable link:{' '}
                <a className="font-mono text-frosted" href={shareUrl}>
                  {shareUrl}
                </a>
              </span>
            )}
          </div>
        </form>
        {error && <Notice tone="danger" title="Verification could not run" className="mt-6">{error}</Notice>}
        {summary && (
          <Card className={cx('mt-8 flex items-start gap-4 p-5', tone === 'ok' ? 'border-ok/30' : tone === 'danger' ? 'border-danger/40' : 'border-warn/30')}>
            <SummaryIcon className={cx('size-8 shrink-0', tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-warn')} aria-hidden />
            <div>
              <p className="text-[18px] font-medium">{summary.state === 'verified' ? 'Verified' : summary.state === 'revoked' ? 'Revoked' : summary.state === 'inconsistent' ? 'Inconsistent' : summary.state === 'unverifiable' ? 'Not publicly verifiable' : 'Not sealed'}</p>
              <p className="mt-1 text-[15px] text-mist">{summary.text}</p>
            </div>
          </Card>
        )}
        {steps.length > 0 && (
          <Card className="mt-4">
            <ol className="divide-y divide-inkline">
              {steps.map((s, i) => (
                <li key={s.id} className="flex gap-4 px-5 py-4">
                  <StepIcon s={s.state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-quartz">
                      {i + 1}. {s.title}
                    </p>
                    {s.detail && <p className="mt-1 break-words text-[13px] text-ash">{s.detail}</p>}
                    {s.source && (
                      <a href={s.source.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[13px] text-frosted hover:text-quartz">
                        Source: {s.source.label} ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
        {pkg && (
          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[16px] font-medium">
                {pkg.serverIdentity.namespace}/{pkg.name}
              </p>
              {pkg.lab && <Badge tone="violet">Attack Lab record</Badge>}
              <Badge tone="neutral">risk {pkg.riskScore}</Badge>
              <Badge tone="neutral">{pkg.changeClass.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="mt-3">
              <CapabilityChips capabilities={pkg.capabilityProfile.map((c) => c.capability)} />
            </div>
            {pkg.aiSummary && <p className="mt-3 text-[14px] font-light text-mist">{pkg.aiSummary}</p>}
            {pkg.pendingReason && <Notice tone="warn" className="mt-3">{pkg.pendingReason}</Notice>}
            <div className="mt-4">
              <FindingList findings={pkg.findings} />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] text-frosted">Full verdict package</summary>
              <CodeBlock className="mt-2" code={JSON.stringify(pkg, null, 2)} filename="verdict-package.json" />
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
