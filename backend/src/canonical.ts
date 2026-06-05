import { createHash } from "node:crypto";

// Recompute the patient hash server-side, byte-for-byte identical to what the
// iOS client computed in PatientHasher.sha256Hex (ios/IPP/Services/Hasher.swift).
//
// iOS uses JSONEncoder with:
//   .sortedKeys            → keys sorted lexicographically at every level
//   .withoutEscapingSlashes → "/" left unescaped (JS JSON.stringify also never escapes "/")
//   .iso8601                → Date encoded as "YYYY-MM-DDTHH:MM:SSZ" strings
// over patient.canonicalCopy() (the passcode field is nil, and Swift omits nil
// optionals, so the canonical object is { createdAt, id, responses, updatedAt }).
//
// The backend stores that exact object in patients.data (JSONB). JSONB does not
// preserve key order or whitespace, but it DOES preserve string values (so the
// ISO-8601 date strings survive intact) and numeric values for the simple
// clinical magnitudes used here. We re-sort keys ourselves, so order does not
// matter — only the canonical byte sequence, which this reproduces.
//
// Parity is locked by a test vector built from a real anchored record; see
// backend/scripts/verify-canonical.ts.

/**
 * Serialize a JSON value with recursively sorted object keys, matching Swift's
 * JSONEncoder.OutputFormatting.sortedKeys + withoutEscapingSlashes.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return "null";

  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("non-finite number");
    // JSON.stringify gives the shortest round-tripping representation, which
    // matches Swift's integer/double formatting for these values (e.g. 45, 45.5).
    return JSON.stringify(value);
  }
  if (t === "boolean") return (value as boolean) ? "true" : "false";
  // JSON.stringify handles escaping of ", \, and control chars identically to
  // Swift, and (like Swift's withoutEscapingSlashes) never escapes "/".
  if (t === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJSON(v)).join(",") + "]";
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(); // ASCII keys → JS sort == Swift sort
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k]))
        .join(",") +
      "}"
    );
  }

  throw new Error(`cannot canonicalize value of type ${t}`);
}

/**
 * SHA-256 (hex) of the canonical encoding of a stored patient `data` object,
 * matching the iOS-computed anchor value. The passcode field is stripped
 * defensively (it should never be present in `data`, but never hash it).
 */
export function hashPatientData(data: Record<string, unknown>): string {
  const { passcode: _passcode, ...rest } = data;
  return createHash("sha256").update(canonicalJSON(rest), "utf8").digest("hex");
}
