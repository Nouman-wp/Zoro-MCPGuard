'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { Button, CodeBlock, Notice, cx, inputCls } from '../ui';
import { api } from '@/lib/api';

interface AskResult {
  answer: string;
  citations: string[];
  proposals: { rule: Record<string, unknown>; reading: string; explanation: string }[];
  model: string | null;
}

const SUGGESTIONS = ['Why was a tool blocked today?', 'Which of my tools can send data outside my company?', 'What changed on my servers this week?', 'Write a policy that only lets my research agent use read-only tools.'];

/** Turn [INC-12] / [tool:server/name] / [call:id] citations into links to the records they cite. */
function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[(?:INC-\d+|APR-\d+|call:[\w-]+|tool:[\w.-]+\/[\w.-]+|rule:[\w.-]+)\])/g);
  return (
    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-mist">
      {parts.map((p, i) => {
        const m = p.match(/^\[(.+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const ref = m[1];
        const href = ref.startsWith('INC-') ? `/console/incidents?seq=${ref.slice(4)}` : ref.startsWith('APR-') ? '/console/approvals' : ref.startsWith('call:') ? `/console/traffic/${ref.slice(5)}` : ref.startsWith('rule:') ? '/console/policies' : `/console/servers`;
        return (
          <Link key={i} href={href} className="rounded bg-cobalt px-1 font-mono text-[12px] text-frosted hover:text-quartz">
            {ref}
          </Link>
        );
      })}
    </p>
  );
}

export function AskZoroPanel({ open, onClose, enabled }: { open: boolean; onClose: () => void; enabled: boolean }) {
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string; result?: AskResult }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    const prior = history.map((h) => ({ role: h.role, content: h.content }));
    setHistory((h) => [...h, { role: 'user', content: question }]);
    setQ('');
    try {
      const r = await api<AskResult>('/api/console/ask', { json: { question, history: prior } });
      setHistory((h) => [...h, { role: 'assistant', content: r.answer, result: r }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="slide-in flex h-full w-full max-w-md flex-col border-l border-obsidian bg-abyss" aria-label="Ask Zoro">
        <div className="flex h-14 items-center justify-between border-b border-inkline px-4">
          <span className="inline-flex items-center gap-2 text-[15px] font-medium">
            <Sparkles className="size-4 text-frosted" aria-hidden /> Ask Zoro
          </span>
          <button onClick={onClose} className="rounded-md p-1 text-ash hover:text-quartz" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-[12px] text-ash">Answers come only from your local records and the public registry, and cite them. Ask Zoro cannot change anything: policies it writes are proposals you review.</p>
          {!enabled && <Notice tone="info" title="Not configured">Ask Zoro needs an AI provider. Set GROQ_API_KEY on the daemon to enable it (a free key from console.groq.com); nothing is sent anywhere until you do.</Notice>}
          {history.length === 0 && enabled && (
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void ask(s)} className="block w-full rounded-[10px] border border-obsidian bg-deep-sea px-3 py-2 text-left text-[13px] text-mist hover:border-sapphire">
                  {s}
                </button>
              ))}
            </div>
          )}
          {history.map((h, i) => (
            <div key={i} className={cx('rounded-[10px] p-3', h.role === 'user' ? 'ml-8 bg-cobalt' : 'border border-inkline bg-deep-sea')}>
              {h.role === 'user' ? <p className="text-[14px] text-quartz">{h.content}</p> : <Cited text={h.content} />}
              {h.result?.proposals.map((p, n) => (
                <div key={n} className="mt-3 rounded-[10px] border border-frosted/30 p-3">
                  <p className="text-[12px] uppercase tracking-wider text-frosted">Proposed rule (not saved)</p>
                  <p className="mt-1 text-[13px] text-quartz">{p.reading}</p>
                  <p className="mt-1 text-[12px] text-ash">{p.explanation}</p>
                  <CodeBlock className="mt-2" code={JSON.stringify(p.rule, null, 2)} maxHeight={160} />
                  <Link href={`/console/policies?propose=${encodeURIComponent(JSON.stringify(p.rule))}`} className="mt-2 inline-block text-[13px] text-frosted hover:text-quartz">
                    Review in the policy editor →
                  </Link>
                </div>
              ))}
              {h.result?.model && <p className="mt-2 text-[11px] text-slate">model: {h.result.model}</p>}
            </div>
          ))}
          {busy && <p className="text-[13px] text-ash">Reading your records…</p>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <form
          className="flex gap-2 border-t border-inkline p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!enabled || busy} placeholder="Ask about your security posture" className={inputCls} aria-label="Question" />
          <Button type="submit" size="md" disabled={!enabled || busy || !q.trim()} aria-label="Send" icon={<Send className="size-4" />} />
        </form>
      </aside>
    </div>
  );
}
