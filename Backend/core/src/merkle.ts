import { concatBytes, hexToBytes, keccakHex } from './hash';

// Binary Merkle tree over keccak256 leaves, used for organization-topic commitments and evidence-pack proofs.
// Pairs are hashed in sorted order, so a proof is just the list of sibling hashes.

const hashPair = (a: string, b: string) => {
  const [x, y] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccakHex(concatBytes(hexToBytes(x), hexToBytes(y)));
};

export const leafHash = (data: string) => keccakHex(`zoro-leaf/1:${data}`);

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return keccakHex('zoro-empty');
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: string[], index: number): string[] {
  const proof: string[] = [];
  let level = [...leaves];
  let idx = index;
  while (level.length > 1) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sibling < level.length) proof.push(level[sibling]);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h.toLowerCase() === root.toLowerCase();
}
