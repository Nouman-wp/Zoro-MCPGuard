'use client';

import { useState } from 'react';
import { Button, Field, Modal, Notice, inputCls } from '../ui';
import type { SealableApproval } from '../human-seal';
import { api } from '@/lib/api';

export function ChallengeModal({ open, onClose, fingerprint, onOpened, kind = 'challenge' }: { open: boolean; onClose: () => void; fingerprint: string | null; onOpened: (a: SealableApproval) => void; kind?: 'challenge' | 'appeal' }) {
  const [evidence, setEvidence] = useState('');
  const [submitter, setSubmitter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const r = await api<{ seq: number; approval: SealableApproval & { seq: number } }>('/api/console/disputes', { json: { kind, fingerprint, evidence, submitter: submitter || undefined } });
      onOpened({ ...r.approval, ref: `APR-${r.approval.seq}` });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={kind === 'challenge' ? 'Challenge a seal' : 'Appeal a verdict'} footer={<><Button variant="subtle" onClick={onClose}>Cancel</Button><Button onClick={submit}>Continue to Human Seal</Button></>}>
      <p className="text-[14px] text-mist">Disputes are public and recorded on the ledger. A different auditor configuration re-reviews the version. Opening one requires a Human Seal.</p>
      <div className="mt-4 space-y-3">
        <Field label="Evidence">
          <textarea className={`${inputCls} h-28 py-2`} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="A proof of concept, a behavioral trace, or a link to a public report" />
        </Field>
        <Field label="Your name or handle (optional, public)">
          <input className={inputCls} value={submitter} onChange={(e) => setSubmitter(e.target.value)} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}
