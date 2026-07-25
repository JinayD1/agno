import { describe, expect, test } from "bun:test";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";

const agent: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["**"], canMerge: true, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function clientWith(handler: (c: Captured) => Response): { client: OrbitRestClient; last: () => Captured } {
  let captured: Captured | undefined;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    captured = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
    };
    return handler(captured);
  }) as unknown as typeof fetch;

  return {
    client: new OrbitRestClient({ apiUrl: "http://a:4000/", agent, apiKey: "k1", fetchImpl: fakeFetch }),
    last: () => captured!,
  };
}

describe("OrbitRestClient identity + shaping", () => {
  test("carries Authorization and X-Orbit-Agent-Id on every call", async () => {
    const { client, last } = clientWith(() => new Response(JSON.stringify({ repoId: "r", ref: "main", nodes: [] }), { status: 200 }));
    await client.readTree("repo_demo", "main");
    const c = last();
    expect(c.headers.Authorization).toBe("Bearer k1");
    expect(c.headers["X-Orbit-Agent-Id"]).toBe("agent_dev1");
    expect(c.url).toBe("http://a:4000/api/repos/repo_demo/tree?ref=main");
  });

  test("omits empty query params", async () => {
    const { client, last } = clientWith(() => new Response(JSON.stringify({}), { status: 200 }));
    await client.readTree("repo_demo");
    expect(last().url).toBe("http://a:4000/api/repos/repo_demo/tree");
  });

  test("sends JSON body + Content-Type on writes", async () => {
    const { client, last } = clientWith(() => new Response(JSON.stringify({ id: "commit_1" }), { status: 201 }));
    await client.createCommit("repo_demo", { files: [{ path: "a.ts", content: "x" }], message: "m", intent: "why" });
    const c = last();
    expect(c.method).toBe("POST");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(c.body!).intent).toBe("why");
  });

  test("encodes path params", async () => {
    const { client, last } = clientWith(() => new Response(JSON.stringify({}), { status: 200 }));
    await client.getTrace("trace/with space");
    expect(last().url).toContain("/api/traces/trace%2Fwith%20space");
  });

  test("maps a scope-denied write to a typed OrbitError", async () => {
    const { client } = clientWith(
      () => new Response(JSON.stringify({ error: { code: "SCOPE_DENIED", message: "path not allowed" } }), { status: 403 }),
    );
    await expect(
      client.createCommit("repo_demo", { files: [{ path: "src/auth/x.ts", content: "" }], message: "m", intent: "i" }),
    ).rejects.toMatchObject({ code: "SCOPE_DENIED", httpStatus: 403 });
  });

  test("returns undefined for 204 (retract)", async () => {
    const { client } = clientWith(() => new Response(null, { status: 204 }));
    await expect(client.retractContext("ctx_1")).resolves.toBeUndefined();
  });
});
