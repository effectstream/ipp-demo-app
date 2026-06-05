// Seeds 80 patients per month for the past 12 months (960 total), backdated
// so the leaderboard's "last 30 days" filter is meaningful and the data set
// looks like a real year of intake.
//
// Writes directly to Postgres (bypasses the HTTP API) so we can set
// created_at/updated_at explicitly. Deterministic — re-running upserts by id.
//
//   cd backend
//   bun run scripts/seed-year.ts

import { randomInt, createHash } from "node:crypto";
import { sql } from "../src/db.ts";

const NOW = new Date("2026-06-04T12:00:00Z"); // pinned for deterministic dates
const PER_MONTH = Number(process.env.SEED_PER_MONTH ?? 80);
const MONTHS = Number(process.env.SEED_MONTHS ?? 12);
const TOTAL = PER_MONTH * MONTHS;

// Each city is a set of weighted neighborhood centers. Coords are
// approximate-real (per OSM); sigma is in degrees ≈ 100km/deg, so
// 0.004° ≈ 400m spread (1σ). Multiple neighborhoods + Gaussian sampling
// gives an organic, irregular-shaped cluster instead of the obvious
// uniform-in-rectangle squares we had before.
interface Neighborhood {
  name: string;
  lat: number;
  lng: number;
  sigma: number;
  weight: number;
}

interface City {
  name: string;
  neighborhoods: Neighborhood[];
}

const CITIES: City[] = [
  {
    name: "Valparaíso",
    neighborhoods: [
      { name: "El Plan",           lat: -33.0458, lng: -71.6197, sigma: 0.0035, weight: 4 },
      { name: "Cerro Concepción",  lat: -33.0392, lng: -71.6249, sigma: 0.0025, weight: 2 },
      { name: "Cerro Alegre",      lat: -33.0415, lng: -71.6286, sigma: 0.0024, weight: 2 },
      { name: "Playa Ancha",       lat: -33.0273, lng: -71.6347, sigma: 0.0055, weight: 3 },
      { name: "Barón",             lat: -33.0510, lng: -71.6033, sigma: 0.0040, weight: 2 },
      { name: "Cerro Esperanza",   lat: -33.0568, lng: -71.6170, sigma: 0.0040, weight: 2 },
    ],
  },
  {
    name: "Viña del Mar",
    neighborhoods: [
      { name: "Centro",            lat: -33.0245, lng: -71.5518, sigma: 0.0040, weight: 4 },
      { name: "Reñaca",            lat: -32.9701, lng: -71.5460, sigma: 0.0055, weight: 3 },
      { name: "Recreo",            lat: -33.0405, lng: -71.5722, sigma: 0.0040, weight: 2 },
      { name: "Forestal",          lat: -33.0173, lng: -71.5336, sigma: 0.0050, weight: 2 },
      { name: "Achupallas",        lat: -33.0212, lng: -71.5240, sigma: 0.0055, weight: 2 },
      { name: "Gómez Carreño",     lat: -32.9990, lng: -71.5392, sigma: 0.0060, weight: 2 },
    ],
  },
  {
    name: "Quilpué",
    neighborhoods: [
      { name: "Centro",            lat: -33.0472, lng: -71.4435, sigma: 0.0035, weight: 4 },
      { name: "El Belloto",        lat: -33.0420, lng: -71.4180, sigma: 0.0055, weight: 3 },
      { name: "El Sol",            lat: -33.0612, lng: -71.4395, sigma: 0.0045, weight: 2 },
      { name: "Los Pinos",         lat: -33.0517, lng: -71.4275, sigma: 0.0040, weight: 2 },
    ],
  },
  {
    name: "Villa Alemana",
    neighborhoods: [
      { name: "Centro",            lat: -33.0426, lng: -71.3729, sigma: 0.0035, weight: 4 },
      { name: "El Patagual",       lat: -33.0521, lng: -71.3655, sigma: 0.0040, weight: 2 },
      { name: "Peñablanca",        lat: -33.0387, lng: -71.3856, sigma: 0.0055, weight: 3 },
      { name: "Quebrada Escobares",lat: -33.0354, lng: -71.3585, sigma: 0.0045, weight: 2 },
    ],
  },
  {
    name: "San Antonio",
    neighborhoods: [
      { name: "Centro",            lat: -33.5928, lng: -71.6118, sigma: 0.0035, weight: 3 },
      { name: "Barrancas",         lat: -33.5773, lng: -71.6168, sigma: 0.0050, weight: 2 },
      { name: "Llolleo",           lat: -33.6125, lng: -71.6092, sigma: 0.0055, weight: 3 },
      { name: "Tejas Verdes",      lat: -33.6014, lng: -71.6175, sigma: 0.0040, weight: 2 },
      { name: "Cerro Alegre",      lat: -33.5862, lng: -71.6052, sigma: 0.0040, weight: 1 },
    ],
  },
];

