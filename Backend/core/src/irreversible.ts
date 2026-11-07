import type { Capability, Definition } from './types';

/**
 * Undo-impossible brake. Some actions cannot be taken back: deleting a database volume, dropping a table, wiping a
 * folder, force-pushing over history, sending funds. Zoro recognizes them from a tool's definition and, more precisely,
 * from the exact arguments of a call, so that they always need a person's yes.
 */

export interface IrreversibleSignal {
  reason: string;
  /** the exact text that triggered it: a command, a statement, an argument */
  evidence: string;
  /** what would be lost, in plain words, when it can be told from the call */
  blastRadius?: string;
}

// ---------- SQL ----------

export type SqlRisk = 'drop' | 'truncate' | 'delete_without_where' | 'update_without_where' | 'none';

/** Split on semicolons outside quotes and comments. */
function sqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      cur += c;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Flags only statements that destroy data wholesale: DROP, TRUNCATE, and DELETE/UPDATE without a WHERE clause. */
export function classifySql(sql: string): { risk: SqlRisk; statement: string | null; object: string | null } {
  for (const st of sqlStatements(sql)) {
    const s = st.replace(/\s+/g, ' ');
    let m = s.match(/^drop\s+(table|database|schema|index|view|materialized view|collection)\s+(if exists\s+)?([^\s;(]+)/i);
    if (m) return { risk: 'drop', statement: st, object: `${m[1].toLowerCase()} ${m[3]}` };
    m = s.match(/^truncate\s+(table\s+)?([^\s;]+)/i);
    if (m) return { risk: 'truncate', statement: st, object: `table ${m[2]}` };
    m = s.match(/^delete\s+from\s+([^\s;]+)(.*)$/i);
    if (m && !/\bwhere\b/i.test(m[2])) return { risk: 'delete_without_where', statement: st, object: `table ${m[1]}` };
    m = s.match(/^update\s+([^\s;]+)\s+set\s+(.*)$/i);
    if (m && !/\bwhere\b/i.test(m[2])) return { risk: 'update_without_where', statement: st, object: `table ${m[1]}` };
  }
  return { risk: 'none', statement: null, object: null };
}

const SQL_RISK_TEXT: Record<Exclude<SqlRisk, 'none'>, string> = {
  drop: 'drops a database object',
  truncate: 'empties a table',
  delete_without_where: 'deletes every row (DELETE without WHERE)',
  update_without_where: 'overwrites every row (UPDATE without WHERE)',
};

// ---------- shell ----------

export interface PackageSpec {
  ecosystem: 'npm' | 'pypi';
  spec: string;
  via: string;
}

export interface ShellAnalysis {
  irreversible: IrreversibleSignal[];
  installs: PackageSpec[];
  skillInstalls: { via: string; target: string }[];
  pipeToShell: string[];
}

/** Minimal POSIX-ish tokenizer: quotes, escapes and the operators that separate commands. */
export function shellSegments(cmd: string): string[][] {
  const segs: string[][] = [];
  let cur: string[] = [];
  let tok = '';
  let has = false;
  let q: string | null = null;
  const flushTok = () => {
    if (has) cur.push(tok);
    tok = '';
    has = false;
  };
  const flushSeg = () => {
    flushTok();
    if (cur.length) segs.push(cur);
    cur = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) tok += cmd[++i];
      else tok += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      tok += cmd[++i];
      has = true;
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')') {
      flushSeg();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      continue;
    }
    if (/\s/.test(c)) {
      flushTok();
      continue;
    }
    tok += c;
    has = true;
  }
  flushSeg();
  return segs;
}

const NPM_INSTALL = new Set(['i', 'install', 'add', 'isntall', 'in']);
const SKILL_DIR = /(^|[\\/])\.claude[\\/](skills|agents|commands|plugins)([\\/]|$)/i;

const nonFlags = (args: string[]) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    if (/^-(p|-package|-registry|-prefix|C|-dir|-filter|w|-workspace)$/.test(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    out.push(a);
  }
  return out;
};

const isPkgSpec = (s: string) => /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*|-]+)?$/i.test(s) && !/^(\.|\/|~)/.test(s);

