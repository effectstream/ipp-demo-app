// Seeds patients aligned with the current clinical form schema (v11+).
// Distributes 30 fake patients across five Chilean coastal cities so the
// map and leaderboard have realistic data. Deterministic - re-running
// upserts the same UUIDs in place.
//
// Run with:
//   cd backend
//   bun run scripts/seed-cities.ts
//
// Reads BACKEND_URL (default http://localhost:3334), so the backend must
// be up first.

import { createHash } from "node:crypto";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3334";
const COUNT = Number(process.env.SEED_COUNT ?? 30);

interface City {
  name: string;
  lat: { min: number; max: number };
  lng: { min: number; max: number };
}

// Land-only bounding boxes east of the coastline.
const CITIES: City[] = [
  { name: "Quilpué",       lat: { min: -33.058, max: -33.030 }, lng: { min: -71.460, max: -71.420 } },
  { name: "Viña del Mar",  lat: { min: -33.040, max: -33.000 }, lng: { min: -71.553, max: -71.510 } },
  { name: "Valparaíso",    lat: { min: -33.070, max: -33.025 }, lng: { min: -71.620, max: -71.580 } },
  { name: "Villa Alemana", lat: { min: -33.052, max: -33.028 }, lng: { min: -71.390, max: -71.355 } },
  { name: "San Antonio",   lat: { min: -33.610, max: -33.570 }, lng: { min: -71.605, max: -71.580 } },
];

const FIRST_NAMES = [
  "María", "Carmen", "Ana", "Isabel", "Patricia", "Sofía", "Camila", "Valentina",
  "Constanza", "Catalina", "Javiera", "Antonia", "Florencia", "Trinidad", "Macarena",
  "Paula", "Daniela", "Andrea", "Fernanda", "Rocío",
];

const PATERNAL = [
  "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva",
  "Martínez", "Sepúlveda", "Morales", "Rodríguez", "López", "Fuentes", "Hernández",
  "Vargas", "Castillo", "Espinoza", "Tapia", "Vergara",
];
const MATERNAL = PATERNAL; // same pool

const STREETS = [
  "Av. Libertad", "Calle Condell", "Av. España", "Calle Brasil", "Av. Argentina",
  "Av. Errázuriz", "Calle Esmeralda", "Av. Pedro Montt", "Av. San Martín", "Calle Yungay",
];

const DOCTORS = ["Dra. Pérez", "Dr. Soto", "Dra. Vega", "Dr. Ramírez"];

// Pools that match the clinical schema's options. allowCustom-friendly.
const CIRUGIAS = ["Ninguna","Cesárea","Apendicectomía","Colecistectomía","Histerectomía","Hernioplastía","Amigdalectomía","Cirugía de várices"];
const ENFERMEDADES = ["Ninguna","Hipertensión arterial (HTA)","Diabetes mellitus 2","Hipotiroidismo","Dislipidemia","Asma/EPOC","Depresión/ansiedad","Enfermedad renal crónica"];
const MEDICAMENTOS = ["Losartán","Metformina","Levotiroxina","Atorvastatina","Omeprazol","Sertralina","Salbutamol","Aspirina","Paracetamol"];
const ALERGIAS = ["Ninguna conocida","Penicilina","AINEs","Yodo/medio de contraste","Látex","Sulfas"];
const ANTICONCEPTIVOS = ["Ninguno","ACO combinado","Progestágeno solo (PPS)","DIU de cobre (T-Cu)","DIU/SIU hormonal (T-LNG)","Implante subdérmico","Inyectable","Preservativo","Esterilización quirúrgica","MELA/método natural"];
const MOTIVOS_PP = ["Incontinencia de orina","Urgencia / vejiga hiperactiva","Sensación de bulto / prolapso","Incontinencia fecal o de gases","Estreñimiento","Dolor / dispareunia"];
const ICIQ_FRECUENCIA = ["Nunca (0)","Una vez a la semana (1)","2–3 veces por semana (2)","Una vez al día (3)","Varias veces al día (4)","Continuamente (5)"];
const ICIQ_CANTIDAD = ["No se me escapa nada (0)","Muy poca cantidad (2)","Una cantidad moderada (4)","Mucha cantidad (6)"];
const ICIQ_SITUACIONES = ["Al toser o estornudar","Al realizar esfuerzos físicos o ejercicio","Antes de llegar al baño","Sin motivo evidente","Mientras duerme","Al terminar de orinar y ya vestida","De forma continua"];
const WEXNER = ["Nunca (0)","Rara vez (1)","A veces (2)","Generalmente (3)","Siempre (4)"];
const ALCOHOL_FREQ = ["Nunca","1 vez al mes o menos","2–4 veces al mes","2–3 veces por semana","4 o más veces por semana"];
const ALCOHOL_CANT = ["1–2","3–4","5–6","7–9","10 o más"];
const ALCOHOL_BINGE = ["Nunca","Menos de 1 vez al mes","Mensualmente","Semanalmente","A diario o casi a diario"];
const ACTIVIDAD = ["Sedentaria","1–2 veces/semana","3 o más veces/semana"];
const PREVISION = ["FONASA","Isapre","Particular"];

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

