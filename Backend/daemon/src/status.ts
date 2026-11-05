import { config, ensAppUrl, hashscan, isEnsConfigured, isHederaConfigured, isWorldConfigured } from './config';
import { all, get, getSetting } from './db';
import { gateway } from './gateway/gateway';
import { mcpSessionCount } from './gateway/http';
import { auditorAccount, auditorKeySource } from './keys';
import { getPolicy } from './policy';
import { getLockdown } from './lockdown';
import { aiConfigured } from './sentinel/ai';
import { queueDepth } from './sentinel/runner';

export type ProtectionState = 'protected' | 'attention' | 'degraded' | 'observe' | 'not_configured' | 'lockdown';

export interface Dependency {
  id: 'auditor' | 'registry' | 'ledger' | 'human_seal' | 'gateway' | 'storage';
  label: string;
  state: 'ok' | 'degraded' | 'not_configured' | 'down';
  detail: string;
  link?: string;
}

export function dependencies(): Dependency[] {
  const deps: Dependency[] = [];
  const failedOutbox = get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'failed'")?.n ?? 0;
  const retrying = (k: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'retrying' AND kind LIKE ?", `${k}%`)?.n ?? 0;
  const q = queueDepth();
  deps.push({
    id: 'gateway',
    label: 'Gateway',
    state: 'ok',
    detail: `${[...gateway.upstreams.values()].filter((u) => u.status === 'online').length}/${gateway.upstreams.size} upstream server(s) online · ${mcpSessionCount()} client session(s)`,
  });
  deps.push({
    id: 'auditor',
    label: 'Sentinel auditor',
    state: aiConfigured() ? 'ok' : config.sentinel.requireAi ? 'degraded' : 'ok',
    detail: aiConfigured()
      ? `Deterministic + differential + AI review (${config.sentinel.model}) · ${q.running} running, ${q.queued} queued`
      : config.sentinel.requireAi
        ? 'AI review not configured: new versions without deterministic findings stay pending'
        : 'Development mode: seals are issued without the AI layer (recorded in every verdict package)',
  });
  if (!isEnsConfigured()) deps.push({ id: 'registry', label: 'ENSv2 registry', state: 'not_configured', detail: 'Seals are local only; set ZORO_ENS_ROOT and run pnpm setup:ens' });
  else {
    const failedChecks = get<{ n: number }>("SELECT COUNT(*) AS n FROM seals WHERE ens_check LIKE '%\"error\"%'")?.n ?? 0;
    const r = retrying('ens');
    deps.push({ id: 'registry', label: 'ENSv2 registry', state: failedChecks || r ? 'degraded' : 'ok', detail: `${config.ens.network} · ${config.ens.root}${r ? ` · ${r} write(s) retrying` : ''}${failedChecks ? ` · ${failedChecks} cached check(s) failing` : ''}`, link: ensAppUrl(config.ens.root) });
  }
  if (!isHederaConfigured()) deps.push({ id: 'ledger', label: 'Hedera ledger', state: 'not_configured', detail: 'Verdicts are not anchored; set HEDERA_OPERATOR_ID/KEY and run pnpm setup:hedera' });
  else {
    const lastOk = Number(getSetting('mirror:last_ok') ?? '0');
    const lastErr = getSetting('mirror:last_error');
    const stale = Date.now() - lastOk > config.hedera.pollSec * 1000 * 6;
    const r = retrying('h');
    deps.push({ id: 'ledger', label: 'Hedera ledger', state: stale || r ? 'degraded' : 'ok', detail: `${config.hedera.network} · topic ${config.hedera.registryTopic}${r ? ` · ${r} pending anchor(s)` : ''}${stale && lastErr ? ` · mirror: ${lastErr.split('|')[1]}` : ''}`, link: hashscan('topic', config.hedera.registryTopic) });
  }
  deps.push(
    isWorldConfigured()
      ? { id: 'human_seal', label: 'Human Seal (World ID)', state: 'ok', detail: config.world.environment === 'production' ? 'production' : 'staging — test identities (World ID Simulator); not production identity assurance' }
      : { id: 'human_seal', label: 'Human Seal (World ID)', state: 'not_configured', detail: 'Actions that need a Human Seal cannot proceed until World ID is configured' },
  );
  if (failedOutbox) deps.push({ id: 'ledger', label: 'Onchain writes', state: 'degraded', detail: `${failedOutbox} write(s) failed permanently; retry from Settings → Networks` });
  if (config.ephemeralStorage)
    deps.push({
      id: 'storage',
      label: 'Local records',
      state: 'degraded',
      detail: 'This instance runs on a disk that is wiped on every restart or redeploy: local seals, audits, incidents, approvals, queued onchain writes and the audit log start over. Verdicts already anchored on Hedera are re-read from the ledger.',
    });
  return deps;
}

export function protectionStatus() {
  const servers = all<{ mode: string; lab: number }>('SELECT mode, lab FROM servers WHERE lab = 0');
  const observe = servers.filter((s) => s.mode === 'observe').length;
  const openCritical = get<{ n: number }>("SELECT COUNT(*) AS n FROM incidents WHERE lab = 0 AND status = 'open' AND severity IN ('critical','high')")?.n ?? 0;
  const pendingApprovals = get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE lab = 0 AND status = 'pending' AND expires_at > ?", Date.now())?.n ?? 0;
  const deps = dependencies();
  const degraded = deps.filter((d) => d.state === 'degraded' || d.state === 'down');
  let state: ProtectionState;
  let headline: string;
  const lock = getLockdown();
  if (lock) {
    state = 'lockdown';
    headline = `Lockdown: every agent is frozen (${lock.source === 'org' ? `by ${lock.orgName ?? 'your organization'}` : `by ${lock.by}`})`;
  } else if (servers.length === 0) {
    state = 'not_configured';
    headline = 'No servers protected yet';
  } else if (observe) {
    state = 'observe';
    headline = `Observe mode active on ${observe} server(s): recording only, not blocking`;
  } else if (openCritical || pendingApprovals) {
    state = 'attention';
    headline = [openCritical ? `${openCritical} urgent incident(s)` : '', pendingApprovals ? `${pendingApprovals} approval(s) waiting` : ''].filter(Boolean).join(' · ');
  } else if (degraded.length) {
    state = 'degraded';
    headline = `Degraded: ${degraded.map((d) => d.label).join(', ')}`;
  } else {
    state = 'protected';
    headline = `Protecting ${servers.length} server(s)`;
  }
  return { state, headline, observe, openCritical, pendingApprovals, dependencies: deps, environment: environment(), lockdown: lock };
}

export function environment() {
  return {
    ens: isEnsConfigured() ? `${config.ens.network}` : 'not configured',
    hedera: isHederaConfigured() ? config.hedera.network : 'not configured',
    world: isWorldConfigured() ? config.world.environment : 'not configured',
    testIdentities: config.world.environment !== 'production',
    labActive: (get<{ n: number }>('SELECT COUNT(*) AS n FROM servers WHERE lab = 1')?.n ?? 0) > 0,
    policyProfile: getPolicy().profile,
    auditor: auditorAccount.address,
    auditorKeySource,
    requireAi: config.sentinel.requireAi,
    ephemeralStorage: config.ephemeralStorage,
  };
}

/** Measured verification overhead of allowed calls (excludes the upstream server's own latency). */
export function performanceStats(hours = 24) {
  const rows = all<{ overhead_ms: number }>("SELECT overhead_ms FROM calls WHERE decision = 'allow' AND outcome = 'executed' AND overhead_ms IS NOT NULL AND ts > ? ORDER BY overhead_ms", Date.now() - hours * 3_600_000);
  if (!rows.length) return { samples: 0, p50: null, p95: null, max: null };
  const at = (p: number) => rows[Math.min(rows.length - 1, Math.floor(p * rows.length))].overhead_ms;
  return { samples: rows.length, p50: at(0.5), p95: at(0.95), max: rows[rows.length - 1].overhead_ms };
}
