import { describe, expect, test } from "bun:test";
import type { AgentScopes } from "@orbit/types";
import {
  checkMerge,
  checkPaths,
  checkReview,
  isPathAllowed,
} from "../src/scope/index.ts";

function scopes(partial: Partial<AgentScopes>): AgentScopes {
  return { pathsAllowed: [], canMerge: false, canReview: false, ...partial };
}

describe("isPathAllowed (ordered, last-match-wins)", () => {
  test("simple positive glob matches nested files", () => {
    expect(isPathAllowed(["src/**"], "src/app.ts")).toBe(true);
    expect(isPathAllowed(["src/**"], "src/a/b/c.ts")).toBe(true);
  });

  test("path outside the allowlist is denied", () => {
    expect(isPathAllowed(["src/**"], "README.md")).toBe(false);
    expect(isPathAllowed(["src/**"], "test/app.ts")).toBe(false);
  });

  test("negation overrides an earlier positive match", () => {
    const allow = ["src/**", "!src/auth/**"];
    expect(isPathAllowed(allow, "src/app.ts")).toBe(true);
    expect(isPathAllowed(allow, "src/auth/login.ts")).toBe(false);
  });

  test("later positive can re-include a negated subtree", () => {
    const allow = ["src/**", "!src/auth/**", "src/auth/public.ts"];
    expect(isPathAllowed(allow, "src/auth/login.ts")).toBe(false);
    expect(isPathAllowed(allow, "src/auth/public.ts")).toBe(true);
  });

  test("empty allowlist denies everything", () => {
    expect(isPathAllowed([], "src/app.ts")).toBe(false);
  });
});

describe("checkPaths", () => {
  test("allows when every path is in scope", () => {
    const res = checkPaths(scopes({ pathsAllowed: ["src/**"] }), [
      "src/a.ts",
      "src/b/c.ts",
    ]);
    expect(res.allowed).toBe(true);
  });

  test("denies and reports the first offending path", () => {
    const res = checkPaths(scopes({ pathsAllowed: ["src/**"] }), [
      "src/a.ts",
      "config/secret.env",
    ]);
    expect(res.allowed).toBe(false);
    expect(res.deniedPath).toBe("config/secret.env");
  });

  test("rejects path traversal even if a glob would match", () => {
    const res = checkPaths(scopes({ pathsAllowed: ["**"] }), ["../../etc/passwd"]);
    expect(res.allowed).toBe(false);
    expect(res.deniedPath).toBe("../../etc/passwd");
  });

  test("rejects absolute paths", () => {
    const res = checkPaths(scopes({ pathsAllowed: ["**"] }), ["/etc/passwd"]);
    expect(res.allowed).toBe(false);
  });

  test("empty allowlist denies all writes", () => {
    expect(checkPaths(scopes({}), ["anything.ts"]).allowed).toBe(false);
  });
});

describe("checkMerge / checkReview", () => {
  test("merge denied when canMerge is false", () => {
    expect(checkMerge(scopes({ canMerge: false })).allowed).toBe(false);
    expect(checkMerge(scopes({ canMerge: true })).allowed).toBe(true);
  });

  test("review denied when canReview is false", () => {
    expect(checkReview(scopes({ canReview: false })).allowed).toBe(false);
    expect(checkReview(scopes({ canReview: true })).allowed).toBe(true);
  });
});
