import type { FormSchema, MapPin, PatientEnvelope, VerifyResult } from "./types";

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3334";

export async function fetchMapPins(): Promise<MapPin[]> {
  const res = await fetch(`${BASE_URL}/api/v1/map-pins`);
  if (!res.ok) throw new Error(`map-pins failed: ${res.status}`);
  const body = (await res.json()) as { pins: MapPin[] };
  return body.pins;
}

export async function fetchSchema(): Promise<FormSchema> {
  const res = await fetch(`${BASE_URL}/api/v1/schema`);
  if (!res.ok) throw new Error(`schema GET failed: ${res.status}`);
  return (await res.json()) as FormSchema;
}

export async function putSchema(schema: FormSchema): Promise<FormSchema> {
  const res = await fetch(`${BASE_URL}/api/v1/schema`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`schema PUT failed: ${res.status} ${body}`);
  }
  return (await res.json()) as FormSchema;
}

export async function verifyOnChain(rut: string): Promise<VerifyResult> {
  const res = await fetch(`${BASE_URL}/api/v1/verify/${encodeURIComponent(rut)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`verify failed: ${res.status} ${body}`);
  }
  return (await res.json()) as VerifyResult;
}

export async function lookupPatient(
  rut: string,
  passcode: string
): Promise<PatientEnvelope | null> {
  const res = await fetch(`${BASE_URL}/api/v1/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rut, passcode }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`lookup failed: ${res.status} ${body}`);
  }
  return (await res.json()) as PatientEnvelope;
}
