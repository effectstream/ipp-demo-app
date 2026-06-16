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