const FIRST_NAMES = ["María","Carmen","Ana","Isabel","Patricia","Sofía","Camila","Valentina","Constanza","Catalina","Javiera","Antonia","Florencia","Trinidad","Macarena","Paula","Daniela","Andrea","Fernanda","Rocío","Gabriela","Francisca","Tamara","Bárbara","Karina","Karen","Loreto","Pamela","Marcela","Verónica"];
const SURNAMES = ["González","Muñoz","Rojas","Díaz","Pérez","Soto","Contreras","Silva","Martínez","Sepúlveda","Morales","Rodríguez","López","Fuentes","Hernández","Vargas","Castillo","Espinoza","Tapia","Vergara","Núñez","Riquelme","Sandoval","Bravo","Salinas","Reyes","Lagos","Ortega","Carrasco","Cerda"];
const STREETS = ["Av. Libertad","Calle Condell","Av. España","Calle Brasil","Av. Argentina","Av. Errázuriz","Calle Esmeralda","Av. Pedro Montt","Av. San Martín","Calle Yungay","Av. La Marina","Av. Borgoño"];

// Doctor distribution weighted so the leaderboard isn't flat.
const DOCTOR_WEIGHTS: Array<{ name: string; weight: number }> = [
  { name: "Dra. Vega",    weight: 35 },
  { name: "Dr. Soto",     weight: 30 },
  { name: "Dr. Ramírez",  weight: 20 },
  { name: "Dra. Pérez",   weight: 15 },
];

const CIRUGIAS = ["Cesárea","Apendicectomía","Colecistectomía","Histerectomía","Hernioplastía","Amigdalectomía","Cirugía de várices"];
const ENFERMEDADES = ["Hipertensión arterial (HTA)","Diabetes mellitus 2","Hipotiroidismo","Dislipidemia","Asma/EPOC","Depresión/ansiedad","Enfermedad renal crónica"];
const MEDICAMENTOS = ["Losartán","Metformina","Levotiroxina","Atorvastatina","Omeprazol","Sertralina","Salbutamol","Aspirina","Paracetamol"];
const ALERGIAS = ["Penicilina","AINEs","Yodo/medio de contraste","Látex","Sulfas"];
const ANTICONCEPTIVOS = ["ACO combinado","Progestágeno solo (PPS)","DIU de cobre (T-Cu)","DIU/SIU hormonal (T-LNG)","Implante subdérmico","Inyectable","Preservativo","Esterilización quirúrgica","MELA/método natural"];
const MOTIVOS_PP = ["Incontinencia de orina","Urgencia / vejiga hiperactiva","Sensación de bulto / prolapso","Incontinencia fecal o de gases","Estreñimiento","Dolor / dispareunia"];
const ICIQ_FRECUENCIA = ["Una vez a la semana (1)","2–3 veces por semana (2)","Una vez al día (3)","Varias veces al día (4)","Continuamente (5)"];
const ICIQ_CANTIDAD = ["Muy poca cantidad (2)","Una cantidad moderada (4)","Mucha cantidad (6)"];
const ICIQ_SITUACIONES = ["Al toser o estornudar","Al realizar esfuerzos físicos o ejercicio","Antes de llegar al baño","Sin motivo evidente","Mientras duerme","Al terminar de orinar y ya vestida","De forma continua"];
const WEXNER = ["Nunca (0)","Rara vez (1)","A veces (2)","Generalmente (3)","Siempre (4)"];
const ALCOHOL_FREQ = ["1 vez al mes o menos","2–4 veces al mes","2–3 veces por semana","4 o más veces por semana"];
const ALCOHOL_CANT = ["1–2","3–4","5–6","7–9","10 o más"];
const ALCOHOL_BINGE = ["Nunca","Menos de 1 vez al mes","Mensualmente","Semanalmente","A diario o casi a diario"];
const ACTIVIDAD = ["Sedentaria","1–2 veces/semana","3 o más veces/semana"];
const PREVISION_OPTS = ["FONASA","Isapre","Particular"];

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error("empty pool");
  return item;
}

