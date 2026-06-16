import { mockCardanoAddress } from "./session";

// Demo accounts. Each user's secretKey was generated once (32 bytes from
// node's crypto.randomBytes) and is committed verbatim - the Cardano-style
// wallet address is deterministically derived from it. Real Cardano
// keypair derivation (CIP-1852 + bech32) will replace this when wallet
// support lands; the rest of the app already routes through walletForAccount,
// so only this file needs to change.
export interface DemoAccount {
  username: string;
  password: string;
  secretKey: string; // hex, 64 chars
}

export const ACCOUNTS: DemoAccount[] = [
  { username: "user01", password: "pass01", secretKey: "ccc9f28bd0bc571e9e2f94043b7836ee25259d44828d7fb88e2607963952edcb" },
  { username: "user02", password: "pass02", secretKey: "7159b3bb29843b62e93eb12b6d5f2933a8c6cb648227231d550aff695851d8c3" },
  { username: "user03", password: "pass03", secretKey: "5213fe778936f41818d22484088590f2e5096b5a020049dfb91cbb0af32e3bb3" },
  { username: "user04", password: "pass04", secretKey: "6ac2f27e184bbb6bda80e824e9a4a83bb9a870695fccb00f23e40cf7fcde7ff8" },
  { username: "user05", password: "pass05", secretKey: "5448cf31d61ecffa7945b5bff00551631ea26cb5611b5ba307a3eb1e8fb7d086" },
  { username: "user06", password: "pass06", secretKey: "2fa3f442b1fb97a0d1cdbc2ed5ac171f330c486848e3cb7557e9e3c2066ccbc6" },
  { username: "user07", password: "pass07", secretKey: "f9e823d3b6c6d7b1891353b59c0b4b7171b2533e0f32cb0edf0db6cda55ae1c8" },
  { username: "user08", password: "pass08", secretKey: "942d21a804841e93b1044e7ae95036bda81021b9cc0aa6bcbc4e87d5d061785a" },
  { username: "user09", password: "pass09", secretKey: "6f1f2afaa9734364957e09fc73ef7ee96cacaeee3aca492c51470c355f4a9f8a" },
  { username: "user10", password: "pass10", secretKey: "c7eca2c87f21d35d824b7489988095b4ffc67c77ffcb9da8109fde205ff091d2" },
];

export function findAccount(username: string, password: string): DemoAccount | null {
  const u = username.trim();
  return ACCOUNTS.find((a) => a.username === u && a.password === password) ?? null;
}

// Look up an account by username alone - used to recover the signing key for
// the logged-in session (the session only stores the username).
export function accountByUsername(username: string): DemoAccount | null {
  const u = username.trim();
  return ACCOUNTS.find((a) => a.username === u) ?? null;
}

export function walletForAccount(account: DemoAccount): string {
  return mockCardanoAddress(`cardano-sk:${account.secretKey}`);
}
