// Builds a CSV of the filter-selected cohort and triggers a browser download.
// Anonymized: only the projected map stats + coarse coordinates - never names
// or RUTs (the map-stats payload doesn't carry them).

import type { MapStatPin, ResponseValue } from "./types";
import type { StatField } from "./mapStats";

function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatValue(v: ResponseValue | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object" && "text" in v) {
    return String((v as { text?: unknown }).text ?? "");
  }
  return String(v);
}

export function cohortToCSV(pins: MapStatPin[], fields: StatField[]): string {
  const headers = ["id", "lat", "lng", ...fields.map((f) => f.label)];
  const rows = pins.map((p) => [
    p.id,
    // Coarse coordinates (~100 m) - enough for geographic studies, not pinpoint.
    p.latitude.toFixed(3),
    p.longitude.toFixed(3),
    ...fields.map((f) => formatValue(p.stats[f.id])),
  ]);
  return [headers, ...rows].map((cols) => cols.map(escapeCell).join(",")).join("\r\n");
}

// Leading BOM so Excel reads UTF-8 (Spanish accents) correctly. In a normal
// browser this downloads a file; inside the embedded iOS WKWebView it needs a
// WKDownloadDelegate to surface - handled separately if we wire that path.
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Verification metadata prepended to an exported dataset so the Verification ID
// travels WITH the file. Lines are `#`-prefixed; the data CSV (whose SHA-256 is
// `exportHash`) follows. A verifier strips the BOM + the leading `#` lines and
// hashes the remainder to reproduce `exportHash`.
export interface ProofStamp {
  verificationId: string;
  recordsRoot: string;
  exportHash: string;
  anchoredValue: string;
  chainTxId: string | null;
  chain: string;
  verifyUrl: string;
}

export function buildProofHeader(s: ProofStamp): string {
  return [
    `# IPP-VERIFICATION`,
    `# Verification-ID: ${s.verificationId}`,
    `# Chain: ${s.chain}  Tx: ${s.chainTxId ?? "(pending)"}`,
    `# Records-Root: ${s.recordsRoot}`,
    `# Export-SHA256: ${s.exportHash}`,
    `# Anchored-Value: ${s.anchoredValue}`,
    `# Verify: ${s.verifyUrl}`,
    `# --- data below (its SHA-256 is Export-SHA256) ---`,
  ].join("\r\n");
}

// Final file = header + data CSV. `exportHash` must be SHA-256 of `dataCsv` ONLY.
export function stampCSV(header: string, dataCsv: string): string {
  return `${header}\r\n${dataCsv}`;
}

// Strip a stamped CSV back to the exact `dataCsv` whose SHA-256 is Export-SHA256
// (drops a leading BOM and the `#`-prefixed header). Used by the verifier.
export function stripProofHeader(text: string): string {
  const noBom = text.replace(/^﻿/, "");
  const lines = noBom.split(/\r\n|\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith("#")) i++;
  return lines.slice(i).join("\r\n");
}

export function downloadJSON(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