/** Read one shell command line the way a careful reviewer would: what gets deleted, installed or executed. */
export function analyzeShellCommand(cmd: string): ShellAnalysis {
  const res: ShellAnalysis = { irreversible: [], installs: [], skillInstalls: [], pipeToShell: [] };
  const segs = shellSegments(cmd);
  const lower = cmd.toLowerCase();
  if (/\b(curl|wget|iwr|invoke-webrequest)\b[^|;&\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(iex|invoke-expression)\b/i.test(cmd)) res.pipeToShell.push(cmd.trim().slice(0, 200));
  for (const seg of segs) {
    let s = seg;
    while (s.length && /^(sudo|doas|time|nohup|env|exec|command)$/.test(s[0])) s = s.slice(1);
    while (s.length && /^[A-Z_][A-Z0-9_]*=/.test(s[0])) s = s.slice(1);
    if (!s.length) continue;
    const [bin0, ...args] = s;
    const bin = bin0.replace(/\.(cmd|exe|ps1)$/i, '').split(/[\\/]/).pop()!.toLowerCase();
    const text = s.join(' ');
    const flags = args.filter((a) => a.startsWith('-')).join(' ');

    // --- deletion and destruction ---
    const before = res.irreversible.length;
    if (bin === 'rm' && (/(^|\s)-[a-z]*r/i.test(flags) || /--recursive/.test(flags)) && (/(^|\s)-[a-z]*f/i.test(flags) || /--force/.test(flags))) {
      const targets = nonFlags(args);
      const broad = targets.some((t) => /^(\/|~\/?|\*|\.\/?\*?|\$HOME\/?|[A-Za-z]:\\?)$/.test(t) || /(^|\/)\.\.?$/.test(t));
      res.irreversible.push({ reason: broad ? 'Recursively force-deletes a home, root or current folder' : 'Recursively force-deletes files', evidence: text, blastRadius: targets.length ? `everything under ${targets.join(', ')}` : undefined });
    }
    if ((bin === 'remove-item' || bin === 'rd' || bin === 'rmdir' || bin === 'del') && /-recurse|\/s\b/i.test(text) && /-force|\/q\b/i.test(text))
      res.irreversible.push({ reason: 'Recursively force-deletes files', evidence: text });
    if (bin === 'git' && args[0] === 'push' && (/(^|\s)(-f|--force|--force-with-lease)\b/.test(flags) || args.some((a) => a.startsWith('+')))) res.irreversible.push({ reason: 'Force-pushes over remote history', evidence: text });
    if (bin === 'git' && args[0] === 'clean' && /-[a-z]*f/.test(flags) && /-[a-z]*d/.test(flags)) res.irreversible.push({ reason: 'Deletes all untracked files', evidence: text });
    if (bin === 'dd' && args.some((a) => /^of=\/dev\//.test(a))) res.irreversible.push({ reason: 'Overwrites a disk device', evidence: text });
    if (/^mkfs(\.|$)/.test(bin) || bin === 'shred' || bin === 'wipefs') res.irreversible.push({ reason: 'Formats or shreds storage', evidence: text });
    if (bin === 'terraform' && (args[0] === 'destroy' || (args[0] === 'apply' && args.includes('-destroy')))) res.irreversible.push({ reason: 'Destroys infrastructure', evidence: text });
    if ((bin === 'kubectl' || bin === 'oc') && args[0] === 'delete') res.irreversible.push({ reason: 'Deletes cluster resources', evidence: text, blastRadius: nonFlags(args.slice(1)).join(' ') || undefined });
    if (bin === 'docker' && ((args[0] === 'volume' && /^(rm|remove|prune)$/.test(args[1] ?? '')) || (args[0] === 'system' && args[1] === 'prune' && /--volumes/.test(flags))))
      res.irreversible.push({ reason: 'Deletes Docker volumes', evidence: text, blastRadius: nonFlags(args.slice(2)).join(', ') || 'all unused volumes' });
    if (bin === 'aws' && (/\b(delete-|terminate-|deregister-)/.test(text) || (args[0] === 's3' && (args[1] === 'rb' || (args[1] === 'rm' && /--recursive/.test(flags))))))
      res.irreversible.push({ reason: 'Deletes cloud resources (AWS)', evidence: text });
    if ((bin === 'gcloud' || bin === 'az' || bin === 'doctl' || bin === 'flyctl' || bin === 'fly' || bin === 'heroku' || bin === 'vercel' || bin === 'netlify' || bin === 'railway' || bin === 'supabase' || bin === 'neonctl' || bin === 'firebase') && /\b(delete|destroy|remove|rm|apps:destroy|projects:delete)\b/.test(args.join(' ')))
      res.irreversible.push({ reason: `Deletes cloud resources (${bin})`, evidence: text });
    if (res.irreversible.length === before && /\bvolume[\s_-]?delete\b|\bvolumeDelete\b|\bdelete[\s_-]?volume\b/i.test(text)) res.irreversible.push({ reason: 'Deletes a storage volume', evidence: text });
    if (bin === 'gh' && args[0] === 'repo' && args[1] === 'delete') res.irreversible.push({ reason: 'Deletes a GitHub repository', evidence: text });
    if (bin === 'npm' && args[0] === 'unpublish') res.irreversible.push({ reason: 'Unpublishes a package', evidence: text });
    if (/^(psql|mysql|mariadb|sqlite3|sqlcmd|mongosh|mongo|cockroach|clickhouse-client)$/.test(bin) || (bin === 'npx' && /prisma|drizzle/.test(text))) {
      const stmt = args.find((a) => /\b(drop|truncate|delete|update)\b/i.test(a));
      const r = stmt ? classifySql(stmt) : null;
      if (r && r.risk !== 'none') res.irreversible.push({ reason: `SQL ${SQL_RISK_TEXT[r.risk]}`, evidence: r.statement ?? text, blastRadius: r.object ?? undefined });
      if (/\bdropDatabase\(\)|\.drop\(\)|deleteMany\(\{\s*\}\)/.test(text)) res.irreversible.push({ reason: 'Drops a database collection', evidence: text });
      if (/prisma\s+migrate\s+reset|db\s+push\s+--force-reset/.test(text)) res.irreversible.push({ reason: 'Resets the database', evidence: text });
    }
    if (bin === 'redis-cli' && /\bflush(all|db)\b/i.test(text)) res.irreversible.push({ reason: 'Flushes a Redis database', evidence: text });

    // --- package installs ---
    if ((bin === 'npm' || bin === 'pnpm' || bin === 'yarn' || bin === 'bun' || bin === 'cnpm') && NPM_INSTALL.has(args[0] ?? '')) {
      for (const p of nonFlags(args.slice(1))) if (isPkgSpec(p)) res.installs.push({ ecosystem: 'npm', spec: p, via: `${bin} ${args[0]}` });
    }
    if (bin === 'yarn' && args[0] === 'global' && args[1] === 'add') for (const p of nonFlags(args.slice(2))) if (isPkgSpec(p)) res.installs.push({ ecosystem: 'npm', spec: p, via: 'yarn global add' });
    const runner =
      bin === 'npx' || bin === 'pnpx' || bin === 'bunx' ? args :
      (bin === 'pnpm' || bin === 'yarn' || bin === 'bun') && (args[0] === 'dlx' || args[0] === 'x') ? args.slice(1) :
      bin === 'npm' && (args[0] === 'exec' || args[0] === 'x') ? args.slice(1) : null;
    if (runner) {
      const pIdx = runner.findIndex((a) => a === '-p' || a === '--package');
      const explicit = pIdx >= 0 ? runner[pIdx + 1] : null;
      const first = nonFlags(runner)[0];
      const spec = explicit ?? first;
      if (spec && isPkgSpec(spec)) res.installs.push({ ecosystem: 'npm', spec, via: bin === 'npx' || bin === 'pnpx' || bin === 'bunx' ? bin : `${bin} ${args[0]}` });
      if (first && /^(skills|@anthropic-ai\/skills|claude-skills|skill-installer)(@|$)/i.test(first)) res.skillInstalls.push({ via: `${bin} ${first}`, target: nonFlags(runner).slice(1).join(' ') || first });
    }
    if ((bin === 'pip' || bin === 'pip3' || (bin === 'uv' && args[0] === 'pip') || (bin === 'python' && args.join(' ').startsWith('-m pip'))) && args.includes('install')) {
      const after = args.slice(args.indexOf('install') + 1);
      for (const p of nonFlags(after)) if (/^[A-Za-z0-9][\w.-]*([=<>!~]=?[\w.*]+)?$/.test(p)) res.installs.push({ ecosystem: 'pypi', spec: p, via: 'pip install' });
    }
    if (bin === 'uvx' || (bin === 'pipx' && (args[0] === 'run' || args[0] === 'install'))) {
      const p = nonFlags(bin === 'pipx' ? args.slice(1) : args)[0];
      if (p) res.installs.push({ ecosystem: 'pypi', spec: p, via: bin });
    }

    // --- skills and plugins: new instructions for the agent ---
    if (bin === 'claude' && (args[0] === 'plugin' || args[0] === 'plugins') && /^(install|add|marketplace)$/.test(args[1] ?? '')) res.skillInstalls.push({ via: `claude ${args[0]} ${args[1]}`, target: nonFlags(args.slice(2)).join(' ') });
    if (bin === 'claude' && args[0] === 'mcp' && args[1] === 'add') res.skillInstalls.push({ via: 'claude mcp add', target: nonFlags(args.slice(2)).join(' ') });
    if ((bin === 'git' && args[0] === 'clone') || bin === 'cp' || bin === 'mv' || bin === 'curl' || bin === 'wget' || bin === 'ln' || bin === 'unzip' || bin === 'tar') {
      const dest = args.find((a) => SKILL_DIR.test(a));
      if (dest) res.skillInstalls.push({ via: bin === 'git' ? 'git clone' : bin, target: dest });
    }
  }
  if (/\bdrop\s+(table|database)\b/i.test(lower) && !res.irreversible.length) {
    const r = classifySql(cmd.slice(lower.search(/\bdrop\s+(table|database)\b/i)));
    if (r.risk !== 'none') res.irreversible.push({ reason: `SQL ${SQL_RISK_TEXT[r.risk]}`, evidence: r.statement ?? cmd, blastRadius: r.object ?? undefined });
  }
  return res;
}

// ---------- definitions and calls ----------

/** Words in a tool's name or description that mean its effect cannot be undone. */
export const IRREVERSIBLE_TEXT = /\b(delete|deletes|deleting|drop|drops|destroy|destroys|wipe|wipes|purge|purges|erase|erases|truncate|burn|burns|revoke|revokes|terminate|terminates|unpublish|publish|publishes|transfer|transfers|send funds|volume ?delete|force[- ]push|rm -rf|permanently|irreversibl[ey]|cannot be undone)\b/i;

/** Signals that a definition's effect cannot be undone (used by capability inference). */
export function irreversibleSignals(def: Definition): string[] {
  const out: string[] = [];
  const name = String(def.name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  const m1 = name.match(IRREVERSIBLE_TEXT);
  if (m1) out.push(`name: “${m1[0]}”`);
  const desc = typeof def.description === 'string' ? def.description.split(/(?<=[.!?])\s/)[0] : '';
  const m2 = desc.match(IRREVERSIBLE_TEXT);
  if (m2) out.push(`text: “${m2[0]}”`);
  const ann = (def.annotations ?? {}) as Record<string, unknown>;
  if (ann.destructiveHint === true) out.push('annotation: destructiveHint');
  if (ann.readOnlyHint === true) return [];
  return out;
}

const SQL_ARG = /^(sql|query|statement|stmt|command|q)$/i;
const CMD_ARG = /^(command|cmd|shell|script|bash|code|args?)$/i;

/**
 * Inspect one call. A tool that is irreversible by definition always counts; any tool counts when its arguments carry
 * a destructive SQL statement or shell command.
 */
export function detectIrreversibleCall(input: { tool: string; capabilities: Capability[]; args: Record<string, unknown> }): IrreversibleSignal[] {
  const out: IrreversibleSignal[] = [];
  const argText = (k: string) => (typeof input.args[k] === 'string' ? (input.args[k] as string) : Array.isArray(input.args[k]) ? (input.args[k] as unknown[]).map(String).join(' ') : null);
  for (const k of Object.keys(input.args)) {
    const v = argText(k);
    if (!v) continue;
    if (SQL_ARG.test(k)) {
      const r = classifySql(v);
      if (r.risk !== 'none') out.push({ reason: `SQL ${SQL_RISK_TEXT[r.risk]}`, evidence: r.statement ?? v, blastRadius: r.object ?? undefined });
    }
    if (CMD_ARG.test(k)) out.push(...analyzeShellCommand(v).irreversible);
  }
  if (input.capabilities.includes('irreversible_action')) {
    const target = ['volume', 'volumeId', 'volume_id', 'database', 'db', 'table', 'bucket', 'repo', 'repository', 'path', 'id', 'name', 'to', 'recipient']
      .map((k) => input.args[k])
      .find((v) => typeof v === 'string' && v) as string | undefined;
    out.unshift({ reason: `“${input.tool}” performs an action that cannot be undone`, evidence: `${input.tool}(${JSON.stringify(input.args).slice(0, 160)})`, blastRadius: target ? `affects ${target}` : undefined });
  }
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.reason + s.evidence) ? false : (seen.add(s.reason + s.evidence), true)));
}
