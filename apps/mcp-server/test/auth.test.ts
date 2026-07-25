import { describe, expect, test } from "bun:test";
import type { AgentIdentity } from "@orbit/types";
import { createAuthProvider, extractBearer } from "../src/auth.js";
import { OrbitError } from "../src/errors.js";
import type { OrbitMcpConfig } from "../src/config.js";

const agent1: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["src/**"], canMerge: false, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function cfg(overrides: Partial<OrbitMcpConfig>): OrbitMcpConfig {
  return {
    transport: "http",
    apiUrl: "http://a:4000",
    repoId: "repo_demo",
    apiKey: null,
    keysFile: null,
    keysInline: null,
    sessionHeartbeatMs: 30_000,
    http: { port: 8787, path: "/mcp", corsOrigins: [] },
    ...overrides,
  };
}

describe("extractBearer", () => {
  test("parses a bearer token case-insensitively", () => {
    expect(extractBearer("Bearer abc")).toBe("abc");
    expect(extractBearer("bearer  xyz ")).toBe("xyz");
  });
  test("returns null for missing/malformed headers", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer("Bearer ")).toBeNull();
  });
});

describe("auth: inline (offline) registry", () => {
  const inline = JSON.stringify({ keys: { k1: { agentId: "agent_dev1", agent: agent1 } } });

  test("resolves an inline agent without touching A", async () => {
    const failFetch = (() => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    const auth = createAuthProvider(cfg({ keysInline: inline }), failFetch);
    const resolved = await auth.authenticate("k1");
    expect(resolved.id).toBe("agent_dev1");
  });

  test("rejects an unknown key as SCOPE_DENIED", async () => {
    const auth = createAuthProvider(cfg({ keysInline: inline }));
    await expect(auth.authenticate("nope")).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });
});

describe("auth: hydrate from A", () => {
  test("fetches the identity when only agentId is registered", async () => {
    let calledUrl = "";
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calledUrl = String(url);
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer k2");
      return new Response(JSON.stringify(agent1), { status: 200 });
    }) as unknown as typeof fetch;

    const auth = createAuthProvider(cfg({ keysInline: JSON.stringify({ keys: { k2: { agentId: "agent_dev1" } } }) }), fakeFetch);
    const resolved = await auth.authenticate("k2");
    expect(resolved.name).toBe("claude-code-dev-1");
    expect(calledUrl).toContain("/api/agents/agent_dev1");
  });

  test("maps A's 404 to a SCOPE_DENIED auth error", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "no agent" } }), { status: 404 })) as unknown as typeof fetch;
    const auth = createAuthProvider(cfg({ keysInline: JSON.stringify({ keys: { k3: { agentId: "ghost" } } }) }), fakeFetch);
    await expect(auth.authenticate("k3")).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  test("rejects a registry whose resolved id disagrees with the entry", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify(agent1), { status: 200 })) as unknown as typeof fetch;
    const auth = createAuthProvider(cfg({ keysInline: JSON.stringify({ keys: { k4: { agentId: "different" } } }) }), fakeFetch);
    await expect(auth.authenticate("k4")).rejects.toBeInstanceOf(OrbitError);
  });
});
