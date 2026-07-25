import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";
import { SessionManager } from "../src/session.js";
import { registerSessionTools } from "../src/tools/session.js";
import type { ToolContext } from "../src/tools/context.js";

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
  body?: string;
}

function clientWith(handler: (c: Captured) => Response): { rest: OrbitRestClient; last: () => Captured } {
  let captured: Captured | undefined;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    captured = { url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined };
    return handler(captured);
  }) as unknown as typeof fetch;

  return {
    rest: new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: fakeFetch }),
    last: () => captured!,
  };
}

const sampleSession = {
  id: "session_1",
  agentId: "agent_dev1",
  repoId: "repo_demo",
  status: "active",
  currentTask: null,
  lastHeartbeat: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:00.000Z",
};

describe("SessionManager — lifecycle", () => {
  test("start() POSTs /sessions and stores the session id", async () => {
    const { rest, last } = clientWith(() => new Response(JSON.stringify(sampleSession), { status: 201 }));
    const mgr = new SessionManager({ rest, repoId: "repo_demo" });
    await mgr.start();
    expect(last().method).toBe("POST");
    expect(last().url).toBe("http://a:4000/api/sessions");
    expect(JSON.parse(last().body!)).toMatchObject({ repoId: "repo_demo", currentTask: null });
    expect(mgr.id).toBe("session_1");
    await mgr.end();
  });

  test("start() is a no-op when no repoId is bound to the connection", async () => {
    const { rest } = clientWith(() => new Response(JSON.stringify(sampleSession), { status: 201 }));
    const mgr = new SessionManager({ rest, repoId: null });
    await mgr.start();
    expect(mgr.id).toBeNull();
  });

  test("start() failure is swallowed — doesn't throw, leaves id null", async () => {
    const { rest } = clientWith(() => new Response(JSON.stringify({ error: { code: "INTERNAL", message: "down" } }), { status: 500 }));
    const mgr = new SessionManager({ rest, repoId: "repo_demo" });
    await expect(mgr.start()).resolves.toBeUndefined();
    expect(mgr.id).toBeNull();
  });

  test("updateTask() PATCHes /sessions/:id with the new task", async () => {
    const { rest, last } = clientWith((c) =>
      c.method === "POST"
        ? new Response(JSON.stringify(sampleSession), { status: 201 })
        : new Response(JSON.stringify({ ...sampleSession, currentTask: "refactor auth" }), { status: 200 }),
    );
    const mgr = new SessionManager({ rest, repoId: "repo_demo" });
    await mgr.start();
    const updated = await mgr.updateTask("refactor auth");
    expect(last().method).toBe("PATCH");
    expect(last().url).toBe("http://a:4000/api/sessions/session_1");
    expect(JSON.parse(last().body!)).toMatchObject({ currentTask: "refactor auth", status: "active" });
    expect(updated.currentTask).toBe("refactor auth");
    await mgr.end();
  });

  test("updateTask() before a session exists throws a CONFLICT OrbitError", async () => {
    const { rest } = clientWith(() => new Response(JSON.stringify(sampleSession), { status: 200 }));
    const mgr = new SessionManager({ rest, repoId: null }); // never starts (no repo)
    await expect(mgr.updateTask("x")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("end() PATCHes status=ended and clears the id", async () => {
    const { rest, last } = clientWith((c) =>
      c.method === "POST"
        ? new Response(JSON.stringify(sampleSession), { status: 201 })
        : new Response(JSON.stringify({ ...sampleSession, status: "ended" }), { status: 200 }),
    );
    const mgr = new SessionManager({ rest, repoId: "repo_demo" });
    await mgr.start();
    await mgr.end();
    expect(last().method).toBe("PATCH");
    expect(JSON.parse(last().body!)).toMatchObject({ status: "ended" });
    expect(mgr.id).toBeNull();
  });

  test("end() before start() is a no-op", async () => {
    const { rest } = clientWith(() => new Response(JSON.stringify(sampleSession), { status: 200 }));
    const mgr = new SessionManager({ rest, repoId: "repo_demo" });
    await expect(mgr.end()).resolves.toBeUndefined();
  });

  test("heartbeat fires on the configured interval and PATCHes status=active", async () => {
    let patchCount = 0;
    const { rest } = clientWith((c) => {
      if (c.method === "POST") return new Response(JSON.stringify(sampleSession), { status: 201 });
      patchCount++;
      return new Response(JSON.stringify(sampleSession), { status: 200 });
    });
    const mgr = new SessionManager({ rest, repoId: "repo_demo", heartbeatMs: 10 });
    await mgr.start();
    await new Promise((resolve) => setTimeout(resolve, 35));
    await mgr.end();
    expect(patchCount).toBeGreaterThanOrEqual(2);
  });
});

/** Boot a real MCP client<->server pair (in-memory transport) around the session tools. */
async function harness(opts: { fetchImpl: typeof fetch }): Promise<{
  client: Client;
  session: SessionManager;
  close: () => Promise<void>;
}> {
  const rest = new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: opts.fetchImpl });
  const session = new SessionManager({ rest, repoId: "repo_demo" });
  const ctx: ToolContext = { agent, rest, repoId: "repo_demo", session };

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerSessionTools(server, ctx);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    session,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("orbit_session_update — tool wrapper", () => {
  test("declares input/output schemas", async () => {
    const { client, close } = await harness({
      fetchImpl: (async () => new Response(JSON.stringify(sampleSession), { status: 201 })) as unknown as typeof fetch,
    });
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "orbit_session_update");
      expect(tool?.inputSchema).toBeTruthy();
      expect(tool?.outputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  test("reports currentTask via the connection's registered session", async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") return new Response(JSON.stringify(sampleSession), { status: 201 });
      return new Response(JSON.stringify({ ...sampleSession, currentTask: "writing tests" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, session, close } = await harness({ fetchImpl });
    try {
      await session.start(); // simulate the connect-time registration server.ts triggers
      const res = await client.callTool({ name: "orbit_session_update", arguments: { currentTask: "writing tests" } });
      expect(res.isError).not.toBe(true);
      expect(res.structuredContent).toMatchObject({ currentTask: "writing tests" });
    } finally {
      await close();
    }
  });

  test("surfaces CONFLICT as a clean tool error when no session is registered yet", async () => {
    const { client, close } = await harness({
      fetchImpl: (async () => new Response(JSON.stringify(sampleSession), { status: 201 })) as unknown as typeof fetch,
    });
    try {
      // Note: harness's session.start() is never called here, so ctx.session has no id yet.
      const res = await client.callTool({ name: "orbit_session_update", arguments: { currentTask: "x" } });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("CONFLICT");
    } finally {
      await close();
    }
  });
});
