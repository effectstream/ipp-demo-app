// One-time migration: backfill patients.passcode_hash from the legacy
// plaintext patients.passcode column, then drop the plaintext column.
//
//   cd backend && bun run scripts/hash-passcodes.ts
//
// Idempotent: safe to run repeatedly. If the plaintext column is already gone
// it does nothing.

import { sql, hashPasscode, initSchema } from "../src/db.ts";

await initSchema(); // ensures passcode_hash column exists + NOT NULL dropped

const cols = await sql<{ column_name: string }[]>`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'patients' AND column_name = 'passcode'
`;
if (cols.length === 0) {
  console.log("No plaintext `passcode` column — nothing to migrate.");
  await sql.end();
  process.exit(0);
}

const rows = await sql<{ id: string; passcode: string | null }[]>`
  SELECT id, passcode FROM patients
  WHERE passcode IS NOT NULL AND passcode_hash IS NULL
`;
console.log(`Backfilling passcode_hash for ${rows.length} rows…`);

let n = 0;
for (const r of rows) {
  if (!r.passcode) continue;
  await sql`UPDATE patients SET passcode_hash = ${hashPasscode(r.passcode)} WHERE id = ${r.id}`;
  n++;
}
console.log(`  hashed ${n} passcodes.`);

console.log("Dropping plaintext `passcode` column…");
await sql`ALTER TABLE patients DROP COLUMN IF EXISTS passcode`;

const remaining = await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM patients WHERE passcode_hash IS NULL
`;
console.log(`Done. Rows still missing a passcode_hash: ${remaining[0]?.n ?? 0}`);
await sql.end();
