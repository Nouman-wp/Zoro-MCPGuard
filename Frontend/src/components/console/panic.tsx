'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Snowflake, Sun } from 'lucide-react';
import { Button, Field, Modal, Notice, inputCls } from '../ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface LockdownState {
  lockdown: { by: string; at: number; reason: string | null; source: 'local' | 'org'; orgName?: string | null } | null;
  liftNeedsHumanSeal: boolean;
}

type LiftResponse = { status: 'done' } | { status: 'needs_confirmation'; phrase: string } | { status: 'approval_required'; approvalId: string } | { status: 'forbidden'; error: string };

export function useLockdown() {
  return useApi<LockdownState>('/api/console/lockdown', { on: ['lockdown', 'status'], interval: 15_000 });
}

/** Panic button: one tap freezes every agent. Lifting is a protected action. */
export function PanicButton() {
  const s = useLockdown();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger' | 'ok'; text: string; approval?: boolean } | null>(null);
  const [needPhrase, setNeedPhrase] = useState(false);
  const active = s.data?.lockdown ?? null;

  const freeze = async () => {
    setBusy(true);
    try {
      await api('/api/console/lockdown', { json: { reason: reason.trim() || undefined } });
      setOpen(false);
      setReason('');
      await s.reload();
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const lift = async () => {
    setBusy(true);
    try {
      const r = await api<LiftResponse>('/api/console/lockdown/lift', { json: { phrase: phrase || undefined } });
      if (r.status === 'done') {
        setOpen(false);
        setPhrase('');
        setNeedPhrase(false);
        await s.reload();
      } else if (r.status === 'needs_confirmation') {
        setNeedPhrase(true);
        setMsg({ tone: 'warn', text: `Type ${r.phrase} to confirm. World ID is not configured, so a typed confirmation protects this action instead of a Human Seal.` });
      } else if (r.status === 'approval_required') {
        setMsg({ tone: 'info', text: 'Lifting needs a verified human. Approve “Lift lockdown” with World ID on the Approvals page.', approval: true });
      } else {
        setMsg({ tone: 'danger', text: r.error });
      }
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setMsg(null);
          setNeedPhrase(false);
          setOpen(true);
        }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${active ? 'border-danger/50 bg-danger-bg text-danger hover:bg-danger/20' : 'border-danger/40 text-danger hover:bg-danger-bg'}`}
        aria-label={active ? 'Lockdown active: open to lift' : 'Freeze every agent'}
      >
        {active ? <Sun className="size-3.5" aria-hidden /> : <Snowflake className="size-3.5" aria-hidden />}
        {active ? 'Frozen' : 'Freeze agents'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={active ? 'Lift the lockdown' : 'Freeze every agent'}
        footer={
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {active ? (
              <Button onClick={() => void lift()} loading={busy} disabled={active.source === 'org' || (needPhrase && phrase.trim().toUpperCase() !== 'UNFREEZE')}>
                {needPhrase ? 'Unfreeze' : s.data?.liftNeedsHumanSeal ? 'Request lift (Human Seal)' : 'Lift lockdown'}
              </Button>
            ) : (
              <Button variant="danger" onClick={() => void freeze()} loading={busy} icon={<Snowflake className="size-4" />}>
                Freeze now
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-[14px]">
          {active ? (
            <>
              <p className="text-mist">
                Frozen by <span className="text-quartz">{active.source === 'org' ? `${active.orgName ?? 'your organization'} (${active.by})` : active.by}</span> on {fmtDate(active.at)}
                {active.reason ? <> — “{active.reason}”</> : null}.
              </p>
              {active.source === 'org' ? (
                <Notice tone="warn">Your organization froze every member’s agents. Only an organization admin can lift it.</Notice>
              ) : (
                <p className="text-mist">Agents will be able to use their tools again. {s.data?.liftNeedsHumanSeal ? 'This needs a World ID Human Seal.' : ''}</p>
              )}
              {needPhrase && (
                <Field label="Type UNFREEZE to confirm">
                  <input className={`${inputCls} font-mono`} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus aria-label="Confirmation phrase" />
                </Field>
              )}
            </>
          ) : (
            <>
              <p className="text-mist">Every agent tool call through Zoro is refused immediately, Claude Code’s built-in tools are blocked through the hook, and pending approvals are denied. An incident records who pressed it and when.</p>
              <Field label="Reason (optional)">
                <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. suspicious transfer in progress" aria-label="Reason" />
              </Field>
            </>
          )}
          {msg && (
            <Notice tone={msg.tone}>
              {msg.text}{' '}
              {msg.approval && (
                <Link href="/console/approvals" className="text-frosted" onClick={() => setOpen(false)}>
                  Open Approvals →
                </Link>
              )}
            </Notice>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Persistent banner while frozen (degraded state, §9.4). */
export function LockdownBanner() {
  const s = useLockdown();
  const l = s.data?.lockdown;
  if (!l) return null;
  return (
    <div className="px-4 pt-4 md:px-8">
      <Notice tone="danger" title={l.source === 'org' ? `Organization lockdown${l.orgName ? `: ${l.orgName}` : ''}` : 'Lockdown active: every agent is frozen'}>
        Frozen by {l.by} on {fmtDate(l.at)}
        {l.reason ? ` — “${l.reason}”` : ''}. Every tool call is refused until a person lifts it{l.source === 'org' ? ' (organization admins only)' : ' with the Frozen button above'}.
      </Notice>
    </div>
  );
}
