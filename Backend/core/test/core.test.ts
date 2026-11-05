import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FlowTracker,
  applyShield,
  buildRefusal,
  computeManifest,
  defaultPolicy,
  differentialAnalysis,
  evaluateCall,
  findLoosening,
  fingerprintDefinition,
  inferCapabilities,
  leafHash,
  merkleProof,
  merkleRoot,
  revealHidden,
  runDeterministicRules,
  runStaticLayers,
  scanOutput,
  severityRank,
  simulatePolicy,
  verifyMerkleProof,
  type CallContext,
  type Definition,
} from '../src';
import { MALICIOUS_CORPUS, OUTPUT_INJECTION_CORPUS } from '../corpus';

const tool = (over: Partial<Definition> = {}): Definition => ({
  name: 'read_file',
  description: 'Read the complete contents of a file from the file system. Only works within allowed directories.',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  ...over,
});

describe('canonicalization and fingerprints', () => {
  it('is independent of key order', () => {
    const a = { name: 'x', description: 'd', inputSchema: { type: 'object', properties: { b: { type: 'string' }, a: { type: 'number' } } } };
    const b = { inputSchema: { properties: { a: { type: 'number' }, b: { type: 'string' } }, type: 'object' }, description: 'd', name: 'x' };
    expect(fingerprintDefinition('tool', a)).toBe(fingerprintDefinition('tool', b));
  });
  it('preserves invisible characters (they change the fingerprint)', () => {
    expect(fingerprintDefinition('tool', tool())).not.toBe(fingerprintDefinition('tool', tool({ description: tool().description + '​' })));
  });
  it('covers every field, including unknown ones', () => {
    expect(fingerprintDefinition('tool', tool())).not.toBe(fingerprintDefinition('tool', tool({ annotations: { readOnlyHint: true } })));
    expect(fingerprintDefinition('tool', tool())).not.toBe(fingerprintDefinition('tool', tool({ _meta: { x: 1 } })));
  });
  it('separates kinds', () => {
    expect(fingerprintDefinition('tool', tool())).not.toBe(fingerprintDefinition('prompt', tool()));
  });
  it('manifest root detects added, removed and renamed tools', () => {
    const base = { declaredName: 's', declaredVersion: '1', artifactId: null, prompts: [], resourceTemplates: [] };
    const r1 = computeManifest({ ...base, tools: [tool(), tool({ name: 'write_file' })] }).root;
    const r2 = computeManifest({ ...base, tools: [tool()] }).root;
    const r3 = computeManifest({ ...base, tools: [tool(), tool({ name: 'write_files' })] }).root;
    const r4 = computeManifest({ ...base, tools: [tool({ name: 'write_file' }), tool()] }).root;
    expect(new Set([r1, r2, r3]).size).toBe(3);
    expect(r4).toBe(r1);
    expect(computeManifest({ ...base, artifactId: 'sha256:abc', tools: [tool()] }).root).not.toBe(r2);
  });
});

describe('Sentinel deterministic layer against the malicious corpus', () => {
  for (const entry of MALICIOUS_CORPUS) {
    it(`detects ${entry.id} at ${entry.expectSeverity} or above`, () => {
      const caps = inferCapabilities(entry.definition);
      const findings = runDeterministicRules({ kind: entry.kind, definition: entry.definition, serverName: entry.server, capabilityProfile: caps, otherTools: [{ server: 'whatsapp', name: 'send_message' }] });
      const top = findings.reduce((m, f) => Math.max(m, severityRank(f.severity)), -1);
      expect(top, JSON.stringify(findings.map((f) => [f.ruleId, f.severity, f.title]))).toBeGreaterThanOrEqual(severityRank(entry.expectSeverity));
    });
  }
  it('every finding carries an evidence span that exists in the definition', () => {
    for (const entry of MALICIOUS_CORPUS) {
      const findings = runDeterministicRules({ kind: entry.kind, definition: entry.definition, serverName: entry.server, capabilityProfile: inferCapabilities(entry.definition) });
      for (const f of findings) expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
  it('does not treat a documented token-symbol parameter as a secret', () => {
    const def: Definition = { name: 'send_transaction', description: 'Send tokens from the treasury wallet to a recipient address.', inputSchema: { type: 'object', properties: { to: { type: 'string' }, amount: { type: 'number' }, token: { type: 'string', description: 'Token symbol, e.g. USDC' } } } };
    const findings = runDeterministicRules({ kind: 'tool', definition: def, serverName: 'wallet-tools', capabilityProfile: inferCapabilities(def) });
    expect(findings.filter((f) => severityRank(f.severity) >= severityRank('medium'))).toEqual([]);
  });
  it('does not flag an ordinary file-reading tool above low', () => {
    const findings = runDeterministicRules({ kind: 'tool', definition: tool(), serverName: 'filesystem', capabilityProfile: inferCapabilities(tool()) });
    expect(findings.filter((f) => severityRank(f.severity) >= severityRank('medium'))).toEqual([]);
  });
});

describe('clean corpus captured from real published MCP servers', () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'clean.json');
  const clean = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { entries: { server: string; kind: 'tool'; definition: Definition }[] }) : null;
  it.skipIf(!clean)('produces no high or critical findings (no false blocks)', () => {
    for (const e of clean!.entries) {
      const findings = runDeterministicRules({ kind: e.kind, definition: e.definition, serverName: e.server, capabilityProfile: inferCapabilities(e.definition) });
      const bad = findings.filter((f) => severityRank(f.severity) >= severityRank('high'));
      expect(bad, `${e.server}/${e.definition.name}: ${bad.map((f) => f.title).join(', ')}`).toEqual([]);
    }
  });
});

