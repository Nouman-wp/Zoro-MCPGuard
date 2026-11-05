'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown = null) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'The Zoro daemon is not reachable. Start it with `pnpm dev` — while it is down, Zoro is not protecting anything.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (res.status === 401 && path.startsWith('/api/console') && typeof window !== 'undefined' && !window.location.pathname.startsWith('/console/login')) {
    window.location.href = `/console/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : res.status >= 500 ? 'The Zoro daemon is not reachable or returned an error.' : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

type Scope = 'console' | 'lab';
type Listener = (type: string, data: unknown) => void;
const sources: Partial<Record<Scope, { es: EventSource; listeners: Set<Listener> }>> = {};

const EVENT_TYPES = ['call', 'incident', 'approval', 'audit', 'seal', 'server', 'tool', 'notification', 'outbox', 'ledger', 'lab', 'lab_event', 'human_seal', 'policy', 'status', 'log'];

function subscribe(scope: Scope, l: Listener) {
  if (!sources[scope]) {
    const es = new EventSource(scope === 'console' ? '/api/console/stream' : '/api/public/lab/stream');
    const listeners = new Set<Listener>();
    for (const t of EVENT_TYPES)
      es.addEventListener(t, (e) => {
        let data: unknown = null;
        try {
          data = JSON.parse((e as MessageEvent).data);
        } catch {
          /* ignore */
        }
        for (const fn of listeners) fn(t, data);
      });
    sources[scope] = { es, listeners };
  }
  sources[scope]!.listeners.add(l);
  return () => {
    const s = sources[scope];
    if (!s) return;
    s.listeners.delete(l);
    if (s.listeners.size === 0) {
      s.es.close();
      delete sources[scope];
    }
  };
}

export function useEvents(scope: Scope, onEvent: Listener, enabled = true) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => (enabled ? subscribe(scope, (t, d) => ref.current(t, d)) : undefined), [scope, enabled]);
}

/**
 * Fetch JSON and keep it fresh: re-fetches when any of the given live event types arrive (debounced), and
 * optionally on an interval. Never caches stale security state across navigations.
 */
export function useApi<T>(path: string | null, opts: { on?: string[]; scope?: Scope; interval?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(Boolean(path));
    void reload();
  }, [reload, path]);
  useEffect(() => {
    if (!opts.interval) return;
    const t = setInterval(() => void reload(), opts.interval);
    return () => clearInterval(t);
  }, [reload, opts.interval]);
  const on = opts.on ?? [];
  useEvents(
    opts.scope ?? (path?.startsWith('/api/public') ? 'lab' : 'console'),
    (type) => {
      if (!on.includes(type) && !on.includes('*')) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload(), 250);
    },
    on.length > 0,
  );
  return { data, error, loading, reload, setData };
}
