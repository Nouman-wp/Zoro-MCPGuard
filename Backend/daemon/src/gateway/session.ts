import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  FlowTracker,
  actionDigest,
  applyShield,
  buildRefusal,
  decodeTransactionCall,
  detectIrreversibleCall,
  evaluateCall,
  rulesOf,
  maskArgs,
  scanOutput,
  shieldActionFor,
  sinkTypes,
  sourceLabel,
  type CallContext,
  type DefinitionKind,
  type Evaluation,
  type ShieldFinding,
} from '@zoro/core';
import { appendLog } from '../auditlog';
import { createApproval, consumeApproval, findGranted, getApproval, approvalRef } from '../approvals';
import { bus } from '../bus';
import { VERSION, config } from '../config';
import { all, get, run } from '../db';
import { incidentRef, raiseIncident } from '../incidents';
import { getPolicy, policyFor } from '../policy';
import { getLockdown } from '../lockdown';
import { approvePowers, pendingPowersFor, syncAgentPowers } from '../powers';
import { vulnerabilitiesFor } from '../recall';
import type { Capability } from '@zoro/core';
import { gateway, type ExposedEntry, type SessionLike } from './gateway';

const SECRET_KEY = /pass(word)?|secret|token|api[_-]?key|auth|credential|private[_-]?key|cookie|mnemonic|seed/i;
/** Local log storage never keeps secret-keyed argument values (FR-G11); a short hash keeps replays comparable. */
function scrubSecrets(v: unknown, key = ''): unknown {
  if (typeof v === 'string' && SECRET_KEY.test(key)) return `[secret:${v.length}]`;
  if (Array.isArray(v)) return v.map((x) => scrubSecrets(x, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, scrubSecrets(x, k)]));
  return v;
}

const textOf = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .map((c) => (c && typeof c === 'object' ? ((c as { type?: string }).type === 'text' ? String((c as { text?: string }).text ?? '') : (c as { type?: string }).type === 'resource' ? String(((c as { resource?: { text?: string } }).resource?.text) ?? '') : '') : ''))
        .join('\n')
    : '';

type ProgressFn = (done: number, total: number, message: string) => void;

export class ClientSession implements SessionLike {
  readonly id = randomUUID();
  readonly server: Server;
  readonly flow = new FlowTracker();
  readonly lab: boolean;
  agent: string;
  clientName: string | null = null;
  private resourceOwners = new Map<string, string>();
  private connected = false;

  private approvalWaitSec: number;

  constructor(opts: { agentHint?: string | null; clientHint?: string | null; lab?: boolean; approvalWaitSec?: number }) {
    this.approvalWaitSec = opts.approvalWaitSec ?? config.approvalWaitSec;
    this.agent = opts.agentHint || 'unidentified-client';
    this.clientName = opts.clientHint ?? null;
    this.lab = Boolean(opts.lab);
    this.server = new Server(
      { name: 'zoro', version: VERSION },
      {
        capabilities: { tools: { listChanged: true }, prompts: { listChanged: true }, resources: { listChanged: true } },
        instructions: 'Tools are provided through Zoro, which verifies every tool against its security seal before use. If Zoro reports that a tool is unavailable, tell the user and continue without it.',
      },
    );
    this.server.oninitialized = () => {
      this.connected = true;
      const info = this.server.getClientVersion();
      if (info?.name && this.agent === 'unidentified-client') this.agent = info.name;
      this.clientName = this.clientName ?? info?.name ?? null;
      this.touchAgent();
    };
    this.server.onclose = () => {
      this.connected = false;
      gateway.sessions.delete(this);
    };
    this.register();
    gateway.sessions.add(this);
  }

  private touchAgent() {
    const now = Date.now();
    run('INSERT INTO agents(id, name, client, first_seen, last_seen, lab) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, client = excluded.client', this.agent, this.agent, this.clientName, now, now, this.lab);
  }

