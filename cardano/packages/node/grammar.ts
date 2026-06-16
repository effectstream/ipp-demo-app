import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

// IPP anchors ride on plain Cardano transfers carrying tx metadata; the
// CardanoTransfer primitive surfaces each transfer's metadata to the STM.
export const grammar = {
  "cardano-transfer": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
