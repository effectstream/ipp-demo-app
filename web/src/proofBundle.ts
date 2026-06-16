// Verifies a hash-only proof bundle against Cardano, independently of the IPP
// backend's stored study row. The checks are pure (given an already-fetched
// on-chain value); fetching that value is the caller's choice:
//   - in-app convenience: read IPP's chain index (fetchOnChain by chain.key)
//   - trustless: read the tx metadata from a public explorer (readAnchorFromChain)
// The standalone CLI (scripts/verify-study-bundle.ts) mirrors this logic.
import type { ProofBundle } from "./types";
import { merkleRoot, verifyMerkleProof } from "./merkleClient";
import { sha256Hex } from "./hash";
import { stripProofHeader } from "./csv";

// anchoredValue = exportHash ? sha256(recordsRootHex ++ exportHashHex) : recordsRoot
export function recomputeAnchoredValue(recordsRoot: string, exportHash: string | null): string {
  return exportHash ? sha256Hex(`${recordsRoot}${exportHash}`) : recordsRoot;
}

export interface BundleCheck {
  recomputedRoot: string;
  rootOk: boolean; // recomputed Merkle root === bundle.recordsRoot
  proofsOk: boolean; // every leaf's inclusion proof verifies against the root
  anchoredValue: string; // recomputed value that should be on chain
  anchoredOk: boolean; // recomputed anchoredValue === bundle.anchoredValue
  onChainValue: string | null;
  chainOk: boolean; // the value on chain === recomputed anchoredValue
  exportChecked: boolean; // was a CSV file supplied to check?
  exportOk: boolean; // sha256(data CSV) === bundle.exportHash
  pass: boolean; // all applicable checks passed
}

export function checkBundle(
  bundle: ProofBundle,
  opts: { csvText?: string; onChainValue: string | null },
): BundleCheck {
  const recomputedRoot = merkleRoot(bundle.leaves.map((l) => l.hash));
  const rootOk = recomputedRoot === bundle.recordsRoot;
  const proofsOk = bundle.leaves.every((l) =>
    verifyMerkleProof(l.hash, l.proof, bundle.recordsRoot),
  );
  const anchoredValue = recomputeAnchoredValue(bundle.recordsRoot, bundle.exportHash);
  const anchoredOk = anchoredValue === bundle.anchoredValue;
  const chainOk = opts.onChainValue != null && opts.onChainValue === anchoredValue;

  const exportChecked = typeof opts.csvText === "string";
  const exportOk = !exportChecked
    ? true
    : bundle.exportHash != null && sha256Hex(stripProofHeader(opts.csvText!)) === bundle.exportHash;

  return {
    recomputedRoot,
    rootOk,
    proofsOk,
    anchoredValue,
    anchoredOk,
    onChainValue: opts.onChainValue,
    chainOk,
    exportChecked,
    exportOk,
    pass: rootOk && proofsOk && anchoredOk && chainOk && (!exportChecked || exportOk),
  };
}

// Trustless read: Blockfrost-compatible GET /txs/{txId}/metadata -> the label
// 8327 entry -> its `v`. Works against Dolos mini-Blockfrost (devnet) or a real
// Blockfrost (preprod/mainnet). Returns null if absent/unreachable.
export async function readAnchorFromChain(
  blockfrostBaseUrl: string,
  txId: string,
): Promise<string | null> {
  const base = blockfrostBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/txs/${txId}/metadata`);
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ label?: unknown; json_metadata?: unknown }>;
  const row = rows.find((r) => String(r.label) === "8327");
  const v = (row?.json_metadata as { v?: unknown } | undefined)?.v;
  return typeof v === "string" ? v : null;
}
