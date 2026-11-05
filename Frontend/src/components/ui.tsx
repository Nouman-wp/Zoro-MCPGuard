'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, ChevronLeft, CircleAlert, Copy, Info, Loader2, X } from 'lucide-react';
import { shortHash } from '@/lib/format';
import { CountUp } from './motion';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------- Buttons (agentql.com: light filled primary, dark outlined secondary, one blue accent pill) ----------

type BtnVariant = 'primary' | 'ghost' | 'accent' | 'subtle' | 'danger' | 'link';
const BTN: Record<BtnVariant, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  accent: 'text-quartz rounded-full! bg-[linear-gradient(90deg,#2f5fd0,#5b5cf0)] border border-white/15 shadow-[0_6px_24px_-6px_rgba(70,100,255,0.6)] hover:brightness-110',
  subtle: 'bg-deep-sea text-mist border border-obsidian hover:border-sapphire hover:text-quartz',
  danger: 'bg-danger-bg text-danger border border-danger/40 hover:border-danger',
  link: 'bg-transparent text-frosted hover:text-quartz border border-transparent px-0!',
};
const BTN_BASE = 'inline-flex items-center justify-center gap-2 rounded-[8px] font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,filter,transform] duration-[180ms] ease-out active:scale-[0.97] active:duration-[120ms] [touch-action:manipulation]';
const BTN_SIZE = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-4.5 text-[14px]', lg: 'h-12 px-6 text-[15.5px]' } as const;

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx(BTN_BASE, 'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100', BTN_SIZE[size], BTN[variant], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', size = 'md', children, className, external }: { href: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; className?: string; external?: boolean }) {
  const cls = cx(BTN_BASE, BTN_SIZE[size], BTN[variant], className);
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

// ---------- Surfaces ----------

export function Card({ children, className, highlight, elevated, as: As = 'div', ...rest }: { children: ReactNode; className?: string; highlight?: boolean; elevated?: boolean; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <As {...rest} className={cx('rounded-[14px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', highlight ? 'bg-cobalt border-cobalt-edge' : 'bg-deep-sea border-ink/[0.07]', elevated && 'shadow-[var(--shadow-xl)]', className)}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-5 pb-3 pt-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[14.5px] font-medium text-quartz">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ash">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-[12.5px] font-medium uppercase tracking-[0.06em] text-ash', className)}>{children}</p>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-1 text-[13px] text-ash [&_a]:transition-colors [&_a:hover]:text-quartz">
            <ChevronLeft className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[26px] font-medium leading-tight text-quartz md:text-[30px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[15px] font-light leading-relaxed text-ash">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

// ---------- Badges (text always present; color only reinforces) ----------

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'violet';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-frosted',
  neutral: 'bg-ink/[0.06] text-mist',
  violet: 'bg-violet-bg text-violet-ink',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[3px] text-[12px] font-medium leading-none', TONE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<string, Tone> = { sealed: 'ok', sealed_with_warnings: 'warn', unsafe: 'danger', pending: 'neutral' };
const VERDICT_TEXT: Record<string, string> = { sealed: 'Sealed', sealed_with_warnings: 'Sealed · warnings', unsafe: 'Unsafe', pending: 'Pending' };

export function VerdictBadge({ verdict, status }: { verdict: string | null | undefined; status?: string | null }) {
  if (status === 'revoked') return <Badge tone="danger" dot>Revoked</Badge>;
  if (status === 'expired') return <Badge tone="neutral" dot>Expired</Badge>;
  if (!verdict) return <Badge tone="neutral">Not audited</Badge>;
  return (
    <Badge tone={VERDICT_TONE[verdict] ?? 'neutral'} dot>
      {VERDICT_TEXT[verdict] ?? verdict}
      {status === 'superseded' ? ' · superseded' : ''}
    </Badge>
  );
}

const SEV_TONE: Record<string, Tone> = { critical: 'danger', high: 'danger', medium: 'warn', low: 'info', info: 'neutral' };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={SEV_TONE[severity] ?? 'neutral'} className={severity === 'critical' ? 'font-semibold' : undefined}>
      {severity === 'critical' ? <CircleAlert className="size-3" aria-hidden /> : null}
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

const DEC_TONE: Record<string, Tone> = { allow: 'ok', ask: 'warn', block: 'danger' };
export function DecisionBadge({ decision, observe }: { decision: string; observe?: boolean | number }) {
  return (
    <Badge tone={DEC_TONE[decision] ?? 'neutral'}>
      {decision === 'allow' ? 'Allowed' : decision === 'ask' ? 'Asked' : decision === 'block' ? 'Blocked' : decision}
      {observe ? ' (observe)' : ''}
    </Badge>
  );
}

const STATE_TONE: Record<string, Tone> = { released: 'ok', quarantined: 'warn', awaiting_release: 'violet', blocked: 'danger', removed: 'neutral' };
export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONE[state] ?? 'neutral'}>{state === 'awaiting_release' ? 'Awaiting release' : state.charAt(0).toUpperCase() + state.slice(1)}</Badge>;
}

export function PublishBadge({ label, status, href }: { label: string; status: string | null | undefined; href?: string | null }) {
  const tone: Tone = status === 'written' || status === 'anchored' || status === 'minted' ? 'ok' : status === 'failed' ? 'danger' : status === 'burned' ? 'danger' : status === 'pending' || status === 'retrying' ? 'warn' : 'neutral';
  const text = status === 'written' ? 'written' : status === 'anchored' ? 'anchored' : status === 'minted' ? 'minted' : status === 'burned' ? 'burned (revoked)' : status === 'not_configured' ? 'not configured' : status === 'not_applicable' ? 'n/a' : status === 'lab_unpublished' ? 'lab · not published' : status ? status.replace(/_/g, ' ') : 'n/a';
  const inner = (
    <Badge tone={tone}>
      {label}: {text}
    </Badge>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80">
      {inner}
    </a>
  ) : (
    inner
  );
}

// ---------- Feedback states (§9.4) ----------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ash" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-ink/[0.05]', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ash">{icon}</div>}
      <p className="text-[15px] font-medium text-quartz">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-[14px] font-light text-ash">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: { message: string; status?: number } | null; retry?: () => void }) {
  if (!error) return null;
  const down = error.status === 0 || (error.status ?? 0) >= 500;
  return (
    <div className="m-5 flex items-start gap-3 rounded-[10px] border border-danger/30 bg-danger-bg px-4 py-3 text-[14px]" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-quartz">{down ? 'Zoro daemon unreachable — not protecting' : 'Something went wrong'}</p>
        <p className="mt-0.5 text-mist">{error.message}</p>
      </div>
      {retry && (
        <Button size="sm" variant="subtle" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, className, action }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = tone === 'ok' ? Check : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex items-start gap-3 rounded-[10px] px-4 py-3 text-[13.5px]', TONE[tone], className)} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-mist">
        {title && <p className="font-medium text-quartz">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ---------- Data display ----------

/** One cell of a divided KPI strip (place several inside a grid with gap-px on a lighter background). */
export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: Tone }) {
  const body = (
    <div className={cx('group h-full bg-deep-sea p-5 transition-colors duration-200', href && 'hover:bg-raised')}>
      <p className="flex items-center justify-between text-[13px] text-ash">
        {label}
        {href && <span className="translate-x-[-4px] text-[12px] opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden>→</span>}
      </p>
      <p className={cx('tabular mt-2 font-display text-[32px] font-medium leading-none', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-quartz')}>{typeof value === 'number' ? <CountUp value={value} duration={0.8} /> : value}</p>
      {hint && <p className="mt-2 text-[12px] text-ash">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KV({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[13px] text-ash">{k}</dt>
          <dd className="min-w-0 break-words text-[14px] text-mist">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md p-1 text-steel hover:bg-ink/5 hover:text-quartz"
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

export function Hash({ value, head = 6, tail = 4, href }: { value: string | null | undefined; head?: number; tail?: number; href?: string }) {
  if (!value) return <span className="text-ash">—</span>;
  const inner = <span className="font-mono text-[12.5px] text-mist">{shortHash(value, head, tail)}</span>;
  return (
    <span className="inline-flex items-center gap-1" title={value}>
      {href ? (
        <Link href={href} className="hover:underline">
          {inner}
        </Link>
      ) : (
        inner
      )}
      <CopyButton value={value} />
    </span>
  );
}

/** A code panel in agentql's manner: navy surface, file name in the header, quiet line numbers. */
export function CodeBlock({ code, filename, language = 'json', maxHeight = 420, className, lineNumbers }: { code: string; filename?: string; language?: 'json' | 'text' | 'shell'; maxHeight?: number; className?: string; lineNumbers?: boolean }) {
  const lines = code.split('\n');
  const numbered = lineNumbers ?? (language !== 'shell' && lines.length > 1 && lines.length < 400);
  return (
    <div className={cx('overflow-hidden rounded-[12px] border border-code-edge bg-code shadow-[inset_0_1px_0_rgba(140,170,255,0.07)]', className)}>
      {(filename || code) && (
        <div className="flex items-center justify-between border-b border-code-edge/80 px-4 py-2">
          <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#9aa8c7]">
            <span className="flex gap-1" aria-hidden>
              <span className="size-2 rounded-full bg-white/15" />
              <span className="size-2 rounded-full bg-white/10" />
              <span className="size-2 rounded-full bg-white/[0.07]" />
            </span>
            <span className="truncate">{filename ?? language}</span>
          </span>
          <CopyButton value={code} />
        </div>
      )}
      <pre className="overflow-auto py-3.5 font-mono text-[12.8px] leading-[1.6] text-[#c8d3ea]" style={{ maxHeight }}>
        {numbered ? (
          <code className="grid grid-cols-[auto_1fr]">
            {lines.map((l, i) => (
              <span key={i} className="contents">
                <span className="select-none pl-4 pr-4 text-right text-[#3d4a6b]" aria-hidden>
                  {i + 1}
                </span>
                <span className="pr-4">{language === 'json' ? <JsonHighlight code={l} /> : l || ' '}</span>
              </span>
            ))}
          </code>
        ) : (
          <code className="block px-4">{language === 'json' ? <JsonHighlight code={code} /> : code}</code>
        )}
      </pre>
    </div>
  );
}

function JsonHighlight({ code }: { code: string }) {
  const parts = code.split(/("(?:[^"\\]|\\.)*"(?:\s*:)?|\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^".*"\s*:$/.test(p)) return <span key={i} className="text-code-key">{p}</span>;
        if (p.startsWith('"')) return <span key={i} className="text-code-str">{p}</span>;
        if (/^(true|false|null)$/.test(p)) return <span key={i} className="text-frosted">{p}</span>;
        if (/^-?\d/.test(p)) return <span key={i} className="text-code-num">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ---------- Tabs & modal ----------

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const group = useId();
  return (
    <div role="tablist" className={cx('no-scrollbar flex gap-1 overflow-x-auto border-b border-ink/[0.06]', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors duration-[180ms]', value === t.id ? 'text-quartz' : 'text-ash hover:text-mist')}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular rounded-full bg-ink/[0.06] px-1.5 text-[11px] text-mist">{t.count}</span>}
          {value === t.id && <motion.span layoutId={`tab-${group}`} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-quartz" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cx('max-h-[92vh] w-full overflow-hidden rounded-t-[16px] border border-ink/[0.08] bg-sunken shadow-[var(--shadow-xl)] outline-none sm:rounded-[16px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
          >
            <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-4">
              <h2 id={id} className="text-[16px] font-medium">
                {title}
              </h2>
              <button onClick={onClose} className="rounded-md p-1 text-ash transition-colors hover:bg-ink/5 hover:text-quartz" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink/[0.06] px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Form controls ----------

export const inputCls = 'h-10 w-full rounded-[8px] border border-control-edge bg-field px-3 text-[14px] text-quartz placeholder:text-slate transition-[border-color,box-shadow] duration-[180ms] hover:border-control-hover focus:border-frosted/60 focus:outline-none focus:ring-[3px] focus:ring-[#4f7fe8]/20';

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-mist">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ash">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, className, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; ariaLabel?: string }) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'pr-8', className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-abyss">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-[14px] text-mist">
      <span className={cx('relative h-5 w-9 rounded-full border transition-colors duration-[180ms]', checked ? 'border-[#5b7fe0] bg-[#3a63d0]' : 'border-control-edge bg-field')}>
        <span className={cx('absolute left-0.5 top-0.5 size-3.5 rounded-full bg-quartz shadow-sm transition-transform duration-[240ms] ease-out', checked ? 'translate-x-4' : 'translate-x-0')} />
      </span>
      {label}
    </button>
  );
}

// ---------- Table ----------

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="tabular w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-ink/[0.06] text-[12.5px] text-ash">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/[0.045] [&>tr]:transition-colors [&>tr]:duration-[180ms] [&>tr:hover]:bg-ink/[0.018]">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx('px-4 py-3 align-middle text-mist', className)}>
      {children}
    </td>
  );
}
