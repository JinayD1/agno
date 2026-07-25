import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyChange,
  getHeadSha,
  initRepo,
  readFile,
  readTree,
  repoExists,
} from "../src/git/index.ts";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "orbit-git-test-"));
  process.env.ORBIT_DATA_DIR = join(workDir, "repos");
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("git storage engine", () => {
  test("initRepo creates a bare repo (idempotent)", async () => {
    expect(repoExists("repo_a")).toBe(false);
    await initRepo("repo_a");
    expect(repoExists("repo_a")).toBe(true);
    await initRepo("repo_a"); // no throw on second call
    expect(await getHeadSha("repo_a")).toBeNull();
  });

  test("applyChange writes a real commit whose sha exists", async () => {
    await initRepo("repo_b");
    const res = await applyChange(
      "repo_b",
      [
        { path: "src/app.ts", content: "export const x = 1;\n" },
        { path: "README.md", content: "# demo\n" },
      ],
      "initial commit",
    );
    expect(res.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(res.parentSha).toBeNull();
    // the returned sha is a real commit object
    expect(await getHeadSha("repo_b")).toBe(res.gitSha);
  });

  test("filesChanged reports added paths with line counts", async () => {
    await initRepo("repo_c");
    const res = await applyChange(
      "repo_c",
      [{ path: "a.txt", content: "one\ntwo\nthree\n" }],
      "add a.txt",
    );
    const change = res.filesChanged.find((f) => f.path === "a.txt");
    expect(change?.changeType).toBe("added");
    expect(change?.additions).toBe(3);
    expect(change?.deletions).toBe(0);
  });

  test("second commit has the first as parent (modified changeType)", async () => {
    await initRepo("repo_d");
    const first = await applyChange("repo_d", [{ path: "a.txt", content: "one\n" }], "c1");
    const second = await applyChange(
      "repo_d",
      [{ path: "a.txt", content: "one\ntwo\n" }],
      "c2",
    );
    expect(second.parentSha).toBe(first.gitSha);
    const change = second.filesChanged.find((f) => f.path === "a.txt");
    expect(change?.changeType).toBe("modified");
    expect(change?.additions).toBe(1);
  });

  test("readTree lists committed files", async () => {
    await initRepo("repo_e");
    await applyChange(
      "repo_e",
      [
        { path: "src/a.ts", content: "a" },
        { path: "src/b.ts", content: "b" },
      ],
      "c1",
    );
    const tree = await readTree("repo_e");
    const paths = tree.filter((e) => e.type === "blob").map((e) => e.path).sort();
    expect(paths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("readFile returns exact content", async () => {
    await initRepo("repo_f");
    await applyChange("repo_f", [{ path: "hello.txt", content: "hi there\n" }], "c1");
    expect(await readFile("repo_f", "hello.txt")).toBe("hi there\n");
  });

  test("readFile throws NOT_FOUND for a missing path", async () => {
    await initRepo("repo_g");
    await applyChange("repo_g", [{ path: "x.txt", content: "x" }], "c1");
    expect(readFile("repo_g", "nope.txt")).rejects.toThrow(/not found/i);
  });

  test("operations on a missing repo throw NOT_FOUND", async () => {
    expect(readFile("ghost", "x.txt")).rejects.toThrow(/does not exist/i);
  });
});
