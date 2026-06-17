// Login session. The Cardano-style address is derived deterministically from
// the account (see deriveCardanoAddress below).

export interface Session {
  username: string;
  // Cardano-style address, derived deterministically from the account.
  walletAddress: string;
  createdAt: string;
}

const SESSION_KEY = "ipp.session.v1";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s?.username !== "string" || typeof s?.walletAddress !== "string") return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// Deterministic Cardano-style address derivation: a two-stream FNV-1a hash
// rendered as an addr1q… string (~58 chars), identical between web and iOS.
export function deriveCardanoAddress(seed: string): string {
  const h = fnv1aHex(seed, 24);
  const h2 = fnv1aHex(seed + ":2", 24);
  return `addr1q${h}${h2}`;
}

// Tiny deterministic hash → lowercase hex, no crypto-grade guarantees but
// reproducible across reloads and visually realistic.
function fnv1aHex(s: string, hexLen: number): string {
  // Two parallel 32-bit FNV-1a hashes salted differently, concatenated as
  // hex. Cheap and good enough for cosmetic IDs.
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= s.charCodeAt(s.length - 1 - i);
    h2 = Math.imul(h2, 0x01000193);
  }
  let out =
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0");
  // Extend by re-hashing if more length needed
  while (out.length < hexLen) {
    out += fnv1aHex(out, 8);
  }
  return out.slice(0, hexLen);
}
