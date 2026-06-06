import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sql } from "./db.ts";

// @noble/ed25519 v2 needs a synchronous SHA-512 binding for verify().
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

const MAX_SKEW_MS = 5 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex must have even length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface Doctor {
  username: string;
  publicKey: string;
}

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
    doctor?: Doctor;
  }
}

// Canonical request payload the client signs. Must match the iOS/web signers:
//   `${METHOD}|${pathname}|${timestampMs}|${SHA-256(rawBody)hex}`
export function canonicalRequestPayload(args: {
  method: string;
  path: string;
  timestamp: number;
  bodyHash: string;
}): Uint8Array {
  return new TextEncoder().encode(
    `${args.method}|${args.path}|${args.timestamp}|${args.bodyHash}`,
  );
}

// Resolve the doctor identity for a public key. Trust-on-first-use: an unknown
// key registers itself to the supplied username, unless that username is
// already bound to a different key.
async function resolveDoctor(publicKey: string, username: string | null): Promise<Doctor | null> {
  const existing = await sql<{ username: string }[]>`
    SELECT username FROM doctors WHERE public_key = ${publicKey}
  `;
  if (existing[0]) return { username: existing[0].username, publicKey };

  if (!username) return null;
  const taken = await sql`SELECT 1 FROM doctors WHERE username = ${username}`;
  if (taken.length > 0) return null; // username already claimed by another key

  await sql`
    INSERT INTO doctors (username, public_key)
    VALUES (${username}, ${publicKey})
    ON CONFLICT DO NOTHING
  `;
  return { username, publicKey };
}

export async function isRegisteredKey(publicKey: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM doctors WHERE public_key = ${publicKey}`;
  return rows.length > 0;
}

// Fastify preHandler: require a valid signed request from a registered (or
// first-seen) doctor. On success attaches req.doctor.
export async function requireDoctor(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const pub = req.headers["x-ipp-pubkey"];
  const tsRaw = req.headers["x-ipp-timestamp"];
  const sig = req.headers["x-ipp-signature"];
  const usernameHeader = req.headers["x-ipp-username"];

  if (typeof pub !== "string" || typeof tsRaw !== "string" || typeof sig !== "string") {
    return reply.code(401).send({ error: "missing auth headers" });
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return reply.code(401).send({ error: "stale or invalid timestamp" });
  }

  const rawBody = req.rawBody ?? "";
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const path = (req.url || "").split("?")[0] ?? "";
  const method = (req.method || "").toUpperCase();

  let valid = false;
  try {
    valid = ed.verify(
      hexToBytes(sig),
      canonicalRequestPayload({ method, path, timestamp: ts, bodyHash }),
      hexToBytes(pub),
    );
  } catch {
    valid = false;
  }
  if (!valid) return reply.code(401).send({ error: "invalid signature" });

  const username = typeof usernameHeader === "string" ? usernameHeader.trim() : null;
  const doctor = await resolveDoctor(pub, username || null);
  if (!doctor) return reply.code(401).send({ error: "unregistered key" });

  req.doctor = doctor;
}
