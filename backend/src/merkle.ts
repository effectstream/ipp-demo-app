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
