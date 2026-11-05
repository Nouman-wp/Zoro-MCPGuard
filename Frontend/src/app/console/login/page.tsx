'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { KeyRound } from 'lucide-react';
import { Logo } from '@/components/site';
import { ThemeToggle } from '@/components/theme';
import { Button, Card, Field, Notice, inputCls } from '@/components/ui';

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') ?? '/console';

  const submit = async (t: string) => {
    setBusy(true);
    setError(null);
    const r = await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t.trim() }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setError(j.error ?? 'Sign-in failed');
    router.replace(next.startsWith('/console') ? next : '/console');
  };

  useEffect(() => {
    const t = params.get('token');
    if (t) void submit(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-void px-4">
      <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <div className="glow glow-blue left-1/2 top-1/2 h-[420px] w-[620px] -translate-x-1/2 -translate-y-[60%] opacity-40" aria-hidden />
      <div className="halftone fade-radial pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[900px] -translate-x-1/2 -translate-y-1/2 opacity-20" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-md">
      <Card elevated className="w-full card-grad p-8">
        <Logo />
        <h1 className="font-display mt-6 text-[28px] font-medium">Sign in to the Console</h1>
        <p className="mt-2 text-[14px] font-light text-ash">The Console shows your own activity, so it is protected by a local token. The daemon prints a sign-in link when it starts; the token is also in <span className="font-mono text-mist">console.token</span> in Zoro’s data directory (on Windows, <span className="font-mono text-mist">%LOCALAPPDATA%\Zoro</span>). On a hosted deployment, it is the <span className="font-mono text-mist">ZORO_CONSOLE_TOKEN</span> value set on the backend.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(token);
          }}
        >
          <Field label="Console token">
            <input value={token} onChange={(e) => setToken(e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} aria-label="Console token" />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" loading={busy} icon={<KeyRound className="size-4" />} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
