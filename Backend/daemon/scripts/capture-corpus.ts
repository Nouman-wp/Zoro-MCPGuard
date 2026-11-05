/**
 * Capture Sentinel's clean corpus from real, published MCP servers (§14.6).
 *
 * Each server is launched exactly as a user would launch it, its tools/prompts/resource templates are listed over
 * MCP, and the definitions are stored verbatim with the package name and the exact version that produced them.
 * Run: pnpm corpus:capture
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Definition, DefinitionKind } from '@zoro/core';
import { CLEAN_CORPUS_PATH, type CleanCorpus } from '../src/corpus';

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'zoro-corpus-'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const SERVERS: { server: string; pkg: string; args: string[] }[] = [
  { server: 'filesystem', pkg: '@modelcontextprotocol/server-filesystem', args: [sandbox] },
  { server: 'memory', pkg: '@modelcontextprotocol/server-memory', args: [] },
  { server: 'everything', pkg: '@modelcontextprotocol/server-everything', args: [] },
  { server: 'sequential-thinking', pkg: '@modelcontextprotocol/server-sequential-thinking', args: [] },
];

function resolveVersion(pkg: string): string | null {
  try {
    return execFileSync(npx, ['--yes', 'npm', 'view', pkg, 'version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim().split('\n').pop() ?? null;
  } catch {
    return null;
  }
}

const corpus: CleanCorpus = { capturedAt: new Date().toISOString(), sources: [], entries: [] };

for (const s of SERVERS) {
  const version = resolveVersion(s.pkg);
  const spec = version ? `${s.pkg}@${version}` : s.pkg;
  process.stdout.write(`capturing ${spec} … `);
  const transport = new StdioClientTransport({ command: npx, args: ['-y', spec, ...s.args], env: getDefaultEnvironment(), stderr: 'ignore' });
  const client = new Client({ name: 'zoro-corpus-capture', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: 120_000 });
    const caps = client.getServerCapabilities() ?? {};
    const push = (kind: DefinitionKind, defs: unknown[]) => defs.forEach((d) => corpus.entries.push({ server: s.server, kind, definition: d as Definition }));
    if (caps.tools) push('tool', (await client.listTools()).tools);
    if (caps.prompts) push('prompt', (await client.listPrompts()).prompts);
    if (caps.resources) push('resource_template', (await client.listResourceTemplates().catch(() => ({ resourceTemplates: [] }))).resourceTemplates);
    corpus.sources.push({ server: s.server, package: s.pkg, version, command: `npx -y ${spec}` });
    console.log(`${corpus.entries.filter((e) => e.server === s.server).length} definitions`);
  } catch (e) {
    console.log(`failed: ${(e as Error).message}`);
  } finally {
    await client.close().catch(() => undefined);
  }
}

writeFileSync(CLEAN_CORPUS_PATH, JSON.stringify(corpus, null, 2));
console.log(`\nwrote ${corpus.entries.length} definitions from ${corpus.sources.length} servers to ${CLEAN_CORPUS_PATH}`);
process.exit(0);