function pickSome<T>(arr: T[], rng: () => number, maxCount: number): T[] {
  const n = Math.floor(rng() * (maxCount + 1));
  const copy = [...arr].sort(() => rng() - 0.5);
  return copy.slice(0, n);
}

function pickWeighted<T>(items: Array<{ value: T; weight: number }>, rng: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1]!.value;
}

// Box-Muller transform: standard-normal sample, then shift+scale.
function gaussian(mean: number, sigma: number, rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Sample a location: pick a weighted neighborhood, then sample Gaussian
// around its center. Returns lat, lng, and the neighborhood name so the
// address string can reflect it ("Av. Pedro Montt 412, Cerro Concepción,
// Valparaíso, Chile").
function locationForCity(city: City, rng: () => number): {
  lat: number;
  lng: number;
  neighborhood: string;
} {
  const total = city.neighborhoods.reduce((s, n) => s + n.weight, 0);
  let r = rng() * total;
  let chosen = city.neighborhoods[0]!;
  for (const n of city.neighborhoods) {
    r -= n.weight;
    if (r <= 0) { chosen = n; break; }
  }
  return {
    lat: gaussian(chosen.lat, chosen.sigma, rng),
    lng: gaussian(chosen.lng, chosen.sigma, rng),
    neighborhood: chosen.name,
  };
}

function fakeRut(rng: () => number): string {
  const digits = (Math.floor(rng() * 90_000_000) + 10_000_000).toString();
  const check = Math.floor(rng() * 10).toString();
  return `${digits}-${check}`;
}

function uuidFromString(s: string): string {
  const h = createHash("sha1").update(s).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    "a" + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

function generatePasscode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Birth date string derived from age and the seeded rng — pinned to NOW.
function birthDateForAge(age: number, rng: () => number): string {
  const dayJitter = Math.floor(rng() * 365);
  const d = new Date(NOW.getTime() - (age * 365.25 + dayJitter) * 86400_000);
  return d.toISOString().slice(0, 10);
}

function recentDateISO(maxDaysAgo: number, anchor: Date, rng: () => number): string {
  const d = new Date(anchor.getTime() - Math.floor(rng() * maxDaysAgo) * 86400_000);
  return d.toISOString().slice(0, 10);
}

// Random timestamp inside the calendar month offset N months before NOW.
function createdAtForMonth(monthOffset: number, rng: () => number): Date {
  const target = new Date(Date.UTC(
    NOW.getUTCFullYear(),
    NOW.getUTCMonth() - monthOffset,
    1, 8, 0, 0
  ));
  const daysInMonth = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0
  )).getUTCDate();
  // If we're in the current month, cap the day at NOW's day so we never
  // place a record in the future.
  const maxDay = monthOffset === 0 ? NOW.getUTCDate() : daysInMonth;
  const day = 1 + Math.floor(rng() * maxDay);
  const hour = 8 + Math.floor(rng() * 10);   // 8h–17h
  const minute = Math.floor(rng() * 60);
  return new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    day,
    hour,
    minute
  ));
}

