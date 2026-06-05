// Wire shapes for the IPP backend. Mirrors backend/src/types.ts.

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
}

export interface PatientEnvelope {
  id: string;
  rut: string;
  passcode: string;
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

// Result of GET /api/v1/verify/:rut — on-chain anchor verification.
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
