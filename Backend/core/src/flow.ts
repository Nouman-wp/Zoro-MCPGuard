import { argumentValues } from './policy/engine';
import type { FlowMatch } from './policy/types';
import { EMAIL_RE, ETH_ADDR_RE, URL_RE } from './sentinel/patterns';
import type { SinkType, SourceLabel } from './types';

interface SourceRecord {
  callId: string;
  tool: string;
  server: string;
  label: SourceLabel;
  identifiers: Set<string>;
  shingles: Set<string>;
  ts: number;
}

const PATH_RE = /(?:~|\/|[A-Za-z]:\\)[\w.\-\\/]{3,}/g;
const KEYLIKE_RE = /\b[A-Za-z0-9_\-+/]{24,}={0,2}\b/g;
const PHONE_RE = /\+\d[\d\s\-()]{8,}\d/g;

export function extractIdentifiers(text: string): string[] {
  const out = new Set<string>();
  for (const re of [EMAIL_RE, URL_RE, ETH_ADDR_RE, PATH_RE, KEYLIKE_RE, PHONE_RE])
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) if (m[0].length >= 6) out.add(m[0].toLowerCase());
  return [...out];
}

const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function shingles(text: string, size = 6): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(' '));
  return out;
}

/**
 * Per-session tracker: remembers what sensitive or untrusted sources returned, and finds that content again in the
 * arguments of later sink calls (exact identifiers and 6-word shingles). Sessions never share a tracker (FR-G8).
 */
export class FlowTracker {
  private sources: SourceRecord[] = [];
  constructor(private readonly maxSources = 200) {}

  recordSource(callId: string, server: string, tool: string, label: SourceLabel, output: string) {
    if (label === 'neutral' || !output) return;
    this.sources.push({ callId, server, tool, label, identifiers: new Set(extractIdentifiers(output)), shingles: shingles(output), ts: Date.now() });
    if (this.sources.length > this.maxSources) this.sources.shift();
  }

  findFlows(args: Record<string, unknown>, sinks: SinkType[]): FlowMatch[] {
    if (!sinks.length || !this.sources.length) return [];
    const out: FlowMatch[] = [];
    const flat = Object.keys(args).map((k) => ({ k, text: argumentValues(args, k).join('\n') }));
    for (const src of [...this.sources].reverse()) {
      for (const { k, text } of flat) {
        if (!text) continue;
        const lower = text.toLowerCase();
        const id = [...src.identifiers].find((i) => lower.includes(i));
        if (id) {
          out.push({ sourceCallId: src.callId, sourceTool: src.tool, sourceServer: src.server, sourceLabel: src.label, sinkTypes: sinks, matched: id, matchKind: 'identifier', argument: k });
          continue;
        }
        const sh = [...shingles(text)].find((s) => src.shingles.has(s));
        if (sh) out.push({ sourceCallId: src.callId, sourceTool: src.tool, sourceServer: src.server, sourceLabel: src.label, sinkTypes: sinks, matched: sh, matchKind: 'fuzzy', argument: k });
      }
    }
    return out;
  }

  /** Instruction-like content from an untrusted source immediately followed by a high-impact call (§4.10). */
  lastUntrusted(withinMs: number) {
    const now = Date.now();
    return [...this.sources].reverse().find((s) => s.label === 'untrusted_external' && now - s.ts <= withinMs) ?? null;
  }
}
