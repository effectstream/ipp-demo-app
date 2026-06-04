// One-time migration: rewrites every patient's `data` JSONB from the legacy
// nested shape ({ personal, antecedentes, ginecologia, pisoPelvico }) into
// the flat shape used by the dynamic form: { responses: { questionId: value } }.
//
// Idempotent — rows that already have `responses` are left alone.
//
// Run with:
//   cd backend
//   bun run scripts/migrate-patients-flat.ts

import { sql } from "../src/db.ts";

interface AnyJSON {
  [k: string]: unknown;
}

interface AddressValue {
  text: string;
  latitud: number | null;
  longitud: number | null;
}

function migrate(data: AnyJSON): AnyJSON | null {
  if (data == null || typeof data !== "object") return null;
  // Already migrated
  if ("responses" in data && data.responses && typeof data.responses === "object") {
    return null;
  }
  const personal = (data.personal as AnyJSON | undefined) ?? {};
  const antecedentes = (data.antecedentes as AnyJSON | undefined) ?? {};
  const ginecologia = (data.ginecologia as AnyJSON | undefined) ?? {};
  const pisoPelvico = (data.pisoPelvico as AnyJSON | undefined) ?? {};

  // If none of the legacy sections are present, nothing to migrate.
  if (
    Object.keys(personal).length === 0 &&
    Object.keys(antecedentes).length === 0 &&
    Object.keys(ginecologia).length === 0 &&
    Object.keys(pisoPelvico).length === 0
  ) {
    return null;
  }

  const responses: AnyJSON = {};

  // Personal
  if (personal.nombre !== undefined) responses.nombre = personal.nombre;
  if (personal.rut !== undefined) responses.rut = personal.rut;
  if (personal.edad !== undefined) responses.edad = personal.edad;
  if (
    personal.direccion !== undefined ||
    personal.latitud !== undefined ||
    personal.longitud !== undefined
  ) {
    const addr: AddressValue = {
      text: (personal.direccion as string | undefined) ?? "",
      latitud: (personal.latitud as number | undefined) ?? null,
      longitud: (personal.longitud as number | undefined) ?? null,
    };
    responses.direccion = addr;
  }

  // Antecedentes
  if (antecedentes.cirugias !== undefined) responses.cirugias = antecedentes.cirugias;
  if (antecedentes.enfermedadesCronicas !== undefined) responses.enfermedadesCronicas = antecedentes.enfermedadesCronicas;
  if (antecedentes.medicamentos !== undefined) responses.medicamentos = antecedentes.medicamentos;
  if (antecedentes.fuma !== undefined) responses.fuma = antecedentes.fuma;
  if (antecedentes.cigarrosPorDia !== undefined && antecedentes.cigarrosPorDia !== null) {
    responses.cigarrosPorDia = antecedentes.cigarrosPorDia;
  }

  // Ginecología
  if (ginecologia.numeroHijos !== undefined && ginecologia.numeroHijos !== null) {
    responses.numeroHijos = ginecologia.numeroHijos;
  }
  if (ginecologia.usaAnticonceptivos !== undefined) responses.usaAnticonceptivos = ginecologia.usaAnticonceptivos;
  if (ginecologia.tipoAnticonceptivo !== undefined && ginecologia.tipoAnticonceptivo !== "") {
    responses.tipoAnticonceptivo = ginecologia.tipoAnticonceptivo;
  }

  // Piso pélvico
  if (pisoPelvico.escapeDeOrina !== undefined) responses.escapeDeOrina = pisoPelvico.escapeDeOrina;
  if (pisoPelvico.frecuenciaEscape !== undefined && pisoPelvico.frecuenciaEscape !== "") {
    responses.frecuenciaEscape = pisoPelvico.frecuenciaEscape;
  }
  if (pisoPelvico.dolorPelvico !== undefined) responses.dolorPelvico = pisoPelvico.dolorPelvico;
  if (pisoPelvico.prolapsoConocido !== undefined) responses.prolapsoConocido = pisoPelvico.prolapsoConocido;

  return {
    id: data.id,
    responses,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

const rows = await sql<{ id: string; data: AnyJSON }[]>`
  SELECT id, data FROM patients
`;

let migrated = 0;
let skipped = 0;
for (const row of rows) {
  const next = migrate(row.data);
  if (!next) {
    skipped++;
    continue;
  }
  await sql`UPDATE patients SET data = ${sql.json(next as never)} WHERE id = ${row.id}`;
  migrated++;
}

console.log(`migrated=${migrated} skipped=${skipped} total=${rows.length}`);
await sql.end();
