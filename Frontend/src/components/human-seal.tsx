'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { CheckCircle2, Fingerprint, ShieldAlert, XCircle } from 'lucide-react';
import { Badge, Button, Modal, Notice } from './ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate, shortHash } from '@/lib/format';

export interface SealableApproval {
  id: string;
  ref: string;
  summary: string | null;
  reason: string | null;
  digest: string;
  human_seal: number;
  expires_at: number;
  approvers_required?: number;
  approvals_received?: number;
}

interface StartResponse {
  ok: boolean;
  id: string;
  status: string;
  error?: string;
  request?: { app_id: `app_${string}`; action: string; signal: string; environment: 'staging' | 'production'; rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string }; expiresAt: number; testIdentities: boolean };
}

type Phase = 'summary' | 'starting' | 'awaiting' | 'validating' | 'done' | 'failed';

const OUTCOME_TEXT: Record<string, string> = {
  verified: 'Verified. The action is approved for exactly this request, once.',
  denied: 'Denied. The action did not happen.',
  cancelled: 'Cancelled. The action did not happen.',
  expired: 'The approval window closed before verification completed. The action did not happen.',
  invalid: 'The proof failed server-side validation. The action did not happen, and a security incident was recorded.',
  mismatched: 'The proof was bound to a different action. The action did not happen.',
  replay: 'This proof was already used. Approvals are single use; the action did not happen.',
  service_unavailable: 'The Human Seal service is unavailable. The action will not proceed; you can retry or deny.',
};

/**
 * The Human Seal modal: action summary and digest → World ID verification → server-side validation → outcome.
 * The client never authorizes anything itself; it only relays World's proof to the Zoro daemon.
 */
