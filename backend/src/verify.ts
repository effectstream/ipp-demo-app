import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// @noble/ed25519 v2 requires this synchronous SHA-512 binding for sign/verify.
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex must have even length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Canonical signing payload - must match what the iOS client signs.
// We sign UTF-8 bytes of `${patientId}|${hash}|${timestamp}` so the format is
// stable and human-inspectable.
export function canonicalPayload(args: {
  patientId: string;
  hash: string;
  timestamp: number;
}): Uint8Array {
  return new TextEncoder().encode(
    `${args.patientId}|${args.hash}|${args.timestamp}`
  );
}

export function verifySignature(args: {
  patientId: string;
  hash: string;
  timestamp: number;
  publicKey: string;
  signature: string;
}): boolean {
  try {
    const msg = canonicalPayload(args);
    const sig = hexToBytes(args.signature);
    const pk = hexToBytes(args.publicKey);
    return ed.verify(sig, msg, pk);
  } catch {
    return false;
  }
}
