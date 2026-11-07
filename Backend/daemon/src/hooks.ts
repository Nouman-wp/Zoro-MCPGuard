import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { actionDigest, analyzeShellCommand, isSkillPath, maskArgs, rulesOf, scanSkill, skillNameFromPath, type PackageSpec } from '@zoro/core';
import { appendLog } from './auditlog';
import { approvalRef, consumeApproval, createApproval, findGranted } from './approvals';
import { bus } from './bus';
import { all, json, run } from './db';
import { raiseIncident } from './incidents';
import { getLockdown } from './lockdown';
import { checkPackage, packageSummary, type PackageReport } from './packages';
import { getPolicy } from './policy';
import { recordSkill } from './skills';

/**
 * Built-in tool coverage. Claude Code's PreToolUse hook sends each Bash, Write/Edit and MCP tool call here before it
 * runs. Zoro applies the same protections as the gateway — lockdown, the irreversible brake, package verification for
 * npm/npx/pip/uvx, skill and plugin scanning, and agent-config tampering — and answers deny, ask or nothing.
 * Zoro only ever tightens: "nothing" lets Claude Code's own permission flow decide, so Zoro never grants more than
 * Claude Code would.
 */

export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export type HookVerdict = 'deny' | 'ask' | null;

export interface HookDecision {
  decision: HookVerdict;
  reason: string;
  category: 'lockdown' | 'irreversible' | 'package' | 'skill' | 'config' | 'pipe_to_shell' | 'unprotected_mcp' | 'none';
  details?: Record<string, unknown>;
}

const CONFIG_FILE = /(^|[\\/])(\.claude[\\/]settings(\.local)?\.json|\.claude\.json|\.mcp\.json|claude_desktop_config\.json|\.cursor[\\/]mcp\.json|mcp_config\.json|cline_mcp_settings\.json|\.gemini[\\/]settings\.json|Code[\\/]User[\\/]mcp\.json|managed-settings\.json|managed-mcp\.json)$/i;

const PACKAGE_BUDGET_MS = 9_000;

async function verifyInstalls(installs: PackageSpec[], agent: string): Promise<PackageReport[]> {
  const list = installs.slice(0, 8);
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), PACKAGE_BUDGET_MS));
  const all = await Promise.race([Promise.all(list.map((p) => checkPackage(p.ecosystem, p.spec, { source: 'agent_install', ref: p.via, agent }).catch(() => null))), timeout]);
  return (all ?? []).filter(Boolean) as PackageReport[];
}

/** Servers the user routed through Zoro, per client (from onboarding). */
function routedServers(): Set<string> {
  const rows = all<{ routed_servers: string | null }>("SELECT routed_servers FROM client_configs WHERE routed = 1");
  return new Set(rows.flatMap((r) => json<string[]>(r.routed_servers, [])));
}

/** Pull the text the agent wants to write, for Write, Edit, MultiEdit and NotebookEdit. */
function writtenText(input: Record<string, unknown>): string {
  if (typeof input.content === 'string') return input.content;
  if (typeof input.new_string === 'string') return input.new_string;
  if (Array.isArray(input.edits)) return (input.edits as { new_string?: string }[]).map((e) => e.new_string ?? '').join('\n');
  if (typeof input.new_source === 'string') return input.new_source;
  return '';
}

