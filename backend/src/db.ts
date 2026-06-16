import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import { DEFAULT_SCHEMA } from "./schema-defaults.ts";
import type { FormSchema } from "./types.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required (see backend/.env.example)");
}

// Secret used to HMAC patient passcodes before storing them. Without it the
// passcodes would sit in the DB in plaintext. Must be stable across restarts
// (a per-process value would make every stored hash unverifiable next boot).
if (!process.env.PASSCODE_SECRET) {
  throw new Error("PASSCODE_SECRET is required (see backend/.env.example)");
}
const PASSCODE_SECRET: string = process.env.PASSCODE_SECRET;

export const sql = postgres(url, {
  ssl: "require",
  max: 10,
  idle_timeout: 30,
  connect_timeout: 30,
});

export async function initSchema(): Promise<void> {
  // patients: full record lives in `data` JSONB. `rut` and the coords are
  // mirrored as columns so the map endpoint and lookup-by-rut are cheap.
  await sql`
    CREATE TABLE IF NOT EXISTS patients (
      id UUID PRIMARY KEY,
      rut TEXT NOT NULL UNIQUE,
      passcode_hash TEXT,
      schema_version INT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Additive migration: doctor_name records who first registered the
  // patient. Set on initial insert, NEVER overwritten on update.
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor_name TEXT`;
  // Tier 3 storage hygiene: store an HMAC of the passcode (never plaintext),
  // and record which form-schema version captured each record.
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS passcode_hash TEXT`;
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS schema_version INT`;
  // Legacy DBs created the plaintext `passcode TEXT NOT NULL` column. Drop the
  // NOT NULL so the new insert path (which never writes plaintext) works; the
  // column itself is removed by scripts/hash-passcodes.ts after backfill.
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'passcode'
      ) THEN
        ALTER TABLE patients ALTER COLUMN passcode DROP NOT NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_patients_rut ON patients(rut)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patients_coords ON patients(latitude, longitude)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(doctor_name)`;

  // anchored_hashes is the append-only log of signed hash submissions.
  await sql`
    CREATE TABLE IF NOT EXISTS anchored_hashes (
      id BIGSERIAL PRIMARY KEY,
      patient_id UUID NOT NULL,
      hash TEXT NOT NULL,
      public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      client_timestamp BIGINT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      chain_tx_id TEXT,
      chain_name TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_anchored_patient ON anchored_hashes(patient_id)`;

  // doctors binds a username to the ed25519 public key whose signature
  // authorizes the doctor-scope endpoints (trust-on-first-use registration).
  await sql`
    CREATE TABLE IF NOT EXISTS doctors (
      username TEXT PRIMARY KEY,
      public_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // studies: a published snapshot whose Merkle root (over the included record
  // hashes) is anchored on chain. Lets anyone validate a study's dataset
  // against the on-chain root without the records ever going on chain.
  await sql`
    CREATE TABLE IF NOT EXISTS studies (
      id UUID PRIMARY KEY,
      title TEXT,
      root TEXT NOT NULL,
      members JSONB NOT NULL,
      member_count INT NOT NULL,
      chain_key TEXT NOT NULL,
      chain_tx_id TEXT,
      chain_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // doctor_events: append-only log of point-scoring actions (currently
  // searches). Patient/field points are derived from the patients table; only
  // searches need explicit logging since they don't persist elsewhere.
  await sql`
    CREATE TABLE IF NOT EXISTS doctor_events (
      id BIGSERIAL PRIMARY KEY,
      doctor TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_doctor_events_doctor ON doctor_events(doctor, type)`;

  // feedback: free-text notes from doctors. `sender` is the authenticated
  // username (NULL when sent anonymously).
  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id BIGSERIAL PRIMARY KEY,
      sender TEXT,
      anonymous BOOLEAN NOT NULL DEFAULT false,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)`;

  // Singleton row holding the current form schema. Constraint locks id=1
  // so we can't accidentally store multiple schemas - this is the
  // single source of truth that the iOS and web clients read.
  await sql`
    CREATE TABLE IF NOT EXISTS form_schema (
      id INT PRIMARY KEY DEFAULT 1,
      version INT NOT NULL,
      schema JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT form_schema_singleton CHECK (id = 1)
    )
  `;
  // Seed the default schema if the table is empty.
  await sql`
    INSERT INTO form_schema (id, version, schema)
    VALUES (1, ${DEFAULT_SCHEMA.version}, ${sql.json(DEFAULT_SCHEMA as never)})
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function loadSchema(): Promise<FormSchema> {
  const rows = await sql<{ schema: FormSchema }[]>`
    SELECT schema FROM form_schema WHERE id = 1
  `;
  return rows[0]?.schema ?? DEFAULT_SCHEMA;
}

export async function storeSchema(schema: FormSchema): Promise<FormSchema> {
  const rows = await sql<{ schema: FormSchema }[]>`
    UPDATE form_schema
       SET schema = ${sql.json(schema as never)},
           version = ${schema.version},
           updated_at = NOW()
     WHERE id = 1
     RETURNING schema
  `;
  return rows[0]?.schema ?? schema;
}

export async function currentSchemaVersion(): Promise<number> {
  const rows = await sql<{ version: number }[]>`
    SELECT version FROM form_schema WHERE id = 1
  `;
  return rows[0]?.version ?? DEFAULT_SCHEMA.version;
}

export function generatePasscode(): string {
  // 6-digit numeric (000000-999999), leading zeros preserved.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// HMAC-SHA256 of a passcode. Stored instead of plaintext so a DB leak doesn't
// expose lookup codes.
export function hashPasscode(passcode: string): string {
  return createHmac("sha256", PASSCODE_SECRET).update(passcode, "utf8").digest("hex");
}

// Constant-time comparison of a candidate passcode against a stored hash.
export function passcodeMatches(passcode: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashPasscode(passcode), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
