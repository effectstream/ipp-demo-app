import { randomBytes } from "node:crypto";
import type { AnchorContext, ChainAdapter, ChainReadResult } from "../types.ts";

// LocalAdapter is a no-op chain adapter that returns a fake tx id.
// Useful for development and as the default when no real chain is configured.
export class LocalAdapter implements ChainAdapter {
  readonly name = "local";

  async submit(_ctx: AnchorContext): Promise<string> {
    return "local:" + randomBytes(16).toString("hex");
  }

  // No real chain to read from; verification falls back to comparing the
  // recorded anchor hash only (chain value reported as not found).
  async read(_keyHex: string): Promise<ChainReadResult> {
    return { found: false, valueHex: null };
  }
}
