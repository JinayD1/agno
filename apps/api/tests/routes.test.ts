import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, setDbForTesting } from "../src/db/index.ts";
import { createApp } from "../src/index.ts";

let workDir: string;
const app = createApp();

async function req(method: string, path: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json };
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "orbit-routes-test-"));
  process.env.ORBIT_DATA_DIR = join(workDir, "repos");
  setDbForTesting(createDb(":memory:"));
});

afterAll(async () => {
  setDbForTesting(null);
  await rm(workDir, { recursive: true, force: true });
});

describe("repos + commits + traces (T2.1)", () => {
  test("full commit round-trip: POST commit → gitSha → GET commit returns trace", async () => {
    const repo = await req("POST", "/api/repos", { name: "demo" });
    expect(repo.status).toBe(201);
    const repoId = repo.json.id as string;

    const agent = await req("POST", "/api/agents", {
      name: "claude-a",
      model: "claude-sonnet-4-6",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["src/**"], canMerge: false, canReview: true },
    });
    const agentId = agent.json.id as string;

    const commit = await req("POST", `/api/repos/${repoId}/commits`, {
      agentId,
      message: "add login",
      intent: "implement login flow",
      files: [{ path: "src/login.ts", content: "export const login = () => {};\n" }],
      trace: {
        taskDescription: "build login",
        turns: [{ role: "human", content: "please add login", timestamp: new Date().toISOString() }],
        decisions: [
          { question: "lib?", chosen: "jose", rejected: ["jsonwebtoken"], reasoning: "ESM" },
        ],
      },
    });
    expect(commit.status).toBe(201);
    expect(commit.json.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.json.filesChanged[0].path).toBe("src/login.ts");

    const detail = await req("GET", `/api/commits/${commit.json.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.trace.taskDescription).toBe("build login");
    expect(detail.json.trace.turns).toHaveLength(1);
    expect(detail.json.trace.decisions[0].chosen).toBe("jose");

    const trace = await req("GET", `/api/traces/${detail.json.traceId}`);
    expect(trace.status).toBe(200);
    expect(trace.json.decisions[0].rejected).toEqual(["jsonwebtoken"]);
  });

  test("scope-denied write returns 403 SCOPE_DENIED", async () => {
    const repo = await req("POST", "/api/repos", { name: "scoped" });
    const agent = await req("POST", "/api/agents", {
      name: "narrow",
      model: "m",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["src/**"], canMerge: false, canReview: false },
    });
    const res = await req("POST", `/api/repos/${repo.json.id}/commits`, {
      agentId: agent.json.id,
      message: "touch secrets",
      intent: "nope",
      files: [{ path: "config/secret.env", content: "KEY=1" }],
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("SCOPE_DENIED");
  });

  test("agent commit without intent is rejected (INVALID_INPUT)", async () => {
    const repo = await req("POST", "/api/repos", { name: "noeffort" });
    const agent = await req("POST", "/api/agents", {
      name: "a",
      model: "m",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["**"], canMerge: false, canReview: false },
    });
    const res = await req("POST", `/api/repos/${repo.json.id}/commits`, {
      agentId: agent.json.id,
      message: "x",
      intent: "   ",
      files: [{ path: "a.txt", content: "a" }],
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("INVALID_INPUT");
  });

  test("tree + file + commit list", async () => {
    const repo = await req("POST", "/api/repos", { name: "browse" });
    const repoId = repo.json.id as string;
    await req("POST", `/api/repos/${repoId}/commits`, {
      message: "seed",
      intent: "",
      files: [
        { path: "src/a.ts", content: "a\n" },
        { path: "README.md", content: "# hi\n" },
      ],
    });
    const tree = await req("GET", `/api/repos/${repoId}/tree`);
    const paths = (tree.json.nodes as { path: string; type: string }[])
      .filter((e) => e.type === "file")
      .map((e) => e.path)
      .sort();
    expect(paths).toEqual(["README.md", "src/a.ts"]);

    const file = await req("GET", `/api/repos/${repoId}/file?path=src/a.ts`);
    expect(file.json.content).toBe("a\n");
    expect(file.json.size).toBe(Buffer.byteLength("a\n", "utf8"));

    const list = await req("GET", `/api/repos/${repoId}/commits`);
    expect(list.json.commits).toHaveLength(1);
  });
});

describe("agents (T2.2)", () => {
  test("register → get → patch scopes → reflects update", async () => {
    const created = await req("POST", "/api/agents", {
      name: "agent-x",
      model: "claude",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["src/**"], canMerge: false, canReview: false },
    });
    const id = created.json.id as string;

    const got = await req("GET", `/api/agents/${id}`);
    expect(got.json.scopes.pathsAllowed).toEqual(["src/**"]);

    const patched = await req("PATCH", `/api/agents/${id}/scopes`, {
      pathsAllowed: ["**"],
      canMerge: true,
      canReview: true,
    });
    expect(patched.json.scopes.canMerge).toBe(true);

    const reGot = await req("GET", `/api/agents/${id}`);
    expect(reGot.json.scopes.pathsAllowed).toEqual(["**"]);
    expect(reGot.json.scopes.canMerge).toBe(true);
  });

  test("invalid body → 400 INVALID_INPUT", async () => {
    const res = await req("POST", "/api/agents", { name: "missing-model" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("INVALID_INPUT");
  });

  test("unknown id → 404 NOT_FOUND", async () => {
    const res = await req("GET", "/api/agents/agent_does_not_exist");
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("NOT_FOUND");
  });
});

describe("context (T2.3)", () => {
  test("publish, filter by type and path, retract", async () => {
    const repo = await req("POST", "/api/repos", { name: "ctx" });
    const repoId = repo.json.id as string;
    const agent = await req("POST", "/api/agents", {
      name: "ctx-agent",
      model: "m",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["**"], canMerge: false, canReview: false },
    });
    const agentId = agent.json.id as string;

    await req("POST", "/api/context", {
      repoId,
      agentId,
      type: "failed_approach",
      title: "tried X",
      body: "X did not work",
      relatedPaths: ["src/auth/login.ts"],
    });
    await req("POST", "/api/context", {
      repoId,
      agentId,
      type: "constraint",
      title: "must be ESM",
      body: "no cjs",
      relatedPaths: ["src/index.ts"],
    });

    const all = await req("GET", `/api/repos/${repoId}/context`);
    expect(all.json.packets).toHaveLength(2);

    const byType = await req("GET", `/api/repos/${repoId}/context?type=failed_approach`);
    expect(byType.json.packets).toHaveLength(1);
    expect(byType.json.packets[0].title).toBe("tried X");

    const byPath = await req("GET", `/api/repos/${repoId}/context?path=src/auth/login.ts`);
    expect(byPath.json.packets).toHaveLength(1);
    expect(byPath.json.packets[0].type).toBe("failed_approach");

    const packetId = byType.json.packets[0].id as string;
    const del = await req("DELETE", `/api/context/${packetId}`);
    expect(del.status).toBe(204);
    const afterDelete = await req("GET", `/api/repos/${repoId}/context`);
    expect(afterDelete.json.packets).toHaveLength(1);
  });

  test("retracting a missing packet → 404", async () => {
    const res = await req("DELETE", "/api/context/ctx_missing");
    expect(res.status).toBe(404);
  });
});

describe("sessions (T2.3)", () => {
  test("start → heartbeat/update → list active → end", async () => {
    const repo = await req("POST", "/api/repos", { name: "sess" });
    const repoId = repo.json.id as string;
    const agent = await req("POST", "/api/agents", {
      name: "sess-agent",
      model: "m",
      ownerHuman: "jinay",
      scopes: { pathsAllowed: ["**"], canMerge: false, canReview: false },
    });

    const started = await req("POST", "/api/sessions", {
      agentId: agent.json.id,
      repoId,
      currentTask: "initial",
    });
    expect(started.status).toBe(201);
    const sessionId = started.json.id as string;
    const firstHeartbeat = started.json.lastHeartbeat as string;

    await Bun.sleep(5);
    const updated = await req("PATCH", `/api/sessions/${sessionId}`, {
      currentTask: "now doing this",
    });
    expect(updated.json.currentTask).toBe("now doing this");
    expect(updated.json.lastHeartbeat > firstHeartbeat).toBe(true);

    const active = await req("GET", `/api/repos/${repoId}/sessions`);
    expect(active.json.sessions).toHaveLength(1);

    await req("PATCH", `/api/sessions/${sessionId}`, { status: "ended" });
    const afterEnd = await req("GET", `/api/repos/${repoId}/sessions`);
    expect(afterEnd.json.sessions).toHaveLength(0);
  });
});
