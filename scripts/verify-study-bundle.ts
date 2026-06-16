#!/usr/bin/env bun
// Standalone verifier for an IPP proof bundle. ZERO IPP dependencies - it only
// uses node:crypto + node:fs + global fetch, so an auditor/journal can run it
// without trusting (or even cloning) IPP. It recomputes the Merkle root and the
// anchored value from the bundle, reads the anchor straight from a Blockfrost-
// compatible Cardano API by tx id, and compares.
//
//   bun scripts/verify-study-bundle.ts <bundle.json> --blockfrost <url> [--csv <file>]
//
//   <url> = Dolos mini-Blockfrost (devnet, e.g. http://localhost:3000) or a real
//           Blockfrost (https://cardano-preprod.blockfrost.io/api/v0).
//
// Exit 0 = verified, 1 = not verified / bad input.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

// --- Merkle (must mirror backend/src/merkle.ts byte-for-byte) ---
function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256hex("");
  let level = [...leaves].sort();
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
interface Step { sibling: string; right: boolean }
function verifyProof(leaf: string, proof: Step[], root: string): boolean {
  let h = leaf;
  for (const s of proof) h = s.right ? sha256hex(h + s.sibling) : sha256hex(s.sibling + h);
  return h === root;
}
// Strip a stamped CSV back to the data whose SHA-256 is Export-SHA256.
function stripHeader(text: string): string {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith("#")) i++;
  return lines.slice(i).join("\r\n");
}

// --- args ---
const argv = process.argv.slice(2);
const positional: string[] = [];
let blockfrost = "";
let csvPath = "";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--blockfrost") blockfrost = argv[++i] ?? "";
  else if (argv[i] === "--csv") csvPath = argv[++i] ?? "";
  else positional.push(argv[i]!);
}
const bundlePath = positional[0];
if (!bundlePath || !blockfrost) {
  console.error("usage: bun scripts/verify-study-bundle.ts <bundle.json> --blockfrost <url> [--csv <file>]");
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
  recordsRoot: string;
  exportHash: string | null;
  anchoredValue: string;
  chain: { txId: string | null };
  leaves: { hash: string; proof: Step[] }[];
};

const leaves = bundle.leaves.map((l) => l.hash);
const rootOk = merkleRoot(leaves) === bundle.recordsRoot;
const proofsOk = bundle.leaves.every((l) => verifyProof(l.hash, l.proof, bundle.recordsRoot));
const anchoredValue = bundle.exportHash
  ? sha256hex(`${bundle.recordsRoot}${bundle.exportHash}`)
  : bundle.recordsRoot;
const anchoredOk = anchoredValue === bundle.anchoredValue;

// Read the anchor straight from the chain (Blockfrost GET /txs/{tx}/metadata).
let onChain: string | null = null;
const base = blockfrost.replace(/\/+$/, "");
try {
  const res = await fetch(`${base}/txs/${bundle.chain.txId}/metadata`);
  if (res.ok) {
    const rows = (await res.json()) as Array<{ label?: unknown; json_metadata?: { v?: unknown } }>;
    const row = rows.find((r) => String(r.label) === "8327");
    if (typeof row?.json_metadata?.v === "string") onChain = row.json_metadata.v;
  } else {
    console.error(`(chain read HTTP ${res.status} from ${base})`);
  }
} catch (e) {
  console.error(`(chain read failed: ${e instanceof Error ? e.message : String(e)})`);
}
const chainOk = onChain != null && onChain === anchoredValue;

let exportChecked = false;
let exportOk = true;
if (csvPath) {
  exportChecked = true;
  exportOk =
    bundle.exportHash != null && sha256hex(stripHeader(readFileSync(csvPath, "utf8"))) === bundle.exportHash;
}

const pass = rootOk && proofsOk && anchoredOk && chainOk && (!exportChecked || exportOk);
const mark = (b: boolean) => (b ? "✓" : "✗");
console.log(`${mark(rootOk)} Merkle root matches the bundle's leaves`);
console.log(`${mark(proofsOk)} all ${bundle.leaves.length} inclusion proofs valid`);
console.log(`${mark(anchoredOk)} anchored value derives from root (+ export hash)`);
console.log(`${mark(chainOk)} on-chain value matches  (chain: ${onChain ?? "not found"})`);
if (exportChecked) console.log(`${mark(exportOk)} provided CSV matches the certified export hash`);
console.log(pass ? "\nVERIFIED ✓" : "\nNOT VERIFIED ✗");
process.exit(pass ? 0 : 1);
