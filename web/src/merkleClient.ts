// Browser mirror of backend/src/merkle.ts. MUST stay byte-identical: sorted
// leaves, internal node = sha256(aHex ++ bHex), odd node paired with itself.
// Used to recompute a study's root and verify per-record inclusion proofs
// independently of the backend.
import { sha256Hex } from "./hash";
import type { MerkleProofStep } from "./types";

export function merkleRoot(leavesHex: string[]): string {
  if (leavesHex.length === 0) return sha256Hex("");
  let level = [...leavesHex].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a;
      next.push(sha256Hex(a + b));
    }
    level = next;
  }
  return level[0]!;
}

export function verifyMerkleProof(
  leafHex: string,
  proof: MerkleProofStep[],
  rootHex: string,
): boolean {
  let h = leafHex;
  for (const step of proof) {
    h = step.right ? sha256Hex(h + step.sibling) : sha256Hex(step.sibling + h);
  }
  return h === rootHex;
}
