import type { Database } from "bun:sqlite";
import type { ContextPacket } from "@orbit/types";
import { OrbitError } from "../errors.ts";
import { newContextId } from "../ids.ts";
import { requireRepo } from "./repos.ts";
import { requireAgent } from "./agents.ts";

interface ContextRow {
  id: string;
  repo_id: string;
  agent_id: string;
  type: ContextPacket["type"];
  title: string;
  body: string;
  related_paths: string;
  supersedes: string | null;
  created_at: string;
  expires_at: string | null;
}

function mapPacket(row: ContextRow): ContextPacket {
  return {
    id: row.id,
    repoId: row.repo_id,
    agentId: row.agent_id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedPaths: JSON.parse(row.related_paths) as string[],
    supersedes: row.supersedes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function publishContext(
  db: Database,
  input: {
    repoId: string;
    agentId: string;
    type: ContextPacket["type"];
    title: string;
    body: string;
    relatedPaths?: string[];
    supersedes?: string | null;
    expiresAt?: string | null;
  },
): ContextPacket {
  requireRepo(db, input.repoId);
  requireAgent(db, input.agentId);
  const id = newContextId();
  const createdAt = new Date().toISOString();
  const relatedPaths = input.relatedPaths ?? [];
  db.query(
    `INSERT INTO context_packets (id, repo_id, agent_id, type, title, body, related_paths, supersedes, created_at, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.repoId,
    input.agentId,
    input.type,
    input.title,
    input.body,
    JSON.stringify(relatedPaths),
    input.supersedes ?? null,
    createdAt,
    input.expiresAt ?? null,
  );
  return {
    id,
    repoId: input.repoId,
    agentId: input.agentId,
    type: input.type,
    title: input.title,
    body: input.body,
    relatedPaths,
    supersedes: input.supersedes ?? null,
    createdAt,
    expiresAt: input.expiresAt ?? null,
  };
}

/**
 * Active (non-expired) packets for a repo, optionally filtered by `type` and by
 * a `path` that matches one of a packet's `relatedPaths` (prefix or exact).
 */
export function queryContext(
  db: Database,
  repoId: string,
  filter: { type?: ContextPacket["type"]; path?: string } = {},
): ContextPacket[] {
  requireRepo(db, repoId);
  const now = new Date().toISOString();
  const rows = filter.type
    ? db
        .query<ContextRow, [string, string]>(
          "SELECT * FROM context_packets WHERE repo_id = ? AND type = ? ORDER BY created_at DESC",
        )
        .all(repoId, filter.type)
    : db
        .query<ContextRow, [string]>(
          "SELECT * FROM context_packets WHERE repo_id = ? ORDER BY created_at DESC",
        )
        .all(repoId);

  return rows
    .map(mapPacket)
    .filter((p) => p.expiresAt === null || p.expiresAt > now)
    .filter((p) => {
      if (!filter.path) return true;
      return p.relatedPaths.some(
        (rp) => rp === filter.path || filter.path!.startsWith(rp) || rp.startsWith(filter.path!),
      );
    });
}

/** Retract (delete) a packet. Returns the repoId it belonged to (for eventing). */
export function retractContext(db: Database, id: string): { repoId: string } {
  const row = db
    .query<{ repo_id: string }, [string]>("SELECT repo_id FROM context_packets WHERE id = ?")
    .get(id);
  if (!row) throw OrbitError.notFound(`Context packet "${id}" not found`);
  db.query("DELETE FROM context_packets WHERE id = ?").run(id);
  return { repoId: row.repo_id };
}
