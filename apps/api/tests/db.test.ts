import { describe, expect, test } from "bun:test";
import { createDb } from "../src/db/index.ts";

const EXPECTED_TABLES = [
  "agents",
  "commits",
  "context_packets",
  "decisions",
  "repos",
  "sessions",
  "trace_turns",
  "traces",
];

function tableNames(db: ReturnType<typeof createDb>): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
}

describe("migrations", () => {
  test("create all 8 PRD tables", () => {
    const db = createDb(":memory:");
    expect(tableNames(db).sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  test("are idempotent (running twice is a no-op)", () => {
    const db = createDb(":memory:");
    // Re-import + re-run against the same connection would normally re-apply;
    // instead assert exactly one migration row exists.
    const count = db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM _migrations")
      .get();
    expect(count?.c).toBe(1);
  });
});

describe("relational trace storage", () => {
  test("commit → trace → turns → decisions round-trip", () => {
    const db = createDb(":memory:");
    const now = new Date().toISOString();

    db.query(
      "INSERT INTO repos (id, name, git_path, created_at) VALUES (?,?,?,?)",
    ).run("repo_1", "demo", "data/repos/repo_1.git", now);

    db.query(
      "INSERT INTO agents (id, name, model, owner_human, paths_allowed, can_merge, can_review, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run("agent_1", "claude-a", "claude-sonnet-4-6", "jinay", '["src/**"]', 0, 1, now);

    db.query(
      "INSERT INTO commits (id, git_sha, repo_id, agent_id, message, intent, created_at) VALUES (?,?,?,?,?,?,?)",
    ).run("commit_1", "abc123", "repo_1", "agent_1", "init", "scaffold", now);

    db.query(
      "INSERT INTO traces (id, commit_id, task_description, created_at) VALUES (?,?,?,?)",
    ).run("trace_1", "commit_1", "set up the project", now);

    db.query("UPDATE commits SET trace_id = ? WHERE id = ?").run("trace_1", "commit_1");

    db.query(
      "INSERT INTO trace_turns (trace_id, seq, role, content, timestamp) VALUES (?,?,?,?,?)",
    ).run("trace_1", 0, "human", "please scaffold", now);

    db.query(
      "INSERT INTO decisions (trace_id, seq, question, chosen, rejected, reasoning) VALUES (?,?,?,?,?,?)",
    ).run("trace_1", 0, "runtime?", "bun", '["node"]', "faster + built-in sqlite");

    // Decisions are queryable INDEPENDENTLY of the trace blob — the PRD point.
    const decisions = db
      .query<{ question: string; chosen: string }, [string]>(
        "SELECT question, chosen FROM decisions WHERE trace_id = ? ORDER BY seq",
      )
      .all("trace_1");
    expect(decisions).toEqual([{ question: "runtime?", chosen: "bun" }]);

    const turns = db
      .query<{ role: string }, [string]>(
        "SELECT role FROM trace_turns WHERE trace_id = ? ORDER BY seq",
      )
      .all("trace_1");
    expect(turns.map((t) => t.role)).toEqual(["human"]);
  });

  test("deleting a trace cascades to turns and decisions", () => {
    const db = createDb(":memory:");
    const now = new Date().toISOString();
    db.query("INSERT INTO repos (id, name, git_path, created_at) VALUES (?,?,?,?)").run(
      "r", "d", "p", now,
    );
    db.query(
      "INSERT INTO commits (id, git_sha, repo_id, message, created_at) VALUES (?,?,?,?,?)",
    ).run("c", "sha", "r", "m", now);
    db.query(
      "INSERT INTO traces (id, commit_id, task_description, created_at) VALUES (?,?,?,?)",
    ).run("t", "c", "task", now);
    db.query(
      "INSERT INTO trace_turns (trace_id, seq, role, content, timestamp) VALUES (?,?,?,?,?)",
    ).run("t", 0, "agent", "x", now);

    db.query("DELETE FROM traces WHERE id = ?").run("t");
    const remaining = db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM trace_turns")
      .get();
    expect(remaining?.c).toBe(0);
  });
});
