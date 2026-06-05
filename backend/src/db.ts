import { randomInt } from "node:crypto";
import postgres from "postgres";
import { DEFAULT_SCHEMA } from "./schema-defaults.ts";
import type { FormSchema } from "./types.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required (see backend/.env.example)");
}

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
      passcode TEXT NOT NULL,
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

  // Singleton row holding the current form schema. Constraint locks id=1
  // so we can't accidentally store multiple schemas — this is the
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

export function generatePasscode(): string {
  // 6-digit numeric (000000-999999), leading zeros preserved.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
