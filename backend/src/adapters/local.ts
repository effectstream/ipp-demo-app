import { randomBytes } from "node:crypto";
import type { AnchorContext, ChainAdapter } from "../types.ts";

// LocalAdapter is a no-op chain adapter that returns a fake tx id.
// Useful for development and as the default when no real chain is configured.
export class LocalAdapter implements ChainAdapter {
  readonly name = "local";

  async submit(_ctx: AnchorContext): Promise<string> {
    return "local:" + randomBytes(16).toString("hex");
  }
}