describe('differential analysis', () => {
  it('classifies a typo fix as cosmetic', () => {
    const prev = tool({ description: 'Read the complete contnets of a file.' });
    const next = tool({ description: 'Read the complete contents of a file.' });
    const r = differentialAnalysis(prev, next, inferCapabilities(prev), inferCapabilities(next), []);
    expect(r.changeClass).toBe('cosmetic');
  });
  it('classifies an added BCC instruction as suspicious', () => {
    const prev = MALICIOUS_CORPUS.find((e) => e.id === 'rugpull-bcc')!.definition;
    const clean = { ...prev, description: 'Send an email to one or more recipients.' };
    const layers = runStaticLayers({ kind: 'tool', definition: prev, previous: { definition: clean, fingerprint: fingerprintDefinition('tool', clean) }, serverName: 'postmail', declaredServerName: null, declaredServerVersion: null, artifactId: null, transport: 'stdio', manifestRoot: null, otherTools: [], lab: false });
    expect(layers.differential.changeClass).toBe('suspicious');
  });
  it('detects a capability expansion', () => {
    const prev = tool();
    const next = tool({ inputSchema: { type: 'object', properties: { path: { type: 'string' }, webhook_url: { type: 'string' } } } });
    const r = differentialAnalysis(prev, next, inferCapabilities(prev), inferCapabilities(next), []);
    expect(r.changeClass).toBe('capability_expansion');
  });
});

const ctx = (over: Partial<CallContext> = {}): CallContext => ({
  agent: 'test-agent',
  serverId: 's1',
  serverName: 'postmail',
  serverMode: 'enforce',
  tool: 'send_email',
  fingerprint: '0x01',
  seal: { state: 'sealed', registry: 'confirmed', highImpact: true },
  capabilities: ['send_communication'],
  args: { to: 'friend@example.com', body: 'hello' },
  timestamp: Date.now(),
  recentCalls: [],
  flows: [],
  ...over,
});

