import { createDb, DEFAULT_DB_PATH } from "./index.ts";

// CLI entrypoint: `bun run migrate`. Applies all pending migrations and lists
// the resulting tables so the operator can eyeball the result.
const path = process.argv[2] ?? DEFAULT_DB_PATH;
const db = createDb(path);

const tables = db
  .query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all()
  .map((r) => r.name);

console.log(`Migrated ${path}`);
console.log(`Tables (${tables.length}): ${tables.join(", ")}`);
