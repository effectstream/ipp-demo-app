// Per-browser map annotations: notes (point markers with text) and areas
// (polygons with a name). Stored in localStorage so they survive reloads,
// and never sent to the backend — this is a planning aid for the local
// user, not patient data.

export interface NoteAnnotation {
  id: string;
  type: "note";
  text: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface AreaAnnotation {
  id: string;
  type: "area";
  name: string;
  points: Array<[number, number]>;
  createdAt: string;
}

export type Annotation = NoteAnnotation | AreaAnnotation;

const STORAGE_KEY = "ipp.annotations.v1";

export function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Light validation: skip anything missing critical fields.
    return parsed.filter((x: unknown): x is Annotation => {
      if (!x || typeof x !== "object") return false;
      const a = x as Record<string, unknown>;
      if (a.type === "note") return typeof a.text === "string" && typeof a.lat === "number" && typeof a.lng === "number";
      if (a.type === "area") return typeof a.name === "string" && Array.isArray(a.points);
      return false;
    });
  } catch {
    return [];
  }
}

export function saveAnnotations(items: Annotation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded or storage disabled — silently ignore.
  }
}

export function newId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}