  notifyListChanged(kinds: DefinitionKind[]) {
    if (!this.connected) return;
    if (kinds.includes('tool')) void this.server.sendToolListChanged().catch(() => undefined);
    if (kinds.includes('prompt')) void this.server.sendPromptListChanged().catch(() => undefined);
    if (kinds.includes('resource_template')) void this.server.sendResourceListChanged().catch(() => undefined);
  }

  private register() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const exposed = gateway.exposed('tool', this.lab);
      this.syncPowers(exposed);
      return { tools: exposed.map((e) => e.definition as never) };
    });
    this.server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      // Progress is only sent when the client asked for it (MCP progressToken); clients with idle timeouts use it to keep waiting.
      const token = req.params._meta?.progressToken;
      const progress: ProgressFn | undefined =
        token === undefined ? undefined : (done, total, message) => void extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: done, total, message } }).catch(() => undefined);
      return this.callTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>, extra.signal, progress);
    });
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: gateway.exposed('prompt', this.lab).map((e) => e.definition as never) }));
    this.server.setRequestHandler(GetPromptRequestSchema, async (req) => this.getPrompt(req.params.name, req.params.arguments));
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: gateway.exposed('resource_template', this.lab).map((e) => e.definition as never) }));
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => this.listResources());
    this.server.setRequestHandler(ReadResourceRequestSchema, async (req) => this.readResource(req.params.uri));
  }

  private async getPrompt(name: string, args: Record<string, string> | undefined) {
    const entry = gateway.exposed('prompt', this.lab).find((e) => e.exposedName === name);
    if (!entry) throw new McpError(ErrorCode.InvalidParams, '[Zoro] This prompt is unavailable pending a security review.');
    const st = gateway.sealStateFor(entry.serverId, 'prompt', entry.name);
    if (st.state !== 'sealed' && st.state !== 'sealed_with_warnings') throw new McpError(ErrorCode.InvalidParams, '[Zoro] This prompt is unavailable pending a security review.');
    const up = gateway.upstreams.get(entry.serverId);
    if (!up?.client) throw new McpError(ErrorCode.InternalError, '[Zoro] The server for this prompt is temporarily unavailable.');
    const res = await up.getPrompt(entry.name, args);
    const action = shieldActionFor(getPolicy(), entry.label, entry.name);
    for (const m of res.messages ?? []) {
      const c = m.content as { type: string; text?: string };
      if (c?.type === 'text' && c.text) {
        const s = applyShield(c.text, scanOutput(c.text), action === 'block' ? 'redact' : action);
        c.text = s.text ?? '';
      }
    }
    return res;
  }

  private async listResources() {
    const out: unknown[] = [];
    this.resourceOwners.clear();
    for (const [id, up] of gateway.upstreams) {
      const row = gateway.serverRow(id);
      if (!row || row.mode === 'disabled' || Boolean(row.lab) !== this.lab || !up.client) continue;
      // Concrete resources are only listed for servers whose manifest is fully released.
      const unreleased = get<{ n: number }>("SELECT COUNT(*) AS n FROM live WHERE server_id = ? AND state NOT IN ('released','removed')", id)?.n ?? 0;
      if (unreleased) continue;
      for (const r of await up.listResources().catch(() => [])) {
        this.resourceOwners.set(r.uri, id);
        out.push(r);
      }
    }
    return { resources: out as never[] };
  }

  private async readResource(uri: string) {
    const owner = this.resourceOwners.get(uri);
    const up = owner ? gateway.upstreams.get(owner) : null;
    if (!up?.client) throw new McpError(ErrorCode.InvalidParams, '[Zoro] This resource is unavailable.');
    const res = await up.readResource(uri);
    const action = shieldActionFor(getPolicy(), up.row.label, uri);
    for (const c of res.contents as { text?: string }[]) {
      if (typeof c.text === 'string') {
        const s = applyShield(c.text, scanOutput(c.text), action);
        c.text = s.text ?? '[Zoro Output Shield] Content withheld: it contained instructions aimed at the AI.';
      }
    }
    return res;
  }

  /** New-power alarm: record what this agent can do now; abilities gained since its baseline become pending. */
  private syncPowers(exposed: ExposedEntry[]) {
    const caps = new Set<Capability>();
    for (const e of exposed) for (const c of gateway.sealStateFor(e.serverId, 'tool', e.name).capabilities) caps.add(c);
    try {
      syncAgentPowers(this.agent, this.lab, [...caps]);
    } catch {
      /* bookkeeping must never break a tools/list */
    }
  }

  private recentCalls() {
    return all<{ server_id: string; tool: string; ts: number }>('SELECT server_id, tool, ts FROM calls WHERE ts > ? AND agent = ?', Date.now() - 3_600_000, this.agent).map((c) => ({ serverId: c.server_id, tool: c.tool, ts: c.ts }));
  }

  /** The enforcement path for every tool call (§4.4). */
  async callTool(exposedName: string, args: Record<string, unknown>, signal?: AbortSignal, onProgress?: ProgressFn) {
    const t0 = performance.now();
    const callId = randomUUID();
    const policy = policyFor(this.lab);
    const entry: ExposedEntry | undefined = gateway.exposed('tool', this.lab).find((e) => e.exposedName === exposedName);
    const target = entry ? { serverId: entry.serverId, name: entry.name } : gateway.resolveName(exposedName, this.lab);
    if (!target) return { isError: true, content: [{ type: 'text' as const, text: '[Zoro] No tool with this name is available. Continue without it.' }] };
    const row = gateway.serverRow(target.serverId);
    const up = gateway.upstreams.get(target.serverId);
    if (!row || Boolean(row.lab) !== this.lab) return { isError: true, content: [{ type: 'text' as const, text: '[Zoro] No tool with this name is available. Continue without it.' }] };
    const knownName = entry?.exposedName ?? null;

    let st = gateway.sealStateFor(target.serverId, 'tool', target.name);
    // Before high-risk calls, re-read the live definition so the decision uses current information (FR-G5).
    if (st.highImpact && up?.client) {
      await Promise.race([up.refresh('pre_call'), new Promise((r) => setTimeout(r, 3000))]);
      st = gateway.sealStateFor(target.serverId, 'tool', target.name);
    }
    // The agent may have read an older list: if the live fingerprint is not the one it was shown, it is a mismatch.
    if (entry && st.fingerprint !== entry.fingerprint && st.state === 'sealed') st = { ...st, state: 'pending', detail: 'definition changed between list and call' };

    this.syncPowers(gateway.exposed('tool', this.lab));
    const flows = this.flow.findFlows(args, sinkTypes(new Set(st.capabilities)));
    const knownAddresses = [
      ...rulesOf(policy, 'transaction_guard').flatMap((r) => r.knownRecipients),
      ...rulesOf(policy, 'argument_constraint').flatMap((r) => (r.constraint.kind === 'allowlist' ? r.constraint.values : [])),
    ];
    const transaction = decodeTransactionCall(target.name, st.capabilities, args, { knownAddresses, largeAmount: rulesOf(policy, 'transaction_guard')[0]?.largeAmount });
    const irreversible = detectIrreversibleCall({ tool: target.name, capabilities: st.capabilities, args });
    const pendingCapabilities = pendingPowersFor(this.agent, st.capabilities);
    const lock = getLockdown();
    const digest = actionDigest({ kind: 'tool_call', requestId: 'call', agent: this.agent, server: row.label, tool: target.name, fingerprint: st.fingerprint, args });
    const granted = findGranted(digest, ['tool_call']);
    const override = findGranted(digest, ['override']);
    const ctx: CallContext = {
      agent: this.agent,
      serverId: row.id,
      serverName: row.label,
      serverMode: row.mode,
      tool: target.name,
      fingerprint: st.fingerprint,
      seal: { state: st.state, changeClass: st.changeClass, registry: st.registry, detail: st.detail, highImpact: st.highImpact },
      capabilities: st.capabilities,
      args,
      timestamp: Date.now(),
      recentCalls: this.recentCalls(),
      flows,
      approvalGranted: Boolean(granted),
      overrideGranted: Boolean(override),
      irreversible,
      transaction,
      pendingCapabilities,
      vulnerabilities: row.lab ? [] : vulnerabilitiesFor(row.id),
      lockdown: lock ? { by: lock.by, at: lock.at, reason: lock.reason } : null,
    };
    // Agent namespace declarations are enforced, so the public declaration and enforcement always match (§5.5).
    const agentDecl = get<{ declaration: string | null }>('SELECT declaration FROM agents WHERE id = ?', this.agent)?.declaration;
    let ev: Evaluation = evaluateCall(policy, ctx);
    if (agentDecl) {
      const decl = JSON.parse(agentDecl) as { allowedTools?: string[] };
      if (decl.allowedTools && !decl.allowedTools.includes(`${row.label}/${target.name}`) && ev.decision !== 'block') {
        ev = { ...ev, decision: row.mode === 'observe' ? 'allow' : 'block', enforcedDecision: 'block', decidingRuleId: 'agent-declaration', reason: `Agent “${this.agent}” declares the tools it may use; ${row.label}/${target.name} is not among them.`, reasonCategory: 'agent_restricted', trace: [...ev.trace, { step: ev.trace.length + 1, ruleId: 'agent-declaration', ruleType: 'agent_rule', outcome: 'block', detail: 'tool not in the agent declaration' }] };
      }
    }
    let waitedMs = 0;
    let approvalId: string | null = granted?.id ?? override?.id ?? null;
    let outcome = 'executed';

    const record = (decision: string, extra: Record<string, unknown> = {}) => {
      const overhead = performance.now() - t0 - waitedMs - ((extra.upstreamMs as number) ?? 0);
      run(
        `INSERT INTO calls(id, ts, session_id, agent, client, server_id, server_label, tool, exposed_name, fingerprint, decision, enforced_decision, outcome, rule, reason, reason_category, observe,
           latency_ms, overhead_ms, args, args_masked, result_summary, result_size, is_error, shield_action, shield_findings, flows, source_label, trace, context, incident_id, approval_id, lab)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        callId, Date.now(), this.id, this.agent, this.clientName, row.id, row.label, target.name, exposedName, st.fingerprint, decision, ev.enforcedDecision, outcome, ev.decidingRuleId, ev.reason, ev.reasonCategory, ev.observe,
        (extra.upstreamMs as number) ?? null, Math.max(0, overhead), JSON.stringify(scrubSecrets(args)), JSON.stringify(maskArgs(args)), (extra.summary as string) ?? null, (extra.size as number) ?? null, Boolean(extra.isError),
        (extra.shieldAction as string) ?? null, JSON.stringify(extra.shieldFindings ?? []), JSON.stringify(flows), (extra.sourceLabel as string) ?? null, JSON.stringify(ev.trace),
        JSON.stringify({ ...ctx, args: scrubSecrets(args), recentCalls: ctx.recentCalls.slice(-50) }), (extra.incidentId as string) ?? null, approvalId, Boolean(row.lab),
      );
      appendLog('call', `${this.agent} → ${row.label}/${target.name}: ${decision}${ev.observe && ev.enforcedDecision !== 'allow' ? ` (observe; would ${ev.enforcedDecision})` : ''}`, { call: callId, rule: ev.decidingRuleId }, callId, Boolean(row.lab));
      bus.emitEvent('call', { id: callId, decision, agent: this.agent, server: row.label, tool: target.name, lab: Boolean(row.lab) });
    };

    // --- ask: wait for a person, bounded, then refuse cleanly so the agent does not loop ---
    if (ev.decision === 'ask') {
      const incident = flows.length
        ? raiseIncident({ type: 'data_flow', severity: 'high', title: `Suspicious data flow into ${row.label}/${target.name}`, summary: ev.reason, groupKey: `flow:${row.id}:${target.name}:${flows[0].sourceTool}`, serverId: row.id, tool: target.name, fingerprint: st.fingerprint, evidence: { flows, call: callId }, lab: Boolean(row.lab) })
        : null;
      // A decoded risky transaction always leads with its plain sentence, whichever rule asked first.
      const summary =
        transaction && transaction.risk !== 'low' ? transaction.sentence :
        ev.reasonCategory === 'irreversible' && irreversible.length ? `${this.agent} wants to run an action that cannot be undone: ${irreversible[0].reason}` :
        ev.reasonCategory === 'new_capability' ? `${this.agent} wants to use a new power for the first time (${pendingCapabilities.join(', ').replace(/_/g, ' ')})` :
        `${this.agent} wants to call ${row.label}/${target.name}`;
      const appr = createApproval({
        kind: 'tool_call', digest, action: { agent: this.agent, server: row.label, tool: target.name, fingerprint: st.fingerprint, args: maskArgs(args) },
        summary, reason: transaction && transaction.risk !== 'low' && ev.reasonCategory !== 'transaction_risk' ? `${ev.reason} Transaction: ${transaction.sentence} ${transaction.risks.join(' ')}`.trim() : ev.reason, rule: ev.decidingRuleId, humanSeal: ev.humanSeal,
        sessionId: this.id, agent: this.agent, serverId: row.id, tool: target.name, fingerprint: st.fingerprint,
        evidence: { flows, trace: ev.trace, capabilities: st.capabilities, call: callId, transaction, irreversible, pendingCapabilities, reasonCategory: ev.reasonCategory }, incidentId: incident?.id ?? null, lab: Boolean(row.lab),
      });
      approvalId = appr.id;
      const until = Date.now() + this.approvalWaitSec * 1000;
      const w0 = performance.now();
      let status = appr.status;
      const waiting = `Waiting for a person to approve ${approvalRef(appr.seq)} in the Zoro Console`;
      let lastProgress = Date.now();
      onProgress?.(0, this.approvalWaitSec, waiting);
      while (status === 'pending' && Date.now() < until && !signal?.aborted) {
        await new Promise((r) => setTimeout(r, 400));
        status = getApproval(appr.id)?.status ?? 'expired';
        if (onProgress && Date.now() - lastProgress >= 5000) {
          lastProgress = Date.now();
          onProgress(Math.min(this.approvalWaitSec, Math.round((performance.now() - w0) / 1000)), this.approvalWaitSec, waiting);
        }
      }
      waitedMs = performance.now() - w0;
      if (status === 'approved') {
        ev = evaluateCall(policy, { ...ctx, approvalGranted: true });
      } else {
        outcome = status === 'denied' ? 'denied' : status === 'expired' ? 'expired' : 'awaiting_approval';
        record('ask', { incidentId: incident?.id });
        return buildRefusal({ toolName: knownName, category: ev.reasonCategory, incidentRef: incident ? incidentRef(incident.seq) : null, approvalRef: approvalRef(appr.seq), kind: status === 'denied' ? 'approval_denied' : status === 'expired' ? 'approval_expired' : 'approval_pending' });
      }
    }

    // --- block: structured refusal, never upstream text (§4.13) ---
    if (ev.decision === 'block') {
      outcome = 'blocked';
      const sev = ev.reasonCategory === 'unsafe_verdict' || ev.reasonCategory === 'revoked' || ev.reasonCategory === 'lockdown' ? 'critical' : ['trust_chain_contradiction', 'tool_changed', 'artifact_changed', 'data_flow'].includes(ev.reasonCategory) ? 'high' : ev.reasonCategory === 'policy_denied' || ev.reasonCategory === 'rate_limited' ? 'low' : 'medium';
      const incident = raiseIncident({
        type: ev.reasonCategory === 'data_flow' ? 'data_flow' : 'blocked_call',
        severity: sev,
        title: `Blocked: ${this.agent} → ${row.label}/${target.name}`,
        summary: ev.reason,
        groupKey: `blocked:${row.id}:${target.name}:${st.fingerprint}:${ev.reasonCategory}`,
        serverId: row.id,
        tool: target.name,
        fingerprint: st.fingerprint,
        evidence: { lastCall: callId, rule: ev.decidingRuleId, digest, flows, overridable: true, action: { agent: this.agent, server: row.label, tool: target.name, fingerprint: st.fingerprint } },
        lab: Boolean(row.lab),
        eventMessage: `Call blocked (${ev.reasonCategory.replace(/_/g, ' ')})`,
      });
      record('block', { incidentId: incident.id });
      return buildRefusal({ toolName: knownName, category: ev.reasonCategory, incidentRef: incidentRef(incident.seq), kind: 'blocked' });
    }

    // --- allow ---
    if (!up?.client) {
      outcome = 'server_unavailable';
      record('allow', { isError: true, summary: 'server offline' });
      return buildRefusal({ toolName: knownName, category: 'allowed', incidentRef: null, kind: 'unavailable' });
    }
    if (ev.observe && ev.enforcedDecision !== 'allow')
      raiseIncident({ type: 'observe_would_block', severity: 'low', title: `Observe mode: would have ${ev.enforcedDecision === 'block' ? 'blocked' : 'asked about'} ${row.label}/${target.name}`, summary: ev.reason, groupKey: `observe:${row.id}:${target.name}:${ev.reasonCategory}`, serverId: row.id, tool: target.name, fingerprint: st.fingerprint, lab: Boolean(row.lab) });
    const usedApproval = ev.enforcedDecision === 'allow' && (ctx.approvalGranted || ctx.overrideGranted || approvalId) ? approvalId : null;
    if (usedApproval && !consumeApproval(usedApproval, 'executed')) {
      // Another session consumed it first: approvals are single use.
      outcome = 'approval_already_used';
      record('block');
      return buildRefusal({ toolName: knownName, category: 'approval_required', incidentRef: null, kind: 'approval_expired' });
    }
    // Undo-impossible brake: an approved irreversible action waits a visible cooldown, and lockdown still wins.
    if (ev.cooldownSeconds && ev.cooldownSeconds > 0) {
      const until = Date.now() + ev.cooldownSeconds * 1000;
      while (Date.now() < until && !signal?.aborted) {
        onProgress?.(ev.cooldownSeconds - Math.ceil((until - Date.now()) / 1000), ev.cooldownSeconds, `Irreversible action approved; running in ${Math.ceil((until - Date.now()) / 1000)}s. Press the panic button in the Zoro Console to stop it.`);
        await new Promise((r) => setTimeout(r, 500));
        if (getLockdown()) {
          outcome = 'cancelled_lockdown';
          record('block');
          return buildRefusal({ toolName: knownName, category: 'lockdown', incidentRef: null, kind: 'blocked' });
        }
      }
    }
    if (ev.enforcedDecision === 'allow' && pendingCapabilities.length && (ctx.approvalGranted || approvalId)) approvePowers(this.agent, pendingCapabilities, approvalId);
    const u0 = performance.now();
    let result: Awaited<ReturnType<typeof up.callTool>>;
    try {
      result = await up.callTool(target.name, args, signal);
    } catch (e) {
      outcome = 'upstream_error';
      record('allow', { isError: true, upstreamMs: performance.now() - u0, summary: 'upstream error' });
      // Upstream error text is not forwarded: it is upstream-provided content.
      return { isError: true, content: [{ type: 'text' as const, text: `[Zoro] The tool call failed on the server side. Tell the user, or continue without this tool.` }] };
    }
    const upstreamMs = performance.now() - u0;

    // --- Output Shield ---
    const action = shieldActionFor(policy, row.label, target.name);
    const knownTools = gateway.exposed('tool', this.lab).map((e) => e.exposedName).filter((n) => n !== exposedName);
    const shieldFindings: ShieldFinding[] = [];
    let shieldAction: string = 'none';
    const content = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
    const originalText = textOf(content);
    for (const c of content) {
      if (c.type === 'text' && typeof c.text === 'string') {
        const f = scanOutput(c.text, knownTools);
        shieldFindings.push(...f);
        const s = applyShield(c.text, f, action);
        if (s.action !== 'none') shieldAction = s.action;
        if (s.text === null) {
          result = { isError: true, content: [{ type: 'text', text: '[Zoro Output Shield] The result was withheld because it contained instructions aimed at the AI. Tell the user what happened.' }] };
          break;
        }
        c.text = s.text;
      }
    }
    if (result.structuredContent && shieldFindings.length === 0) {
      const sf = scanOutput(JSON.stringify(result.structuredContent), knownTools);
      if (sf.length && (action === 'redact' || action === 'block')) {
        delete (result as { structuredContent?: unknown }).structuredContent;
        shieldAction = action;
      }
      shieldFindings.push(...sf);
    }
    let incidentId: string | null = null;
    if (shieldAction !== 'none' && shieldAction !== 'pass') {
      const sev = shieldFindings.some((f) => f.severity === 'critical') ? 'high' : 'medium';
      incidentId = raiseIncident({ type: 'output_shield', severity: sev, title: `Output Shield ${shieldAction === 'block' ? 'withheld' : shieldAction === 'redact' ? 'redacted' : 'annotated'} a result from ${row.label}/${target.name}`, summary: shieldFindings.slice(0, 3).map((f) => f.label).join('; '), groupKey: `shield:${row.id}:${target.name}`, serverId: row.id, tool: target.name, fingerprint: st.fingerprint, evidence: { call: callId, findings: shieldFindings.slice(0, 10) }, lab: Boolean(row.lab) }).id;
    }

    // --- data-flow labels for later calls in this session ---
    const label = sourceLabel(new Set(st.capabilities));
    this.flow.recordSource(callId, row.label, target.name, label, originalText);
    const size = Buffer.byteLength(JSON.stringify(result.content ?? []));
    updateBaseline(row.id, target.name, size, upstreamMs, Boolean(result.isError), Boolean(row.lab));
    record('allow', { upstreamMs, size, summary: originalText.slice(0, 280), isError: result.isError, shieldAction, shieldFindings: shieldFindings.slice(0, 10), sourceLabel: label, incidentId });
    return result;
  }
}

/** Behavioral baselines (§5.3): Welford running mean/variance of result size and latency. Drift never blocks on its own. */
function updateBaseline(serverId: string, tool: string, size: number, latency: number, isError: boolean, lab: boolean) {
  const b = get<{ n: number; mean_size: number; m2_size: number; mean_latency: number; m2_latency: number; errors: number }>('SELECT * FROM baselines WHERE server_id = ? AND tool = ?', serverId, tool);
  if (!b) {
    run('INSERT INTO baselines(server_id, tool, n, mean_size, m2_size, mean_latency, m2_latency, errors, updated_at) VALUES(?,?,?,?,?,?,?,?,?)', serverId, tool, 1, size, 0, latency, 0, isError ? 1 : 0, Date.now());
    return;
  }
  const sd = b.n > 1 ? Math.sqrt(b.m2_size / (b.n - 1)) : 0;
  if (b.n >= 20 && sd > 0 && Math.abs(size - b.mean_size) > 5 * sd + 256) {
    raiseIncident({ type: 'drift', severity: 'low', title: `Behavior drift: ${tool} returned an unusual result size`, summary: `Result size ${size} bytes vs. a baseline of ${Math.round(b.mean_size)} ± ${Math.round(sd)} over ${b.n} calls. Drift is informational and never blocks on its own.`, groupKey: `drift:${serverId}:${tool}`, serverId, tool, evidence: { size, mean: b.mean_size, sd, n: b.n }, lab });
  }
  const n = b.n + 1;
  const d1 = size - b.mean_size;
  const meanSize = b.mean_size + d1 / n;
  const d2 = latency - b.mean_latency;
  const meanLat = b.mean_latency + d2 / n;
  run('UPDATE baselines SET n = ?, mean_size = ?, m2_size = ?, mean_latency = ?, m2_latency = ?, errors = errors + ?, updated_at = ? WHERE server_id = ? AND tool = ?', n, meanSize, b.m2_size + d1 * (size - meanSize), meanLat, b.m2_latency + d2 * (latency - meanLat), isError ? 1 : 0, Date.now(), serverId, tool);
}