function fakeRut(rng: () => number): string {
  const digits = (Math.floor(rng() * 90_000_000) + 10_000_000).toString();
  const check = Math.floor(rng() * 10).toString();
  return `${digits}-${check}`;
}

// ISO date for "today minus `years` years" plus some random jitter days.
function birthDateForAge(age: number, rng: () => number): string {
  const now = Date.parse("2026-06-04T00:00:00Z"); // pinned so deterministic
  const dayJitter = Math.floor(rng() * 365);
  const d = new Date(now - (age * 365.25 + dayJitter) * 86400_000);
  return d.toISOString().slice(0, 10);
}

function recentDateISO(maxDaysAgo: number, rng: () => number): string {
  const now = Date.parse("2026-06-04T00:00:00Z");
  const d = new Date(now - Math.floor(rng() * maxDaysAgo) * 86400_000);
  return d.toISOString().slice(0, 10);
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

interface SeedResult {
  ok: boolean;
  status: number;
  city: string;
  doctor: string;
  nombre: string;
  rut: string;
  passcode?: string;
  error?: string;
}

async function seedOne(index: number): Promise<SeedResult> {
  const rng = mulberry32(index * 7919);
  const city = pick(CITIES, rng);
  const lat = city.lat.min + rng() * (city.lat.max - city.lat.min);
  const lng = city.lng.min + rng() * (city.lng.max - city.lng.min);
  const nombre = pick(FIRST_NAMES, rng);
  const paterno = pick(PATERNAL, rng);
  const materno = pick(MATERNAL, rng);
  const rut = fakeRut(rng);
  const id = uuidFromString(`ipp-seed-clinical-v1:${index}:${nombre}:${rut}`);
  const doctor = pick(DOCTORS, rng);
  const street = pick(STREETS, rng);
  const direccionText = `${street} ${100 + Math.floor(rng() * 900)}, ${city.name}, Chile`;
  const edad = 25 + Math.floor(rng() * 45);
  const fechaNacimiento = birthDateForAge(edad, rng);
  const peso = Math.round((52 + rng() * 38) * 10) / 10; // 52.0–90.0
  const talla = Math.round(150 + rng() * 25);            // 150–175 cm
  const imc = Math.round((peso / Math.pow(talla / 100, 2)) * 10) / 10;
  const prevision = pick(PREVISION, rng);
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
  const now = new Date().toISOString();

  const responses: Record<string, unknown> = {
    nombres: nombre,
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    rut,
    fechaNacimiento,
    telefono: `+56 9 ${Math.floor(rng() * 9000_0000 + 1000_0000)}`,
    direccion: { text: direccionText, latitud: lat, longitud: lng },
    prevision,
    consentimientoDatos: true,
    peso,
    talla,
    imc,
    enfermedadesCronicas: pickSome(ENFERMEDADES.filter(e => e !== "Ninguna"), rng, 2),
    cirugiasPrevias: pickSome(CIRUGIAS.filter(c => c !== "Ninguna"), rng, 2),
    medicamentos: pickSome(MEDICAMENTOS, rng, 3),
    alergias: pickSome(ALERGIAS.filter(a => a !== "Ninguna conocida"), rng, 1),
    fuma,
    alcoholFrecuencia: consumeAlcohol ? pick(ALCOHOL_FREQ.filter(f => f !== "Nunca"), rng) : "Nunca",
    actividadFisica: pick(ACTIVIDAD, rng),
    menarquia: 10 + Math.floor(rng() * 5),
    fur: recentDateISO(60, rng),
    cicloMenstrual: edad < 50 ? `${3 + Math.floor(rng() * 4)}/${26 + Math.floor(rng() * 6)}` : "",
    estadoMenopausico: edad < 45 ? "Premenopausia" : edad < 55 ? "Perimenopausia" : "Postmenopausia",
    gestas: partos + cesareas + abortos,
    partosVaginales: partos,
    cesareas,
    abortos,
    metodoAnticonceptivo: usaAnti
      ? pickSome(ANTICONCEPTIVOS.filter(a => a !== "Ninguno"), rng, 1)
      : ["Ninguno"],
    fechaPap: recentDateISO(900, rng),
    resultadoPap: pick(["Normal","Normal","Normal","ASCUS","Lesión de bajo grado (NIE I)"], rng),
    fechaMamografia: edad >= 40 ? recentDateISO(900, rng) : undefined,
    resultadoMamografia: edad >= 40 ? pick(["BI-RADS 1","BI-RADS 1","BI-RADS 2","BI-RADS 3"], rng) : undefined,
    motivoConsultaPP: pierdeOrina || sensacionBulto || incontinenciaFecal
      ? pickSome(MOTIVOS_PP, rng, 2)
      : undefined,
    pierdeOrina,
    urgencia,
    sensacionBulto,
    incontinenciaFecal,
    estrenimiento,
    dispareunia,
  };

  // Conditional fields
  if (fuma) {
    responses.cigarrillosDia = 5 + Math.floor(rng() * 20);
  }
  if (consumeAlcohol) {
    responses.alcoholCantidad = pick(ALCOHOL_CANT, rng);
    responses.alcoholBinge = pick(ALCOHOL_BINGE, rng);
  }
  if (pierdeOrina) {
    responses.iciqFrecuencia = pick(ICIQ_FRECUENCIA.filter(o => o !== "Nunca (0)"), rng);
    responses.iciqCantidad = pick(ICIQ_CANTIDAD.filter(o => o !== "No se me escapa nada (0)"), rng);
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
    createdAt: now,
    updatedAt: now,
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        rut,
        doctorName: doctor,
        latitude: lat,
        longitude: lng,
        data,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        city: city.name,
        doctor,
        nombre: `${nombre} ${paterno}`,
        rut,
        error: await res.text(),
      };
    }
    const body = (await res.json()) as { passcode: string };
    return {
      ok: true,
      status: res.status,
      city: city.name,
      doctor,
      nombre: `${nombre} ${paterno}`,
      rut,
      passcode: body.passcode,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      city: city.name,
      doctor,
      nombre: `${nombre} ${paterno}`,
      rut,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

console.log(`Seeding ${COUNT} patients against ${BACKEND_URL}…`);
const results: SeedResult[] = [];
for (let i = 1; i <= COUNT; i++) {
  results.push(await seedOne(i));
}

const ok = results.filter(r => r.ok).length;
const fail = results.length - ok;

const byCity = results.reduce<Record<string, number>>((acc, r) => {
  if (r.ok) acc[r.city] = (acc[r.city] ?? 0) + 1;
  return acc;
}, {});
const byDoctor = results.reduce<Record<string, number>>((acc, r) => {
  if (r.ok) acc[r.doctor] = (acc[r.doctor] ?? 0) + 1;
  return acc;
}, {});

console.log(`\nDone. ok=${ok} fail=${fail}`);
console.log("\nBy city:");
for (const [k, v] of Object.entries(byCity).sort()) console.log(`  ${k.padEnd(16)} ${v}`);
console.log("\nBy doctor:");
for (const [k, v] of Object.entries(byDoctor).sort()) console.log(`  ${k.padEnd(16)} ${v}`);

const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  [${f.status}] ${f.nombre} (${f.rut}): ${f.error}`);
  process.exit(1);
}
