import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHash, randomUUID } from "node:crypto";
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
import { verifySignature } from "./verify.ts";
import { hashPatientData } from "./canonical.ts";
import { merkleRoot, merkleProof } from "./merkle.ts";
import { checkRate, recordFailure, clearRate } from "./ratelimit.ts";
import { requireDoctor, isRegisteredKey } from "./auth.ts";
import type {
  AnchorContext,
  ChainAdapter,
  FormSchema,
  HashSubmission,
  LeaderboardEntry,
  PatientUpsertRequest,
  PatientRow,
  MapPin,
  MapStatPin,
  FeedbackEntry,
} from "./types.ts";

const PORT = Number(process.env.PORT ?? 3334);
const HOST = process.env.HOST ?? "0.0.0.0";
const CHAIN = process.env.CHAIN ?? "local";
const MAX_SKEW_MS = 5 * 60 * 1000;
const RUT_PATTERN = /^[0-9kK.\-]{5,15}$/;

async function pickAdapter(name: string): Promise<ChainAdapter> {
  switch (name) {
    case "cardano": {
      // Lazy import so Lucid's WASM only loads when Cardano is selected.
      const { CardanoAdapter } = await import("./adapters/cardano.ts");
      return new CardanoAdapter();
    }
    case "local":
    default:
      return new LocalAdapter();
  }
}

await initSchema();
const adapter = await pickAdapter(CHAIN);
const app = Fastify({ logger: true });
// Permissive CORS for development. The web frontend lives at a different
// origin (Vite dev server on :5173). Tighten before deploying to prod.
await app.register(cors, { origin: true });

// Capture the raw JSON body (as a string) so the signed-request auth can hash
// the exact bytes the client signed, while still exposing parsed `req.body` to
// handlers. Replaces Fastify's default application/json parser.
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    req.rawBody = body as string;
    if (!body) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

app.get("/health", async () => ({
  status: "ok",
  chain: adapter.name,
  storage: "postgres",
}));

// -- Patient CRUD ----------------------------------------------------------