function buildPatient(index: number) {
  const rng = mulberry32(index * 7919);
  const city = pick(CITIES, rng);
  const { lat, lng, neighborhood } = locationForCity(city, rng);
  const nombre = pick(FIRST_NAMES, rng);
  const paterno = pick(SURNAMES, rng);
  const materno = pick(SURNAMES, rng);
  const rut = fakeRut(rng);
  const id = uuidFromString(`ipp-seed-year-v2:${index}:${nombre}:${rut}`);
  const doctor = pickWeighted(
    DOCTOR_WEIGHTS.map(d => ({ value: d.name, weight: d.weight })),
    rng,
  );
  const street = pick(STREETS, rng);
  const direccionText = `${street} ${100 + Math.floor(rng() * 900)}, ${neighborhood}, ${city.name}, Chile`;
  const edad = 25 + Math.floor(rng() * 45);
  const fechaNacimiento = birthDateForAge(edad, rng);
  const peso = Math.round((52 + rng() * 38) * 10) / 10;
  const talla = Math.round(150 + rng() * 25);
  const imc = Math.round((peso / Math.pow(talla / 100, 2)) * 10) / 10;
  const prevision = pick(PREVISION_OPTS, rng);
  const fuma = rng() < 0.28;
  const consumeAlcohol = rng() < 0.65;
  const partos = Math.floor(rng() * 3);
  const cesareas = Math.floor(rng() * 2);
  const abortos = rng() < 0.2 ? 1 : 0;
  const usaAnti = rng() < 0.5;
  const pierdeOrina = rng() < 0.45;
  const urgencia = rng() < 0.35;
  const sensacionBulto = rng() < 0.18;
  const incontinenciaFecal = rng() < 0.12;
  const estrenimiento = rng() < 0.22;
  const dispareunia = rng() < 0.15;

  // Distribute monthly: indices 1..80 → month 0 (current), 81..160 → month 1, etc.
  const monthOffset = Math.floor((index - 1) / PER_MONTH);
  const createdAt = createdAtForMonth(monthOffset, rng);

  const responses: Record<string, unknown> = {
    nombres: nombre,
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    rut,
    fechaNacimiento,
    telefono: `+56 9 ${(Math.floor(rng() * 89_999_999) + 10_000_000).toString()}`,
    direccion: { text: direccionText, latitud: lat, longitud: lng },
    prevision,
    consentimientoDatos: true,
    peso,
    talla,
    imc,
    enfermedadesCronicas: pickSome(ENFERMEDADES, rng, 2),
    cirugiasPrevias: pickSome(CIRUGIAS, rng, 2),
    medicamentos: pickSome(MEDICAMENTOS, rng, 3),
    alergias: pickSome(ALERGIAS, rng, 1),
    fuma,
    alcoholFrecuencia: consumeAlcohol ? pick(ALCOHOL_FREQ, rng) : "Nunca",
    actividadFisica: pick(ACTIVIDAD, rng),
    menarquia: 10 + Math.floor(rng() * 5),
    fur: recentDateISO(60, createdAt, rng),
    cicloMenstrual: edad < 50 ? `${3 + Math.floor(rng() * 4)}/${26 + Math.floor(rng() * 6)}` : "",
    estadoMenopausico: edad < 45 ? "Premenopausia" : edad < 55 ? "Perimenopausia" : "Postmenopausia",
    gestas: partos + cesareas + abortos,
    partosVaginales: partos,
    cesareas,
    abortos,
    metodoAnticonceptivo: usaAnti
      ? pickSome(ANTICONCEPTIVOS, rng, 1)
      : ["Ninguno"],
    fechaPap: recentDateISO(900, createdAt, rng),
    resultadoPap: pick(["Normal","Normal","Normal","ASCUS","Lesión de bajo grado (NIE I)"], rng),
    motivoConsultaPP: (pierdeOrina || sensacionBulto || incontinenciaFecal)
      ? pickSome(MOTIVOS_PP, rng, 2)
      : undefined,
    pierdeOrina,
    urgencia,
    sensacionBulto,
    incontinenciaFecal,
    estrenimiento,
    dispareunia,
  };

  if (edad >= 40) {
    responses.fechaMamografia = recentDateISO(900, createdAt, rng);
    responses.resultadoMamografia = pick(["BI-RADS 1","BI-RADS 1","BI-RADS 2","BI-RADS 3"], rng);
  }
  if (fuma) {
    responses.cigarrillosDia = 5 + Math.floor(rng() * 20);
  }
  if (consumeAlcohol) {
    responses.alcoholCantidad = pick(ALCOHOL_CANT, rng);
    responses.alcoholBinge = pick(ALCOHOL_BINGE, rng);
  }
  if (pierdeOrina) {
    responses.iciqFrecuencia = pick(ICIQ_FRECUENCIA, rng);
    responses.iciqCantidad = pick(ICIQ_CANTIDAD, rng);
    responses.iciqImpacto = 1 + Math.floor(rng() * 10);
    responses.iciqSituaciones = pickSome(ICIQ_SITUACIONES, rng, 2);
  }
  if (urgencia) {
    responses.frecuenciaMiccional = 6 + Math.floor(rng() * 6);
    responses.nicturia = Math.floor(rng() * 3);
  }
  if (incontinenciaFecal) {
    responses.wexnerSolido = pick(WEXNER, rng);
    responses.wexnerLiquido = pick(WEXNER, rng);
    responses.wexnerGases = pick(WEXNER, rng);
    responses.wexnerProteccion = pick(WEXNER, rng);
    responses.wexnerEstiloVida = pick(WEXNER, rng);
  }

  const data = {
    id,
    responses,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };

  return { id, rut, doctor, lat, lng, data, city: city.name, createdAt, passcode: generatePasscode() };
}

