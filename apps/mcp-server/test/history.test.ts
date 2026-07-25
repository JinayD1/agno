import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";
import { SessionManager } from "../src/session.js";
import { registerHistoryTools } from "../src/tools/history.js";
import type { ToolContext } from "../src/tools/context.js";

const agent: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["**"], canMerge: true, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Boot a real MCP client<->server pair (in-memory transport) around the history tools. */
async function harness(opts: {
  repoId: string | null;
  fetchImpl: typeof fetch;
}): Promise<{ client: Client; close: () => Promise<void> }> {
  const rest = new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: opts.fetchImpl });
  const session = new SessionManager({ rest, repoId: null });
  const ctx: ToolContext = { agent, rest, repoId: opts.repoId, session };

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerHistoryTools(server, ctx);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const sampleCommit = {
  id: "commit_1",
  gitSha: "abc123",
  repoId: "repo_demo",
  agentId: "agent_dev1",
  message: "add feature",
  intent: "ship the thing",
  traceId: "trace_1",
  parentIds: [],
  filesChanged: [{ path: "src/a.ts", changeType: "added", additions: 10, deletions: 0 }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const sampleTrace = {
  id: "trace_1",
  commitId: "commit_1",
  taskDescription: "add a feature",
  turns: [{ role: "human", content: "please add X", timestamp: "2026-01-01T00:00:00.000Z" }],
  decisions: [{ question: "which lib?", chosen: "a", rejected: ["b"], reasoning: "a is simpler" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("orbit_history / orbit_get_trace — schemas + wrapper pattern", () => {
  test("lists both tools with input/output schemas", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      const { tools } = await client.listTools();
      const history = tools.find((t) => t.name === "orbit_history");
      const trace = tools.find((t) => t.name === "orbit_get_trace");
      expect(history?.inputSchema).toBeTruthy();
      expect(history?.outputSchema).toBeTruthy();
      expect(trace?.inputSchema).toBeTruthy();
      expect(trace?.outputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  test("orbit_history wraps GET /repos/:id/commits with filters", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ commits: [sampleCommit], nextCursor: "cur_2" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({
        name: "orbit_history",
        arguments: { path: "src/a.ts", agentId: "agent_dev1", since: "2026-01-01T00:00:00.000Z", limit: 10 },
      });
      expect(calledUrl).toContain("/api/repos/repo_demo/commits");
      expect(calledUrl).toContain("path=src%2Fa.ts");
      expect(calledUrl).toContain("agentId=agent_dev1");
      expect(calledUrl).toContain("limit=10");
      expect(res.isError).not.toBe(true);
      expect(res.structuredContent).toMatchObject({ nextCursor: "cur_2" });
      expect((res.structuredContent as { commits: unknown[] }).commits).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test("explicit repoId argument overrides the connection-bound repo", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ commits: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      await client.callTool({ name: "orbit_history", arguments: { repoId: "repo_other" } });
      expect(calledUrl).toContain("/api/repos/repo_other/commits");
    } finally {
      await close();
    }
  });

  test("missing repoId (no binding, no arg) surfaces a clean INVALID_INPUT tool error", async () => {
    const { client, close } = await harness({ repoId: null, fetchImpl: jsonFetch({}) });
    try {
      const res = await client.callTool({ name: "orbit_history", arguments: {} });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("INVALID_INPUT");
    } finally {
      await close();
    }
  });

  test("orbit_get_trace wraps GET /traces/:id", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify(sampleTrace), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_get_trace", arguments: { traceId: "trace_1" } });
      expect(calledUrl).toBe("http://a:4000/api/traces/trace_1");
      expect(res.structuredContent).toMatchObject({ id: "trace_1", commitId: "commit_1" });
      expect((res.structuredContent as { decisions: unknown[] }).decisions).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test("A's NOT_FOUND for a missing trace becomes a clean tool error, not a throw", async () => {
    const fetchImpl = jsonFetch({ error: { code: "NOT_FOUND", message: "no such trace" } }, 404);
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_get_trace", arguments: { traceId: "nope" } });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("NOT_FOUND");
    } finally {
      await close();
    }
  });

  test("rejects a call missing the required `traceId` argument", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      // Schema-validation failures can surface either as a rejected promise or
      // (depending on SDK-internal timing) a resolved `isError` result — accept both.
      let isError = false;
      try {
        const res = await client.callTool({ name: "orbit_get_trace", arguments: {} });
        isError = res.isError === true;
      } catch {
        isError = true;
      }
      expect(isError).toBe(true);
    } finally {
      await close();
    }
  });
});
