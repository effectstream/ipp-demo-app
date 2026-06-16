export interface HashSubmission {
  patientId: string;
  hash: string;
  publicKey: string;
  signature: string;
  timestamp: number;
}

export interface PatientUpsertRequest {
  id: string;
  rut: string;
  doctorName: string | null;
  latitude: number | null;
  longitude: number | null;
  data: Record<string, unknown>;
}

export interface LeaderboardEntry {
  doctor: string;
  total: number;    // patients registered (kept for display)
  last30: number;   // patients in the last 30 days
  fields: number;   // filled response fields across their patients
  searches: number; // logged search events
  points: number;   // 1000·patients + 20·fields + 10·searches
}

export interface PatientRow {
  id: string;
  rut: string;
  // Plaintext passcode is returned ONCE, in the POST /patients response for a
  // newly-created patient. It is never stored in plaintext (only an HMAC is)
  // and is never returned by reads/lookup.
  passcode?: string;
  latitude: number | null;
  longitude: number | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  // SHA-256(rut) - non-identifying key used to look up the patient's on-chain
  // anchor (the same key the chain adapter anchors under).
  anchorKey: string;
}

// Anonymized pin enriched with non-identifying medical/population stats, served
// by GET /api/v1/map-stats for the map's population-study filters. `stats` is a
// projection of data.responses restricted to filterable, non-identifying
// fields (plus a derived `edad`); names, RUT, contact and address never appear.
export interface MapStatPin {
  id: string;
  latitude: number;
  longitude: number;
  anchorKey: string;
  stats: Record<string, unknown>;
}

export type QuestionType =
  | "text"
  | "number"
  | "boolean"
  | "multiselect"
  | "picker"
  | "date"
  | "address";

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  tab: string;
  order: number;
  options?: string[];        // For picker/multiselect; also acts as autocomplete for text.
  allowCustom?: boolean;     // For multiselect: can the user add their own entries?
  placeholder?: string;
  hidden?: boolean;
  // Whether this question is offered as a filter on the population map. When
  // unset, the map falls back to a type-based default (see /map-stats).
  filterable?: boolean;
  // Conditional visibility: show this question only when the value of
  // dependsOn equals dependsOnValue. Kept loosely-typed so the schema can
  // depend on any answer shape.
  dependsOn?: string;
  dependsOnValue?: unknown;
  // Optional clinical / authoring metadata. Stored but ignored by today's
  // renderers; surfaced in the web's Configurar editor as helper text and
  // available to iOS for future tooltip / "porqué" affordances.
  labelEn?: string;
  rationale?: string;
  source?: string;
  tier?: "essential" | "commonly" | "optional";
}

export interface FormTab {
  id: string;
  label: string;
  icon?: string;
  order: number;
}

export interface FormSchema {
  version: number;
  tabs: FormTab[];
  questions: Question[];
}

// Free-text feedback from a doctor. `sender` is the authenticated username, or
// null when the doctor opted to send anonymously.
export interface FeedbackEntry {
  id: number;
  sender: string | null;
  anonymous: boolean;
  message: string;
  createdAt: string;
}

export interface AnchoredHash {
  id: number;
  patientId: string;
  hash: string;
  publicKey: string;
  signature: string;
  clientTimestamp: number;
  receivedAt: string;
  chainTxId: string | null;
  chainName: string;
}

export interface AnchorContext {
  patientId: string;
  rut: string;
  // Hex of SHA-256(canonical patient JSON) - becomes the value on chain.
  hash: string;
  publicKey: string;
  signature: string;
  timestamp: number;
}

export interface ChainReadResult {
  found: boolean;
  valueHex: string | null;
}

export interface ChainAdapter {
  readonly name: string;
  submit(ctx: AnchorContext): Promise<string | null>;
  // Read the on-chain value anchored at `keyHex` (= SHA-256(rut)). Used by the
  // verification path. Adapters with no on-chain read return { found: false }.
  read(keyHex: string): Promise<ChainReadResult>;
}
