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
  total: number;
  last30: number;
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
  // Hex of SHA-256(canonical patient JSON) — becomes the value on chain.
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
