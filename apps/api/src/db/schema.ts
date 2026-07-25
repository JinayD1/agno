/**
 * Relational schema for Orbit (PRD §5 "SQLite schema").
 *
 * Design notes:
 * - Traces are stored RELATIONALLY (traces + trace_turns + decisions), NOT as
 *   JSON blobs, so the UI can query decisions independently. This is an explicit
 *   PRD requirement.
 * - `commits.files_changed` and array-valued fields (parent_ids, paths_allowed,
 *   related_paths, decisions.rejected) are stored as JSON TEXT: they are read as
 *   whole objects with their parent row and never queried column-wise.
 * - Circular reference (commits.trace_id ⇄ traces.commit_id) is broken by NOT
 *   declaring a hard FK on commits.trace_id. traces.commit_id keeps the FK.
 *   Insert order: commit → trace → UPDATE commit.trace_id.
 */

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "init",
    sql: /* sql */ `
      CREATE TABLE repos (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        git_path       TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        created_at     TEXT NOT NULL
      );

      CREATE TABLE agents (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        model         TEXT NOT NULL,
        owner_human   TEXT NOT NULL,
        paths_allowed TEXT NOT NULL DEFAULT '[]', -- JSON string[]
        can_merge     INTEGER NOT NULL DEFAULT 0, -- 0/1
        can_review    INTEGER NOT NULL DEFAULT 0, -- 0/1
        created_at    TEXT NOT NULL
      );

      CREATE TABLE commits (
        id            TEXT PRIMARY KEY,
        git_sha       TEXT NOT NULL,
        repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        agent_id      TEXT REFERENCES agents(id),          -- null = human commit
        message       TEXT NOT NULL,
        intent        TEXT NOT NULL DEFAULT '',
        trace_id      TEXT,                                 -- soft ref to traces.id (cycle-break)
        parent_ids    TEXT NOT NULL DEFAULT '[]',           -- JSON string[]
        files_changed TEXT NOT NULL DEFAULT '[]',           -- JSON FileChange[]
        created_at    TEXT NOT NULL
      );
      CREATE INDEX idx_commits_repo ON commits(repo_id, created_at DESC);
      CREATE INDEX idx_commits_agent ON commits(agent_id);

      CREATE TABLE traces (
        id               TEXT PRIMARY KEY,
        commit_id        TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
        task_description TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );
      CREATE INDEX idx_traces_commit ON traces(commit_id);

      CREATE TABLE trace_turns (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id  TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
        seq       INTEGER NOT NULL,
        role      TEXT NOT NULL CHECK (role IN ('human','agent','tool')),
        content   TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX idx_trace_turns_trace ON trace_turns(trace_id, seq);

      CREATE TABLE decisions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id  TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
        seq       INTEGER NOT NULL,
        question  TEXT NOT NULL,
        chosen    TEXT NOT NULL,
        rejected  TEXT NOT NULL DEFAULT '[]', -- JSON string[]
        reasoning TEXT NOT NULL
      );
      CREATE INDEX idx_decisions_trace ON decisions(trace_id, seq);

      CREATE TABLE context_packets (
        id            TEXT PRIMARY KEY,
        repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        agent_id      TEXT NOT NULL REFERENCES agents(id),
        type          TEXT NOT NULL CHECK (type IN
                        ('constraint','failed_approach','open_thread','discovery','handoff')),
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        related_paths TEXT NOT NULL DEFAULT '[]', -- JSON string[]
        supersedes    TEXT REFERENCES context_packets(id),
        created_at    TEXT NOT NULL,
        expires_at    TEXT                         -- null = permanent
      );
      CREATE INDEX idx_context_repo_type ON context_packets(repo_id, type);

      CREATE TABLE sessions (
        id             TEXT PRIMARY KEY,
        agent_id       TEXT NOT NULL REFERENCES agents(id),
        repo_id        TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        status         TEXT NOT NULL CHECK (status IN ('active','idle','ended')),
        current_task   TEXT,
        last_heartbeat TEXT NOT NULL,
        started_at     TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_repo_status ON sessions(repo_id, status);
    `,
  },
];
