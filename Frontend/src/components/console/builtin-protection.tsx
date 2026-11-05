'use client';

import { useState } from 'react';
import { Eye, Terminal } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Notice } from '../ui';
import { api, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface HookStatus {
  installed: boolean;
  path: string;
  matcher: string;
  error: string | null;
  backup: string | null;
}

interface Watchdog {
  permitted: boolean;
  files: { path: string; client: string | null; updated_at: number; restorable: number }[];
  watching: string[];
}

/**
 * Built-in tool coverage (Claude Code hook) and the settings watchdog. MCP routing protects MCP tools; this protects
 * the agent's own shell and file tools, package and skill installs, and the clients' configuration files.
 */
export function BuiltinProtectionCard() {
  const hook = useApi<HookStatus>('/api/console/hooks/claude-code');
  const wd = useApi<Watchdog>('/api/console/watchdog', { on: ['watchdog'] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { json: {} });
      await Promise.all([hook.reload(), wd.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const h = hook.data;
  return (
    <Card className="mb-6">
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Terminal className="size-4" aria-hidden /> Claude Code built-in tools, packages and skills</span>}
        subtitle="A PreToolUse hook sends Bash, Write/Edit and MCP calls to Zoro first: irreversible commands ask, npm/npx/pip/uvx installs are verified, skills are scanned, and edits to AI settings are flagged."
        action={
          h ? (
            h.installed ? (
              <Button size="sm" variant="subtle" loading={busy} onClick={() => void act('/api/console/hooks/claude-code/uninstall')}>Remove hook</Button>
            ) : (
              <Button size="sm" loading={busy} disabled={wd.data ? !wd.data.permitted : false} onClick={() => void act('/api/console/hooks/claude-code/install')}>Install hook</Button>
            )
          ) : null
        }
      />
      <div className="space-y-3 p-5 text-[13.5px]">
        {h && (
          <p className="text-mist">
            Status: {h.installed ? <Badge tone="ok">installed</Badge> : <Badge tone="warn">not installed</Badge>} <span className="font-mono text-[12px] text-ash">{h.path}</span>
            {h.backup ? <span className="text-ash"> · original backed up</span> : null}
          </p>
        )}
        {h?.installed && <p className="text-ash">Restart Claude Code sessions to load the hook. If Zoro is stopped, the hook asks before each action and says why — it never silently allows or blocks.</p>}
        {wd.data && !wd.data.permitted && <Notice tone="info">Grant permission to read client configurations (step 2 below) to install the hook and start the settings watchdog.</Notice>}
        {h?.error && <Notice tone="danger">{h.error}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        {wd.data && wd.data.files.length > 0 && (
          <div className="rounded-[10px] border border-inkline bg-deep-sea p-3">
            <p className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ash"><Eye className="size-3.5" aria-hidden /> Settings watchdog · {wd.data.files.length} file(s)</p>
            <ul className="mt-2 space-y-1">
              {wd.data.files.map((f) => (
                <li key={f.path} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="font-mono text-mist">{f.path}</span>
                  <span className="text-ash">{f.client ?? ''} · trusted {timeAgo(f.updated_at)}</span>
                  {f.restorable ? <Badge tone="warn">changed outside Zoro</Badge> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ash">A change made outside Zoro opens an incident within a second, with the exact added lines and one-click restore.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