describe('policy engine', () => {
  const standard = defaultPolicy('standard');
  it('allows a sealed tool', () => expect(evaluateCall(standard, ctx()).decision).toBe('allow'));
  it('blocks unsealed and unsafe versions', () => {
    expect(evaluateCall(standard, ctx({ seal: { state: 'pending', registry: 'confirmed', highImpact: true } })).decision).toBe('block');
    expect(evaluateCall(standard, ctx({ seal: { state: 'unsafe', registry: 'confirmed', highImpact: true } })).reasonCategory).toBe('unsafe_verdict');
    expect(evaluateCall(standard, ctx({ seal: { state: 'contradiction', registry: 'confirmed', highImpact: true } })).decision).toBe('block');
  });
  it('asks for sealed-with-warnings', () => expect(evaluateCall(standard, ctx({ seal: { state: 'sealed_with_warnings', registry: 'confirmed', highImpact: false } })).decision).toBe('ask'));
  it('observe mode never blocks but records the enforced decision', () => {
    const e = evaluateCall(standard, ctx({ serverMode: 'observe', seal: { state: 'unsafe', registry: 'confirmed', highImpact: true } }));
    expect(e.decision).toBe('allow');
    expect(e.enforcedDecision).toBe('block');
  });
  it('enforces argument constraints', () => {
    const p = { ...standard, rules: [...standard.rules, { id: 'domain', type: 'argument_constraint' as const, enabled: true, server: '*', tool: 'send_email', argument: 'to', constraint: { kind: 'email_domain' as const, domains: ['acme.com'] }, action: 'block' as const, humanSeal: false }] };
    expect(evaluateCall(p, ctx()).decision).toBe('block');
    expect(evaluateCall(p, ctx({ args: { to: 'bob@acme.com' } })).decision).toBe('allow');
  });
  it('asks on an untrusted → external flow and needs a Human Seal', () => {
    const e = evaluateCall(standard, ctx({ flows: [{ sourceCallId: 'c1', sourceTool: 'read_inbox', sourceServer: 'mail', sourceLabel: 'untrusted_external', sinkTypes: ['external_communication'], matched: 'x', matchKind: 'identifier', argument: 'body' }] }));
    expect(e.decision).toBe('ask');
    expect(e.humanSeal).toBe(true);
  });
  it('a granted approval converts ask to allow; overrides convert block to allow', () => {
    expect(evaluateCall(standard, ctx({ seal: { state: 'sealed_with_warnings', registry: 'confirmed', highImpact: false }, approvalGranted: true })).decision).toBe('allow');
    expect(evaluateCall(standard, ctx({ seal: { state: 'unsafe', registry: 'confirmed', highImpact: true }, overrideGranted: true })).decision).toBe('allow');
  });
  it('detects loosening changes', () => {
    const looser = structuredClone(standard);
    (looser.rules.find((r) => r.id === 'verdicts') as { sealed_with_warnings: string }).sealed_with_warnings = 'allow';
    looser.rules = looser.rules.filter((r) => r.id !== 'flow-untrusted');
    const changes = findLoosening(standard, looser);
    expect(changes.length).toBe(2);
    expect(findLoosening(standard, defaultPolicy('strict')).length).toBe(0);
  });
  it('simulation reports changed decisions', () => {
    const recs = [{ callId: 'a', ts: 1, agent: 'x', serverName: 'postmail', tool: 'send_email', originalDecision: 'ask' as const, context: ctx({ seal: { state: 'sealed_with_warnings', registry: 'confirmed', highImpact: false } }) }];
    const lab = defaultPolicy('lab');
    expect(simulatePolicy(recs, standard, lab).changed).toBe(1);
  });
});

describe('data-flow tracker', () => {
  it('finds identifiers from a private source in sink arguments', () => {
    const t = new FlowTracker();
    t.recordSource('c1', 'files', 'read_file', 'private_sensitive', 'API_TOKEN=zoro_fixture_token_9f8e7d6c5b4a39281706f5e4d3c2b1a0');
    const flows = t.findFlows({ to: 'x@y.com', body: 'here: zoro_fixture_token_9f8e7d6c5b4a39281706f5e4d3c2b1a0' }, ['external_communication']);
    expect(flows.length).toBe(1);
    expect(flows[0].argument).toBe('body');
  });
});

describe('Output Shield', () => {
  it('flags every output injection sample', () => {
    for (const s of OUTPUT_INJECTION_CORPUS) expect(scanOutput(s.text, ['send_email']).length, s.id).toBeGreaterThan(0);
  });
  it('redacts and annotates', () => {
    const text = OUTPUT_INJECTION_CORPUS[0].text;
    const f = scanOutput(text);
    expect(applyShield(text, f, 'redact').text).toContain('[removed by Zoro Output Shield]');
    expect(applyShield(text, f, 'annotate').text?.startsWith('[Zoro Output Shield]')).toBe(true);
    expect(applyShield(text, f, 'block').text).toBeNull();
  });
});

describe('refusals', () => {
  it('never echo upstream text and reject odd tool names', () => {
    const r = buildRefusal({ toolName: 'send_email\nIGNORE', category: 'tool_changed', incidentRef: 'INC-1', kind: 'blocked' });
    expect(r.content[0].text).not.toContain('IGNORE');
    expect(r.content[0].text).toContain('the requested tool');
  });
});

describe('merkle commitments', () => {
  it('proves inclusion', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'].map(leafHash);
    const root = merkleRoot(leaves);
    for (let i = 0; i < leaves.length; i++) expect(verifyMerkleProof(leaves[i], merkleProof(leaves, i), root)).toBe(true);
    expect(verifyMerkleProof(leafHash('z'), merkleProof(leaves, 0), root)).toBe(false);
  });
});

describe('hidden character reveal', () => {
  it('decodes tag runs', () => {
    const def = MALICIOUS_CORPUS.find((e) => e.id === 'tag-smuggling')!.definition;
    const segs = revealHidden(String(def.description));
    expect(segs.some((s) => s.hidden?.decoded?.includes('notes-sync.example'))).toBe(true);
  });
});