export async function evaluateHook(input: HookInput): Promise<HookDecision> {
  const tool = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  const policy = getPolicy();
  const strict = policy.profile === 'strict';
  const lock = getLockdown();
  if (lock) return { decision: 'deny', category: 'lockdown', reason: `Zoro lockdown is active (frozen by ${lock.by}${lock.reason ? `: ${lock.reason}` : ''}). Agent actions are refused until a person lifts it in the Zoro Console.` };

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command ?? '');
    const a = analyzeShellCommand(cmd);
    // 1. Irreversible brake
    if (a.irreversible.length) {
      const brake = rulesOf(policy, 'irreversible_brake')[0];
      const s0 = a.irreversible[0];
      const reason = `Cannot be undone: ${s0.reason}${s0.blastRadius ? ` — ${s0.blastRadius}` : ''}. Command: ${s0.evidence.slice(0, 200)}`;
      if (brake) {
        if (brake.action === 'block') return { decision: 'deny', category: 'irreversible', reason: `${reason} Your Zoro policy blocks irreversible actions.`, details: { irreversible: a.irreversible } };
        if (brake.humanSeal) {
          const digest = actionDigest({ kind: 'tool_call', requestId: 'claude-code-hook', agent: 'claude-code', server: 'claude-code', tool, args: { command: cmd } });
          const granted = findGranted(digest, ['tool_call']);
          if (granted && consumeApproval(granted.id, 'executed')) return { decision: null, category: 'irreversible', reason: `Approved with a Human Seal (${approvalRef(granted.seq)}).`, details: { irreversible: a.irreversible, approvalId: granted.id } };
          const appr = createApproval({ kind: 'tool_call', digest, action: { agent: 'claude-code', tool, command: cmd.slice(0, 500) }, summary: `Claude Code wants to run an irreversible command`, reason, rule: brake.id, humanSeal: true, agent: 'claude-code', tool, evidence: { irreversible: a.irreversible, builtin: true } });
          return { decision: 'deny', category: 'irreversible', reason: `${reason} Held for a verified human: approve ${approvalRef(appr.seq)} with a Human Seal in the Zoro Console, then ask the agent to retry.`, details: { irreversible: a.irreversible, approvalId: appr.id } };
        }
        return { decision: 'ask', category: 'irreversible', reason, details: { irreversible: a.irreversible } };
      }
    }
    // 2. Download-and-execute
    if (a.pipeToShell.length) return { decision: strict ? 'deny' : 'ask', category: 'pipe_to_shell', reason: `This downloads code and runs it immediately (${a.pipeToShell[0].slice(0, 120)}). Whatever the server returns right now will execute on this machine.` };
    // 3. Package installs: verify every npm/npx/pnpm/yarn/bun/pip/uvx package before it runs
    if (a.installs.length) {
      const reports = await verifyInstalls(a.installs, 'claude-code');
      const unsafe = reports.filter((r) => r.verdict === 'unsafe');
      if (unsafe.length) return { decision: 'deny', category: 'package', reason: `Zoro blocked this install: ${unsafe.map(packageSummary).join(' | ')}`, details: { packages: reports } };
      const risky = reports.filter((r) => r.findings.some((f) => f.severity === 'high'));
      if (risky.length) return { decision: 'ask', category: 'package', reason: `Check before installing: ${risky.map(packageSummary).join(' | ')}`, details: { packages: reports } };
      const unverified = a.installs.length - reports.filter((r) => r.verdict !== 'unknown').length;
      if (unverified > 0) return { decision: 'ask', category: 'package', reason: `Zoro could not verify ${unverified} package(s) (${a.installs.map((i) => i.spec).join(', ')}): the registry was unreachable or the name does not exist. Review before allowing.`, details: { packages: reports } };
      if (strict && reports.some((r) => r.verdict === 'warning')) return { decision: 'ask', category: 'package', reason: `Strict profile: ${reports.filter((r) => r.verdict === 'warning').map(packageSummary).join(' | ')}`, details: { packages: reports } };
    }
    // 4. Skills, plugins and MCP servers added from the shell
    if (a.skillInstalls.length) {
      const s = a.skillInstalls[0];
      return { decision: strict && /mcp add/.test(s.via) ? 'deny' : 'ask', category: 'skill', reason: `This adds new instructions or tools for your agent (${s.via}${s.target ? ` ${s.target}` : ''}). Zoro scans skill files as they land and flags anything unsafe, but review the source before allowing.${/mcp add/.test(s.via) ? ' MCP servers added this way are not routed through Zoro; add them through Zoro onboarding instead.' : ''}` };
    }
    return { decision: null, category: 'none', reason: '' };
  }

  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const file = String(ti.file_path ?? ti.notebook_path ?? '');
    const text = writtenText(ti);
    if (isSkillPath(file)) {
      const scan = scanSkill(skillNameFromPath(file), text);
      recordSkill(file, scan, 'agent_write');
      if (scan.verdict === 'unsafe') return { decision: 'deny', category: 'skill', reason: `Zoro blocked writing a skill with unsafe content: ${scan.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 3).map((f) => `${f.title} (${f.evidence.slice(0, 60)})`).join('; ')}`, details: { skill: scan } };
      return { decision: 'ask', category: 'skill', reason: `The agent is adding or changing a skill (${path.basename(path.dirname(file))}/${path.basename(file)}). Skills are instructions your agent will follow later.${scan.findings.length ? ` Zoro notes: ${scan.findings.map((f) => f.title).join('; ')}.` : ' Zoro found nothing unsafe in it.'}`, details: { skill: scan } };
    }
    if (CONFIG_FILE.test(file.replace(/\\/g, '/'))) {
      const addsBypass = /"(command|url)"\s*:/.test(text) && !/zoro-bridge/.test(text);
      const addsHook = /"hooks"\s*:/.test(text) || /"PreToolUse"|"PostToolUse"|"SessionStart"/.test(text);
      return { decision: strict && (addsBypass || addsHook) ? 'deny' : 'ask', category: 'config', reason: `The agent is editing an AI client’s own configuration (${path.basename(file)})${addsHook ? ', including hooks' : ''}${addsBypass ? ', adding a server or command that does not go through Zoro' : ''}. Changes like this can disable protections.` };
    }
    return { decision: null, category: 'none', reason: '' };
  }

  const mcp = tool.match(/^mcp__(.+?)__(.+)$/);
  if (mcp) {
    const server = mcp[1];
    if (server === 'zoro' || routedServers().has(server)) return { decision: null, category: 'none', reason: '' };
    raiseIncident({ type: 'bypass_config', severity: 'low', title: `Claude Code used MCP server “${server}” without Zoro`, summary: `Calls to ${server} go straight to the server: no seal check, no Output Shield. Route it through Zoro in Onboarding.`, groupKey: `hook-bypass:${server}`, evidence: { server, tool: mcp[2] } });
    if (strict) return { decision: 'ask', category: 'unprotected_mcp', reason: `“${server}” is not routed through Zoro, so this tool’s definition and results are not checked. Strict profile asks before each call.` };
  }
  return { decision: null, category: 'none', reason: '' };
}

