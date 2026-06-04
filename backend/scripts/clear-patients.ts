// Deletes every patient row. Useful before re-seeding so old IDs that
// don't match the current clinical schema's question shape are cleared.
//
//   cd backend
//   bun run scripts/clear-patients.ts

import { sql } from "../src/db.ts";

const { count } = (await sql<{ count: number }[]>`
  SELECT COUNT(*)::int AS count FROM patients
`)[0]!;
await sql`DELETE FROM patients`;
console.log(`deleted ${count} patient rows`);
await sql.end();
