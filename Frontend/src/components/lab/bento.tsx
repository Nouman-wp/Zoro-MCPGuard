'use client';

/**
 * Attack Lab dashboard pieces, each with its own visual form:
 * AttackerView (what the attacker's screen received), Checkpoints (each audit as a run through Sentinel's gates),
 * NetworkMap (agent → Zoro → servers, with the line to the attacker cut), AlertTickets (incidents) and Receipts
 * (public records). All read the same Lab API data as before.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Bot, Check, Globe, Lock, Mail, ShieldCheck, Skull, Wallet, X } from 'lucide-react';
import { SeverityBadge, VerdictBadge, cx } from '../ui';
import { PublicationBadges, type LayerState } from '../security';
import { InfoTip, Tip, type TipContent } from '../tip';
import { GATE_HELP, PANEL_HELP } from './explain';

// ---------- shared frame ----------

export function Panel({ title, kicker, children, className, dark, tip, n }: { title: ReactNode; kicker?: ReactNode; children: ReactNode; className?: string; dark?: boolean; tip?: TipContent; n?: number }) {
  return (
    <section className={cx('flex flex-col overflow-hidden rounded-[16px] border border-sapphire', dark ? 'bg-code text-code-text' : 'bg-panel', className)}>
      <header className="px-5 pb-2 pt-4">
        {kicker && (
          <p className={cx('flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em]', dark ? 'text-code-gutter' : 'text-slate')}>
            {n !== undefined && <span className={cx('flex size-5 items-center justify-center rounded-full border text-[10.5px] tracking-normal', dark ? 'border-code-gutter' : 'border-sapphire text-quartz')}>{n}</span>}
            {kicker}
          </p>
        )}
        <h3 className={cx('font-display mt-0.5 flex items-center gap-2 text-[22px] leading-tight', dark && 'text-code-text')}>
          {title}
          {tip && <InfoTip content={tip} label={`What is ${typeof title === 'string' ? title : 'this panel'}?`} className={dark ? '[&_button]:text-code-gutter [&_button:hover]:bg-white/10 [&_button:hover]:text-code-text' : undefined} />}
        </h3>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

// ---------- the attacker's screen ----------

export interface World {
  outbox: { id: string; to: string; bcc: string[]; subject: string; at: number }[];
  transactions: { id: string; to: string; amount: number; token: string; at: number }[];
  network: { to: string; bytes: number; at: number; via: string }[];
}

export function AttackerView({ world, hasRun }: { world: World | undefined; hasRun: boolean }) {
  const copies = (world?.outbox ?? []).filter((m) => m.bcc.length);
  const reqs = world?.network ?? [];
  const tx = world?.transactions ?? [];
  const bytes = reqs.reduce((a, r) => a + r.bytes, 0);
  const leaked = copies.length + reqs.length > 0;
  const tiles: { icon: ReactNode; label: string; value: string; bad: boolean }[] = [
    { icon: <Mail />, label: 'Copied emails', value: String(copies.length), bad: copies.length > 0 },
    { icon: <Globe />, label: 'Data collected', value: bytes ? `${bytes} B` : '0 B', bad: reqs.length > 0 },
    { icon: <Wallet />, label: 'Payments made', value: String(tx.length), bad: false },
  ];
  return (
    <Panel dark n={1} tip={PANEL_HELP.attacker} kicker="What actually happened" title="The attacker’s screen">
      <div className="mx-5 mb-5 overflow-hidden rounded-[12px] border border-code-edge">
        <div className="flex items-center gap-2 border-b border-code-edge px-3 py-2">
          <Skull className="size-3.5 text-[color:var(--pink)]" aria-hidden />
          <span className="font-mono text-[11.5px] text-code-gutter">attacker@lab-attacker.example</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-code-edge">
          {tiles.map((t) => (
            <div key={t.label} className="px-3 py-4 text-center">
              <span className={cx('mx-auto flex size-8 items-center justify-center rounded-full [&_svg]:size-4', t.bad ? 'bg-danger-bg text-danger' : 'bg-white/5 text-code-gutter')}>{t.icon}</span>
              <p className={cx('font-display mt-2 text-[30px] leading-none', t.bad ? 'text-[color:var(--pink)]' : 'text-code-text')}>{t.value}</p>
              <p className="mt-1.5 text-[11px] text-code-gutter">{t.label}</p>
            </div>
          ))}
        </div>
        <div className={cx('flex items-center gap-2 border-t border-code-edge px-4 py-3 text-[14px] font-semibold', !hasRun ? 'text-code-gutter' : leaked ? 'text-[color:var(--pink)]' : 'text-[color:var(--mint)]')}>
          {!hasRun ? 'Waiting for an attack…' : leaked ? <><X className="size-4" /> Something got through. Details below.</> : <><Check className="size-4" /> Nothing came in. Zoro kept everything inside.</>}
        </div>
        {leaked && (
          <ul className="space-y-1 border-t border-code-edge px-4 py-3 font-mono text-[11.5px] text-[color:var(--pink)]">
            {copies.map((m) => (
              <li key={m.id}>
                BCC {m.bcc.join(', ')} · “{m.subject}”
              </li>
            ))}
            {reqs.map((r, i) => (
              <li key={i}>
                {r.via} → {r.to} · {r.bytes} B
              </li>
            ))}
          </ul>
        )}
        {tx.length > 0 && (
          <ul className="space-y-1 border-t border-code-edge px-4 py-3 font-mono text-[11.5px] text-code-gutter">
            {tx.map((t) => (
              <li key={t.id}>
                payment {t.amount} {t.token} → {t.to}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

// ---------- checkpoints ----------

export interface Audit {
  id: string;
  name: string;
  status: string;
  verdict: string | null;
  layers: LayerState[];
  server_label: string;
  source: string;
}

const GATE: Record<string, string> = { deterministic: 'Rules', differential: 'Diff', ai: 'AI review', dynamic: 'Sandbox', detonation: 'Sandbox', attestation: 'Signed' };

/** A gate's look from its real status: green when it found nothing, amber when it reported findings or failed. */
function gate(l: LayerState) {
  const findings = Number(/(\d+)\s*finding/i.exec(l.detail ?? '')?.[1] ?? 0);
  if (l.status === 'done') return findings > 0 ? { cls: 'border-warn bg-warn-bg text-warn', mark: `${findings}`, label: `${findings} finding${findings === 1 ? '' : 's'}` } : { cls: 'border-ok bg-ok-bg text-ok', mark: '✓', label: 'clear' };
  if (l.status === 'failed') return { cls: 'border-warn bg-warn-bg text-warn', mark: '!', label: 'failed' };
  if (l.status === 'running') return { cls: 'border-accent bg-accent-tint text-accent animate-pulse', mark: '…', label: 'running' };
  return { cls: 'border-obsidian bg-panel text-slate', mark: '–', label: l.status };
}

