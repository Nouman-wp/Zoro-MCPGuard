'use client';

import { useState } from 'react';
import { Package, Puzzle, Search } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, Select, Table, Td, Toggle, inputCls } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';

interface Finding {
  id: string;
  severity: string;
  title: string;
  detail: string;
}

interface PackageRow {
  ecosystem: string;
  name: string;
  version: string;
  verdict: string;
  checked_at: number;
  last_seen: number;
  findings: Finding[];
  vulns: { id: string; severity: string; fixed: string | null; malicious: boolean }[];
  publishedAt: number | null;
  publisher: string | null;
  provenance: boolean;
  signature: string;
  installScripts: string[];
  weeklyDownloads: number | null;
  uses: { source: string; n: number; last: number; agents: string | null }[];
}

interface PackagesResponse {
  packages: PackageRow[];
  recent: { ts: number; ecosystem: string; name: string; version: string | null; requested: string; source: string; ref: string | null; agent: string | null }[];
  remoteChecks: boolean;
}

interface SkillRow {
  path: string;
  name: string;
  verdict: string;
  findings: Finding[];
  source: string;
  first_seen: number;
  last_seen: number;
}

interface Report extends Omit<PackageRow, 'uses' | 'checked_at' | 'last_seen'> {
  requested: string;
  latest: string | null;
  error: string | null;
}

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { clean: 'ok', warning: 'warn', unsafe: 'danger', unknown: 'neutral' };
const SOURCE: Record<string, string> = { agent_install: 'agent install', mcp_server: 'MCP server', manual: 'manual check', skill: 'skill' };

