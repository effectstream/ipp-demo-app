import { createHash } from "node:crypto";

const sha256hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

// Merkle root over a set of leaf hashes (hex). Leaves are sorted so the root is
// a commitment to the *set* - independent of presentation order - which is what
// lets a third party recompute it from the dataset in any order. Internal nodes
// are sha256(a || b); an odd node is paired with itself. Empty set → sha256("").
export function merkleRoot(leavesHex: string[]): string {
  if (leavesHex.length === 0) return sha256hex("");
  let level = [...leavesHex].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a;
      next.push(sha256hex(a + b));
    }
    level = next;
  }
  return level[0]!;
}

// One step of an inclusion proof: the sibling hash and whether it sits on the
// right of the current node. `right: true`  -> parent = sha256(current ‖ sibling)
//                            `right: false` -> parent = sha256(sibling ‖ current)
export interface MerkleProofStep {
  sibling: string;
  right: boolean;
}

// Inclusion proof that `targetHex` is one of `leavesHex`, against merkleRoot().
// Walks the same sorted/odd-paired-with-self tree, recording the sibling at each
// level. Returns [] for a single-leaf tree (root === leaf). Throws if the target
// isn't present.
export function merkleProof(leavesHex: string[], targetHex: string): MerkleProofStep[] {
  let level = [...leavesHex].sort();
  let idx = level.indexOf(targetHex);
  if (idx < 0) throw new Error("merkleProof: target not in leaves");

  const proof: MerkleProofStep[] = [];
  while (level.length > 1) {
    const isLeft = idx % 2 === 0;
    // Left node pairs with idx+1 (or itself if it's an odd-length tail);
    // right node pairs with idx-1.
    const siblingIdx = isLeft ? idx + 1 : idx - 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx]! : level[idx]!;
    proof.push({ sibling, right: isLeft });

    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a;
      next.push(sha256hex(a + b));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

// Verify an inclusion proof: fold the leaf up through the siblings and check it
// reproduces the root. Independent of merkleRoot() so a third party can run it
// over just { leaf, proof, root } with no access to the full set.
export function verifyMerkleProof(
  leafHex: string,
  proof: MerkleProofStep[],
  rootHex: string,
): boolean {
  let h = leafHex;
  for (const step of proof) {
    h = step.right ? sha256hex(h + step.sibling) : sha256hex(step.sibling + h);
  }
  return h === rootHex;
}
