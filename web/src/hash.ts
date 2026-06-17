// SHA-256 (hex) of a UTF-8 string. Matches the backend's
// createHash("sha256").update(str, "utf8") and is the building block the web
// shares with merkleClient.ts and the export/verify flows.
import { sha256 } from "@noble/hashes/sha256";

export function sha256Hex(input: string): string {
  const bytes = sha256(new TextEncoder().encode(input));
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