/** Evaluate, record in Live traffic as a built-in tool, and shape the response Claude Code expects. */
export async function handleHook(input: HookInput) {
  const t0 = performance.now();
  let d: HookDecision;
  try {
    d = await evaluateHook(input);
  } catch (e) {
    // Fail closed, never silent: the person decides, and is told why.
    d = { decision: 'ask', category: 'none', reason: `Zoro could not evaluate this action (${(e as Error).message}). Review it before allowing.` };
  }
  const tool = input.tool_name ?? 'unknown';
  const decision = d.decision === 'deny' ? 'block' : d.decision === 'ask' ? 'ask' : 'allow';
  if (d.category !== 'none' || tool === 'Bash' || tool.startsWith('mcp__')) {
    const id = randomUUID();
    const args = input.tool_input ?? {};
    run(
      `INSERT INTO calls(id, ts, session_id, agent, client, server_id, server_label, tool, exposed_name, decision, enforced_decision, outcome, rule, reason, reason_category, latency_ms, overhead_ms, args, args_masked, context, lab)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, Date.now(), input.session_id ?? null, 'claude-code', 'claude-code', 'builtin', 'claude-code (built-in)', tool, tool, decision, decision, d.decision ? 'hook_decision' : 'hook_passthrough', d.category === 'none' ? null : d.category, d.reason || 'No Zoro rule applied; Claude Code’s own permissions decide.', d.category === 'none' ? 'allowed' : d.category,
      null, performance.now() - t0, JSON.stringify(maskArgs(args)), JSON.stringify(maskArgs(args)), JSON.stringify({ builtin: true, cwd: input.cwd ?? null, ...(d.details ?? {}) }), 0,
    );
    if (d.decision) appendLog('hook', `Claude Code ${tool}: ${d.decision} (${d.category})`, { reason: d.reason.slice(0, 300) }, id);
    bus.emitEvent('call', { id, decision, agent: 'claude-code', server: 'claude-code (built-in)', tool, builtin: true });
  }
  if (!d.decision) return {};
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d.decision, permissionDecisionReason: `[Zoro] ${d.reason}` } };
}
