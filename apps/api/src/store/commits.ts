import type { Database } from "bun:sqlite";
import type {
  ConversationTrace,
  CreateCommitInput,
  Decision,
  FileChange,
  OrbitCommit,
  TraceTurn,
} from "@orbit/types";
import { OrbitError } from "../errors.ts";
import { newCommitId, newTraceId } from "../ids.ts";
import { applyChange } from "../git/index.ts";
import { checkPaths } from "../scope/index.ts";
import { requireRepo } from "./repos.ts";
import { getAgent } from "./agents.ts";

interface CommitRow {
  id: string;
  git_sha: string;
  repo_id: string;
  agent_id: string | null;
  message: string;
  intent: string;
  trace_id: string | null;
  parent_ids: string;
  files_changed: string;
  created_at: string;
}

function mapCommit(row: CommitRow): OrbitCommit {
  return {
    id: row.id,
    gitSha: row.git_sha,
    repoId: row.repo_id,
    agentId: row.agent_id,
    message: row.message,
    intent: row.intent,
    traceId: row.trace_id,
    parentIds: JSON.parse(row.parent_ids) as string[],
    filesChanged: JSON.parse(row.files_changed) as FileChange[],
    createdAt: row.created_at,
  };
}

export interface OrbitCommitDetail extends OrbitCommit {
  trace: ConversationTrace | null;
}

/**
 * Create a commit: enforce scope (for agent commits), write the git commit via
 * the storage engine, persist the commit row, and attach a relational trace.
 */
export async function createCommit(
  db: Database,
  repoId: string,
  input: CreateCommitInput,
): Promise<OrbitCommit> {
  const repo = requireRepo(db, repoId);
  const agentId = input.agentId ?? null;

  if (!input.message?.trim()) {
    throw OrbitError.invalidInput("Commit message is required");
  }

  // Agent commits require a non-empty intent and must pass scope enforcement.
  if (agentId) {
    const agent = getAgent(db, agentId);
    if (!agent) throw OrbitError.notFound(`Agent "${agentId}" not found`);
    if (!input.intent?.trim()) {
      throw OrbitError.invalidInput("intent is required for agent commits");
    }
    const paths = input.files.map((f) => f.path);
    const scope = checkPaths(agent.scopes, paths);
    if (!scope.allowed) {
      throw OrbitError.scopeDenied(
        scope.reason ?? `Write to "${scope.deniedPath}" is outside agent scope`,
      );
    }
  }

  if (input.trace && !input.trace.taskDescription?.trim()) {
    throw OrbitError.invalidInput("trace.taskDescription is required when a trace is attached");
  }

  const { gitSha, parentSha, filesChanged } = await applyChange(
    repoId,
    input.files,
    input.message,
    { branch: repo.defaultBranch },
  );

  const commitId = newCommitId();
  const createdAt = new Date().toISOString();
  const parentIds = parentSha ? [parentSha] : [];

  const tx = db.transaction(() => {
    db.query(
      `INSERT INTO commits (id, git_sha, repo_id, agent_id, message, intent, trace_id, parent_ids, files_changed, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      commitId,
      gitSha,
      repoId,
      agentId,
      input.message,
      input.intent ?? "",
      null,
      JSON.stringify(parentIds),
      JSON.stringify(filesChanged),
      createdAt,
    );

    if (input.trace) {
      const traceId = newTraceId();
      db.query(
        "INSERT INTO traces (id, commit_id, task_description, created_at) VALUES (?,?,?,?)",
      ).run(traceId, commitId, input.trace.taskDescription, createdAt);

      input.trace.turns.forEach((turn, seq) => {
        db.query(
          "INSERT INTO trace_turns (trace_id, seq, role, content, timestamp) VALUES (?,?,?,?,?)",
        ).run(traceId, seq, turn.role, turn.content, turn.timestamp);
      });

      input.trace.decisions.forEach((d, seq) => {
        db.query(
          "INSERT INTO decisions (trace_id, seq, question, chosen, rejected, reasoning) VALUES (?,?,?,?,?,?)",
        ).run(traceId, seq, d.question, d.chosen, JSON.stringify(d.rejected), d.reasoning);
      });

      db.query("UPDATE commits SET trace_id = ? WHERE id = ?").run(traceId, commitId);
    }
  });
  tx();

  return mapCommit(
    db.query<CommitRow, [string]>("SELECT * FROM commits WHERE id = ?").get(commitId)!,
  );
}

export function listCommits(
  db: Database,
  repoId: string,
  opts: { limit?: number; offset?: number } = {},
): OrbitCommit[] {
  requireRepo(db, repoId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  return db
    .query<CommitRow, [string, number, number]>(
      "SELECT * FROM commits WHERE repo_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
    )
    .all(repoId, limit, offset)
    .map(mapCommit);
}

export function getCommitDetail(db: Database, id: string): OrbitCommitDetail {
  const row = db.query<CommitRow, [string]>("SELECT * FROM commits WHERE id = ?").get(id);
  if (!row) throw OrbitError.notFound(`Commit "${id}" not found`);
  const commit = mapCommit(row);
  const trace = commit.traceId ? getTrace(db, commit.traceId) : null;
  return { ...commit, trace };
}

export function getTrace(db: Database, id: string): ConversationTrace {
  const trace = db
    .query<{ id: string; commit_id: string; task_description: string; created_at: string }, [string]>(
      "SELECT * FROM traces WHERE id = ?",
    )
    .get(id);
  if (!trace) throw OrbitError.notFound(`Trace "${id}" not found`);

  const turns = db
    .query<{ role: TraceTurn["role"]; content: string; timestamp: string }, [string]>(
      "SELECT role, content, timestamp FROM trace_turns WHERE trace_id = ? ORDER BY seq",
    )
    .all(id)
    .map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp }));

  const decisions: Decision[] = db
    .query<{ question: string; chosen: string; rejected: string; reasoning: string }, [string]>(
      "SELECT question, chosen, rejected, reasoning FROM decisions WHERE trace_id = ? ORDER BY seq",
    )
    .all(id)
    .map((d) => ({
      question: d.question,
      chosen: d.chosen,
      rejected: JSON.parse(d.rejected) as string[],
      reasoning: d.reasoning,
    }));

  return {
    id: trace.id,
    commitId: trace.commit_id,
    taskDescription: trace.task_description,
    turns,
    decisions,
    createdAt: trace.created_at,
  };
}