function Findings({ list }: { list: Finding[] }) {
  const material = list.filter((f) => f.severity !== 'info');
  if (!material.length) return <span className="text-[12.5px] text-ash">No findings</span>;
  return (
    <ul className="space-y-1">
      {material.slice(0, 4).map((f) => (
        <li key={f.id} className="text-[12.5px]">
          <Badge tone={f.severity === 'critical' || f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warn' : 'neutral'} className="mr-1.5">
            {f.severity}
          </Badge>
          <span className="text-quartz">{f.title}</span>
          <span className="text-ash"> — {f.detail.slice(0, 140)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PackagesPage() {
  const p = useApi<PackagesResponse>('/api/console/packages', { on: ['package'] });
  const s = useApi<{ skills: SkillRow[] }>('/api/console/skills', { on: ['skill'] });
  const [spec, setSpec] = useState('');
  const [eco, setEco] = useState<'npm' | 'pypi'>('npm');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await api<Report>('/api/console/packages/check', { json: { spec, ecosystem: eco } }));
      void p.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Packages & skills"
        description="Every npm and PyPI package your agents installed or ran (npm/pnpm/yarn/bun add, npx, dlx, pip, uvx) and every skill, plugin or custom agent they gained — each checked before use."
      />
      {p.data && !p.data.remoteChecks && (
        <Notice tone="warn" title="Remote package checks are off" className="mb-4" action={<Button size="sm" variant="subtle" onClick={() => void api('/api/console/settings/package-checks', { method: 'PUT', json: { enabled: true } }).then(p.reload)}>Turn on</Button>}>
          Without registry and OSV lookups, installs cannot be verified, so Zoro asks before every one.
        </Notice>
      )}

      <Card className="mb-4">
        <CardHeader title="Check a package" subtitle="Registry metadata, known-malicious and vulnerable versions (OSV), typosquats, publish age, install scripts, publisher changes and registry signatures" />
        <div className="flex flex-wrap items-end gap-2 p-5">
          <Select ariaLabel="Ecosystem" value={eco} onChange={(v) => setEco(v as 'npm' | 'pypi')} options={[{ value: 'npm', label: 'npm' }, { value: 'pypi', label: 'PyPI' }]} className="w-28" />
          <input className={`${inputCls} max-w-md flex-1 font-mono`} placeholder={eco === 'npm' ? '@modelcontextprotocol/server-github or lodash@4.17.21' : 'requests==2.32.0'} value={spec} onChange={(e) => setSpec(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && spec.trim() && void check()} aria-label="Package spec" />
          <Button onClick={() => void check()} loading={busy} disabled={!spec.trim()} icon={<Search className="size-4" />}>
            Check
          </Button>
        </div>
        {error && <Notice tone="danger" className="mx-5 mb-5">{error}</Notice>}
        {report && (
          <div className="mx-5 mb-5 space-y-2 rounded-[10px] border border-inkline bg-deep-sea p-4">
            <p className="text-[15px] text-quartz">
              <span className="font-mono">{report.name}@{report.version ?? report.requested}</span> <Badge tone={TONE[report.verdict] ?? 'neutral'}>{report.verdict}</Badge>
            </p>
            {report.error && <p className="text-[13px] text-ash">{report.error}</p>}
            <p className="text-[12.5px] text-ash">
              {report.publishedAt ? `published ${timeAgo(report.publishedAt)}` : ''}{report.publisher ? ` by ${report.publisher}` : ''}
              {report.weeklyDownloads !== null ? ` · ${report.weeklyDownloads.toLocaleString()} downloads/week` : ''} · signature {report.signature} · {report.provenance ? 'provenance published' : 'no provenance'}
              {report.latest && report.latest !== report.version ? ` · latest ${report.latest}` : ''}
            </p>
            <Findings list={report.findings} />
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Packages" subtitle="What was checked, the verdict, and where each package was used" />
        {p.loading && !p.data ? (
          <LoadingBlock />
        ) : p.error ? (
          <ErrorState error={p.error} retry={p.reload} />
        ) : !p.data?.packages.length ? (
          <EmptyState icon={<Package className="size-5" />} title="No packages yet" description="Packages appear when an agent installs or runs one (through the Claude Code hook), when an MCP server is launched with npx, or when you check one above." />
        ) : (
          <Table head={['Package', 'Verdict', 'Findings', 'Used as', 'Checked']}>
            {p.data.packages.map((x) => (
              <tr key={`${x.ecosystem}:${x.name}@${x.version}`}>
                <Td>
                  <p className="font-mono text-[13px] text-quartz">{x.name}@{x.version}</p>
                  <p className="text-[11.5px] text-ash">
                    {x.ecosystem}
                    {x.publishedAt ? ` · published ${timeAgo(x.publishedAt)}` : ''}
                    {x.installScripts.length ? ` · install scripts: ${x.installScripts.join(', ')}` : ''}
                  </p>
                </Td>
                <Td>
                  <Badge tone={TONE[x.verdict] ?? 'neutral'}>{x.verdict}</Badge>
                  {x.vulns.length > 0 && <Badge tone="danger" className="ml-1">{x.vulns.some((v) => v.malicious) ? 'malicious' : `${x.vulns.length} CVE`}</Badge>}
                </Td>
                <Td className="max-w-md"><Findings list={x.findings} /></Td>
                <Td className="text-[12.5px] text-mist">{x.uses.map((u) => `${SOURCE[u.source] ?? u.source} ×${u.n}`).join(', ') || '—'}</Td>
                <Td className="whitespace-nowrap text-[12.5px] text-ash">{timeAgo(x.checked_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {p.data && p.data.recent.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Recent install attempts" subtitle="Each time an agent or a server asked for a package" />
          <Table head={['When', 'Requested', 'Resolved', 'Source', 'By']}>
            {p.data.recent.slice(0, 30).map((u, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap text-[12.5px] text-ash">{timeAgo(u.ts)}</Td>
                <Td className="font-mono text-[12.5px]">{u.requested}</Td>
                <Td className="font-mono text-[12.5px] text-ash">{u.version ? `${u.name}@${u.version}` : 'not resolved'}</Td>
                <Td className="text-[12.5px]">{SOURCE[u.source] ?? u.source}{u.ref ? ` (${u.ref})` : ''}</Td>
                <Td className="text-[12.5px] text-ash">{u.agent ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title="Skills, plugins and custom agents" subtitle="Instructions your agent will follow. Each file is scanned when it is written or appears on disk." />
        {s.loading && !s.data ? (
          <LoadingBlock />
        ) : !s.data?.skills.length ? (
          <EmptyState icon={<Puzzle className="size-5" />} title="No skills recorded" description="Install the Claude Code hook and allow Zoro to read client configurations (Onboarding) so new skills are scanned as they are added." />
        ) : (
          <Table head={['Skill', 'Verdict', 'Findings', 'Seen']}>
            {s.data.skills.map((k) => (
              <tr key={k.path}>
                <Td>
                  <p className="text-[13.5px] text-quartz">{k.name}</p>
                  <p className="max-w-xs truncate font-mono text-[11px] text-ash" title={k.path}>{k.path}</p>
                </Td>
                <Td><Badge tone={TONE[k.verdict] ?? 'neutral'}>{k.verdict}</Badge></Td>
                <Td className="max-w-md"><Findings list={k.findings} /></Td>
                <Td className="whitespace-nowrap text-[12.5px] text-ash">
                  {k.source === 'agent_write' ? 'written by agent' : 'found on disk'} · {fmtDate(k.last_seen)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {p.data && (
        <Card className="mt-4 p-5">
          <Toggle checked={p.data.remoteChecks} onChange={(v) => void api('/api/console/settings/package-checks', { method: 'PUT', json: { enabled: v } }).then(p.reload)} label="Check packages online (registry.npmjs.org, api.npmjs.org and api.osv.dev receive the package name and version only)" />
        </Card>
      )}
    </>
  );
}