export function Checkpoints({ audits }: { audits: Audit[] }) {
  return (
    <Panel n={2} tip={PANEL_HELP.checkpoints} kicker="Sentinel’s audits" title="Every new version runs the gauntlet">
      {audits.length ? (
        <ul className="divide-y divide-obsidian">
          {audits.slice(0, 4).map((a) => (
            <li key={a.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[14.5px] font-semibold">
                  <span className="font-mono text-[13px] font-normal text-slate">{a.server_label}/</span>
                  {a.name}
                  {a.source === 'artifact' && <span className="ml-2 rounded-full bg-peach-soft px-2 py-[1px] text-[11px] font-semibold text-on-pastel">code change</span>}
                </p>
                {a.verdict ? <VerdictBadge verdict={a.verdict} /> : <span className="text-[12px] text-slate">{a.status}</span>}
              </div>
              <ol className="mt-3 flex flex-wrap items-center gap-y-2">
                {a.layers.map((l, i) => {
                  const g = gate(l);
                  return (
                    <li key={l.layer} className="flex items-center">
                      {i > 0 && <span className="mx-1.5 h-px w-4 bg-sapphire sm:w-6" aria-hidden />}
                      <Tip content={{ ...(GATE_HELP[l.layer] ?? { title: GATE[l.layer] ?? l.layer, body: 'One of Sentinel’s checks.' }), example: `This run: ${l.detail ?? g.label}` }}>
                        <span tabIndex={0} className={cx('inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold', g.cls)}>
                          <span className="font-mono">{g.mark}</span> {GATE[l.layer] ?? l.layer}
                        </span>
                      </Tip>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 pt-2 text-[14px] text-ash">No audits yet. Launch an attack and watch its new version hit each gate.</p>
      )}
    </Panel>
  );
}

// ---------- network map ----------

export interface LabServer {
  label: string;
  version: string;
  connected: boolean;
  state: string;
}

export function NetworkMap({ servers, leaked }: { servers: LabServer[]; leaked: boolean }) {
  const list = servers.slice(0, 6);
  const H = Math.max(220, list.length * 44 + 40);
  const rowY = (i: number) => 30 + i * ((H - 60) / Math.max(1, list.length - 1 || 1));
  const hubY = H / 2;
  return (
    <Panel n={3} tip={PANEL_HELP.network} kicker="Lab servers" title="Everything goes through Zoro">
      <div className="px-3 pb-4">
        <svg viewBox={`0 0 360 ${H}`} className="h-auto w-full" role="img" aria-label={`The agent reaches ${list.length} Lab servers only through Zoro; the line to the attacker host is ${leaked ? 'open' : 'cut'}.`}>
          {/* links */}
          <path d={`M60 ${hubY} H140`} style={{ stroke: 'var(--border-strong)', strokeWidth: 1.6 }} />
          {list.map((s, i) => (
            <path key={s.label} d={`M200 ${hubY} C 230 ${hubY}, 230 ${rowY(i)}, 252 ${rowY(i)}`} style={{ fill: 'none', stroke: s.connected ? 'var(--border-strong)' : 'var(--border)', strokeWidth: 1.4, strokeDasharray: s.connected ? undefined : '4 4' }} />
          ))}
          {/* agent */}
          <circle cx="36" cy={hubY} r="22" style={{ fill: 'var(--lavender)', stroke: 'var(--border-strong)', strokeWidth: 1.6 }} />
          <foreignObject x="24" y={hubY - 12} width="24" height="24">
            <Bot className="size-6 text-on-pastel" />
          </foreignObject>
          <text x="36" y={hubY + 38} textAnchor="middle" style={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>
            Agent
          </text>
          {/* Zoro hub */}
          <rect x="140" y={hubY - 26} width="60" height="52" rx="12" style={{ fill: 'var(--mint)', stroke: 'var(--border-strong)', strokeWidth: 1.8 }} />
          <foreignObject x="158" y={hubY - 12} width="24" height="24">
            <ShieldCheck className="size-6 text-on-pastel" />
          </foreignObject>
          <text x="170" y={hubY + 42} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 11, fontWeight: 700 }}>
            Zoro
          </text>
          {/* servers */}
          {list.map((s, i) => {
            const held = /quarantin|held|block|unsafe/i.test(s.state);
            return (
              <g key={s.label}>
                <rect x="252" y={rowY(i) - 15} width="104" height="30" rx="8" style={{ fill: held ? 'var(--warn-bg)' : 'var(--surface)', stroke: 'var(--border-strong)', strokeWidth: 1.2 }} />
                <circle cx="264" cy={rowY(i)} r="4" style={{ fill: s.connected ? 'var(--ok)' : 'var(--neutral-state)' }} />
                <text x="274" y={rowY(i) + 4} style={{ fill: 'var(--text)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
                  {s.label.replace(/^lab-/, '').slice(0, 10)}
                </text>
                {held && (
                  <foreignObject x="336" y={rowY(i) - 8} width="16" height="16">
                    <Lock className="size-4 text-warn" />
                  </foreignObject>
                )}
              </g>
            );
          })}
          {/* attacker host, cut off */}
          <g>
            <path d={`M170 ${hubY + 26} V${H - 14} H70`} style={{ fill: 'none', stroke: leaked ? 'var(--danger)' : 'var(--border)', strokeWidth: 1.4, strokeDasharray: '5 5' }} />
            {!leaked && (
              <g transform={`translate(120 ${H - 14})`}>
                <circle r="9" style={{ fill: 'var(--ok-bg)', stroke: 'var(--ok)', strokeWidth: 1.6 }} />
                <path d="M-4 -4 L4 4 M4 -4 L-4 4" style={{ stroke: 'var(--ok)', strokeWidth: 2, strokeLinecap: 'round' }} />
              </g>
            )}
            <text x="14" y={H - 10} style={{ fill: leaked ? 'var(--danger)' : 'var(--text-dim)', fontSize: 10.5, fontWeight: 600 }}>
              attacker host
            </text>
          </g>
        </svg>
        <p className="px-2 text-[12.5px] text-ash">{leaked ? 'The line to the attacker was used during this run.' : 'The line to the attacker host is cut. No call reached it.'}</p>
      </div>
    </Panel>
  );
}

// ---------- incidents as alert tickets ----------

export interface LabIncident {
  id: string;
  seq: number;
  severity: string;
  status: string;
  title: string;
  summary: string;
  count: number;
}

const EDGE: Record<string, string> = { critical: 'bg-danger', high: 'bg-danger', medium: 'bg-warn', low: 'bg-pending', info: 'bg-pending' };

export function AlertTickets({ incidents }: { incidents: LabIncident[] }) {
  return (
    <Panel n={4} tip={PANEL_HELP.alerts} kicker="Incidents" title={incidents.length ? `${incidents.length} alert${incidents.length === 1 ? '' : 's'} raised` : 'No alerts'}>
      {incidents.length ? (
        <ul className="space-y-3 px-5 pb-5">
          {incidents.slice(0, 4).map((i) => (
            <li key={i.id} className="ticket relative flex overflow-hidden rounded-[10px] border border-sapphire bg-panel">
              <span className={cx('w-2 shrink-0', EDGE[i.severity] ?? 'bg-pending')} aria-hidden />
              <div className="min-w-0 flex-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[18px] font-bold leading-none">INC-{i.seq}</span>
                  <SeverityBadge severity={i.severity} />
                </div>
                <p className="mt-2 text-[14px] font-semibold leading-snug">{i.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ash">{i.summary}</p>
                <p className="mt-2 text-[11.5px] text-slate">
                  {i.status}
                  {i.count > 1 ? ` · seen ${i.count}×` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 pt-2 text-[14px] text-ash">When Zoro catches an attack it raises an alert here. Lab alerts never reach your real Console.</p>
      )}
    </Panel>
  );
}

// ---------- public records as receipts ----------

export interface LabSeal {
  fingerprint: string;
  name: string;
  server_label: string;
  verdict: string;
  status: string;
  ens_status: string | null;
  ledger_status: string | null;
  badge_status: string | null;
  links: { ens: string | null; ledger: string | null; badge: string | null };
}

export function Receipts({ seals }: { seals: LabSeal[] }) {
  return (
    <Panel n={5} tip={PANEL_HELP.receipts} kicker="Public records" title="Receipts anyone can check">
      {seals.length ? (
        <ul className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-1">
          {seals.slice(0, 3).map((x) => (
            <li key={x.fingerprint} className="receipt px-4 pb-5 pt-5 font-mono text-[11.5px] text-quartz">
              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-slate">Zoro verdict receipt</p>
              <p className="mt-2 truncate text-center text-[13px] font-bold">
                {x.server_label}/{x.name}
              </p>
              <div className="my-3 border-t border-dashed border-sapphire" />
              <dl className="space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate">fingerprint</dt>
                  <dd className="truncate">
                    {x.fingerprint.slice(0, 8)}…{x.fingerprint.slice(-4)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate">verdict</dt>
                  <dd>
                    <VerdictBadge verdict={x.verdict} status={x.status} />
                  </dd>
                </div>
              </dl>
              <div className="my-3 border-t border-dashed border-sapphire" />
              <PublicationBadges seal={x} />
              <Link href={`/verify?q=${x.fingerprint}`} className="mt-3 inline-flex items-center gap-1 font-sans text-[12.5px] font-semibold text-accent hover:underline">
                Verify this receipt <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 pt-2 text-[14px] text-ash">Every Lab verdict gets a public receipt under the lab namespace. None yet.</p>
      )}
    </Panel>
  );
}
