import type { Database } from "bun:sqlite";
import type { AgentIdentity, AgentScopes } from "@orbit/types";
import { OrbitError } from "../errors.ts";
import { newAgentId } from "../ids.ts";

interface AgentRow {
  id: string;
  name: string;
  model: string;
  owner_human: string;
  paths_allowed: string;
  can_merge: number;
  can_review: number;
  created_at: string;
}

function mapAgent(row: AgentRow): AgentIdentity {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    ownerHuman: row.owner_human,
    scopes: {
      pathsAllowed: JSON.parse(row.paths_allowed) as string[],
      canMerge: row.can_merge === 1,
      canReview: row.can_review === 1,
    },
    createdAt: row.created_at,
  };
}

export function createAgent(
  db: Database,
  input: { name: string; model: string; ownerHuman: string; scopes: AgentScopes },
): AgentIdentity {
  const id = newAgentId();
  const createdAt = new Date().toISOString();
  db.query(
    `INSERT INTO agents (id, name, model, owner_human, paths_allowed, can_merge, can_review, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.name,
    input.model,
    input.ownerHuman,
    JSON.stringify(input.scopes.pathsAllowed),
    input.scopes.canMerge ? 1 : 0,
    input.scopes.canReview ? 1 : 0,
    createdAt,
  );
  return {
    id,
    name: input.name,
    model: input.model,
    ownerHuman: input.ownerHuman,
    scopes: input.scopes,
    createdAt,
  };
}

export function getAgent(db: Database, id: string): AgentIdentity | null {
  const row = db.query<AgentRow, [string]>("SELECT * FROM agents WHERE id = ?").get(id);
  return row ? mapAgent(row) : null;
}

export function requireAgent(db: Database, id: string): AgentIdentity {
  const agent = getAgent(db, id);
  if (!agent) throw OrbitError.notFound(`Agent "${id}" not found`);
  return agent;
}

export function updateScopes(
  db: Database,
  id: string,
  scopes: AgentScopes,
): AgentIdentity {
  requireAgent(db, id);
  db.query(
    "UPDATE agents SET paths_allowed = ?, can_merge = ?, can_review = ? WHERE id = ?",
  ).run(
    JSON.stringify(scopes.pathsAllowed),
    scopes.canMerge ? 1 : 0,
    scopes.canReview ? 1 : 0,
    id,
  );
  return requireAgent(db, id);
}
