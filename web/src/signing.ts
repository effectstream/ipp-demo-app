// Signs doctor-scope API requests with the account's ed25519 key, matching
// backend/src/auth.ts and the iOS DoctorSigner. The signed payload is:
//   `${METHOD}|${pathname}|${timestampMs}|${SHA-256(body)hex}`
//
// The key is derived from the same 32-byte account seed as iOS, so both clients
// present the identical public key for a given account (standard RFC 8032
// ed25519 — verified against CryptoKit).

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";

// @noble/ed25519 v2 needs a synchronous SHA-512 binding for the sync API.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function toHex(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function signedHeaders(
  secretKeyHex: string,
  username: string,
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const priv = fromHex(secretKeyHex);
  const pub = ed.getPublicKey(priv);
  const ts = Date.now();
  const bodyHash = toHex(sha256(new TextEncoder().encode(body)));
  const sig = ed.sign(new TextEncoder().encode(`${method}|${path}|${ts}|${bodyHash}`), priv);
  return {
    "X-IPP-PubKey": toHex(pub),
    "X-IPP-Timestamp": String(ts),
    "X-IPP-Signature": toHex(sig),
    "X-IPP-Username": username,
  };
}
