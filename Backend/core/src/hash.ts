import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const sha256Hex = (input: string | Uint8Array) =>
  '0x' + bytesToHex(sha256(typeof input === 'string' ? utf8ToBytes(input) : input));

export const keccakHex = (input: string | Uint8Array) =>
  '0x' + bytesToHex(keccak_256(typeof input === 'string' ? utf8ToBytes(input) : input));

export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const concatBytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export const shortHash = (h: string, head = 6, tail = 4) =>
  h.length <= head + tail + 3 ? h : `${h.slice(0, head + 2)}…${h.slice(-tail)}`;

export const randomHex = (bytes = 16) => {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return bytesToHex(arr);
};
