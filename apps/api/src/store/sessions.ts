import type { Database } from "bun:sqlite";
import type { AgentSession } from "@orbit/types";
import { OrbitError } from "../errors.ts";
import { newSessionId } from "../ids.ts";
import { requireRepo } from "./repos.ts";
import { requireAgent } from "./agents.ts";

interface SessionRow {
  id: string;
  agent_id: string;
  repo_id: string;
  status: AgentSession["status"];
  current_task: string | null;
  last_heartbeat: string;
  started_at: string;
}

function mapSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    agentId: row.agent_id,
    repoId: row.repo_id,
    status: row.status,
    currentTask: row.current_task,
    lastHeartbeat: row.last_heartbeat,
    startedAt: row.started_at,
  };
}

export function startSession(
  db: Database,
  input: { agentId: string; repoId: string; currentTask?: string | null },
): AgentSession {
  requireRepo(db, input.repoId);
  requireAgent(db, input.agentId);
  const id = newSessionId();
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO sessions (id, agent_id, repo_id, status, current_task, last_heartbeat, started_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(id, input.agentId, input.repoId, "active", input.currentTask ?? null, now, now);
  return {
    id,
    agentId: input.agentId,
    repoId: input.repoId,
    status: "active",
    currentTask: input.currentTask ?? null,
    lastHeartbeat: now,
    startedAt: now,
  };
}

/**
 * PATCH a session: always bumps `lastHeartbeat`; optionally updates status
 * (e.g. "ended") and/or currentTask. Covers heartbeat, task update, and end.
 */
export function updateSession(
  db: Database,
  id: string,
  patch: { status?: AgentSession["status"]; currentTask?: string | null },
): AgentSession {
  const existing = db
    .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?")
    .get(id);
  if (!existing) throw OrbitError.notFound(`Session "${id}" not found`);

  const status = patch.status ?? existing.status;
  const currentTask =
    patch.currentTask !== undefined ? patch.currentTask : existing.current_task;
  const now = new Date().toISOString();

  db.query(
    "UPDATE sessions SET status = ?, current_task = ?, last_heartbeat = ? WHERE id = ?",
  ).run(status, currentTask, now, id);

  return mapSession(
    db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(id)!,
  );
}

/** Active sessions (status != "ended") for a repo. */
export function listActiveSessions(db: Database, repoId: string): AgentSession[] {
  requireRepo(db, repoId);
  return db
    .query<SessionRow, [string]>(
      "SELECT * FROM sessions WHERE repo_id = ? AND status != 'ended' ORDER BY last_heartbeat DESC",
    )
    .all(repoId)
    .map(mapSession);
}
