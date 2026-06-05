// Read-only verification path for the anchor contract.
//
// This is the *read* counterpart to the batcher's write path: given a key
// (SHA-256(rut), hex), it fetches the deployed contract's public ledger state
// from the Midnight indexer and returns the on-chain value (SHA-256(canonical
// patient JSON), hex) — WITHOUT a wallet, proof server, or transaction.
//
// Anyone can call this to verify a patient record hasn't been altered since it
// was anchored: recompute SHA-256(canonical record) and compare to what's here.

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { Anchor } from "@ipp/midnight-contract";

export interface AnchorReadResult {
  found: boolean;
  valueHex: string | null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex must have even length");
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error("invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// The provider opens a websocket for subscriptions; build it once and reuse so
// we don't leak a connection per request. queryContractState itself is a
// one-shot HTTP GraphQL query.
let cachedProvider: ReturnType<typeof indexerPublicDataProvider> | null = null;
function provider() {
  if (!cachedProvider) {
    setNetworkId(midnightNetworkConfig.id);
    cachedProvider = indexerPublicDataProvider(
      midnightNetworkConfig.indexer,
      midnightNetworkConfig.indexerWS,
    );
  }
  return cachedProvider;
}

let cachedAddress: string | null = null;
function contractAddress(): string {
  if (cachedAddress) return cachedAddress;
  const { contractAddress: addr } = readMidnightContract("contract-anchor", {
    networkId: midnightNetworkConfig.id,
  });
  if (!addr) {
    throw new Error(
      "contract-anchor address not found — deploy the contract first " +
        "(it's written to contract-anchor.undeployed.json on deploy).",
    );
  }
  cachedAddress = addr;
  return addr;
}

export async function readAnchor(keyHex: string): Promise<AnchorReadResult> {
  const key = hexToBytes(keyHex);
  const state = await provider().queryContractState(contractAddress());
  if (!state) return { found: false, valueHex: null };

  // compact-runtime ContractState exposes the ledger data on `.data`
  // (StateValue/ChargedState); fall back to the state itself defensively.
  const ledgerState = Anchor.ledger((state as { data?: unknown }).data ?? state);

  if (!ledgerState.anchors.member(key)) return { found: false, valueHex: null };
  return { found: true, valueHex: bytesToHex(ledgerState.anchors.lookup(key)) };
}
