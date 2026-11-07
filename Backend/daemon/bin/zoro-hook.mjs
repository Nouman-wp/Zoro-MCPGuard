#!/usr/bin/env node
// Zoro hook for Claude Code (PreToolUse). Claude Code runs this before Bash, Write/Edit and MCP tool calls and passes
// the call as JSON on stdin. The hook forwards it to the local Zoro daemon, which answers deny, ask or nothing, and
// prints that answer for Claude Code. If Zoro is unreachable the hook answers "ask" and says why: it never allows
// silently and never blocks silently (fail closed, never fail silent).
import { readFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const url = arg('url', process.env.ZORO_HOOK_URL ?? 'http://127.0.0.1:7420/hooks/claude-code');
let token = process.env.ZORO_GATEWAY_TOKEN ?? '';
const tokenFile = arg('token-file', '');
if (tokenFile) {
  try {
    token = readFileSync(tokenFile, 'utf8').trim();
  } catch {
    /* reported below as an unreachable check */
  }
}

const answer = (decision, reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: `[Zoro] ${reason}` } }));
  process.exit(0);
};

let input = '';
for await (const chunk of process.stdin) input += chunk;

try {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zoro-gateway-token': token }, body: input || '{}', signal: AbortSignal.timeout(25_000) });
  const text = await res.text();
  if (!res.ok) answer('ask', `Zoro could not check this action (HTTP ${res.status}${res.status === 401 ? ': hook token mismatch, reinstall the hook from Zoro onboarding' : ''}). Review it yourself before allowing.`);
  process.stdout.write(text || '{}');
  process.exit(0);
} catch (e) {
  answer('ask', `Zoro is not reachable (${e?.message ?? e}), so this action was not checked. Start Zoro, or review the action yourself before allowing.`);
}
