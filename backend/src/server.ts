import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHash } from "node:crypto";
import {
  sql,
  initSchema,
  generatePasscode,
  hashPasscode,
  passcodeMatches,
  currentSchemaVersion,
  loadSchema,
  storeSchema,
} from "./db.ts";
import { LocalAdapter } from "./adapters/local.ts";
import { MidnightAdapter } from "./adapters/midnight.ts";
import { verifySignature } from "./verify.ts";
import { hashPatientData } from "./canonical.ts";
import { checkRate, recordFailure, clearRate } from "./ratelimit.ts";
import type {
  AnchorContext,
  ChainAdapter,
  FormSchema,
  HashSubmission,
  LeaderboardEntry,
  PatientUpsertRequest,
  PatientRow,
  MapPin,
} from "./types.ts";

const PORT = Number(process.env.PORT ?? 3334);
const HOST = process.env.HOST ?? "0.0.0.0";
const CHAIN = process.env.CHAIN ?? "local";
const MAX_SKEW_MS = 5 * 60 * 1000;
const RUT_PATTERN = /^[0-9kK.\-]{5,15}$/;

function pickAdapter(name: string): ChainAdapter {
  switch (name) {
    case "midnight":
      return new MidnightAdapter();
    case "local":
    default:
      return new LocalAdapter();
  }
}

await initSchema();
const adapter = pickAdapter(CHAIN);
const app = Fastify({ logger: true });
// Permissive CORS for development. The web frontend lives at a different
// origin (Vite dev server on :5173). Tighten before deploying to prod.
await app.register(cors, { origin: true });

app.get("/health", async () => ({
  status: "ok",
  chain: adapter.name,
  storage: "postgres",
}));

// -- Patient CRUD ----------------------------------------------------------

app.post("/api/v1/patients", async (req, reply) => {
  const body = req.body as Partial<PatientUpsertRequest> | undefined;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.rut !== "string" ||
    !RUT_PATTERN.test(body.rut) ||
    typeof body.data !== "object" ||
    body.data === null
  ) {
    return reply.code(400).send({ error: "id, rut, and data are required" });
  }

  const lat = body.latitude == null ? null : Number(body.latitude);
  const lng = body.longitude == null ? null : Number(body.longitude);
  const passcode = generatePasscode();
  const passcodeHash = hashPasscode(passcode);
  const schemaVersion = await currentSchemaVersion();
  const doctorName = typeof body.doctorName === "string" && body.doctorName.trim()
    ? body.doctorName.trim()
    : null;

  // Upsert. We store only an HMAC of the passcode, and stamp the schema
  // version the record was captured under. doctor_name is preserved on update
  // so the leaderboard credits whoever first registered the patient. `xmax = 0`
  // tells us whether this was a fresh insert (vs. an update of an existing id).
  const rows = await sql<(PatientRow & { inserted: boolean })[]>`
    INSERT INTO patients (id, rut, passcode_hash, schema_version, doctor_name, latitude, longitude, data)
    VALUES (${body.id}, ${body.rut}, ${passcodeHash}, ${schemaVersion}, ${doctorName}, ${lat}, ${lng}, ${sql.json(body.data as never)})
    ON CONFLICT (id) DO UPDATE SET
      rut = EXCLUDED.rut,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      data = EXCLUDED.data,
      schema_version = EXCLUDED.schema_version,
      updated_at = NOW()
    RETURNING id, rut, latitude, longitude, data,
              created_at AS "createdAt", updated_at AS "updatedAt",
              (xmax = 0) AS inserted
  `;
  const row = rows[0];
  if (!row) return reply.code(500).send({ error: "upsert returned no row" });
  const { inserted, ...patient } = row;
  // Return the plaintext passcode exactly ONCE, when the patient is first
  // created. On later saves the doctor already has it and we no longer can
  // (only the hash is stored).
  return reply.code(200).send(inserted ? { ...patient, passcode } : patient);
});

app.get("/api/v1/patients", async () => {
  const rows = await sql<PatientRow[]>`
    SELECT id, rut, latitude, longitude, data,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM patients
    ORDER BY updated_at DESC
  `;
  return { patients: rows };
});

