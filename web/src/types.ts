// Wire shapes for the IPP backend. Mirrors backend/src/types.ts.

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  anchorKey: string;
}

// On-chain anchor lookup result (GET /api/v1/onchain/:key).
export interface OnChainAnchor {
  chain: string;
  found: boolean;
  valueHex: string | null;
}

// Anonymized pin + non-identifying medical stats (GET /api/v1/map-stats),
// used by the map's population-study filters. Mirrors backend MapStatPin.
export interface MapStatPin {
  id: string;
  latitude: number;
  longitude: number;
  anchorKey: string;
  stats: Record<string, ResponseValue>;
}

export interface PatientEnvelope {
  id: string;
  rut: string;
  // Only present in the POST response for a newly-created patient; reads and
  // lookup no longer return it (the backend stores only an HMAC).
  passcode?: string;
  latitude: number | null;
  longitude: number | null;
  data: PatientData;
  createdAt: string;
  updatedAt: string;
}

// Mirror of the iOS Patient struct. Sub-objects are optional here so the
// web is tolerant of partially-populated records.
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
  options?: string[];
  allowCustom?: boolean;
  placeholder?: string;
  hidden?: boolean;
  // Whether this question is offered as a filter on the population map.
  // Unset → a type-based default decides (see mapStats.isFilterable).
  filterable?: boolean;
  dependsOn?: string;
  dependsOnValue?: unknown;
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

// Schema-agnostic: responses are keyed by questionId.
export interface AddressValue {
  text?: string;
  latitud?: number | null;
  longitud?: number | null;
}

export type ResponseValue =
  | string
  | number
  | boolean
  | string[]
  | AddressValue
  | null;

export interface PatientData {
  id?: string;
  responses?: Record<string, ResponseValue>;
  createdAt?: string;
  updatedAt?: string;
}

// One feedback row (GET /api/v1/feedback). `sender` is null when anonymous.
export interface FeedbackEntry {
  id: number;
  sender: string | null;
  anonymous: boolean;
  message: string;
  createdAt: string;
}

// Result of GET /api/v1/verify/:rut - on-chain anchor verification.
export interface VerifyResult {
  rut: string;
  keyHex: string;
  chain: string;
  found: boolean;
  onChainHash: string | null;
  anchoredHash: string | null;
  localHash: string | null;
  // chain faithfully stored the hash we submitted when anchoring
  chainMatch: boolean;
  // the current record still matches what's anchored on chain
  recordMatch: boolean;
  chainTxId: string | null;
  chainName: string | null;
  anchoredAt: string | null;
  readError: string | null;
}
