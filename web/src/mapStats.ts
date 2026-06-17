// Map population-study filters: derive the filterable fields from the live form
// schema + the data actually present, and evaluate filters against a pin's
// stats. ANY question can be made filterable from the schema editor; what
// differs is the *default* - medical-stat types are on by default, names and
// other identifiers are off, so the default map filters are "by stat, not by
// name". Mirrors the backend (/api/v1/map-stats).

import type { FormSchema, MapStatPin, Question, ResponseValue } from "./types";

// Types/ids that are filterable BY DEFAULT (i.e. checked in the editor when no
// explicit choice has been made). Every other field can still be turned on
// per-question; this only decides the starting state.
const DEFAULT_FILTER_TYPES = new Set(["boolean", "number", "picker", "multiselect"]);
const NON_DEFAULT_IDS = new Set([
  "nombres", "apellidoPaterno", "apellidoMaterno", "rut", "telefono",
  "email", "nombreIsapre", "ocupacion", "comuna", "consentimientoDatos",
]);

// Whether a question is filterable by default (no explicit flag set).
function isDefaultFilter(q: Question): boolean {
  return DEFAULT_FILTER_TYPES.has(q.type) && !NON_DEFAULT_IDS.has(q.id);
}

// Effective filterability: an explicit per-question `filterable` flag (set in
// the schema editor) wins; otherwise fall back to the default. Must mirror the
// backend's isFilterableQuestion in server.ts.
export function isFilterable(q: Question): boolean {
  if (typeof q.filterable === "boolean") return q.filterable;
  return !q.hidden && isDefaultFilter(q);
}

export type StatFieldType =
  | "boolean" | "number" | "picker" | "multiselect" | "text" | "date" | "address";

export interface StatField {
  id: string;
  label: string;
  tab: string;        // tab id (for grouping)
  tabLabel: string;
  type: StatFieldType;
  options: string[];  // picker/multiselect: distinct values present in the data
  min: number | null; // number: observed range (used as input hints)
  max: number | null;
  dateMin: string | null; // date: observed ISO range (used as input hints)
  dateMax: string | null;
}

export interface StatFilter {
  id: string;
  type: StatFieldType;
  selected: string[];      // picker/multiselect
  want: boolean | null;    // boolean (null = inactive)
  min: number | null;      // number
  max: number | null;
  query: string;           // text/address (case-insensitive substring)
  dateMin: string | null;  // date (ISO, inclusive)
  dateMax: string | null;
}

interface Candidate {
  id: string;
  label: string;
  type: StatFieldType;
  tab: string;
}

// Build the filterable-field list from the schema, computing each field's
// domain (distinct options / numeric range) from the data that's actually
// present. A synthetic `edad` (age, derived server-side) is appended - a core
// population-study variable. Fields with no data are dropped (nothing to
// filter on); booleans are always kept since their Sí/No domain is implicit.
export function deriveStatFields(schema: FormSchema, pins: MapStatPin[]): StatField[] {
  const tabLabel = new Map(schema.tabs.map((t) => [t.id, t.label] as const));

  const candidates: Candidate[] = schema.questions
    .filter(isFilterable)
    .sort((a, b) => a.tab.localeCompare(b.tab) || a.order - b.order)
    .map((q) => ({ id: q.id, label: q.label, type: q.type as StatFieldType, tab: q.tab }));
  candidates.push({ id: "edad", label: "Edad (años)", type: "number", tab: "datosPersonales" });

  const fields: StatField[] = [];
  for (const c of candidates) {
    const options = new Set<string>();
    let min: number | null = null;
    let max: number | null = null;
    let dateMin: string | null = null;
    let dateMax: string | null = null;
    let hasValue = false;

    for (const p of pins) {
      const v = p.stats[c.id];
      if (v == null || v === "") continue;
      if (c.type === "number" && typeof v === "number") {
        min = min === null ? v : Math.min(min, v);
        max = max === null ? v : Math.max(max, v);
        hasValue = true;
      } else if (c.type === "picker" && typeof v === "string") {
        options.add(v);
        hasValue = true;
      } else if (c.type === "multiselect" && Array.isArray(v)) {
        for (const x of v) if (typeof x === "string") options.add(x);
        if (v.length) hasValue = true;
      } else if (c.type === "date" && typeof v === "string") {
        if (dateMin === null || v < dateMin) dateMin = v;
        if (dateMax === null || v > dateMax) dateMax = v;
        hasValue = true;
      } else if (c.type === "address") {
        const text = typeof v === "string" ? v
          : (typeof v === "object" && v && "text" in v ? String((v as { text?: unknown }).text ?? "") : "");
        if (text.trim()) hasValue = true;
      } else if (c.type === "text" || c.type === "boolean") {
        hasValue = true;
      }
    }

    // Drop fields with nothing to filter on (booleans always keep - Sí/No is
    // implicit; text/address keep if any non-empty value was seen).
    if (c.type === "number" && min === null) continue;
    if (c.type === "date" && dateMin === null) continue;
    if ((c.type === "picker" || c.type === "multiselect") && options.size === 0) continue;
    if ((c.type === "text" || c.type === "address") && !hasValue) continue;

    fields.push({
      id: c.id,
      label: c.label,
      tab: c.tab,
      tabLabel: tabLabel.get(c.tab) ?? c.tab,
      type: c.type,
      options: [...options].sort((a, b) => a.localeCompare(b, "es")),
      min,
      max,
      dateMin,
      dateMax,
    });
  }
  return fields;
}

