import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLog } from './auditlog';
import { config } from './config';
import { all, get, getSetting, json, run, setSetting } from './db';
import { gateway } from './gateway/gateway';
import { gatewayToken } from './gateway/http';
import { raiseIncident } from './incidents';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE_PATH = path.resolve(here, '../bin/zoro-bridge.mjs');
export const HOOK_PATH = path.resolve(here, '../bin/zoro-hook.mjs');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_JSON = path.join(os.homedir(), '.claude.json');
const BACKUP_DIR = path.join(config.dataDir, 'backups');

interface ClientDef {
  client: string;
  label: string;
  paths: string[];
  key: 'mcpServers' | 'servers';
}

function candidates(): ClientDef[] {
  const home = os.homedir();
  const appdata = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const mac = process.platform === 'darwin';
  const win = process.platform === 'win32';
  const userConfig = win ? appdata : mac ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config');
  return [
    { client: 'claude-desktop', label: 'Claude Desktop', key: 'mcpServers', paths: [path.join(userConfig, 'Claude', 'claude_desktop_config.json')] },
    { client: 'claude-code', label: 'Claude Code (user scope)', key: 'mcpServers', paths: [path.join(home, '.claude.json')] },
    { client: 'cursor', label: 'Cursor', key: 'mcpServers', paths: [path.join(home, '.cursor', 'mcp.json')] },
    { client: 'windsurf', label: 'Windsurf', key: 'mcpServers', paths: [path.join(home, '.codeium', 'windsurf', 'mcp_config.json')] },
    { client: 'vscode', label: 'VS Code', key: 'servers', paths: [path.join(userConfig, 'Code', 'User', 'mcp.json')] },
    { client: 'gemini-cli', label: 'Gemini CLI', key: 'mcpServers', paths: [path.join(home, '.gemini', 'settings.json')] },
    { client: 'cline', label: 'Cline', key: 'mcpServers', paths: [path.join(userConfig, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')] },
  ];
}

/** Projects Claude Code has opened (keys of "projects" in ~/.claude.json), for project and local MCP scopes. */
function claudeProjects(): { dir: string; local: Record<string, Record<string, unknown>> }[] {
  try {
    if (!existsSync(CLAUDE_JSON) || statSync(CLAUDE_JSON).size > 50_000_000) return [];
    const doc = JSON.parse(readFileSync(CLAUDE_JSON, 'utf8')) as { projects?: Record<string, { mcpServers?: Record<string, Record<string, unknown>> }> };
    return Object.entries(doc.projects ?? {}).map(([dir, v]) => ({ dir, local: v?.mcpServers ?? {} }));
  } catch {
    return [];
  }
}

function projectDefs(): ClientDef[] {
  return claudeProjects()
    .filter((p) => existsSync(path.join(p.dir, '.mcp.json')))
    .map((p) => ({ client: 'claude-code-project', label: `Claude Code project (${path.basename(p.dir)})`, key: 'mcpServers' as const, paths: [path.join(p.dir, '.mcp.json')] }));
}

/** Every AI client configuration file Zoro knows about (for the settings watchdog). */
export function clientConfigPaths(): { path: string; client: string }[] {
  const out = [...candidates(), ...projectDefs()].flatMap((d) => d.paths.map((p) => ({ path: p, client: d.client })));
  out.push({ path: CLAUDE_SETTINGS, client: 'claude-code-settings' });
  if (process.platform === 'win32') out.push({ path: 'C:\\Program Files\\ClaudeCode\\managed-settings.json', client: 'claude-code-managed' }, { path: 'C:\\Program Files\\ClaudeCode\\managed-mcp.json', client: 'claude-code-managed' });
  else if (process.platform === 'darwin') out.push({ path: '/Library/Application Support/ClaudeCode/managed-settings.json', client: 'claude-code-managed' }, { path: '/Library/Application Support/ClaudeCode/managed-mcp.json', client: 'claude-code-managed' });
  else out.push({ path: '/etc/claude-code/managed-settings.json', client: 'claude-code-managed' }, { path: '/etc/claude-code/managed-mcp.json', client: 'claude-code-managed' });
  return out;
}

/** After Zoro writes a client config itself, record the new content as trusted so the watchdog does not flag it. */
export function trustConfigWrite(file: string, client: string) {
  try {
    const content = readFileSync(file, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    run('INSERT INTO config_snapshots(path, client, hash, content, good_content, updated_at, expected_until) VALUES(?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, content = excluded.content, good_content = excluded.good_content, updated_at = excluded.updated_at, expected_until = excluded.expected_until', file, client, `0x${hash}`, content, content, Date.now(), Date.now() + 5_000);
  } catch {
    /* file vanished: nothing to trust */
  }
}

/** Minimal JSONC support (VS Code config files allow comments and trailing commas). */
function parseJsonc(text: string): Record<string, unknown> {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') while (i < text.length && text[i] !== '\n') i++;
    else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
}

export interface DetectedServer {
  name: string;
  transport: 'stdio' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  hasEnv: boolean;
  hasHeaders: boolean;
  status: 'unprotected' | 'zoro' | 'routed';
}

export interface DetectedClient {
  id: string;
  client: string;
  label: string;
  path: string;
  servers: DetectedServer[];
  routed: boolean;
  backup: string | null;
  error: string | null;
  /** false for Claude Code local-scope servers kept inside ~/.claude.json: detected and flagged, not rewritten */
  routable?: boolean;
}

const idFor = (p: string) => createHash('sha256').update(p).digest('hex').slice(0, 16);
const isZoroEntry = (e: Record<string, unknown>) => Array.isArray(e.args) && (e.args as string[]).some((a) => String(a).includes('zoro-bridge'));

export const scanPermitted = () => getSetting('onboarding_scan_permission') === 'granted';

export function scanClients(grant = false): DetectedClient[] {
  if (grant) {
    setSetting('onboarding_scan_permission', 'granted');
    appendLog('onboarding', 'Permission granted to read MCP client configurations');
  }
  if (!scanPermitted()) throw new Error('Permission to read client configurations has not been granted');
  const out: DetectedClient[] = [];
  for (const def of [...candidates(), ...projectDefs()]) {
    for (const p of def.paths) {
      if (!existsSync(p)) continue;
      const id = idFor(p);
      const prior = get<{ backup_path: string | null; routed: number; routed_servers: string | null }>('SELECT backup_path, routed, routed_servers FROM client_configs WHERE id = ?', id);
      try {
        const doc = parseJsonc(readFileSync(p, 'utf8'));
        const entries = (doc[def.key] ?? {}) as Record<string, Record<string, unknown>>;
        const routedNames = json<string[]>(prior?.routed_servers, []);
        const servers: DetectedServer[] = Object.entries(entries).map(([name, e]) => ({
          name,
          transport: typeof e.url === 'string' ? 'http' : 'stdio',
          command: typeof e.command === 'string' ? e.command : null,
          args: Array.isArray(e.args) ? (e.args as string[]).map(String) : [],
          url: typeof e.url === 'string' ? e.url : null,
          hasEnv: Boolean(e.env && Object.keys(e.env as object).length),
          hasHeaders: Boolean(e.headers && Object.keys(e.headers as object).length),
          status: isZoroEntry(e) ? 'zoro' : 'unprotected',
        }));
        for (const n of routedNames) if (!servers.some((s) => s.name === n)) servers.push({ name: n, transport: 'stdio', command: null, args: [], url: null, hasEnv: false, hasHeaders: false, status: 'routed' });
        run('INSERT INTO client_configs(id, client, path, detected_at, last_scan) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_scan = excluded.last_scan', id, def.client, p, Date.now(), JSON.stringify(servers));
        out.push({ id, client: def.client, label: def.label, path: p, servers, routed: Boolean(prior?.routed), backup: prior?.backup_path ?? null, error: null });
      } catch (e) {
        out.push({ id, client: def.client, label: def.label, path: p, servers: [], routed: Boolean(prior?.routed), backup: prior?.backup_path ?? null, error: `Could not parse: ${(e as Error).message}` });
      }
    }
  }
  // Claude Code local scope: servers stored per project inside ~/.claude.json. Detected and flagged; route them by
  // moving them to user scope or by adding them through Zoro.
  for (const p of claudeProjects()) {
    const names = Object.keys(p.local);
    if (!names.length) continue;
    const servers: DetectedServer[] = Object.entries(p.local).map(([name, e]) => ({
      name,
      transport: typeof e.url === 'string' ? 'http' : 'stdio',
      command: typeof e.command === 'string' ? e.command : null,
      args: Array.isArray(e.args) ? (e.args as string[]).map(String) : [],
      url: typeof e.url === 'string' ? e.url : null,
      hasEnv: Boolean(e.env && Object.keys(e.env as object).length),
      hasHeaders: Boolean(e.headers && Object.keys(e.headers as object).length),
      status: isZoroEntry(e) ? 'zoro' : 'unprotected',
    }));
    out.push({ id: idFor(`${CLAUDE_JSON}#${p.dir}`), client: 'claude-code-local', label: `Claude Code local scope (${path.basename(p.dir)})`, path: `${CLAUDE_JSON} → projects → ${p.dir}`, servers, routed: false, backup: null, error: null, routable: false });
  }
  return out;
}

/**
 * Route the selected servers of one client through the Gateway. The original file is backed up first (FR-O2);
 * secrets in env/headers move into Zoro's local store and are never displayed in full.
 */
export function routeClient(clientId: string, serverNames: string[], mode: 'enforce' | 'observe') {
  const def = [...candidates(), ...projectDefs()].find((d) => d.paths.some((p) => idFor(p) === clientId));
  const p = def?.paths.find((x) => idFor(x) === clientId);
  if (!def || !p || !existsSync(p)) throw new Error('client configuration not found');
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const prior = get<{ backup_path: string | null; routed_servers: string | null }>('SELECT backup_path, routed_servers FROM client_configs WHERE id = ?', clientId);
  const backup = prior?.backup_path ?? path.join(BACKUP_DIR, `${def.client}-${clientId}-${Date.now()}.json`);
  if (!prior?.backup_path) copyFileSync(p, backup);
  const doc = parseJsonc(readFileSync(p, 'utf8'));
  const entries = { ...((doc[def.key] ?? {}) as Record<string, Record<string, unknown>>) };
  const imported: string[] = [];
  for (const name of serverNames) {
    const e = entries[name];
    if (!e || isZoroEntry(e)) continue;
    const url = typeof e.url === 'string' ? e.url : null;
    if (url && (e.type === 'sse' || /\/sse\/?$/.test(url))) throw new Error(`“${name}” uses the legacy SSE transport, which Zoro does not proxy yet. Leave it unselected.`);
    gateway.addServer({
      name,
      transport: url ? 'http' : 'stdio',
      command: typeof e.command === 'string' ? e.command : null,
      args: Array.isArray(e.args) ? (e.args as unknown[]).map(String) : [],
      env: (e.env as Record<string, string>) ?? {},
      cwd: typeof e.cwd === 'string' ? e.cwd : null,
      url,
      headers: (e.headers as Record<string, string>) ?? {},
      mode,
      source: `import:${def.client}`,
    });
    delete entries[name];
    imported.push(name);
  }
  const bridgeArgs = [BRIDGE_PATH, '--url', `http://127.0.0.1:${config.port}/mcp`, '--token', gatewayToken, '--client', def.client];
  entries.zoro = def.key === 'servers' ? { type: 'stdio', command: process.execPath, args: bridgeArgs } : { command: process.execPath, args: bridgeArgs };
  doc[def.key] = entries;
  writeFileSync(p, JSON.stringify(doc, null, 2));
  trustConfigWrite(p, def.client);
  const routedNames = [...new Set([...json<string[]>(prior?.routed_servers, []), ...imported])];
  run('UPDATE client_configs SET backup_path = ?, routed = 1, routed_at = ?, routed_servers = ? WHERE id = ?', backup, Date.now(), JSON.stringify(routedNames), clientId);
  appendLog('onboarding', `${def.label}: routed ${imported.length} server(s) through Zoro (${mode})`, { servers: imported, backup }, clientId);
  return { imported, backup, restartRequired: `Restart ${def.label} so it reconnects through Zoro.` };
}

/** One action restores every original configuration exactly (byte-for-byte from the backup). */
export function restoreClients(clientId?: string) {
  const rows = all<{ id: string; path: string; backup_path: string | null; client: string }>('SELECT id, path, backup_path, client FROM client_configs WHERE routed = 1' + (clientId ? ' AND id = ?' : ''), ...(clientId ? [clientId] : []));
  const restored: string[] = [];
  for (const r of rows) {
    if (!r.backup_path || !existsSync(r.backup_path)) continue;
    writeFileSync(r.path, readFileSync(r.backup_path));
    trustConfigWrite(r.path, r.client);
    run('UPDATE client_configs SET routed = 0, routed_servers = NULL, backup_path = NULL WHERE id = ?', r.id);
    restored.push(r.path);
  }
  appendLog('onboarding', `Restored ${restored.length} original client configuration(s); protection for those clients has ended`, { restored });
  return restored;
}

/** FR-O4: a server added to a routed client that does not go through Zoro is flagged. */
export function watchForBypass() {
  if (!scanPermitted()) return;
  let clients: DetectedClient[] = [];
  try {
    clients = scanClients();
  } catch {
    return;
  }
  for (const c of clients.filter((x) => x.routed)) {
    for (const s of c.servers.filter((x) => x.status === 'unprotected')) {
      raiseIncident({ type: 'bypass_config', severity: 'medium', title: `${c.label}: “${s.name}” bypasses Zoro`, summary: `${c.label} connects to “${s.name}” directly, so Zoro cannot protect calls to it. Route it through Zoro from the onboarding page.`, groupKey: `bypass:${c.id}:${s.name}`, evidence: { client: c.client, path: c.path, server: s.name } });
    }
  }
}

export function clientSnippet(client: string) {
  return { command: process.execPath, args: [BRIDGE_PATH, '--url', `http://127.0.0.1:${config.port}/mcp`, '--token', gatewayToken, '--client', client] };
}

// ---------- Claude Code hook: built-in tools (Bash, Write/Edit) and npm/npx/skill protection ----------

const HOOK_MATCHER = 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|mcp__.*';
const isZoroHook = (h: { command?: string }) => typeof h?.command === 'string' && h.command.includes('zoro-hook');
type HookGroup = { matcher?: string; hooks?: { type?: string; command?: string; timeout?: number }[] };

function readClaudeSettings(): Record<string, unknown> {
  if (!existsSync(CLAUDE_SETTINGS)) return {};
  return parseJsonc(readFileSync(CLAUDE_SETTINGS, 'utf8'));
}

export function claudeHookStatus() {
  let installed = false;
  let error: string | null = null;
  try {
    const doc = readClaudeSettings();
    const groups = ((doc.hooks as Record<string, HookGroup[]> | undefined)?.PreToolUse ?? []) as HookGroup[];
    installed = groups.some((g) => (g.hooks ?? []).some(isZoroHook));
  } catch (e) {
    error = `Could not read ${CLAUDE_SETTINGS}: ${(e as Error).message}`;
  }
  return { installed, path: CLAUDE_SETTINGS, matcher: HOOK_MATCHER, error, backup: getSetting('claude_hook_backup') };
}

/** Add Zoro's PreToolUse hook to Claude Code's user settings, after backing the file up. Idempotent. */
export function installClaudeCodeHook() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  if (existsSync(CLAUDE_SETTINGS) && !getSetting('claude_hook_backup')) {
    const backup = path.join(BACKUP_DIR, `claude-settings-${Date.now()}.json`);
    copyFileSync(CLAUDE_SETTINGS, backup);
    setSetting('claude_hook_backup', backup);
  }
  const tokenFile = path.join(config.dataDir, 'hook.token');
  writeFileSync(tokenFile, gatewayToken, { mode: 0o600 });
  const doc = readClaudeSettings();
  const hooks = { ...((doc.hooks as Record<string, HookGroup[]>) ?? {}) };
  const pre = (hooks.PreToolUse ?? []).map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isZoroHook(h)) })).filter((g) => g.hooks.length);
  const q = (x: string) => `"${x}"`;
  pre.push({ matcher: HOOK_MATCHER, hooks: [{ type: 'command', command: `${q(process.execPath)} ${q(HOOK_PATH)} --url http://127.0.0.1:${config.port}/hooks/claude-code --token-file ${q(tokenFile)}`, timeout: 30 }] });
  hooks.PreToolUse = pre;
  doc.hooks = hooks;
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(doc, null, 2));
  trustConfigWrite(CLAUDE_SETTINGS, 'claude-code-settings');
  appendLog('onboarding', 'Installed the Zoro hook for Claude Code built-in tools (Bash, Write/Edit) and package/skill installs', { path: CLAUDE_SETTINGS });
  return claudeHookStatus();
}

export function uninstallClaudeCodeHook() {
  if (!existsSync(CLAUDE_SETTINGS)) return claudeHookStatus();
  const doc = readClaudeSettings();
  const hooks = { ...((doc.hooks as Record<string, HookGroup[]>) ?? {}) };
  hooks.PreToolUse = (hooks.PreToolUse ?? []).map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isZoroHook(h)) })).filter((g) => g.hooks.length);
  if (!hooks.PreToolUse.length) delete hooks.PreToolUse;
  if (Object.keys(hooks).length) doc.hooks = hooks;
  else delete doc.hooks;
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(doc, null, 2));
  trustConfigWrite(CLAUDE_SETTINGS, 'claude-code-settings');
  appendLog('onboarding', 'Removed the Zoro hook from Claude Code; built-in tools are no longer checked', { path: CLAUDE_SETTINGS });
  return claudeHookStatus();
}
