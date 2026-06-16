import type { FeedbackEntry, FormSchema, MapPin, MapStatPin, OnChainAnchor, PatientEnvelope, VerifyResult } from "./types";
import { accountByUsername } from "./accounts";
import { loadSession } from "./session";
import { signedHeaders } from "./signing";

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3334";

// Build signed-request auth headers for the logged-in doctor (empty if not
// logged in - the backend will then 401 the gated endpoint).
function authHeaders(method: string, url: string, body: string): Record<string, string> {
  const session = loadSession();
  if (!session) return {};
  const account = accountByUsername(session.username);
  if (!account) return {};
  return signedHeaders(account.secretKey, account.username, method, new URL(url).pathname, body);
}

export async function fetchMapPins(): Promise<MapPin[]> {
  const res = await fetch(`${BASE_URL}/api/v1/map-pins`);
  if (!res.ok) throw new Error(`map-pins failed: ${res.status}`);
  const body = (await res.json()) as { pins: MapPin[] };
  return body.pins;
}

// Anonymized pins + non-identifying medical stats for the map filters. This is
// a doctor-scope endpoint, so the request is signed with the account key.
export async function fetchMapStats(): Promise<MapStatPin[]> {
  const url = `${BASE_URL}/api/v1/map-stats`;
  const res = await fetch(url, { headers: { ...authHeaders("GET", url, "") } });
  if (!res.ok) throw new Error(`map-stats failed: ${res.status}`);
  const body = (await res.json()) as { pins: MapStatPin[] };
  return body.pins;
}

// Feedback is a doctor-scope endpoint (sender attributed from the signed
// identity), so both calls are signed with the account key.
export async function fetchFeedback(): Promise<FeedbackEntry[]> {
  const url = `${BASE_URL}/api/v1/feedback`;
  const res = await fetch(url, { headers: { ...authHeaders("GET", url, "") } });
  if (!res.ok) throw new Error(`feedback GET failed: ${res.status}`);
  const body = (await res.json()) as { feedback: FeedbackEntry[] };
  return body.feedback;
}

export async function submitFeedback(message: string, anonymous: boolean): Promise<FeedbackEntry> {
  const url = `${BASE_URL}/api/v1/feedback`;
  const body = JSON.stringify({ message, anonymous });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders("POST", url, body) },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`feedback POST failed: ${res.status} ${text}`);
  }
  return (await res.json()) as FeedbackEntry;
}

// On-chain anchor for a pin's key (SHA-256(rut)) - public read for the map popup.
export async function fetchOnChain(key: string): Promise<OnChainAnchor> {
  const res = await fetch(`${BASE_URL}/api/v1/onchain/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`onchain failed: ${res.status}`);
  return (await res.json()) as OnChainAnchor;
}

export async function fetchSchema(): Promise<FormSchema> {
  const res = await fetch(`${BASE_URL}/api/v1/schema`);
  if (!res.ok) throw new Error(`schema GET failed: ${res.status}`);
  return (await res.json()) as FormSchema;
}

export async function putSchema(schema: FormSchema): Promise<FormSchema> {
  const url = `${BASE_URL}/api/v1/schema`;
  const body = JSON.stringify(schema);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders("PUT", url, body) },
    body,
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
