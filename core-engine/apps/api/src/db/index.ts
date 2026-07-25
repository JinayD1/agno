import { Database } from "bun:sqlite";
import { MIGRATIONS } from "./schema.ts";

export const DEFAULT_DB_PATH = process.env.ORBIT_DB ?? "orbit.db";

/**
 * Open a database at `path` and bring it fully up to date. Pass ":memory:" for
 * an isolated in-memory DB (used by tests). Migrations are idempotent and
 * tracked in the `_migrations` table, so calling this repeatedly is safe.
 */
export function createDb(path: string = DEFAULT_DB_PATH): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  return db;
}

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .query<{ version: number }, []>("SELECT version FROM _migrations")
      .all()
      .map((r) => r.version),
  );

  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      db.query(
        "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, new Date().toISOString());
    });
    tx();
  }
}

/**
 * Shared singleton connection for the running server. Tests should call
 * `createDb(":memory:")` instead of importing this, so they stay isolated.
 */
let _db: Database | null = null;
export function db(): Database {
  if (!_db) _db = createDb();
  return _db;
}
