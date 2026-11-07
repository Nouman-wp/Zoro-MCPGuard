import { AlertTriangle, Coins, Sparkles, Trash } from 'lucide-react';

export interface RiskEvidence {
  transaction?: { kind: string; sentence: string; risks: string[]; risk: 'high' | 'medium' | 'low'; unlimited?: boolean } | null;
  irreversible?: { reason: string; evidence: string; blastRadius?: string }[] | null;
  pendingCapabilities?: string[] | null;
}

/** Plain-language evidence for risky actions: the decoded transaction, the exact irreversible command, new powers. */
export function RiskEvidenceBlock({ evidence }: { evidence: RiskEvidence | null | undefined }) {
  if (!evidence) return null;
  const tx = evidence.transaction;
  const irr = evidence.irreversible ?? [];
  const powers = evidence.pendingCapabilities ?? [];
  if (!tx && !irr.length && !powers.length) return null;
  return (
    <div className="space-y-2">
      {tx && (
        <div className={`rounded-[10px] border p-3 ${tx.risk === 'high' ? 'border-danger/40 bg-danger-bg' : 'border-warn/40 bg-warn-bg'}`}>
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ash">
            <Coins className="size-3.5" aria-hidden /> Transaction, decoded
          </p>
          <p className="mt-1 text-[14.5px] font-medium text-quartz">{tx.sentence}</p>
          {tx.risks.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-mist">
              {tx.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {irr.length > 0 && (
        <div className="rounded-[10px] border border-danger/40 bg-danger-bg p-3">
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ash">
            <Trash className="size-3.5" aria-hidden /> Cannot be undone
          </p>
          {irr.slice(0, 3).map((s, i) => (
            <div key={i} className="mt-1.5">
              <p className="text-[14px] text-quartz">{s.reason}</p>
              {s.blastRadius && <p className="text-[13px] text-mist">Blast radius: {s.blastRadius}</p>}
              <p className="mt-1 break-all rounded-md bg-abyss px-2 py-1 font-mono text-[12px] text-code-str">{s.evidence.slice(0, 300)}</p>
            </div>
          ))}
        </div>
      )}
      {powers.length > 0 && (
        <div className="rounded-[10px] border border-warn/40 bg-warn-bg p-3">
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ash">
            <Sparkles className="size-3.5" aria-hidden /> New power, first use
          </p>
          <p className="mt-1 text-[13.5px] text-mist">
            Since it was last approved, this agent gained: <span className="text-quartz">{powers.map((p) => p.replace(/_/g, ' ')).join(', ')}</span>. Approving this call also approves the ability.
          </p>
        </div>
      )}
      {tx?.unlimited && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-danger">
          <AlertTriangle className="size-3.5" aria-hidden /> Unlimited approvals are the most common way wallets are drained.
        </p>
      )}
    </div>
  );
}
