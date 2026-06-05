// Parity check + test vector for the backend canonical hasher.
//
// The hashes in anchored_hashes were computed by the iOS client
// (PatientHasher.sha256Hex) over each patient's canonical JSON. This script
// recomputes them server-side with backend/src/canonical.ts and asserts they
// match — proving the two independent canonicalizers (Swift + TS) agree.
//
//   cd backend && bun run scripts/verify-canonical.ts
//
// Exit code 1 if any anchored record whose patient still exists fails to match.

import { createHash } from "node:crypto";
import { sql } from "../src/db.ts";
import { canonicalJSON, hashPatientData } from "../src/canonical.ts";

// 1) Offline parity vector: the bytes a real Foundation.JSONEncoder produced
// (scripts/fixtures/canon-reference.{swift,json}). canonicalJSON() must
// reproduce them exactly — this is the cross-language lock and needs no DB.
const referenceBytes = await Bun.file(
  new URL("./fixtures/canon-reference.json", import.meta.url),
).text();
const reproduced = canonicalJSON(JSON.parse(referenceBytes));
if (reproduced !== referenceBytes) {
  console.log("✗ canonical parity BROKEN vs Swift reference fixture");
  for (let i = 0; i < Math.max(reproduced.length, referenceBytes.length); i++) {
    if (reproduced[i] !== referenceBytes[i]) {
      console.log(`    first diff @ ${i}`);
      console.log(`    swift: ${JSON.stringify(referenceBytes.slice(i - 12, i + 12))}`);
      console.log(`    ts:    ${JSON.stringify(reproduced.slice(i - 12, i + 12))}`);
      break;
    }
  }
  await sql.end();
  process.exit(1);
}
console.log(
  `✓ canonical parity vs Swift reference (${referenceBytes.length} bytes, ` +
    `sha256 ${createHash("sha256").update(referenceBytes).digest("hex").slice(0, 16)}…)`,
);

interface Row {
  patientId: string;
  hash: string;
  data: Record<string, unknown>;
  receivedAt: string;
}

const rows = await sql<Row[]>`
  SELECT a.patient_id AS "patientId", a.hash, p.data, a.received_at AS "receivedAt"
  FROM anchored_hashes a
  JOIN patients p ON p.id = a.patient_id
  ORDER BY a.received_at DESC
`;

if (rows.length === 0) {
  console.log(
    "No anchored_hashes rows joined to an existing patient — nothing to verify.\n" +
      "Anchor at least one patient (iOS → /patient-hash) to build a parity vector.",
  );
  await sql.end();
  process.exit(0);
}

let ok = 0;
let bad = 0;
for (const r of rows) {
  const recomputed = hashPatientData(r.data);
  const match = recomputed === r.hash;
  if (match) {
    ok++;
    console.log(`✓ ${r.patientId}  ${r.hash.slice(0, 16)}…  (${r.receivedAt})`);
  } else {
    bad++;
    console.log(`✗ ${r.patientId}`);
    console.log(`    anchored (iOS): ${r.hash}`);
    console.log(`    recomputed (TS): ${recomputed}`);
    // Note: a mismatch can also mean the record was edited after anchoring,
    // which is exactly what /verify's recordMatch is meant to detect.
  }
}

console.log(`\n${ok} matched, ${bad} mismatched, ${rows.length} total.`);
await sql.end();
process.exit(bad > 0 ? 1 : 0);