export function HumanSealModal({ approval, open, onClose, mode = 'console', onDone }: { approval: SealableApproval | null; open: boolean; onClose: () => void; mode?: 'console' | 'lab'; onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>('summary');
  const [start, setStart] = useState<StartResponse | null>(null);
  const [outcome, setOutcome] = useState<{ status: string; error?: string | null } | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [Widget, setWidget] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [preset, setPreset] = useState<((o: { signal?: string }) => unknown) | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('summary');
    setStart(null);
    setOutcome(null);
    setWidgetOpen(false);
  }, [open, approval?.id]);

  useEffect(() => {
    if (!open || Widget) return;
    void import('@worldcoin/idkit').then((m) => {
      setWidget(() => m.IDKitRequestWidget as unknown as ComponentType<Record<string, unknown>>);
      setPreset(() => m.orbLegacy as (o: { signal?: string }) => unknown);
    });
  }, [open, Widget]);

  if (!approval) return null;
  const base = mode === 'lab' ? '/api/public/lab' : '/api/console';

  const begin = async () => {
    setPhase('starting');
    try {
      const r = await api<StartResponse>(mode === 'lab' ? `${base}/approvals/${approval.id}/human-seal` : `${base}/human-seal/start`, { json: mode === 'lab' ? {} : { approvalId: approval.id } });
      setStart(r);
      if (!r.ok || !r.request) {
        setOutcome({ status: r.status, error: r.error });
        setPhase('failed');
        return;
      }
      setPhase('awaiting');
      setWidgetOpen(true);
    } catch (e) {
      setOutcome({ status: 'service_unavailable', error: (e as Error).message });
      setPhase('failed');
    }
  };

  const verify = async (result: unknown) => {
    setPhase('validating');
    try {
      const path = mode === 'lab' ? `${base}/human-seal/${start!.id}/complete` : `${base}/human-seal/${start!.id}/complete`;
      const r = await api<{ status: string; error?: string | null }>(path, { json: mode === 'lab' ? { approvalId: approval.id, result } : { result } });
      setOutcome(r);
      setPhase(r.status === 'verified' ? 'done' : 'failed');
      onDone?.();
    } catch (e) {
      const body = (e as ApiError).body as { status?: string; error?: string } | null;
      setOutcome({ status: body?.status ?? 'invalid', error: body?.error ?? (e as Error).message });
      setPhase('failed');
      onDone?.();
      throw e;
    }
  };

  const cancel = async () => {
    if (start?.id && mode === 'console') await api(`/api/console/human-seal/${start.id}/cancel`, { json: {} }).catch(() => undefined);
    setWidgetOpen(false);
    setOutcome({ status: 'cancelled' });
    setPhase('failed');
  };

  const deny = async () => {
    await api(mode === 'lab' ? `${base}/approvals/${approval.id}/deny` : `/api/console/approvals/${approval.id}/decide`, { json: mode === 'lab' ? {} : { decision: 'deny' } }).catch(() => undefined);
    setOutcome({ status: 'denied' });
    setPhase('failed');
    onDone?.();
  };

  const req = start?.request;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Fingerprint className="size-4 text-frosted" aria-hidden /> Human Seal · {approval.ref}
        </span>
      }
      footer={
        phase === 'summary' ? (
          <>
            <Button variant="danger" onClick={deny}>
              Deny
            </Button>
            <Button onClick={begin}>Approve with World ID</Button>
          </>
        ) : phase === 'awaiting' ? (
          <>
            <Button variant="subtle" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={() => setWidgetOpen(true)}>Open verification</Button>
          </>
        ) : (
          <Button variant="subtle" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4 text-[14px]">
        <div>
          <p className="text-[12px] uppercase tracking-wider text-ash">Exact action</p>
          <p className="mt-1 text-quartz">{approval.summary}</p>
          {approval.reason && <p className="mt-1 text-mist">{approval.reason}</p>}
        </div>
        <div className="rounded-[10px] border border-inkline bg-deep-sea p-3">
          <p className="text-[12px] text-ash">Action digest — the proof is bound to this exact value and works once</p>
          <p className="mt-1 break-all font-mono text-[12px] text-code-str">{approval.digest}</p>
          <p className="mt-2 text-[12px] text-ash">Approval window closes {fmtDate(approval.expires_at)}</p>
          {(approval.approvers_required ?? 1) > 1 && (
            <p className="mt-1 text-[12px] text-ash">
              Approvers: {approval.approvals_received ?? 0} of {approval.approvers_required} distinct verified people
            </p>
          )}
        </div>
        {(req?.testIdentities ?? true) && (
          <Notice tone="warn" title="Test identities">
            {req ? `World ID ${req.environment} environment.` : 'This instance uses World ID’s staging environment.'} Verification uses test identities (the World ID Simulator) and is not production identity assurance.
          </Notice>
        )}
        {phase === 'starting' && <p className="text-ash">Requesting a signed World ID request from the Zoro daemon…</p>}
        {phase === 'awaiting' && <p className="text-ash">Complete the verification in World App{req?.environment === 'staging' ? ' or the World ID Simulator' : ''}. Nothing happens until Zoro validates the proof on its server.</p>}
        {phase === 'validating' && <p className="text-ash">Validating the proof server-side with World’s verify API…</p>}
        {(phase === 'done' || phase === 'failed') && outcome && (
          <div className={`flex items-start gap-3 rounded-[10px] border p-3 ${phase === 'done' ? 'border-ok/30 bg-ok-bg' : 'border-danger/30 bg-danger-bg'}`}>
            {phase === 'done' ? <CheckCircle2 className="mt-0.5 size-5 text-ok" aria-hidden /> : outcome.status === 'service_unavailable' ? <ShieldAlert className="mt-0.5 size-5 text-warn" aria-hidden /> : <XCircle className="mt-0.5 size-5 text-danger" aria-hidden />}
            <div>
              <Badge tone={phase === 'done' ? 'ok' : 'danger'}>{outcome.status.replace(/_/g, ' ')}</Badge>
              <p className="mt-1.5 text-mist">{OUTCOME_TEXT[outcome.status] ?? outcome.status}</p>
              {outcome.error && outcome.status !== 'denied' && <p className="mt-1 text-[12px] text-ash">{outcome.error}</p>}
              {phase === 'done' && <p className="mt-1 text-[12px] text-ash">For tool calls, the agent’s next identical call runs once. Digest {shortHash(approval.digest)}.</p>}
            </div>
          </div>
        )}
      </div>
      {Widget && preset && req && (
        <Widget
          open={widgetOpen}
          onOpenChange={(o: boolean) => setWidgetOpen(o)}
          app_id={req.app_id}
          action={req.action}
          rp_context={req.rp_context}
          environment={req.environment}
          allow_legacy_proofs={true}
          action_description={(approval.summary ?? 'Zoro Human Seal').slice(0, 120)}
          preset={preset({ signal: req.signal })}
          handleVerify={verify}
          onSuccess={() => setWidgetOpen(false)}
          onError={() => {
            if (phase === 'awaiting') {
              setOutcome({ status: 'cancelled', error: 'Verification was not completed.' });
              setPhase('failed');
            }
          }}
        />
      )}
    </Modal>
  );
}
