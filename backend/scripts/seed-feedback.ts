// Seeds realistic doctor feedback so the Feedback tab has content to show.
// The notes reflect how the intended users actually talk: clinicians who
// contribute data daily, want to catalog patients faster, and run population
// studies on the captured records. A few are anonymous.
//
// Idempotent: skips if the table already has rows (set FORCE=1 to reseed).
//
//   cd backend
//   bun run scripts/seed-feedback.ts

import { sql } from "../src/db.ts";

const BASE = new Date("2026-06-12T15:00:00Z"); // pinned for deterministic dates
function daysAgo(n: number): Date {
  return new Date(BASE.getTime() - n * 86_400_000);
}

interface Seed {
  sender: string | null; // null ⇒ anonymous
  message: string;
  daysAgo: number;
}

const ENTRIES: Seed[] = [
  { sender: "Dra. Vega", daysAgo: 142,
    message: "Sería de gran ayuda exportar las fichas filtradas (por ejemplo, todas las pacientes con incontinencia de esfuerzo) a CSV para analizarlas fuera de la plataforma." },
  { sender: "Dr. Soto", daysAgo: 131,
    message: "El filtro por IMC y tabaquismo en el mapa me sirvió para ubicar zonas de mayor riesgo. ¿Podrían permitir combinarlo con un rango de edad?" },
  { sender: null, daysAgo: 119,
    message: "Catalogar a cada paciente por estadio POP-Q toma demasiado tiempo. Un selector rápido al cerrar la consulta ayudaría mucho." },
  { sender: "Dra. Pérez", daysAgo: 110,
    message: "Me gustaría marcar pacientes para seguimiento y recibir un aviso cuando toque repetir el PAP." },
  { sender: "Dr. Ramírez", daysAgo: 98,
    message: "Propongo un tablero con la distribución de resultados de mamografía (BI-RADS) por comuna para los informes mensuales al servicio de salud." },
  { sender: null, daysAgo: 90,
    message: "Aporto datos a diario; estaría bueno que el leaderboard refleje calidad del registro, no solo cantidad." },
  { sender: "Dra. Vega", daysAgo: 76,
    message: "Necesitamos un campo estandarizado para el método anticonceptivo; hoy lo escribo en texto libre y se pierde en los filtros." },
  { sender: "Dr. Soto", daysAgo: 67,
    message: "Excelente que el hash quede anclado en Cardano: por primera vez puedo demostrarle a una auditoría que la ficha no fue editada." },
  { sender: null, daysAgo: 58,
    message: "Sugiero registrar el PISQ-12 y el PFDI-20 como puntaje numérico para poder graficar tendencias por paciente." },
  { sender: "Dr. Ramírez", daysAgo: 44,
    message: "El mapa de densidad es muy útil para planificar operativos de pesquisa en terreno. Faltaría dibujar una zona y ver el conteo de pacientes dentro." },
  { sender: null, daysAgo: 33,
    message: "Para estudios de piso pélvico sería ideal cruzar paridad (partos vaginales) con severidad de la incontinencia en una sola vista." },
  { sender: "Dra. Pérez", daysAgo: 25,
    message: "¿Se puede agregar un filtro por previsión (FONASA / Isapre) para medir brechas de acceso entre las pacientes?" },
  { sender: "Dra. Vega", daysAgo: 14,
    message: "Gracias por la verificación en cadena; la uso para validar la ficha antes de derivar a especialista." },
  { sender: null, daysAgo: 6,
    message: "Un modo offline para registrar en consultorios rurales sin buena señal nos cambiaría el día a día." },
  { sender: "Dra. Pérez", daysAgo: 2,
    message: "Quiero contribuir con un set de datos anonimizado para una investigación sobre menopausia. ¿Hay forma de exportar agregados sin datos identificatorios?" },
];

const existing = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM feedback`;
if ((existing[0]?.n ?? 0) > 0 && !process.env.FORCE) {
  console.log(`feedback already has ${existing[0]!.n} row(s); skipping (set FORCE=1 to reseed).`);
  await sql.end();
  process.exit(0);
}
if (process.env.FORCE) await sql`TRUNCATE feedback`;

for (const e of ENTRIES) {
  await sql`
    INSERT INTO feedback (sender, anonymous, message, created_at)
    VALUES (${e.sender}, ${e.sender === null}, ${e.message}, ${daysAgo(e.daysAgo)})
  `;
}

const named = ENTRIES.filter((e) => e.sender !== null).length;
console.log(`Seeded ${ENTRIES.length} feedback entries (${named} named, ${ENTRIES.length - named} anonymous).`);
await sql.end();
