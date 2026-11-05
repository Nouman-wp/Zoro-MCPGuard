/**
 * Small key-value cache for chain lookups (for example, which resolver serves a namespace).
 * The backend plugs in its database so entries survive restarts; standalone scripts keep them in memory.
 */
export interface ChainCache {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const memory = new Map<string, string>();
let cache: ChainCache = { get: (k) => memory.get(k) ?? null, set: (k, v) => void memory.set(k, v) };

export function useChainCache(next: ChainCache) {
  cache = next;
}

export const chainCache = () => cache;
