import { severityRank, type Severity } from '@zoro/core';
import { all, json, run } from './db';
import { raiseIncident } from './incidents';
import { osvQuery, remoteChecksEnabled, type Ecosystem, type Vuln } from './packages';
import { getPin } from './pins';

/**
 * Recall checker: every protected server's package and version is checked against OSV.dev (free, no key; results
 * cached for 12 hours). Findings show as a "Known CVE" badge with the fixed version, and Strict policy can block
 * servers with critical vulnerabilities. Optional: only the package name and version leave the machine.
 */

interface ServerPkg {
  ecosystem: Ecosystem;
  name: string;
  version: string;
}

/** Packages behind a server: installed files (name@version from package.json), a pinned runner spec, or a pinned uvx spec. */
export function serverPackages(serverId: string): ServerPkg[] {
  const row = all<{ artifact_detail: string | null; command: string | null; args: string | null }>('SELECT artifact_detail, command, args FROM servers WHERE id = ?', serverId)[0];
  if (!row) return [];
  const out = new Map<string, ServerPkg>();
  const add = (ecosystem: Ecosystem, spec: string) => {
    const m = spec.match(/^(@?[^@]+)@(\d[\w.+-]*)$/);
    if (m) out.set(`${ecosystem}:${m[1]}`, { ecosystem, name: m[1], version: m[2] });
  };
  const detail = json<{ files?: { package: string | null }[]; packageSpecs?: string[] }>(row.artifact_detail, {});
  for (const f of detail.files ?? []) if (f.package) add('npm', f.package);
  const pin = getPin(serverId);
  if (pin) add('npm', `${pin.name}@${pin.version}`);
  const cmd = (row.command ?? '').toLowerCase();
  if (/(^|[\\/])uvx(\.exe)?$/.test(cmd)) {
    const spec = json<string[]>(row.args, []).find((a) => !a.startsWith('-'));
    const m = spec?.match(/^([A-Za-z0-9][\w.-]*)==([\w.]+)$/);
    if (m) out.set(`pypi:${m[1]}`, { ecosystem: 'pypi', name: m[1], version: m[2] });
  }
  return [...out.values()];
}

export async function checkServerVulns(serverId: string) {
  if (!remoteChecksEnabled()) return [];
  const found: (Vuln & { package: string })[] = [];
  for (const p of serverPackages(serverId)) {
    const vulns = await osvQuery(p.ecosystem, p.name, p.version).catch(() => null);
    if (!vulns) continue;
    run('INSERT INTO server_vulns(server_id, package, ecosystem, vulns, checked_at) VALUES(?,?,?,?,?) ON CONFLICT(server_id, package) DO UPDATE SET vulns = excluded.vulns, checked_at = excluded.checked_at', serverId, `${p.name}@${p.version}`, p.ecosystem, JSON.stringify(vulns), Date.now());
    found.push(...vulns.map((v) => ({ ...v, package: `${p.name}@${p.version}` })));
    const worst = vulns.reduce<Severity | null>((a, v) => (!a || severityRank(v.severity) > severityRank(a) ? v.severity : a), null);
    if (worst && severityRank(worst) >= severityRank('high'))
      raiseIncident({
        type: 'known_vulnerability',
        severity: vulns.some((v) => v.malicious) ? 'critical' : worst === 'critical' ? 'high' : 'medium',
        title: `Known ${vulns.some((v) => v.malicious) ? 'malicious version' : `${worst} vulnerability`} in ${p.name}@${p.version}`,
        summary: vulns.slice(0, 3).map((v) => `${v.id}: ${v.summary}${v.fixed ? ` (fixed in ${v.fixed})` : ''}`).join(' · '),
        groupKey: `vuln:${serverId}:${p.name}@${p.version}`,
        serverId,
        evidence: { package: `${p.name}@${p.version}`, vulns },
      });
  }
  return found;
}

export async function checkAllServers() {
  for (const s of all<{ id: string }>('SELECT id FROM servers WHERE lab = 0')) await checkServerVulns(s.id).catch(() => undefined);
}

export function vulnerabilitiesFor(serverId: string): { id: string; severity: Severity; fixed: string | null; package: string; summary: string }[] {
  return all<{ package: string; vulns: string }>('SELECT package, vulns FROM server_vulns WHERE server_id = ?', serverId).flatMap((r) =>
    json<Vuln[]>(r.vulns, []).map((v) => ({ id: v.id, severity: v.severity, fixed: v.fixed, package: r.package, summary: v.summary })),
  );
}

export function vulnOverview() {
  const rows = all<{ server_id: string; package: string; vulns: string }>("SELECT server_id, package, vulns FROM server_vulns WHERE vulns != '[]'");
  return rows.map((r) => ({ serverId: r.server_id, package: r.package, vulns: json<Vuln[]>(r.vulns, []) }));
}