app.post("/api/v1/patients", { preHandler: requireDoctor }, async (req, reply) => {
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
  // doctor_name is the authenticated identity, not a client-supplied string.
  const doctorName = req.doctor?.username
    ?? (typeof body.doctorName === "string" && body.doctorName.trim() ? body.doctorName.trim() : null);

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

app.get("/api/v1/patients", { preHandler: requireDoctor }, async () => {
  const rows = await sql<PatientRow[]>`
    SELECT id, rut, latitude, longitude, data,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM patients
    ORDER BY updated_at DESC
  `;
  return { patients: rows };
});

app.get("/api/v1/patients/:id", { preHandler: requireDoctor }, async (req, reply) => {
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

app.delete("/api/v1/patients/:id", { preHandler: requireDoctor }, async (req, reply) => {
  const { id } = req.params as { id: string };
  await sql`DELETE FROM patients WHERE id = ${id}`;
  return reply.code(204).send();
});

// -- Form schema (configurable form layout) -------------------------------

app.get("/api/v1/schema", async () => {
  const schema = await loadSchema();
  return schema;
});

app.put("/api/v1/schema", { preHandler: requireDoctor }, async (req, reply) => {
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

// -- Feedback --------------------------------------------------------------
//
// Doctors leave free-text notes (feature requests, data-quality observations,
// study ideas). Doctor-scope: the sender is taken from the authenticated
// identity, never a client field, and is stored as NULL when the doctor opts
// to send anonymously.

app.get("/api/v1/feedback", { preHandler: requireDoctor }, async () => {
  const rows = await sql<FeedbackEntry[]>`
    SELECT id, sender, anonymous, message, created_at AS "createdAt"
    FROM feedback
    ORDER BY created_at DESC
  `;
  return { feedback: rows };
});

app.post("/api/v1/feedback", { preHandler: requireDoctor }, async (req, reply) => {
  const body = req.body as { message?: string; anonymous?: boolean } | undefined;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return reply.code(400).send({ error: "message is required" });
  if (message.length > 4000) return reply.code(400).send({ error: "message too long" });

  const anonymous = body?.anonymous === true;
  const sender = anonymous ? null : (req.doctor?.username ?? null);

  const rows = await sql<FeedbackEntry[]>`
    INSERT INTO feedback (sender, anonymous, message)
    VALUES (${sender}, ${anonymous}, ${message})
    RETURNING id, sender, anonymous, message, created_at AS "createdAt"
  `;
  return reply.code(201).send(rows[0]);
});

// Gamified ranking: 1000 pts per patient, 20 per filled response field, 10 per
// logged search. Patient/field counts come from the patients table; searches
// from doctor_events.
app.get("/api/v1/leaderboard", async () => {
  const rows = await sql<LeaderboardEntry[]>`
    WITH pts AS (
      SELECT
        COALESCE(doctor_name, '(sin asignar)') AS doctor,
        COUNT(*)::int AS patients,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last30,
        COALESCE(SUM((
          SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(data->'responses', '{}'::jsonb))
        )), 0)::int AS fields
      FROM patients
      GROUP BY COALESCE(doctor_name, '(sin asignar)')
    ),
    ev AS (
      SELECT doctor, COUNT(*)::int AS searches
      FROM doctor_events
      WHERE type = 'search'
      GROUP BY doctor
    )
    SELECT
      pts.doctor,
      pts.patients AS total,
      pts.last30,
      pts.fields,
      COALESCE(ev.searches, 0)::int AS searches,
      (pts.patients * 1000 + pts.fields * 20 + COALESCE(ev.searches, 0) * 10)::int AS points
    FROM pts
    LEFT JOIN ev ON ev.doctor = pts.doctor
    ORDER BY points DESC, total DESC, pts.doctor ASC
  `;
  return { entries: rows };
});

// Log a point-scoring action (currently only "search"). Doctor-scope:
// attributed to the authenticated username.
app.post("/api/v1/events", { preHandler: requireDoctor }, async (req, reply) => {
  const body = req.body as { type?: string } | undefined;
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (type !== "search") {
    return reply.code(400).send({ error: "unknown event type" });
  }
  const doctor = req.doctor?.username;
  if (!doctor) return reply.code(401).send({ error: "no doctor" });
  await sql`INSERT INTO doctor_events (doctor, type) VALUES (${doctor}, ${type})`;
  return reply.code(201).send({ ok: true });
});

// Anonymized pins for the public map view - id + coords + a non-identifying
// anchorKey (SHA-256(rut)) so the map can look up each pin's on-chain anchor.
app.get("/api/v1/map-pins", async () => {
  const rows = await sql<{ id: string; latitude: number; longitude: number; rut: string }[]>`
    SELECT id, latitude, longitude, rut
    FROM patients
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  const pins: MapPin[] = rows.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    anchorKey: createHash("sha256").update(r.rut, "utf8").digest("hex"),
  }));
  return { pins };
});

// On-chain anchor lookup by key (SHA-256(rut) or study key). Used by the map's
// "Verificar en cadena" popup; reads through the active chain adapter (for
// CHAIN=cardano this hits the synced ipp_anchors table).
app.get("/api/v1/onchain/:key", async (req, reply) => {
  const { key } = req.params as { key: string };
  if (!/^[0-9a-f]{64}$/.test(key)) {
    return reply.code(400).send({ error: "invalid key" });
  }
  try {
    const result = await adapter.read(key);
    return { chain: adapter.name, found: result.found, valueHex: result.valueHex };
  } catch (err) {
    return {
      chain: adapter.name,
      found: false,
      valueHex: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// Question types that make sense as map filters for population studies.
const STAT_FILTER_TYPES = new Set(["boolean", "number", "picker", "multiselect"]);
// Excluded from the map even when their type is filterable: these identify the
// patient (or are administrative) rather than describing a population stat.
const NON_STAT_IDS = new Set([
  "nombres", "apellidoPaterno", "apellidoMaterno", "rut", "telefono",
  "email", "nombreIsapre", "ocupacion", "comuna", "consentimientoDatos",
]);

// Whether a question is offered as a map filter. An explicit `filterable` flag
// (set per-question in the schema editor) wins; otherwise we fall back to a
// type-based default so existing schemas get sensible medical-stat filters.
function isFilterableQuestion(q: {
  type: string; id: string; hidden?: boolean; filterable?: boolean;
}): boolean {
  if (typeof q.filterable === "boolean") return q.filterable;
  return !q.hidden && STAT_FILTER_TYPES.has(q.type) && !NON_STAT_IDS.has(q.id);
}

// Whole years between a YYYY-MM-DD birth date and today, or null if unparseable.
function ageFromDob(dob: string): number | null {
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  const birth = new Date(t);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// Anonymized pins enriched with non-identifying medical stats, for the map's
// population-study filters. Doctor-only: medical attributes are not public.
// The exposed fields are derived from the live form schema (filterable types
// only) and an explicit identifier denylist, so only population stats - and a
// derived `edad` (the birth date itself never leaves) - reach the client.
app.get("/api/v1/map-stats", { preHandler: requireDoctor }, async () => {
  const schema = await loadSchema();
  const statIds = schema.questions
    .filter(isFilterableQuestion)
    .map((q) => q.id);

  const rows = await sql<
    { id: string; latitude: number; longitude: number; rut: string; data: Record<string, unknown> }[]
  >`
    SELECT id, latitude, longitude, rut, data
    FROM patients
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;

  const pins: MapStatPin[] = rows.map((r) => {
    const responses = ((r.data as { responses?: Record<string, unknown> })?.responses ?? {});
    const stats: Record<string, unknown> = {};
    for (const id of statIds) {
      const v = responses[id];
      if (v !== undefined && v !== null && v !== "") stats[id] = v;
    }
    const dob = responses["fechaNacimiento"];
    if (typeof dob === "string") {
      const age = ageFromDob(dob);
      if (age != null) stats["edad"] = age;
    }
    return {
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      anchorKey: createHash("sha256").update(r.rut, "utf8").digest("hex"),
      stats,
    };
  });

  return { pins };
});

// Great-circle distance in km between two lat/lng points.
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Curated reference ("Mundo") baselines - only fields with a sensible global
// value get a world comparison. Illustrative figures for the demo.
const WORLD_BASELINES: Record<string, { type: string; mean?: number; pctTrue?: number }> = {
  edad: { type: "number", mean: 41 },
  peso: { type: "number", mean: 70 },
  talla: { type: "number", mean: 161 },
  imc: { type: "number", mean: 26.5 },
  fuma: { type: "boolean", pctTrue: 0.22 },
  pierdeOrina: { type: "boolean", pctTrue: 0.30 },
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

// Aggregate a set of values for one field according to its type.
function aggregateField(type: string, values: unknown[]): Record<string, unknown> | null {
  if (type === "number") {
    const nums = (values.filter((v) => typeof v === "number") as number[]).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const at = (p: number) => nums[Math.min(nums.length - 1, Math.floor(p * nums.length))];
    return {
      type, n: nums.length,
      mean: round1(nums.reduce((s, x) => s + x, 0) / nums.length),
      p25: at(0.25), p50: at(0.5), p75: at(0.75),
    };
  }
  if (type === "boolean") {
    const bools = values.filter((v) => typeof v === "boolean") as boolean[];
    if (bools.length === 0) return null;
    return { type, n: bools.length, pctTrue: round2(bools.filter(Boolean).length / bools.length) };
  }
  if (type === "picker" || type === "multiselect") {
    const freq: Record<string, number> = {};
    let denom = 0;
    for (const v of values) {
      if (type === "picker" && typeof v === "string" && v !== "") {
        freq[v] = (freq[v] ?? 0) + 1; denom++;
      } else if (type === "multiselect" && Array.isArray(v)) {
        denom++;
        for (const x of v) if (typeof x === "string") freq[x] = (freq[x] ?? 0) + 1;
      }
    }
    if (denom === 0) return null;
    for (const k of Object.keys(freq)) freq[k] = round2((freq[k] ?? 0) / denom);
    return { type, n: denom, freq };
  }
  return null;
}

// Per-field aggregates for the patient form's discreet comparison: the local
// area (within radiusKm of the supplied coords), the country (all rows), and a
// curated world reference. Doctor-scope.
app.get("/api/v1/field-stats", { preHandler: requireDoctor }, async (req) => {
  const { lat, lng, radiusKm } = req.query as { lat?: string; lng?: string; radiusKm?: string };
  const cLat = lat != null ? Number(lat) : NaN;
  const cLng = lng != null ? Number(lng) : NaN;
  const radius = radiusKm != null ? Number(radiusKm) : 10;
  const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng);

  const schema = await loadSchema();
  const statQs = schema.questions.filter(isFilterableQuestion);

  const rows = await sql<{ latitude: number; longitude: number; data: Record<string, unknown> }[]>`
    SELECT latitude, longitude, data
    FROM patients
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  const recs = rows.map((r) => {
    const responses = ((r.data as { responses?: Record<string, unknown> })?.responses ?? {}) as Record<string, unknown>;
    const dob = responses["fechaNacimiento"];
    if (typeof dob === "string") {
      const age = ageFromDob(dob);
      if (age != null) responses["edad"] = age;
    }
    return { lat: r.latitude, lng: r.longitude, responses };
  });

  function scope(subset: typeof recs) {
    const fields: Record<string, unknown> = {};
    for (const q of statQs) {
      const vals = subset.map((r) => r.responses[q.id]).filter((v) => v !== undefined && v !== null && v !== "");
      const agg = aggregateField(q.type, vals);
      if (agg) fields[q.id] = agg;
    }
    const edad = aggregateField("number", subset.map((r) => r.responses["edad"]).filter((v) => v != null));
    if (edad) fields["edad"] = edad;
    return { n: subset.length, fields };
  }

  const localRecs = hasCenter ? recs.filter((r) => haversineKm(cLat, cLng, r.lat, r.lng) <= radius) : [];

  return {
    radiusKm: radius,
    local: localRecs.length ? scope(localRecs) : null,
    country: scope(recs),
    world: { fields: WORLD_BASELINES },
  };
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

  // The signing key must belong to a registered doctor. In the normal flow the
  // doctor has already saved the patient (POST /patients, which registers the
  // key on first use) before anchoring, so this is satisfied.
  if (!(await isRegisteredKey(body.publicKey))) {
    return reply.code(401).send({ error: "unregistered key" });
  }

  // Look up the patient's RUT so the adapter can use SHA-256(rut) as the
  // on-chain key. Reject if the patient hasn't been created yet - the iOS
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
// [chainMatch - proves the chain faithfully stored our submission] and
// (b) the hash of the patient record as it stands right now [recordMatch -
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

// -- Study anchoring (Cardano) --------------------------------------------
//
// Publish a study: snapshot every patient's current record hash, build a Merkle
// root over that set, and anchor ONLY the 32-byte root on chain (via the same
// anchor ledger, keyed by a synthetic "study:<id>" rut). The records never go
// on chain; a third party validates a study's dataset by recomputing the root
// and checking it against the on-chain value. Matches Cardano's CIP-100 anchor
// convention (a rootHash on chain attesting off-chain data).

app.post("/api/v1/studies", { preHandler: requireDoctor }, async (req, reply) => {
  const body = req.body as
    | {
        title?: string;
        memberIds?: unknown;
        exportHash?: string;
        filter?: { description?: string; json?: unknown };
      }
    | undefined;
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;
  // SHA-256 hex of the exported data file this study certifies (optional).
  const exportHash =
    typeof body?.exportHash === "string" && /^[0-9a-f]{64}$/i.test(body.exportHash)
      ? body.exportHash.toLowerCase()
      : null;
  const filterDescription =
    typeof body?.filter?.description === "string" && body.filter.description.trim()
      ? body.filter.description.trim()
      : null;
  const filterJson = body?.filter?.json ?? null;

  // Cohort selection: an explicit member-id list (the filtered cohort the doctor
  // exported) or, when omitted, all patients (back-compat).
  const memberIds = Array.isArray(body?.memberIds)
    ? (body!.memberIds as unknown[]).filter((x): x is string => typeof x === "string")
    : null;

  const rows =
    memberIds && memberIds.length > 0
      ? await sql<{ id: string; rut: string; data: Record<string, unknown> }[]>`
          SELECT id, rut, data FROM patients WHERE id = ANY(${memberIds}) ORDER BY rut
        `
      : await sql<{ id: string; rut: string; data: Record<string, unknown> }[]>`
          SELECT id, rut, data FROM patients ORDER BY rut
        `;
  if (rows.length === 0) {
    return reply.code(400).send({ error: "cohort is empty" });
  }

  const members = rows.map((r) => ({ id: r.id, rut: r.rut, hash: hashPatientData(r.data) }));
  const root = merkleRoot(members.map((m) => m.hash));
  // Bind the exact exported file to the cohort in ONE on-chain value:
  // anchoredValue = sha256(rootHex ++ exportHashHex). Clients/CLI recompute the
  // same way. With no export hash, the anchored value is just the cohort root.
  const anchoredValue = exportHash
    ? createHash("sha256").update(`${root}${exportHash}`, "utf8").digest("hex")
    : root;

  const id = randomUUID();
  const chainKey = createHash("sha256").update(`study:${id}`, "utf8").digest("hex");

  let txId: string | null = null;
  try {
    txId = await adapter.submit({
      patientId: id,
      rut: `study:${id}`,
      hash: anchoredValue,
      publicKey: "",
      signature: "",
      timestamp: Date.now(),
    });
  } catch (err) {
    app.log.error({ err }, "study anchor failed");
    return reply.code(502).send({ error: "chain submit failed" });
  }

  await sql`
    INSERT INTO studies
      (id, title, root, members, member_count, chain_key, chain_tx_id, chain_name,
       filter_description, filter_json, export_hash, anchored_value)
    VALUES
      (${id}, ${title}, ${root}, ${sql.json(members as never)}, ${members.length},
       ${chainKey}, ${txId}, ${adapter.name}, ${filterDescription},
       ${filterJson === null ? null : sql.json(filterJson as never)}, ${exportHash}, ${anchoredValue})
  `;

  return reply.code(201).send({
    verificationId: id,
    title,
    recordsRoot: root,
    exportHash,
    anchoredValue,
    memberCount: members.length,
    chainKey,
    chainTxId: txId,
    chain: adapter.name,
  });
});

// Doctor-side DRIFT check: recompute the Merkle root from the members' CURRENT
// record hashes and compare to (a) the published root and (b) the value still on
// chain. This answers "is my live dataset still the one I published?" - distinct
// from the public, trustless bundle verification (GET /studies/:id + chain read).
app.get("/api/v1/verify-study/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const studyRows = await sql<{
    title: string | null;
    root: string;
    members: { rut: string; hash: string }[];
    memberCount: number;
    chainKey: string;
    chainTxId: string | null;
    chainName: string;
    createdAt: string;
    anchoredValue: string | null;
  }[]>`
    SELECT title, root, members, member_count AS "memberCount",
           chain_key AS "chainKey", chain_tx_id AS "chainTxId",
           chain_name AS "chainName", created_at AS "createdAt",
           anchored_value AS "anchoredValue"
    FROM studies WHERE id = ${id}
  `;
  const study = studyRows[0];
  if (!study) return reply.code(404).send({ error: "study not found" });
  // The value actually anchored on chain (older rows predate the column).
  const anchoredValue = study.anchoredValue ?? study.root;

  const all = await sql<{ rut: string; data: Record<string, unknown> }[]>`
    SELECT rut, data FROM patients
  `;
  const currentByRut = new Map(all.map((p) => [p.rut, hashPatientData(p.data)]));

  const changed: string[] = [];
  const missing: string[] = [];
  for (const m of study.members) {
    const cur = currentByRut.get(m.rut);
    if (cur == null) missing.push(m.rut);
    else if (cur !== m.hash) changed.push(m.rut);
  }
  const recomputedRoot = merkleRoot(study.members.map((m) => currentByRut.get(m.rut) ?? m.hash));

  let onChainValue: string | null = null;
  let chainFound = false;
  let readError: string | null = null;
  try {
    const result = await adapter.read(study.chainKey);
    chainFound = result.found;
    onChainValue = result.valueHex;
  } catch (err) {
    readError = err instanceof Error ? err.message : String(err);
  }

  return {
    id,
    title: study.title,
    chain: study.chainName,
    chainKey: study.chainKey,
    chainTxId: study.chainTxId,
    memberCount: study.memberCount,
    storedRoot: study.root,
    recomputedRoot,
    anchoredValue,
    onChainValue,
    // No member record was edited or removed since publication.
    datasetIntact: recomputedRoot === study.root && changed.length === 0 && missing.length === 0,
    // The chain still holds the value we anchored.
    chainMatch: chainFound && onChainValue === anchoredValue,
    changed,
    missing,
    readError,
    anchoredAt: study.createdAt,
  };
});

// Doctor-scope: list the studies/exports this instance has recorded.
app.get("/api/v1/studies", { preHandler: requireDoctor }, async () => {
  const rows = await sql<{
    id: string;
    title: string | null;
    memberCount: number;
    chainTxId: string | null;
    chainName: string;
    createdAt: string;
    filterDescription: string | null;
    exportHash: string | null;
  }[]>`
    SELECT id, title, member_count AS "memberCount", chain_tx_id AS "chainTxId",
           chain_name AS "chainName", created_at AS "createdAt",
           filter_description AS "filterDescription", export_hash AS "exportHash"
    FROM studies ORDER BY created_at DESC
  `;
  return { studies: rows };
});

// Public: the hash-only proof bundle for a study/export. Carries only record
// hashes + Merkle inclusion proofs + the on-chain anchor pointer - NO PII - so
// it's safe to attach to a paper. A third party recomputes the root from the
// leaves and checks it against the value on Cardano (read by chainTxId), without
// trusting this backend. See scripts/verify-study-bundle.ts and the web verifier.
app.get("/api/v1/studies/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const rows = await sql<{
    title: string | null;
    root: string;
    members: { id?: string; rut: string; hash: string }[];
    memberCount: number;
    chainKey: string;
    chainTxId: string | null;
    chainName: string;
    createdAt: string;
    filterDescription: string | null;
    exportHash: string | null;
    anchoredValue: string | null;
  }[]>`
    SELECT title, root, members, member_count AS "memberCount",
           chain_key AS "chainKey", chain_tx_id AS "chainTxId",
           chain_name AS "chainName", created_at AS "createdAt",
           filter_description AS "filterDescription",
           export_hash AS "exportHash", anchored_value AS "anchoredValue"
    FROM studies WHERE id = ${id}
  `;
  const s = rows[0];
  if (!s) return reply.code(404).send({ error: "study not found" });

  // Hashes only (no rut/id) + an inclusion proof per record against recordsRoot.
  const hashes = s.members.map((m) => m.hash);
  const leaves = hashes.map((hash, i) => ({ index: i, hash, proof: merkleProof(hashes, hash) }));

  return {
    verificationId: id,
    title: s.title,
    createdAt: s.createdAt,
    filterDescription: s.filterDescription,
    memberCount: s.memberCount,
    recordsRoot: s.root,
    exportHash: s.exportHash,
    anchoredValue: s.anchoredValue ?? s.root,
    chain: { name: s.chainName, txId: s.chainTxId, metadataLabel: 8327, key: s.chainKey },
    leaves,
    spec: {
      hash: "sha256",
      record: "sha256(canonical JSON of the record; sorted keys; passcode excluded)",
      merkle: "sorted leaves; internal node = sha256(aHex ++ bHex); odd node paired with itself",
      anchoredValue: "exportHash ? sha256(recordsRootHex ++ exportHashHex) : recordsRoot",
    },
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
