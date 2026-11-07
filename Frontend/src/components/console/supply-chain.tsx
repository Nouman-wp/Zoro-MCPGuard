'use client';

import { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Notice } from '../ui';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface Supply {
  pin: { name: string; version: string; verdict: string; pinnedAt: number; requested: string } | null;
  update: { name: string; from: string; to: string; verdict: string; summary: string; checkedAt: number } | null;
  vulns: { id: string; severity: string; fixed: string | null; package: string; summary: string }[];
}

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { clean: 'ok', warning: 'warn', unsafe: 'danger', unknown: 'neutral' };

/** Pinned package, verified updates and known vulnerabilities for one server (recall checker). */
export function SupplyChainCard({ serverId }: { serverId: string }) {
  const s = useApi<Supply>(`/api/console/servers/${serverId}/supply`, { on: ['package', 'server', 'incident'] });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (what: 'accept-update' | 'check-vulns') => {
    setBusy(what);
    setError(null);
    try {
      await api(`/api/console/servers/${serverId}/${what}`, { json: {} });
      await s.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const d = s.data;
  if (!d) return null;
  const critical = d.vulns.filter((v) => v.severity === 'critical' || v.severity === 'high');
  return (
    <Card className="mt-4">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <PackageSearch className="size-4" aria-hidden /> Supply chain
            {d.vulns.length > 0 && <Badge tone="danger">Known CVE{d.vulns.length > 1 ? `s (${d.vulns.length})` : ''}</Badge>}
          </span>
        }
        subtitle="The exact package version this server runs, verified updates waiting for you, and known vulnerabilities from OSV.dev"
        action={<Button size="sm" variant="subtle" loading={busy === 'check-vulns'} onClick={() => void act('check-vulns')}>Check now</Button>}
      />
      <div className="space-y-3 p-5 text-[13.5px]">
        {d.pin ? (
          <p className="text-mist">
            Pinned to <span className="font-mono text-quartz">{d.pin.name}@{d.pin.version}</span> <Badge tone={TONE[d.pin.verdict] ?? 'neutral'}>{d.pin.verdict}</Badge>
            <span className="text-ash"> · requested “{d.pin.requested}” · pinned {timeAgo(d.pin.pinnedAt)}. New releases never run until you accept them.</span>
          </p>
        ) : (
          <p className="text-ash">This server is not launched through a package runner (npx, dlx), so there is nothing to pin. Its installed files are fingerprinted instead.</p>
        )}
        {d.update && (
          <Notice
            tone={d.update.verdict === 'unsafe' ? 'danger' : d.update.verdict === 'warning' ? 'warn' : 'info'}
            title={`${d.update.verdict === 'unsafe' ? 'Unsafe update held back' : 'Update available'}: ${d.update.from} → ${d.update.to}`}
            action={d.update.verdict !== 'unsafe' ? <Button size="sm" loading={busy === 'accept-update'} onClick={() => void act('accept-update')}>Accept and restart</Button> : undefined}
          >
            {d.update.summary}. Checked {timeAgo(d.update.checkedAt)}.
          </Notice>
        )}
        {d.vulns.length > 0 && (
          <ul className="space-y-1.5">
            {d.vulns.map((v) => (
              <li key={`${v.package}:${v.id}`} className="rounded-md border border-inkline bg-abyss p-2">
                <Badge tone={v.severity === 'critical' || v.severity === 'high' ? 'danger' : 'warn'}>{v.severity}</Badge> <span className="font-mono text-[12.5px] text-quartz">{v.id}</span>
                <span className="text-ash"> · {v.package}</span>
                {v.fixed && <span className="text-ok"> · fixed in {v.fixed}</span>}
                <p className="mt-0.5 text-[12.5px] text-mist">{v.summary}</p>
              </li>
            ))}
          </ul>
        )}
        {critical.length > 0 && <p className="text-[12.5px] text-ash">The Strict profile blocks servers with critical vulnerabilities (rule “known-vulns”); Standard reports them.</p>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Card>
  );
}
