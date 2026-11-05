import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULESET_VERSION, combineVerdict, runStaticLayers, scanOutput, severityRank, type Definition, type DefinitionKind } from '@zoro/core';
import { MALICIOUS_CORPUS, OUTPUT_INJECTION_CORPUS } from '@zoro/core/corpus';
import { REPO_ROOT } from './config';
import { get, json, run } from './db';
import { aiConfigured, aiReview } from './sentinel/ai';
import { providerName } from './llm';

export const CLEAN_CORPUS_PATH = path.join(REPO_ROOT, 'Backend', 'core', 'corpus', 'clean.json');

export interface CleanCorpus {
  capturedAt: string;
  sources: { server: string; package: string; version: string | null; command: string }[];
  entries: { server: string; kind: DefinitionKind; definition: Definition }[];
}

export function loadCleanCorpus(): CleanCorpus | null {
  if (!existsSync(CLEAN_CORPUS_PATH)) return null;
  return json<CleanCorpus | null>(readFileSync(CLEAN_CORPUS_PATH, 'utf8'), null);
}

const baseInput = (server: string, kind: DefinitionKind, definition: Definition) => ({
  kind, definition, previous: null, serverName: server, declaredServerName: null, declaredServerVersion: null, artifactId: null, transport: 'corpus', manifestRoot: null, otherTools: [{ server: 'whatsapp', name: 'send_message' }], lab: false,
});

/** Deterministic measurement: reproducible by anyone (FR-A8). Runs at startup and after every ruleset change. */
export function measureDeterministic() {
  const malicious = MALICIOUS_CORPUS.map((e) => {
    const layers = runStaticLayers(baseInput(e.server, e.kind, e.definition));
    const { verdict } = combineVerdict({ deterministic: layers.deterministic, differential: [], ai: { status: 'not_configured', findings: [], summary: null, configs: [], reason: null }, detonation: [], requireAi: false });
    const top = layers.deterministic.reduce((m, f) => Math.max(m, severityRank(f.severity)), -1);
    return { id: e.id, title: e.title, category: e.category, reference: e.reference, verdict, detected: verdict === 'unsafe', severityMet: top >= severityRank(e.expectSeverity), findings: layers.deterministic.map((f) => ({ rule: f.ruleId, severity: f.severity, title: f.title })) };
  });
  const clean = loadCleanCorpus();
  const cleanResults = (clean?.entries ?? []).map((e) => {
    const layers = runStaticLayers(baseInput(e.server, e.kind, e.definition));
    const { verdict } = combineVerdict({ deterministic: layers.deterministic, differential: [], ai: { status: 'not_configured', findings: [], summary: null, configs: [], reason: null }, detonation: [], requireAi: false });
    return { server: e.server, name: e.definition.name, verdict, falseBlock: verdict === 'unsafe', warning: verdict === 'sealed_with_warnings', findings: layers.deterministic.filter((f) => f.severity !== 'info' && f.severity !== 'low').map((f) => ({ rule: f.ruleId, severity: f.severity, title: f.title })) };
  });
  const shield = OUTPUT_INJECTION_CORPUS.map((s) => ({ id: s.id, reference: s.reference, detected: scanOutput(s.text, ['send_email']).some((f) => f.severity !== 'low') }));
  const results = {
    layers: 'deterministic + differential',
    malicious: { total: malicious.length, detected: malicious.filter((m) => m.detected).length, items: malicious },
    clean: clean ? { total: cleanResults.length, falseBlocks: cleanResults.filter((c) => c.falseBlock).length, warnings: cleanResults.filter((c) => c.warning).length, capturedAt: clean.capturedAt, sources: clean.sources, items: cleanResults } : null,
    outputShield: { total: shield.length, detected: shield.filter((s) => s.detected).length, items: shield },
  };
  const id = randomUUID();
  run('INSERT INTO corpus_runs(id, ts, ruleset, ai, results) VALUES(?,?,?,?,?)', id, Date.now(), RULESET_VERSION, null, JSON.stringify(results));
  return { id, ts: Date.now(), ruleset: RULESET_VERSION, results };
}

/** Optional: measure the AI layer on the same corpus. Costs API usage, so it only runs when a person asks. */
export async function measureWithAi() {
  if (!aiConfigured()) throw new Error('AI layer is not configured');
  const clean = loadCleanCorpus();
  const items: { set: 'malicious' | 'clean'; id: string; status: string; flagged: boolean }[] = [];
  for (const e of MALICIOUS_CORPUS) {
    const r = await aiReview({ serverName: e.server, kind: e.kind, definition: e.definition, previous: null, fields: [], highImpact: false });
    items.push({ set: 'malicious', id: e.id, status: r.status, flagged: r.findings.some((f) => f.confidence !== 'low' && severityRank(f.severity) >= severityRank('high')) });
  }
  for (const e of (clean?.entries ?? []).slice(0, 40)) {
    const r = await aiReview({ serverName: e.server, kind: e.kind, definition: e.definition, previous: null, fields: [], highImpact: false });
    items.push({ set: 'clean', id: `${e.server}/${e.definition.name}`, status: r.status, flagged: r.findings.some((f) => f.confidence !== 'low' && severityRank(f.severity) >= severityRank('high')) });
  }
  const results = {
    layers: 'ai only',
    malicious: { total: items.filter((i) => i.set === 'malicious').length, detected: items.filter((i) => i.set === 'malicious' && i.flagged).length },
    clean: { total: items.filter((i) => i.set === 'clean').length, falseAlarms: items.filter((i) => i.set === 'clean' && i.flagged).length },
    items,
  };
  const id = randomUUID();
  run('INSERT INTO corpus_runs(id, ts, ruleset, ai, results) VALUES(?,?,?,?,?)', id, Date.now(), RULESET_VERSION, providerName(), JSON.stringify(results));
  return { id, results };
}

export function latestCorpusRuns() {
  const det = get<{ id: string; ts: number; ruleset: string; results: string }>("SELECT * FROM corpus_runs WHERE ai IS NULL ORDER BY ts DESC LIMIT 1");
  const ai = get<{ id: string; ts: number; ruleset: string; results: string }>("SELECT * FROM corpus_runs WHERE ai IS NOT NULL ORDER BY ts DESC LIMIT 1");
  return { deterministic: det ? { ...det, results: json(det.results, {}) } : null, ai: ai ? { ...ai, results: json(ai.results, {}) } : null };
}