export function emptyFilter(field: StatField): StatFilter {
  return {
    id: field.id, type: field.type, selected: [], want: null,
    min: null, max: null, query: "", dateMin: null, dateMax: null,
  };
}

// A filter with nothing chosen imposes no constraint (treated as inactive).
export function isActive(f: StatFilter): boolean {
  switch (f.type) {
    case "boolean": return f.want !== null;
    case "number": return f.min !== null || f.max !== null;
    case "date": return f.dateMin !== null || f.dateMax !== null;
    case "text":
    case "address": return f.query.trim() !== "";
    default: return f.selected.length > 0; // picker, multiselect
  }
}

export function activeFilters(filters: StatFilter[]): StatFilter[] {
  return filters.filter(isActive);
}

function matchesOne(value: ResponseValue | undefined, f: StatFilter): boolean {
  if (!isActive(f)) return true;
  if (value === undefined || value === null) return false; // missing data → excluded
  switch (f.type) {
    case "boolean":
      return value === f.want;
    case "number":
      return typeof value === "number"
        && (f.min === null || value >= f.min)
        && (f.max === null || value <= f.max);
    case "picker":
      return typeof value === "string" && f.selected.includes(value);
    case "multiselect":
      return Array.isArray(value) && value.some((x) => f.selected.includes(x as string));
    case "date":
      // ISO YYYY-MM-DD strings compare correctly lexicographically.
      return typeof value === "string"
        && (f.dateMin === null || value >= f.dateMin)
        && (f.dateMax === null || value <= f.dateMax);
    case "text":
    case "address": {
      const text = typeof value === "string" ? value
        : (typeof value === "object" && value && "text" in value
            ? String((value as { text?: unknown }).text ?? "") : "");
      return text.toLowerCase().includes(f.query.trim().toLowerCase());
    }
  }
}

export function matchesAll(pin: MapStatPin, filters: StatFilter[]): boolean {
  return filters.every((f) => matchesOne(pin.stats[f.id], f));
}

// Human-readable description of the active cohort filters, recorded with a study
// as provenance ("which slice of the population this export covers").
export function describeFilters(active: StatFilter[], fields: StatField[]): string {
  if (active.length === 0) return "Todos los pacientes";
  const label = new Map(fields.map((f) => [f.id, f.label] as const));
  return active
    .map((f) => {
      const name = label.get(f.id) ?? f.id;
      switch (f.type) {
        case "boolean":
          return `${name}: ${f.want ? "Sí" : "No"}`;
        case "number":
          return `${name}: ${f.min ?? ""}–${f.max ?? ""}`;
        case "date":
          return `${name}: ${f.dateMin ?? ""}–${f.dateMax ?? ""}`;
        case "text":
        case "address":
          return `${name} ~ "${f.query.trim()}"`;
        default:
          return `${name}: ${f.selected.join(" / ")}`;
      }
    })
    .join("; ");
}
