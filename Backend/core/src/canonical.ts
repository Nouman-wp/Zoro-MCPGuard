import { sha256Hex } from './hash';
import type { Definition, DefinitionKind } from './types';

/**
 * Zoro canonicalization, version 1 ("zoro-canon/1"). Published in docs/CANONICALIZATION.md.
 *
 * Rules:
 *  1. The whole definition object is covered — every field the server sent, not a chosen subset.
 *  2. Objects: keys sorted by UTF-16 code unit order (RFC 8785 / JCS ordering). `undefined` members are dropped.
 *  3. Arrays keep their order. Numbers use the ECMAScript shortest round-trip form. `null` is kept.
 *  4. Strings are emitted with JSON escaping only. No Unicode normalization, no trimming, no whitespace
 *     folding: invisible, direction-override and homoglyph characters are part of the fingerprint.
 *  5. fingerprint = sha256( "zoro-canon/1\n" + kind + "\n" + canonicalJson(definition) ).
 */
export const CANONICALIZATION_VERSION = 'zoro-canon/1';

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new Error('non-finite number cannot be canonicalized');
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',') + ']';
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
    }
    default:
      throw new Error(`cannot canonicalize ${typeof value}`);
  }
}

export function fingerprintDefinition(kind: DefinitionKind, definition: Definition): string {
  return sha256Hex(`${CANONICALIZATION_VERSION}\n${kind}\n${canonicalJson(definition)}`);
}

export interface ManifestInput {
  declaredName: string | null;
  declaredVersion: string | null;
  artifactId: string | null;
  tools: Definition[];
  prompts: Definition[];
  resourceTemplates: Definition[];
}

export interface ManifestEntry {
  kind: DefinitionKind;
  name: string;
  fingerprint: string;
}

/**
 * The manifest root commits to every tool, prompt and resource template plus identity signals, so that
 * added, removed and renamed entries change the root even when every individual definition is unchanged.
 */
export function computeManifest(input: ManifestInput): { root: string; entries: ManifestEntry[] } {
  const entries: ManifestEntry[] = [
    ...input.tools.map((d) => ({ kind: 'tool' as const, name: d.name, fingerprint: fingerprintDefinition('tool', d) })),
    ...input.prompts.map((d) => ({ kind: 'prompt' as const, name: d.name, fingerprint: fingerprintDefinition('prompt', d) })),
    ...input.resourceTemplates.map((d) => ({
      kind: 'resource_template' as const,
      name: d.name,
      fingerprint: fingerprintDefinition('resource_template', d),
    })),
  ];
  const sorted = [...entries].sort((a, b) =>
    a.kind === b.kind ? (a.name < b.name ? -1 : a.name > b.name ? 1 : a.fingerprint < b.fingerprint ? -1 : 1) : a.kind < b.kind ? -1 : 1,
  );
  const root = sha256Hex(
    `${CANONICALIZATION_VERSION}\nmanifest\n` +
      canonicalJson({
        identity: { name: input.declaredName, version: input.declaredVersion, artifact: input.artifactId },
        entries: sorted.map((e) => [e.kind, e.name, e.fingerprint]),
      }),
  );
  return { root, entries };
}

/** Parse untrusted JSON pasted by a person (Zoro Verify). Accepts a single definition or an MCP tools/list result. */
export function parseDefinitionsInput(raw: string): { kind: DefinitionKind; definition: Definition }[] {
  const parsed = JSON.parse(raw) as unknown;
  const out: { kind: DefinitionKind; definition: Definition }[] = [];
  const push = (kind: DefinitionKind, d: unknown) => {
    if (d && typeof d === 'object' && typeof (d as Definition).name === 'string') out.push({ kind, definition: d as Definition });
  };
  if (Array.isArray(parsed)) parsed.forEach((d) => push('tool', d));
  else if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    if (Array.isArray(p.tools) || Array.isArray(p.prompts) || Array.isArray(p.resourceTemplates)) {
      (p.tools as unknown[] | undefined)?.forEach((d) => push('tool', d));
      (p.prompts as unknown[] | undefined)?.forEach((d) => push('prompt', d));
      (p.resourceTemplates as unknown[] | undefined)?.forEach((d) => push('resource_template', d));
    } else if ('uriTemplate' in p) push('resource_template', p);
    else if ('arguments' in p && !('inputSchema' in p)) push('prompt', p);
    else push('tool', p);
  }
  return out;
}
