import { Glob } from "bun";
import type { AgentScopes } from "@orbit/types";

/**
 * Scope enforcement — the single source of truth for "may this agent do this?"
 * (PRD §5). Glob bugs here are "security theater," so the semantics are explicit
 * and every branch is covered by tests.
 *
 * Path matching is ORDERED, gitignore-style: patterns are evaluated top to
 * bottom and the LAST matching pattern wins. A leading "!" negates.
 *
 *   ["src/**", "!src/auth/**"]
 *     src/app.ts      → allowed (matches src/**)
 *     src/auth/x.ts   → denied  (later !src/auth/** overrides)
 *
 * An empty allowlist denies everything. Any path that escapes the repo root
 * (absolute, or containing a ".." segment) is denied outright, before globbing.
 */

export interface ScopeCheckResult {
  allowed: boolean;
  /** First path that caused a denial (for actionable error messages). */
  deniedPath?: string;
  reason?: string;
}

const ALLOWED: ScopeCheckResult = { allowed: true };

/** Reject absolute paths and any traversal outside the repo root. */
function isSafeRelPath(path: string): boolean {
  if (path.length === 0) return false;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  return !segments.some((seg) => seg === ".." || seg === "");
}

/**
 * Does `path` match the ordered allow/deny pattern list? Last match wins.
 * Assumes `path` is already validated as a safe relative path.
 */
export function isPathAllowed(pathsAllowed: string[], path: string): boolean {
  const target = path.replace(/\\/g, "/");
  let allowed = false;
  for (const raw of pathsAllowed) {
    const negate = raw.startsWith("!");
    const pattern = negate ? raw.slice(1) : raw;
    if (new Glob(pattern).match(target)) {
      allowed = !negate;
    }
  }
  return allowed;
}

/** Check that every path in `paths` is writable under `scopes`. */
export function checkPaths(scopes: AgentScopes, paths: string[]): ScopeCheckResult {
  for (const path of paths) {
    if (!isSafeRelPath(path)) {
      return {
        allowed: false,
        deniedPath: path,
        reason: `Path is not a safe repo-relative path: "${path}"`,
      };
    }
    if (!isPathAllowed(scopes.pathsAllowed, path)) {
      return {
        allowed: false,
        deniedPath: path,
        reason: `Path "${path}" is outside the agent's allowed scope`,
      };
    }
  }
  return ALLOWED;
}

export function checkMerge(scopes: AgentScopes): ScopeCheckResult {
  return scopes.canMerge
    ? ALLOWED
    : { allowed: false, reason: "Agent does not have merge permission" };
}

export function checkReview(scopes: AgentScopes): ScopeCheckResult {
  return scopes.canReview
    ? ALLOWED
    : { allowed: false, reason: "Agent does not have review permission" };
}
