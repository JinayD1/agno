import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrbitEvent, OrbitEventType } from "@orbit/types";
import { createDb, setDbForTesting } from "../src/db/index.ts";
import { bus } from "../src/events/index.ts";
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
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function setup() {
  const repo = await req("POST", "/api/repos", { name: "sse" });
  const agent = await req("POST", "/api/agents", {
    name: "a",
    model: "m",
    ownerHuman: "j",
    scopes: { pathsAllowed: ["src/**"], canMerge: false, canReview: false },
  });
  return { repoId: repo.json.id as string, agentId: agent.json.id as string };
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "orbit-sse-test-"));
  process.env.ORBIT_DATA_DIR = join(workDir, "repos");
  setDbForTesting(createDb(":memory:"));
});

afterAll(async () => {
  setDbForTesting(null);
  await rm(workDir, { recursive: true, force: true });
});

describe("mutations emit OrbitEvents onto the bus", () => {
  test("every mutation type fans out with the right event", async () => {
    const { repoId, agentId } = await setup();
    const seen: OrbitEventType[] = [];
    const sub = bus.subscribe(repoId, (e: OrbitEvent) => seen.push(e.type));

    await req("POST", `/api/repos/${repoId}/commits`, {
      agentId,
      message: "add x",
      intent: "demo",
      files: [{ path: "src/x.ts", content: "export const x = 1;\n" }],
    });

    const packet = await req("POST", "/api/context", {
      repoId,
      agentId,
      type: "discovery",
      title: "found something",
      body: "note",
      relatedPaths: ["src/x.ts"],
    });
    await req("DELETE", `/api/context/${packet.json.id}`);

    const session = await req("POST", "/api/sessions", { agentId, repoId });
    await req("PATCH", `/api/sessions/${session.json.id}`, { currentTask: "working" });
    await req("PATCH", `/api/sessions/${session.json.id}`, { status: "ended" });

    sub.unsubscribe();

    expect(seen).toEqual([
      "commit.created",
      "context.published",
      "context.retracted",
      "session.started",
      "session.updated",
      "session.ended",
    ]);
  });

  test("events are scoped to their repo", async () => {
    const a = await setup();
    const b = await setup();
    const seenB: OrbitEventType[] = [];
    const sub = bus.subscribe(b.repoId, (e) => seenB.push(e.type));

    await req("POST", `/api/repos/${a.repoId}/commits`, {
      agentId: a.agentId,
      message: "in A",
      intent: "demo",
      files: [{ path: "src/only-a.ts", content: "1" }],
    });

    sub.unsubscribe();
    expect(seenB).toHaveLength(0);
  });
});

describe("GET /api/repos/:id/events (SSE)", () => {
  test("streams a commit.created frame after a commit", async () => {
    const { repoId, agentId } = await setup();
    const controller = new AbortController();
    const res = await app.handle(
      new Request(`http://localhost/api/repos/${repoId}/events`, { signal: controller.signal }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Fire a commit shortly after the stream has subscribed.
    const commit = (async () => {
      await Bun.sleep(20);
      await req("POST", `/api/repos/${repoId}/commits`, {
        agentId,
        message: "stream me",
        intent: "demo",
        files: [{ path: "src/stream.ts", content: "export const s = 1;\n" }],
      });
    })();

    let buffer = "";
    let sawCommit = false;
    const started = performance.now();
    while (performance.now() - started < 2000) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      if (buffer.includes("event: commit.created")) {
        sawCommit = true;
        break;
      }
    }
    controller.abort();
    await commit.catch(() => {});
    await reader.cancel().catch(() => {});

    expect(sawCommit).toBe(true);
    expect(buffer).toContain(": connected"); // initial comment frame
    expect(buffer).toContain('"gitSha"'); // payload is the OrbitCommit
  });

  test("returns 404 for a stream on an unknown repo", async () => {
    const res = await app.handle(new Request("http://localhost/api/repos/repo_missing/events"));
    expect(res.status).toBe(404);
  });
});