app.get("/api/v1/patients/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rows = await sql<PatientRow[]>`
    SELECT id, rut, latitude, longitude, data,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM patients WHERE id = ${id}
  `;
  const row = rows[0];
  if (!row) return reply.code(404).send({ error: "not found" });
  return row;
});

app.delete("/api/v1/patients/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  await sql`DELETE FROM patients WHERE id = ${id}`;
  return reply.code(204).send();
});

// -- Form schema (configurable form layout) -------------------------------

app.get("/api/v1/schema", async () => {
  const schema = await loadSchema();
  return schema;
});

app.put("/api/v1/schema", async (req, reply) => {
  const body = req.body as Partial<FormSchema> | undefined;
  if (
    !body ||
    typeof body.version !== "number" ||
    !Array.isArray(body.tabs) ||
    !Array.isArray(body.questions)
  ) {
    return reply.code(400).send({ error: "version, tabs and questions required" });
  }
  // Bump the version on every save so clients can detect they're stale.
  const next: FormSchema = {
    version: body.version + 1,
    tabs: body.tabs,
    questions: body.questions,
  };
  const stored = await storeSchema(next);
  return stored;
});

app.get("/api/v1/leaderboard", async () => {
  const rows = await sql<LeaderboardEntry[]>`
    SELECT
      COALESCE(doctor_name, '(sin asignar)') AS doctor,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last30
    FROM patients
    GROUP BY doctor_name
    ORDER BY total DESC, last30 DESC, doctor ASC
  `;
  return { entries: rows };
});

// Anonymized pins for the public map view — id + coords only, no names/RUTs.
app.get("/api/v1/map-pins", async () => {
  const rows = await sql<MapPin[]>`
    SELECT id, latitude, longitude
    FROM patients
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  return { pins: rows };
});

// Patient self-service lookup: requires RUT + passcode. Returns the full
// record. The passcode is compared against its HMAC (constant-time), and
// repeated failures are rate-limited per rut+IP since a 6-digit code is
// otherwise brute-forceable.
app.post("/api/v1/lookup", async (req, reply) => {
  const body = req.body as { rut?: string; passcode?: string } | undefined;
  if (!body?.rut || !body?.passcode) {
    return reply.code(400).send({ error: "rut and passcode are required" });
  }

  const now = Date.now();
  const rateKey = `${body.rut}:${req.ip}`;
  const decision = checkRate(rateKey, now);
  if (!decision.allowed) {
    return reply
      .code(429)
      .header("Retry-After", String(decision.retryAfterSeconds ?? 60))
      .send({ error: "demasiados intentos, intente más tarde" });
  }

  const rows = await sql<(PatientRow & { passcodeHash: string | null })[]>`
    SELECT id, rut, passcode_hash AS "passcodeHash", latitude, longitude, data,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM patients
    WHERE rut = ${body.rut}
  `;
  const row = rows[0];
  if (!row || !passcodeMatches(body.passcode, row.passcodeHash)) {
    recordFailure(rateKey, now);
    return reply.code(404).send({ error: "no match" });
  }

  clearRate(rateKey);
  const { passcodeHash: _passcodeHash, ...patient } = row;
  return patient;
});

// -- Hash anchor (existing) ------------------------------------------------

app.post("/api/v1/patient-hash", async (req, reply) => {
  const body = req.body as Partial<HashSubmission> | undefined;
  if (
    !body ||
    typeof body.patientId !== "string" ||
    typeof body.hash !== "string" ||
    typeof body.publicKey !== "string" ||
    typeof body.signature !== "string" ||
    typeof body.timestamp !== "number"
  ) {
    return reply.code(400).send({ error: "missing or invalid fields" });
  }

  const now = Date.now();
  if (Math.abs(now - body.timestamp) > MAX_SKEW_MS) {
    return reply.code(400).send({ error: "timestamp out of range" });
  }

  const valid = verifySignature({
    patientId: body.patientId,
    hash: body.hash,
    timestamp: body.timestamp,
    publicKey: body.publicKey,
    signature: body.signature,
  });
  if (!valid) return reply.code(401).send({ error: "invalid signature" });

  // Look up the patient's RUT so the adapter can use SHA-256(rut) as the
  // on-chain key. Reject if the patient hasn't been created yet — the iOS
  // client always saves the patient before anchoring.
  const patientRows = await sql<{ rut: string }[]>`
    SELECT rut FROM patients WHERE id = ${body.patientId}
  `;
  const patientRow = patientRows[0];
  if (!patientRow) {
    return reply.code(404).send({ error: "patient not found; save first" });
  }

  const ctx: AnchorContext = {
    patientId: body.patientId,
    rut: patientRow.rut,
    hash: body.hash,
    publicKey: body.publicKey,
    signature: body.signature,
    timestamp: body.timestamp,
  };

  let txId: string | null = null;
  try {
    txId = await adapter.submit(ctx);
  } catch (err) {
    app.log.error({ err }, "chain submit failed");
    return reply.code(502).send({ error: "chain submit failed" });
  }

  await sql`
    INSERT INTO anchored_hashes (
      patient_id, hash, public_key, signature, client_timestamp, chain_tx_id, chain_name
    ) VALUES (
      ${body.patientId}, ${body.hash}, ${body.publicKey}, ${body.signature},
      ${body.timestamp}, ${txId}, ${adapter.name}
    )
  `;

  return reply.code(201).send({ ok: true, txId, chain: adapter.name });
});

