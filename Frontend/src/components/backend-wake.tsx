'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCw, ServerCrash } from 'lucide-react';
import { BACKEND_UP_EVENT, isLocalApp } from '@/lib/backend';
import { cx } from './ui';

type Phase = 'checking' | 'ok' | 'waking' | 'woke' | 'down';

/** A warm backend answers its health check in milliseconds; anything slower means it is starting. */
const SLOW_MS = 2_500;
/** A cold start takes about a minute. Well past that, stop calling it "starting" and say it is not responding. */
const GIVE_UP_MS = 150_000;
const RETRY_MS = 3_000;
const DOWN_RETRY_MS = 10_000;
/** After the tab was hidden this long, the backend may have gone to sleep again; check before the user acts. */
const RECHECK_AFTER_HIDDEN_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function healthy() {
  try {
    const r = await fetch('/api/healthz', { cache: 'no-store', signal: AbortSignal.timeout(130_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * The hosted backend runs on an instance that sleeps when idle. Instead of a blank page or a misleading error while it
 * wakes, this says plainly what is happening and clears itself once the backend answers (§9.4 degraded state). On the
 * developer's own machine it stays out of the way: the Console already explains how to start the daemon.
 */
export function BackendWake() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [elapsed, setElapsed] = useState(0);
  const run = useRef(0);

  const check = useCallback(async () => {
    const id = ++run.current;
    const started = Date.now();
    const live = () => run.current === id;
    setElapsed(0);
    const slow = setTimeout(() => live() && setPhase((p) => (p === 'checking' || p === 'ok' ? 'waking' : p)), SLOW_MS);
    const tick = setInterval(() => live() && setElapsed(Math.round((Date.now() - started) / 1000)), 1_000);
    try {
      while (live()) {
        if (await healthy()) {
          if (!live()) return;
          const wasSlow = Date.now() - started > SLOW_MS;
          setPhase(wasSlow ? 'woke' : 'ok');
          if (wasSlow) {
            window.dispatchEvent(new Event(BACKEND_UP_EVENT));
            setTimeout(() => live() && setPhase('ok'), 4_000);
          }
          return;
        }
        if (!live()) return;
        const over = Date.now() - started > GIVE_UP_MS;
        setPhase(over ? 'down' : 'waking');
        await sleep(over ? DOWN_RETRY_MS : RETRY_MS);
      }
    } finally {
      clearTimeout(slow);
      clearInterval(tick);
    }
  }, []);

  useEffect(() => {
    if (isLocalApp()) return;
    void check();
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RECHECK_AFTER_HIDDEN_MS) void check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      run.current++;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check]);

  if (phase === 'checking' || phase === 'ok') return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'slide-in pointer-events-auto flex max-w-xl items-start gap-3 rounded-[14px] border bg-sunken px-4 py-3 text-[13.5px] shadow-[var(--shadow-xl)]',
          phase === 'down' ? 'border-danger/40' : 'border-ink/[0.1]',
        )}
      >
        {phase === 'waking' && <span className="mt-1 size-3.5 shrink-0 animate-spin rounded-full border-2 border-frosted/30 border-t-frosted" aria-hidden />}
        {phase === 'woke' && <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />}
        {phase === 'down' && <ServerCrash className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
        <div className="min-w-0">
          {phase === 'waking' && (
            <>
              <p className="font-medium text-quartz">
                Starting the Zoro backend… <span className="font-mono text-ash">{elapsed}s</span>
              </p>
              <p className="mt-0.5 text-mist">It runs on a free instance that sleeps when idle and takes about a minute to wake. Nothing to do: this page continues on its own.</p>
            </>
          )}
          {phase === 'woke' && <p className="font-medium text-quartz">The backend is up.</p>}
          {phase === 'down' && (
            <>
              <p className="font-medium text-quartz">The Zoro backend is not responding.</p>
              <p className="mt-0.5 text-mist">It has not answered for over two minutes, longer than a normal wake-up. Zoro keeps retrying in the background; pages that need live data stay unavailable until it answers.</p>
            </>
          )}
        </div>
        {phase === 'down' && (
          <button onClick={() => void check()} className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[13px] text-frosted transition-colors hover:bg-ink/[0.05]">
            <RotateCw className="size-3.5" aria-hidden /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
