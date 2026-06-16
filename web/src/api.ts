import type {
  FeedbackEntry, FormSchema, MapPin, MapStatPin, OnChainAnchor, PatientEnvelope, VerifyResult,
  StudyPublishResult, StudySummary, ProofBundle, StudyVerifyResult,
} from "./types";
import { accountByUsername } from "./accounts";
import { loadSession } from "./session";
import { signedHeaders } from "./signing";

export const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3334";

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

// Publish a cohort-scoped, export-bound study (doctor-scope). The CSV export
// flow calls this with the filtered cohort's member ids + the export file hash.
export async function publishStudy(input: {
  memberIds: string[];
  exportHash?: string;
  title?: string;
  filter?: { description?: string; json?: unknown };
}): Promise<StudyPublishResult> {
  const url = `${BASE_URL}/api/v1/studies`;
  const body = JSON.stringify(input);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders("POST", url, body) },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`publish study failed: ${res.status} ${text}`);
  }
  return (await res.json()) as StudyPublishResult;
}

// List recorded studies/exports (doctor-scope).
export async function fetchStudies(): Promise<StudySummary[]> {
  const url = `${BASE_URL}/api/v1/studies`;
  const res = await fetch(url, { headers: { ...authHeaders("GET", url, "") } });
  if (!res.ok) throw new Error(`studies GET failed: ${res.status}`);
  const body = (await res.json()) as { studies: StudySummary[] };
  return body.studies;
}

// The hash-only proof bundle for a study (public).
export async function fetchStudyBundle(id: string): Promise<ProofBundle> {
  const res = await fetch(`${BASE_URL}/api/v1/studies/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`study bundle failed: ${res.status}`);
  return (await res.json()) as ProofBundle;
}

// Doctor-side drift check: does the live dataset still match what was published?
export async function verifyStudy(id: string): Promise<StudyVerifyResult> {
  const res = await fetch(`${BASE_URL}/api/v1/verify-study/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`verify-study failed: ${res.status}`);
  return (await res.json()) as StudyVerifyResult;
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
