import { randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { normalize } from 'viem/ens';
import { actionDigest, ensNamesFor, parseDefinitionsInput, slugLabel, type Definition } from '@zoro/core';
import { appendLog } from './auditlog';
import { createApproval, registerApprovalExecutor } from './approvals';
import { config, isEnsConfigured } from './config';
import { all, get, json, run } from './db';
import { grantPublisherKeys, publicClient, resolverForNamespace } from '@zoro/blockchain/ens';
import { publishEvent } from './registry/outbox';
import { requestAudit } from './sentinel/runner';

export type ClaimMethod = 'dns' | 'github' | 'npm' | 'ens';

export interface NamespaceRow {
  label: string;
  created_at: number;
  method: ClaimMethod;
  target: string;
  challenge: string;
  status: 'awaiting_proof' | 'proof_verified' | 'verified' | 'contested' | 'failed';
  proof: string | null;
  human_seal_id: string | null;
  verified_at: number | null;
  publisher: string | null;
  ledger_ref: string | null;
  error: string | null;
}

export function instructionsFor(method: ClaimMethod, target: string, challenge: string) {
  switch (method) {
    case 'dns':
      return `Add a DNS TXT record at _zoro.${target} with the value: zoro-claim=${challenge}`;
    case 'github':
      return `Commit a file at .well-known/zoro-claim.txt in ${target} (default branch) containing: ${challenge}`;
    case 'npm':
      return `Publish a version of ${target} whose package.json contains: "zoroClaim": "${challenge}"`;
    case 'ens':
      return `Set the text record zoro.claim on ${target} (${config.ens.network}) to: ${challenge}`;
  }
}

export function startClaim(input: { label: string; method: ClaimMethod; target: string; publisher: string | null }) {
  const label = slugLabel(input.label);
  const target = input.target.trim();
  if (!target) throw new Error('A target (domain, owner/repo, package or ENS name) is required');
  if (input.method === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(target)) throw new Error('GitHub target must be owner/repo');
  if (input.publisher && !/^0x[0-9a-fA-F]{40}$/.test(input.publisher)) throw new Error('Publisher address must be an Ethereum address');
  const existing = get<NamespaceRow>('SELECT * FROM namespaces WHERE label = ?', label);
  if (existing?.status === 'verified' && existing.target !== target) {
    run("UPDATE namespaces SET status = 'contested' WHERE label = ?", label);
    publishEvent('registry', { v: 1, type: 'namespace.contested', ref: label, reason: `second claim via ${input.method}`, ts: new Date().toISOString() }, null);
    appendLog('namespace', `Namespace ${label} contested: a second claim was made`, { method: input.method }, label);
    throw new Error('This namespace is already claimed by a different proof. Both claims are now shown as contested until resolved.');
  }
  const challenge = `zoro-${randomBytes(12).toString('hex')}`;
  run(
    `INSERT INTO namespaces(label, created_at, method, target, challenge, status, publisher) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(label) DO UPDATE SET method = excluded.method, target = excluded.target, challenge = excluded.challenge, status = 'awaiting_proof', publisher = excluded.publisher, error = NULL`,
    label, Date.now(), input.method, target, challenge, 'awaiting_proof', input.publisher,
  );
  appendLog('namespace', `Namespace claim started: ${label} via ${input.method}`, { target }, label);
  return { label, challenge, instructions: instructionsFor(input.method, target, challenge) };
}

async function checkProof(ns: NamespaceRow): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (ns.method) {
      case 'dns': {
        const recs = (await resolveTxt(`_zoro.${ns.target}`)).map((r) => r.join(''));
        return recs.includes(`zoro-claim=${ns.challenge}`) ? { ok: true, detail: `TXT _zoro.${ns.target} matches` } : { ok: false, detail: `TXT records found: ${recs.length ? recs.join(', ') : 'none'}` };
      }
      case 'github': {
        const r = await fetch(`https://raw.githubusercontent.com/${ns.target}/HEAD/.well-known/zoro-claim.txt`, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return { ok: false, detail: `GitHub returned ${r.status} for .well-known/zoro-claim.txt` };
        return (await r.text()).trim().includes(ns.challenge) ? { ok: true, detail: `${ns.target}/.well-known/zoro-claim.txt matches` } : { ok: false, detail: 'file found but the challenge does not match' };
      }
      case 'npm': {
        const r = await fetch(`https://registry.npmjs.org/${ns.target.replace('/', '%2F')}/latest`, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return { ok: false, detail: `npm registry returned ${r.status}` };
        const p = (await r.json()) as { zoroClaim?: string; version?: string };
        return p.zoroClaim === ns.challenge ? { ok: true, detail: `${ns.target}@${p.version} carries the claim` } : { ok: false, detail: `latest version ${p.version ?? '?'} has no matching zoroClaim field` };
      }
      case 'ens': {
        const v = await publicClient().getEnsText({ name: normalize(ns.target), key: 'zoro.claim' });
        return v === ns.challenge ? { ok: true, detail: `${ns.target} zoro.claim matches` } : { ok: false, detail: `zoro.claim is ${v ?? 'unset'}` };
      }
    }
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Verify the proof; then a Human Seal is required before the claim takes effect (§4.16). */
export async function verifyClaim(label: string) {
  const ns = get<NamespaceRow>('SELECT * FROM namespaces WHERE label = ?', label);
  if (!ns) throw new Error('no claim for this namespace');
  const r = await checkProof(ns);
  if (!r.ok) {
    run('UPDATE namespaces SET error = ? WHERE label = ?', r.detail, label);
    return { ok: false, detail: r.detail, approval: null };
  }
  run("UPDATE namespaces SET status = 'proof_verified', proof = ?, error = NULL WHERE label = ?", r.detail, label);
  const approval = createApproval({
    kind: 'namespace_claim',
    digest: actionDigest({ kind: 'namespace_claim', requestId: ns.challenge, detail: { label, method: ns.method, target: ns.target, publisher: ns.publisher } }),
    action: { label },
    summary: `Claim namespace ${label} (${ns.method}: ${ns.target})`,
    reason: 'Claiming a namespace affects trust for every user of this server, so it requires a fresh Human Seal.',
    humanSeal: true,
    windowSec: 3600,
  });
  return { ok: true, detail: r.detail, approval };
}

registerApprovalExecutor('namespace_claim', async (a) => {
  const { label } = json<{ label: string }>(a.action, { label: '' });
  const ns = get<NamespaceRow>('SELECT * FROM namespaces WHERE label = ?', label);
  if (!ns || ns.status !== 'proof_verified') return 'claim no longer pending';
  const hs = json<{ humanSeals?: string[] }>(a.evidence, {}).humanSeals?.[0] ?? null;
  run("UPDATE namespaces SET status = 'verified', verified_at = ?, human_seal_id = ? WHERE label = ?", Date.now(), hs, label);
  run('UPDATE servers SET publisher_verified = 1 WHERE label = ?', label);
  publishEvent('registry', { v: 1, type: 'namespace.claimed', ref: label, outcome: ns.method, ts: new Date().toISOString() }, { kind: 'namespace', id: label });
  appendLog('namespace', `Namespace ${label} claimed by publisher (${ns.method})`, { target: ns.target }, label);
  if (ns.publisher && isEnsConfigured() && config.ens.operatorKey) {
    try {
      await grantPublisherKeys(resolverForNamespace(label) as `0x${string}`, ns.publisher as `0x${string}`);
    } catch (e) {
      run('UPDATE namespaces SET error = ? WHERE label = ?', `ENS publisher role grant failed: ${(e as Error).message}`, label);
    }
  }
  return 'namespace claimed';
});

/** Pre-release audit: users' gateways recognize a sealed fingerprint the moment it appears (no quarantine). */
export function submitRelease(input: { namespace: string; version: string | null; manifest: string }) {
  const label = slugLabel(input.namespace);
  const defs = parseDefinitionsInput(input.manifest);
  if (!defs.length) throw new Error('The manifest contains no definitions (expected a tools/list result or a definition object).');
  if (defs.length > 200) throw new Error('At most 200 definitions per release');
  const auditIds = defs.map(({ kind, definition }) => {
    const prev = get<{ fingerprint: string; audit_id: string }>(
      "SELECT fingerprint, audit_id FROM seals WHERE server_label = ? AND name = ? AND kind = ? AND verdict IN ('sealed','sealed_with_warnings') AND status IN ('active','superseded') AND lab = 0 ORDER BY audited_at DESC LIMIT 1",
      label, definition.name, kind,
    );
    const prevDef = prev ? json<Definition | null>(get<{ definition: string }>('SELECT definition FROM audits WHERE id = ?', prev.audit_id)?.definition, null) : null;
    return requestAudit({
      kind, definition, previous: prev && prevDef ? { definition: prevDef, fingerprint: prev.fingerprint } : null,
      serverName: label, declaredServerName: label, declaredServerVersion: input.version, artifactId: null, transport: 'publisher',
      manifestRoot: null, otherTools: [], lab: false, serverId: null, trigger: 'pre_release', source: 'publisher',
    });
  });
  const id = randomUUID();
  run('INSERT INTO releases(id, created_at, namespace, version, manifest, audit_ids, status) VALUES(?,?,?,?,?,?,?)', id, Date.now(), label, input.version, input.manifest, JSON.stringify(auditIds), 'auditing');
  appendLog('namespace', `Pre-release audit submitted for ${label}${input.version ? `@${input.version}` : ''} (${defs.length} definition(s))`, { auditIds }, id);
  return { id, auditIds };
}

export function releaseHistory(label: string) {
  const versions = all<{ fingerprint: string; name: string; kind: string; verdict: string; status: string; risk: number; audited_at: number; ens_name: string | null; ledger_seq: number | null; badge_serial: number | null }>(
    'SELECT fingerprint, name, kind, verdict, status, risk, audited_at, ens_name, ledger_seq, badge_serial FROM seals WHERE server_label = ? AND lab = 0 ORDER BY audited_at DESC', label,
  );
  // Deployment counts are aggregate sightings on this gateway only — never who runs them.
  return versions.map((v) => ({ ...v, sightings: get<{ n: number }>('SELECT COUNT(DISTINCT server_id) AS n FROM versions WHERE fingerprint = ?', v.fingerprint)?.n ?? 0 }));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** README badge computed from the live seal state of the tool's current version. */
export function badgeSvg(label: string, tool: string) {
  const s = get<{ verdict: string; status: string; fingerprint: string }>("SELECT verdict, status, fingerprint FROM seals WHERE server_label = ? AND name = ? AND lab = 0 AND status != 'superseded' ORDER BY audited_at DESC LIMIT 1", slugLabel(label), tool);
  const state = !s ? 'not audited' : s.status === 'revoked' ? 'revoked' : s.status === 'expired' ? 'expired' : s.verdict === 'sealed' ? 'sealed' : s.verdict === 'sealed_with_warnings' ? 'sealed · warnings' : s.verdict === 'unsafe' ? 'unsafe' : 'pending';
  const color = { sealed: '#2f9e6b', 'sealed · warnings': '#b7861b', unsafe: '#c2413b', revoked: '#c2413b', expired: '#6b7280', pending: '#6b7280', 'not audited': '#6b7280' }[state];
  const left = 'zoro';
  const lw = 40;
  const rw = 8 + state.length * 6.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${esc(state)}"><title>${left}: ${esc(state)}${s ? ` (${s.fingerprint.slice(0, 10)}…)` : ''}</title><rect width="${lw}" height="20" fill="#12244f"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14" text-anchor="middle">${left}</text><text x="${lw + rw / 2}" y="14" text-anchor="middle">${esc(state)}</text></g></svg>`;
}

export function ensNameForTool(label: string, tool: string) {
  if (!config.ens.root) return null;
  return ensNamesFor(config.ens.root, label, tool, '0x00000000').tool;
}
