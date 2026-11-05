'use client';

import { useState } from 'react';
import { Button, Modal, Notice } from '../ui';
import { HumanSealModal, type SealableApproval } from '../human-seal';
import { api } from '@/lib/api';

export type ProtectedResult = { status: 'done'; result: string } | { status: 'needs_confirmation'; changes: string[] } | { status: 'approval_required'; approvalId: string; humanSeal: boolean };

/**
 * Runs a protected action (§4.8): the first call may come back asking for confirmation of a loosening change, then
 * for a Human Seal. This hook walks the person through both and never bypasses either.
 */
export function useProtectedAction(onDone?: (r: string) => void) {
  const [confirm, setConfirm] = useState<{ changes: string[]; retry: () => Promise<void> } | null>(null);
  const [seal, setSeal] = useState<SealableApproval | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (call: (confirmed: boolean) => Promise<ProtectedResult>, confirmed = false) => {
    setError(null);
    try {
      const r = await call(confirmed);
      if (r.status === 'done') {
        setConfirm(null);
        onDone?.(r.result);
      } else if (r.status === 'needs_confirmation') setConfirm({ changes: r.changes, retry: () => handle(call, true) });
      else {
        setConfirm(null);
        const a = await api<SealableApproval & { ref: string }>(`/api/console/approvals/${r.approvalId}`);
        setSeal(a);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ui = (
    <>
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="This weakens protection"
        footer={
          <>
            <Button variant="subtle" onClick={() => setConfirm(null)}>
              Keep current protection
            </Button>
            <Button variant="danger" onClick={() => void confirm?.retry()}>
              I understand — continue
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-mist">Review exactly what becomes looser. The safe choice is to keep the current setting.</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-quartz">
          {confirm?.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Modal>
      <HumanSealModal approval={seal} open={Boolean(seal)} onClose={() => setSeal(null)} onDone={() => onDone?.('human seal flow finished')} />
      {error && (
        <Notice tone="danger" className="my-3">
          {error}
        </Notice>
      )}
    </>
  );
  return { run: handle, ui };
}