console.log(`Seeding ${TOTAL} patients (${PER_MONTH}/month × ${MONTHS} months)…`);
const t0 = Date.now();

// Batch in chunks so we don't open 960 individual transactions but also
// don't blow up a single statement.
const CHUNK = 50;
let inserted = 0;
for (let start = 1; start <= TOTAL; start += CHUNK) {
  const end = Math.min(start + CHUNK - 1, TOTAL);
  const batch = Array.from({ length: end - start + 1 }, (_, i) => buildPatient(start + i));

  // Each row gets its own INSERT inside one transaction — keeps the SQL
  // simple while still being ~50× faster than separate HTTP calls.
  await sql.begin(async (tx) => {
    for (const p of batch) {
      await tx`
        INSERT INTO patients (
          id, rut, passcode, doctor_name, latitude, longitude, data,
          created_at, updated_at
        ) VALUES (
          ${p.id}, ${p.rut}, ${p.passcode}, ${p.doctor},
          ${p.lat}, ${p.lng}, ${tx.json(p.data as never)},
          ${p.createdAt}, ${p.createdAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          rut = EXCLUDED.rut,
          passcode = EXCLUDED.passcode,
          doctor_name = EXCLUDED.doctor_name,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          data = EXCLUDED.data,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `;
    }
  });

  inserted += batch.length;
  process.stdout.write(`\r  ${inserted}/${TOTAL}…  `);
}
const elapsedMs = Date.now() - t0;
process.stdout.write("\n");

// Summarize what we wrote.
const cityRows = await sql<{ addr: string; n: number }[]>`
  SELECT
    COALESCE(data->'responses'->'direccion'->>'text', '?') AS addr,
    COUNT(*)::int AS n
  FROM patients
  GROUP BY addr
`;
const byCity: Record<string, number> = {};
for (const r of cityRows) {
  const m = r.addr.match(/, ([^,]+), Chile$/);
  const c = m?.[1] ?? "?";
  byCity[c] = (byCity[c] ?? 0) + r.n;
}
const byDoctor = await sql<{ doctor_name: string | null; n: number }[]>`
  SELECT doctor_name, COUNT(*)::int AS n
  FROM patients GROUP BY doctor_name ORDER BY n DESC
`;
const byMonth = await sql<{ ym: string; n: number }[]>`
  SELECT to_char(created_at, 'YYYY-MM') AS ym, COUNT(*)::int AS n
  FROM patients
  GROUP BY ym ORDER BY ym
`;

console.log(`\nDone in ${(elapsedMs / 1000).toFixed(1)}s. ${inserted} rows.\n`);
console.log("By city:");
for (const [k, v] of Object.entries(byCity).sort()) console.log(`  ${k.padEnd(16)} ${v}`);
console.log("\nBy doctor:");
for (const r of byDoctor) console.log(`  ${(r.doctor_name ?? "—").padEnd(16)} ${r.n}`);
console.log("\nBy month:");
for (const r of byMonth) console.log(`  ${r.ym}  ${r.n}`);

await sql.end();