app.get("/api/v1/patient-hash/:patientId", async (req) => {
  const { patientId } = req.params as { patientId: string };
  const rows = await sql`
    SELECT id, patient_id AS "patientId", hash, public_key AS "publicKey",
           signature, client_timestamp AS "clientTimestamp",
           received_at AS "receivedAt", chain_tx_id AS "chainTxId",
           chain_name AS "chainName"
    FROM anchored_hashes
    WHERE patient_id = ${patientId}
    ORDER BY received_at ASC
  `;
  return { patientId, records: rows };
});

// -- On-chain verification -------------------------------------------------
//
// Closes the anchor loop: reads anchors.lookup(SHA-256(rut)) back from chain
// and reports whether it matches (a) the hash we recorded when anchoring
// [chainMatch — proves the chain faithfully stored our submission] and
// (b) the hash of the patient record as it stands right now [recordMatch —
// proves the stored record has not been altered since it was anchored].
//
// The iOS client does the same recordMatch check locally with its own
// canonical encoder, so the doctor's device verifies independently of the
// backend's canonicalization.
app.get("/api/v1/verify/:rut", async (req, reply) => {
  const { rut } = req.params as { rut: string };
  if (!RUT_PATTERN.test(rut)) {
    return reply.code(400).send({ error: "invalid rut" });
  }

  const keyHex = createHash("sha256").update(rut, "utf8").digest("hex");

  const patientRows = await sql<PatientRow[]>`
    SELECT id, rut, data FROM patients WHERE rut = ${rut}
  `;
  const patient = patientRows[0];
  if (!patient) return reply.code(404).send({ error: "patient not found" });

  // Latest anchor we recorded for this patient (what iOS computed + submitted).
  const anchorRows = await sql<
    { hash: string; chainTxId: string | null; chainName: string; receivedAt: string }[]
  >`
    SELECT hash, chain_tx_id AS "chainTxId", chain_name AS "chainName",
           received_at AS "receivedAt"
    FROM anchored_hashes
    WHERE patient_id = ${patient.id}
    ORDER BY received_at DESC
    LIMIT 1
  `;
  const anchoredHash = anchorRows[0]?.hash ?? null;

  // Recompute the hash of the current record (must match what iOS computed).
  let localHash: string | null = null;
  try {
    localHash = hashPatientData(patient.data);
  } catch (err) {
    app.log.error({ err }, "canonical hash failed");
  }

  // Read the value currently on chain.
  let onChainHash: string | null = null;
  let found = false;
  let readError: string | null = null;
  try {
    const result = await adapter.read(keyHex);
    found = result.found;
    onChainHash = result.valueHex;
  } catch (err) {
    readError = err instanceof Error ? err.message : String(err);
    app.log.error({ err }, "chain read failed");
  }

  return {
    rut,
    keyHex,
    chain: adapter.name,
    found,
    onChainHash,
    anchoredHash,
    localHash,
    // chain faithfully stored the hash we submitted
    chainMatch: found && anchoredHash != null && onChainHash === anchoredHash,
    // the current record still matches what's anchored on chain
    recordMatch: found && localHash != null && onChainHash === localHash,
    chainTxId: anchorRows[0]?.chainTxId ?? null,
    chainName: anchorRows[0]?.chainName ?? null,
    anchoredAt: anchorRows[0]?.receivedAt ?? null,
    readError,
  };
});

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `IPP backend listening on http://${HOST}:${PORT} (chain=${adapter.name}, storage=neon)`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
