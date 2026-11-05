import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson, sha256Hex } from '@zoro/core';

export interface ArtifactIdentity {
  id: string | null;
  detail: Record<string, unknown>;
}

const sha256File = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function nearestPackage(file: string): { name: string; version: string; dir: string } | null {
  let dir = path.dirname(file);
  for (let i = 0; i < 8; i++) {
    const pj = path.join(dir, 'package.json');
    if (existsSync(pj)) {
      try {
        const p = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string; version?: string };
        if (p.name) return { name: p.name, version: p.version ?? '0.0.0', dir };
      } catch {
        /* ignore malformed package.json */
      }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const RUNNERS = new Set(['npx', 'npx.cmd', 'pnpx', 'bunx', 'uvx', 'pipx', 'dlx']);

/**
 * Locally launched servers: hash every file the command line points at, record the owning package and version,
 * and the package spec for runner commands (npx/uvx). A change to any of these is a code change (§4.2).
 */
export function stdioArtifact(command: string, args: string[], cwd: string | null): ArtifactIdentity {
  const files: { path: string; sha256: string; package: string | null }[] = [];
  const specs: string[] = [];
  const base = cwd ?? process.cwd();
  const candidates = [command, ...args];
  for (const c of candidates) {
    if (!c || c.startsWith('-')) continue;
    const abs = path.isAbsolute(c) ? c : path.resolve(base, c);
    try {
      if (existsSync(abs) && statSync(abs).isFile() && statSync(abs).size < 64 * 1024 * 1024) {
        const pkg = nearestPackage(abs);
        files.push({ path: abs, sha256: sha256File(abs), package: pkg ? `${pkg.name}@${pkg.version}` : null });
      }
    } catch {
      /* unreadable path: recorded by spec only */
    }
  }
  const runner = path.basename(command).toLowerCase();
  if (RUNNERS.has(runner)) {
    const spec = args.find((a) => !a.startsWith('-'));
    if (spec) specs.push(spec);
  }
  const pinned = specs.every((s) => /@\d/.test(s.replace(/^@/, '')) || /==\d/.test(s));
  const detail = { kind: 'local', command, args, files, packageSpecs: specs, pinned: specs.length === 0 ? files.length > 0 : pinned };
  const identityBasis = { command: path.basename(command), files: files.map((f) => [f.path, f.sha256]), specs };
  return { id: files.length || specs.length ? sha256Hex(canonicalJson(identityBasis)) : null, detail };
}

export function remoteArtifact(url: string, declaredName: string | null, declaredVersion: string | null): ArtifactIdentity {
  const detail = { kind: 'remote', endpoint: url, declaredName, declaredVersion, note: 'A remote server can change behaviour without changing its definitions or version string; Zoro cannot see inside it.' };
  return { id: sha256Hex(canonicalJson({ url, declaredName, declaredVersion })), detail };
}

export function labArtifact(codeVersion: string, codeHash: string): ArtifactIdentity {
  return { id: sha256Hex(`lab:${codeHash}`), detail: { kind: 'lab', codeVersion, codeHash } };
}
