import { createHash } from "node:crypto";
import type { AnchorContext, ChainAdapter } from "../types.ts";

// MidnightAdapter posts each anchor to the IPP batcher (at ../midnight/),
// which in turn invokes the `anchor(key, value)` circuit on the Midnight
// contract. The batcher must be running; see ipp/midnight/README.md.
//
// key   = SHA-256(rut)   — 32 bytes hex
// value = ctx.hash       — SHA-256(canonical patient JSON), 32 bytes hex
//
// The batcher signs the chain tx using its own seed (the contract deployer).
// The signature we receive from the iOS client is logged in anchored_hashes
// but not used here.
export class MidnightAdapter implements ChainAdapter {
  readonly name = "midnight";

  private readonly batcherUrl: string;
  private readonly batcherAddress: string;

  constructor() {
    this.batcherUrl = process.env.MIDNIGHT_BATCHER_URL ?? "http://localhost:3335";
    this.batcherAddress = process.env.MIDNIGHT_BATCHER_ADDRESS ?? "ipp-anchor";
  }

  async submit(ctx: AnchorContext): Promise<string | null> {
    const keyHex = createHash("sha256").update(ctx.rut, "utf8").digest("hex");

    const input = JSON.stringify({
      circuit: "anchor",
      args: [keyHex, ctx.hash],
    });

    const body = {
      data: {
        address: this.batcherAddress,
        addressType: 0,
        input,
        signature: "",
        timestamp: String(ctx.timestamp),
        target: "midnight",
      },
      confirmationLevel: "wait-receipt" as const,
    };

    const res = await fetch(`${this.batcherUrl}/send-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`batcher rejected: ${res.status} ${text}`);
    }
    const result = (await res.json()) as {
      success?: boolean;
      transactionHash?: string;
      message?: string;
    };
    if (!result.success) {
      throw new Error(`batcher did not succeed: ${result.message ?? "unknown"}`);
    }
    return result.transactionHash ?? null;
  }
}
