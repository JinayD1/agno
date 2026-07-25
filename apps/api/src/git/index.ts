import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { CommitFileInput, FileChange } from "@orbit/types";
import { OrbitError } from "../errors.ts";

/**
 * Git storage engine (PRD §5). The ONLY module that touches git. Every Orbit
 * repo is a bare repository at `<dataDir>/<repoId>.git`. Commits are applied
 * with plumbing (hash-object → update-index → write-tree → commit-tree →
 * update-ref) so we never need a working tree or checkout.
 *
 * The public surface is intentionally small — the route layer composes these:
 *   initRepo, repoExists, applyChange, readTree, readFile, getHeadSha.
 */

export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const FILE_MODE = "100644";

export interface GitAuthor {
  name: string;
  email: string;
}

const DEFAULT_AUTHOR: GitAuthor = { name: "Orbit", email: "orbit@local" };

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface ApplyChangeOptions {
  branch?: string;
  author?: GitAuthor;
  /** Paths to delete in this change (relative repo paths). */
  deletePaths?: string[];
}

export interface ApplyChangeResult {
  gitSha: string;
  parentSha: string | null;
  filesChanged: FileChange[];
}

function dataDir(): string {
  return resolve(process.env.ORBIT_DATA_DIR ?? "data/repos");
}

export function repoGitDir(repoId: string): string {
  return join(dataDir(), `${repoId}.git`);
}

export function repoExists(repoId: string): boolean {
  return existsSync(repoGitDir(repoId));
}

interface GitRunOptions {
  stdin?: string | Uint8Array;
  env?: Record<string, string>;
  allowFail?: boolean;
}

interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function git(gitDir: string, args: string[], opts: GitRunOptions = {}): Promise<GitResult> {
  const proc = Bun.spawn(["git", "--git-dir", gitDir, ...args], {
    stdin: opts.stdin ? Buffer.from(opts.stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts.env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0 && !opts.allowFail) {
    throw OrbitError.internal(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return { stdout, stderr, exitCode };
}

/** Create a bare repo for `repoId` (idempotent). Returns its git dir + branch. */
export async function initRepo(
  repoId: string,
  opts: { defaultBranch?: string } = {},
): Promise<{ gitDir: string; defaultBranch: string }> {
  const gitDir = repoGitDir(repoId);
  const defaultBranch = opts.defaultBranch ?? "main";
  if (!existsSync(gitDir)) {
    await mkdir(dataDir(), { recursive: true });
    const proc = Bun.spawn(
      ["git", "init", "--bare", `--initial-branch=${defaultBranch}`, gitDir],
      { stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw OrbitError.internal(`git init --bare failed: ${err.trim()}`);
    }
  }
  return { gitDir, defaultBranch };
}

function assertRepo(repoId: string): string {
  if (!repoExists(repoId)) {
    throw OrbitError.notFound(`Repo "${repoId}" does not exist`);
  }
  return repoGitDir(repoId);
}

/** Resolve a branch tip to a commit sha, or null if the branch has no commits. */
export async function getHeadSha(repoId: string, branch = "main"): Promise<string | null> {
  const gitDir = assertRepo(repoId);
  const res = await git(gitDir, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFail: true,
  });
  const sha = res.stdout.trim();
  return sha.length > 0 ? sha : null;
}

/**
 * Apply a set of file writes/deletes as a single commit on top of `branch`.
 * Returns the new commit sha and a structured diff (FileChange[]).
 */
export async function applyChange(
  repoId: string,
  files: CommitFileInput[],
  message: string,
  opts: ApplyChangeOptions = {},
): Promise<ApplyChangeResult> {
  const gitDir = assertRepo(repoId);
  const branch = opts.branch ?? "main";
  const author = opts.author ?? DEFAULT_AUTHOR;
  const parentSha = await getHeadSha(repoId, branch);

  // Use an isolated temp index so concurrent commits never clobber each other.
  const indexFile = join(tmpdir(), `orbit-index-${repoId}-${crypto.randomUUID()}`);
  const env = { GIT_INDEX_FILE: indexFile };

  try {
    // Seed the index from the parent tree (skip for the first commit).
    if (parentSha) {
      await git(gitDir, ["read-tree", parentSha], { env });
    }

    for (const file of files) {
      const blob = await git(gitDir, ["hash-object", "-w", "--stdin"], {
        stdin: file.content,
      });
      const blobSha = blob.stdout.trim();
      await git(
        gitDir,
        ["update-index", "--add", "--cacheinfo", `${FILE_MODE},${blobSha},${file.path}`],
        { env },
      );
    }

    for (const path of opts.deletePaths ?? []) {
      await git(gitDir, ["update-index", "--force-remove", path], { env });
    }

    const treeSha = (await git(gitDir, ["write-tree"], { env })).stdout.trim();

    const commitArgs = ["commit-tree", treeSha, "-m", message];
    if (parentSha) commitArgs.push("-p", parentSha);
    const commitSha = (
      await git(gitDir, commitArgs, {
        env: {
          ...env,
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email,
        },
      })
    ).stdout.trim();

    await git(gitDir, ["update-ref", `refs/heads/${branch}`, commitSha]);

    const filesChanged = await diffStat(gitDir, parentSha ?? EMPTY_TREE_SHA, commitSha);
    return { gitSha: commitSha, parentSha, filesChanged };
  } finally {
    await Bun.file(indexFile)
      .exists()
      .then((e) => (e ? Bun.$`rm -f ${indexFile}`.quiet() : null))
      .catch(() => {});
  }
}

const CHANGE_TYPE: Record<string, FileChange["changeType"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "added",
};

/** Compute a structured diff between two tree-ish refs. */
async function diffStat(gitDir: string, base: string, head: string): Promise<FileChange[]> {
  const numstat = (
    await git(gitDir, ["diff", "--numstat", "--find-renames", base, head])
  ).stdout;
  const nameStatus = (
    await git(gitDir, ["diff", "--name-status", "--find-renames", base, head])
  ).stdout;

  const churn = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [addRaw, delRaw, ...pathParts] = line.split("\t");
    // For renames numstat shows the destination as the last tab field.
    const path = pathParts[pathParts.length - 1]!;
    churn.set(path, {
      additions: addRaw === "-" ? 0 : Number(addRaw),
      deletions: delRaw === "-" ? 0 : Number(delRaw),
    });
  }

  const changes: FileChange[] = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const statusCode = parts[0]![0]!;
    const path = parts[parts.length - 1]!;
    const stat = churn.get(path) ?? { additions: 0, deletions: 0 };
    changes.push({
      path,
      changeType: CHANGE_TYPE[statusCode] ?? "modified",
      additions: stat.additions,
      deletions: stat.deletions,
    });
  }
  return changes;
}

/** List all entries (files + dirs) in the tree at `ref` (default: main tip). */
export async function readTree(repoId: string, ref = "main"): Promise<TreeEntry[]> {
  const gitDir = assertRepo(repoId);
  const resolved = await resolveRef(gitDir, ref);
  if (!resolved) return [];
  const out = (await git(gitDir, ["ls-tree", "-r", "-t", resolved])).stdout;
  const entries: TreeEntry[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // format: "<mode> <type> <sha>\t<path>"
    const [meta, path] = line.split("\t");
    const [, type, sha] = meta!.split(/\s+/);
    entries.push({ path: path!, type: type === "tree" ? "tree" : "blob", sha: sha! });
  }
  return entries;
}

/** Read a file's contents at `ref`. Throws NOT_FOUND if the path is absent. */
export async function readFile(repoId: string, path: string, ref = "main"): Promise<string> {
  const gitDir = assertRepo(repoId);
  const resolved = await resolveRef(gitDir, ref);
  if (!resolved) throw OrbitError.notFound(`Ref "${ref}" not found in repo "${repoId}"`);
  const res = await git(gitDir, ["cat-file", "-p", `${resolved}:${path}`], {
    allowFail: true,
  });
  if (res.exitCode !== 0) {
    throw OrbitError.notFound(`File "${path}" not found at ref "${ref}"`);
  }
  return res.stdout;
}

/** Resolve a ref/branch/sha to a concrete sha, or null if it doesn't exist. */
async function resolveRef(gitDir: string, ref: string): Promise<string | null> {
  const direct = await git(gitDir, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    allowFail: true,
  });
  if (direct.stdout.trim()) return direct.stdout.trim();
  const asBranch = await git(
    gitDir,
    ["rev-parse", "--verify", "--quiet", `refs/heads/${ref}^{commit}`],
    { allowFail: true },
  );
  return asBranch.stdout.trim() || null;
}
