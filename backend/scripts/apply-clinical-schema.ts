// Apply the IPP clinical question set to the running backend's schema.
// Reads current schema (for the version baseline), then PUTs the new one;
// the endpoint bumps the version itself.
//
//   cd backend
//   bun run scripts/apply-clinical-schema.ts

import { CLINICAL_SCHEMA } from "../src/clinical-schema.ts";
import type { FormSchema, Question } from "../src/types.ts";

const BASE = process.env.BACKEND_URL ?? "http://localhost:3334";

const cur = (await (await fetch(`${BASE}/api/v1/schema`)).json()) as FormSchema;
const next = { ...CLINICAL_SCHEMA, version: cur.version };

const res = await fetch(`${BASE}/api/v1/schema`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(next),
});
if (!res.ok) {
  console.error("PUT failed:", res.status, await res.text());
  process.exit(1);
}
const stored = (await res.json()) as FormSchema;
console.log(`schema applied - v${stored.version}`);
console.log(`  tabs:      ${stored.tabs.length}`);
console.log(`  questions: ${stored.questions.length}`);
const byTab: Record<string, number> = {};
for (const q of stored.questions as Question[]) byTab[q.tab] = (byTab[q.tab] ?? 0) + 1;
for (const [tab, n] of Object.entries(byTab)) console.log(`    ${tab.padEnd(22)} ${n}`);
