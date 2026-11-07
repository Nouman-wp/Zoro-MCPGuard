'use client';

/**
 * The Lab timeline as an attack replay: four lanes (Lab · Attacker · Agent · Zoro) like a sequence diagram. Each event
 * sits in its actor's lane, and a dashed line shows the hand-over from the previous actor. Zoro's stops are drawn as
 * walls. On small screens it collapses to a single rail with lane chips.
 */
import { Bot, FlaskConical, ShieldCheck, Skull, type LucideIcon } from 'lucide-react';
import { cx } from '../ui';
import { Tip } from '../tip';
import { LANE_HELP } from './explain';

export interface ReplayEvent {
  id: string;
  ts: number;
  actor: 'step' | 'agent' | 'attacker' | 'zoro' | 'note' | 'result' | 'error';
  title: string;
  detail?: string;
}

const LANES: { key: 'lab' | 'attacker' | 'agent' | 'zoro'; label: string; icon: LucideIcon; card: string; head: string }[] = [
  { key: 'lab', label: 'Lab', icon: FlaskConical, card: 'bg-panel', head: 'bg-ink/[0.05]' },
  { key: 'attacker', label: 'Attacker', icon: Skull, card: 'bg-danger-bg', head: 'bg-danger-bg text-danger' },
  { key: 'agent', label: 'Agent', icon: Bot, card: 'bg-lavender-soft', head: 'bg-lavender text-on-pastel' },
  { key: 'zoro', label: 'Zoro', icon: ShieldCheck, card: 'bg-mint-soft', head: 'bg-mint text-on-pastel' },
];

const laneOf = (a: ReplayEvent['actor']) => (a === 'attacker' ? 1 : a === 'agent' ? 2 : a === 'zoro' || a === 'result' ? 3 : 0);
const isWall = (e: ReplayEvent) => e.actor === 'zoro' && /block|quarantin|held|deni|refus|stop|unsafe|redact/i.test(e.title);
const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function ReplayLanes({ events, running }: { events: ReplayEvent[]; running: boolean }) {
  return (
    <div>
      {/* lane headers */}
      <div className="sticky top-0 z-10 hidden grid-cols-[72px_repeat(4,1fr)] gap-2 border-b border-obsidian bg-panel px-4 py-2.5 md:grid">
        <span />
        {LANES.map((l) => (
          <Tip key={l.key} content={LANE_HELP[l.key]} block>
            <span tabIndex={0} className={cx('flex cursor-help items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-semibold', l.head)}>
              <l.icon className="size-3.5" aria-hidden /> {l.label}
            </span>
          </Tip>
        ))}
      </div>
      <ol className="relative px-4 py-3">
        {/* lane guides */}
        <div className="pointer-events-none absolute inset-y-0 left-4 right-4 hidden grid-cols-[72px_repeat(4,1fr)] gap-2 md:grid" aria-hidden>
          <span />
          {LANES.map((l) => (
            <span key={l.key} className="mx-auto w-px bg-obsidian" />
          ))}
        </div>
        {events.map((e, i) => {
          const lane = laneOf(e.actor);
          const prev = i > 0 ? laneOf(events[i - 1].actor) : lane;
          const L = LANES[lane];
          const latest = i === events.length - 1;
          const wall = isWall(e);
          const err = e.actor === 'error';
          const lo = Math.min(prev, lane);
          const hi = Math.max(prev, lane);
          return (
            <li key={e.id} className="slide-in relative grid grid-cols-1 gap-2 py-1.5 md:grid-cols-[72px_repeat(4,1fr)]">
              {/* hand-over line from the previous actor's lane */}
              {hi > lo && (
                <span className="pointer-events-none absolute top-0 hidden h-px border-t border-dashed border-sapphire md:block" style={{ left: `calc(72px + 0.5rem + ${lo} * ((100% - 72px - 2rem) / 4 + 0.5rem) + ((100% - 72px - 2rem) / 8))`, width: `calc(${hi - lo} * ((100% - 72px - 2rem) / 4 + 0.5rem))` }} aria-hidden />
              )}
              <span className="hidden pt-2 font-mono text-[11px] text-slate md:block">{clock(e.ts)}</span>
              <div className={cx('relative min-w-0 rounded-[10px] border px-3 py-2 md:[grid-column-start:var(--lane)]', err ? 'border-danger bg-danger-bg' : wall ? 'border-sapphire border-l-[5px] bg-mint-soft' : cx('border-obsidian', L.card), latest && running && 'ring-2 ring-[color:var(--lavender)]')} style={{ ['--lane' as string]: lane + 2 }} data-lane={lane}>
                <span className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate md:hidden">
                  <L.icon className="size-3.5" aria-hidden /> {L.label} · <span className="font-mono">{clock(e.ts)}</span>
                </span>
                {wall && <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-ok">Zoro stopped it</span>}
                <p className={cx('text-[13.5px] leading-snug', latest ? 'font-semibold text-quartz' : 'text-mist')}>{e.title}</p>
                {e.detail && <p className={cx('mt-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ash', !latest && 'line-clamp-2')}>{e.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
