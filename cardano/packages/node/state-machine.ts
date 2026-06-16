import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";
import { grammar } from "./grammar.ts";

// Metadata label IPP anchors are written under (must match the backend adapter).
const IPP_LABEL = "8327";

const pool = getConnection();
const stm = new Stm<typeof grammar, {}>(grammar);

// metadataToJson renders a CBOR map as an array of { k, v } pairs, so flatten
// that (and tolerate a plain object) into { t, k, v }.
function fields(entry: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(entry)) {
    for (const p of entry) {
      const pair = p as { k?: unknown; v?: unknown };
      if (pair && typeof pair.k === "string") out[pair.k] = String(pair.v ?? "");
    }
  } else if (entry && typeof entry === "object") {
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) out[k] = String(v ?? "");
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// cardano-transfer fires for every transfer on the devnet. We persist only the
// ones carrying an IPP anchor (label 8327): { t: "ipp" | "ipp-study", k, v }.
//   k = SHA-256(rut) | study id      v = record hash | study Merkle root
// This is where on-chain data becomes the app's verifiable state (ipp_anchors).
// ──────────────────────────────────────────────────────────────────────────
stm.addStateTransition("cardano-transfer", function* (data) {
  const { txId, metadata } = data.parsedInput as { txId: string; metadata: string };
  if (!metadata) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return;
  }
  const entry = parsed?.[IPP_LABEL];
  if (entry == null) return;

  const f = fields(entry);
  const kind = f.t;
  if ((kind !== "ipp" && kind !== "ipp-study") || !f.k || !f.v) return;

  console.log(`[STM] IPP anchor indexed: kind=${kind} key=${f.k.slice(0, 16)}… tx=${txId}`);
  yield* World.promise(
    pool.query(
      `INSERT INTO ipp_anchors (block_height, tx_id, kind, anchor_key, anchor_value, raw_metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.blockHeight, txId, kind, f.k, f.v, JSON.stringify(entry)],
    ),
  );
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
