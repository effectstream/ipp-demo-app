import { createHash } from "node:crypto";
import {
  Lucid,
  SLOT_CONFIG_NETWORK,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import { Blockfrost } from "@lucid-evolution/provider";
import { generateSeedPhrase, PROTOCOL_PARAMETERS_DEFAULT } from "@lucid-evolution/utils";
import postgres from "postgres";
import type { AnchorContext, ChainAdapter, ChainReadResult } from "../types.ts";

// Anchors each hash in Cardano transaction metadata (label 8327) on the local
// yaci devnet via Lucid (submitting through the Yaci admin API), and reads
// anchors back from the `ipp_anchors` table that the EffectStream
// CardanoTransfer primitive syncs from chain (served by the pglite DB).
//
//   metadata 8327 = { t, k, v }
//     t = "ipp" (record) | "ipp-study" (Merkle root)
//     k = SHA-256(rut) | SHA-256("study:"+id)
//     v = SHA-256(canonical record) | study Merkle root
const DOLOS_URL = process.env.CARDANO_DOLOS_URL ?? "http://localhost:3000";
const YACI_ADMIN_URL = process.env.CARDANO_YACI_URL ?? "http://localhost:10000";
const PGLITE_URL =
  process.env.CARDANO_PGLITE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const METADATA_LABEL = 8327;

const sha256hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export class CardanoAdapter implements ChainAdapter {
  readonly name = "cardano";

  private lucidPromise: Promise<LucidEvolution> | null = null;
  private readonly readSql = postgres(PGLITE_URL, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 8,
    onnotice: () => {},
  });

  private lucid(): Promise<LucidEvolution> {
    if (!this.lucidPromise) {
      this.lucidPromise = (async () => {
        // Slot config for the custom devnet - Lucid needs it to build valid txs.
        const devnet = (await (
          await fetch(`${YACI_ADMIN_URL}/local-cluster/api/admin/devnet`)
        ).json()) as { startTime: number };
        SLOT_CONFIG_NETWORK["Custom"] = {
          zeroTime: devnet.startTime * 1000,
          zeroSlot: 0,
          slotLength: 1000,
        };

        const provider = new Blockfrost(DOLOS_URL, "dev");
        // Dolos mini-blockfrost is read-only and doesn't evaluate scripts.
        provider.evaluateTx = async () =>
          [{ redeemer_tag: "spend", redeemer_index: 0, ex_units: { mem: 10_000_000, steps: 5_000_000_000 } }] as never;
        provider.submitTx = async (tx: string): Promise<string> => {
          const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/tx/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/cbor" },
            body: Buffer.from(tx, "hex"),
          });
          if (!res.ok) throw new Error(`yaci submit failed (${res.status}): ${await res.text()}`);
          return (await res.text()).replace(/^"|"$/g, "");
        };

        const lucid = await Lucid(provider, "Custom", {
          presetProtocolParameters: PROTOCOL_PARAMETERS_DEFAULT,
        });
        const seed = process.env.CARDANO_WALLET_SEED ?? generateSeedPhrase();
        lucid.selectWallet.fromSeed(seed);
        const addr = await lucid.wallet().address();

        // Fund from the devnet faucet, then wait for a spendable UTxO.
        await fetch(`${YACI_ADMIN_URL}/local-cluster/api/addresses/topup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, adaAmount: 10_000 }),
        });
        for (let i = 0; i < 30; i++) {
          if ((await lucid.utxosAt(addr)).length > 0) break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        return lucid;
      })();
    }
    return this.lucidPromise;
  }

  async submit(ctx: AnchorContext): Promise<string | null> {
    const lucid = await this.lucid();
    const k = sha256hex(ctx.rut);
    const t = ctx.rut.startsWith("study:") ? "ipp-study" : "ipp";
    const addr = await lucid.wallet().address();
    const tx = lucid
      .newTx()
      .pay.ToAddress(addr, { lovelace: 2_000_000n })
      .attachMetadata(METADATA_LABEL, { t, k, v: ctx.hash });
    const signed = await (await tx.complete()).sign.withWallet().complete();
    const txHash = await signed.submit();
    await lucid.awaitTx(txHash);
    return txHash;
  }

  // Latest anchor for keyHex, read from the chain-synced ipp_anchors table.
  async read(keyHex: string): Promise<ChainReadResult> {
    try {
      const rows = await this.readSql<{ anchor_value: string }[]>`
        SELECT anchor_value FROM ipp_anchors
        WHERE anchor_key = ${keyHex}
        ORDER BY block_height DESC, id DESC
        LIMIT 1
      `;
      const v = rows[0]?.anchor_value ?? null;
      return { found: v != null, valueHex: v };
    } catch {
      return { found: false, valueHex: null };
    }
  }
}
