import type { Database } from "bun:sqlite";
import { OrbitError } from "../errors.ts";
import { newRepoId } from "../ids.ts";
import { initRepo, repoGitDir } from "../git/index.ts";

// Repo metadata is not a frozen §4.1 type; this is the API's own shape.
export interface Repo {
  id: string;
  name: string;
  defaultBranch: string;
  createdAt: string;
}

interface RepoRow {
  id: string;
  name: string;
  default_branch: string;
  created_at: string;
}

function mapRepo(row: RepoRow): Repo {
  return {
    id: row.id,
    name: row.name,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
  };
}

export async function createRepo(
  db: Database,
  input: { name: string; defaultBranch?: string },
): Promise<Repo> {
  const id = newRepoId();
  const defaultBranch = input.defaultBranch ?? "main";
  // Provision the bare git repo before recording metadata.
  await initRepo(id, { defaultBranch });
  const createdAt = new Date().toISOString();
  db.query(
    "INSERT INTO repos (id, name, git_path, default_branch, created_at) VALUES (?,?,?,?,?)",
  ).run(id, input.name, repoGitDir(id), defaultBranch, createdAt);
  return { id, name: input.name, defaultBranch, createdAt };
}

export function getRepo(db: Database, id: string): Repo | null {
  const row = db
    .query<RepoRow, [string]>("SELECT * FROM repos WHERE id = ?")
    .get(id);
  return row ? mapRepo(row) : null;
}

export function requireRepo(db: Database, id: string): Repo {
  const repo = getRepo(db, id);
  if (!repo) throw OrbitError.notFound(`Repo "${id}" not found`);
  return repo;
}
