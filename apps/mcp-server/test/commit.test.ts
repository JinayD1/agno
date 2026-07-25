import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";
import { SessionManager } from "../src/session.js";
import { registerCommitTools } from "../src/tools/commit.js";
import type { ToolContext } from "../src/tools/context.js";
import { commitArgsSchema, formatZodIssues } from "../src/schemas.js";

const agent: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["**"], canMerge: true, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const validTrace = {
  taskDescription: "Add a health check endpoint",
  turns: [{ role: "human", content: "Add GET /health", timestamp: "2026-01-01T00:00:00.000Z" }],
  decisions: [{ question: "Framework?", chosen: "Elysia", rejected: ["Express — no Bun-native support"], reasoning: "Already in the stack." }],
};

const validArgs = {
  files: [{ path: "src/health.ts", content: "export const health = () => 'ok';" }],
  message: "add health endpoint",
  intent: "expose a liveness check for the deploy platform",
  trace: validTrace,
};

/** Boot a real MCP client<->server pair (in-memory transport) around the commit tool. */
async function harness(opts: { repoId: string | null; fetchImpl: typeof fetch }): Promise<{ client: Client; close: () => Promise<void> }> {
  const rest = new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: opts.fetchImpl });
  const session = new SessionManager({ rest, repoId: null });
  const ctx: ToolContext = { agent, rest, repoId: opts.repoId, session };

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerCommitTools(server, ctx);

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

function toolText(res: Awaited<ReturnType<Client["callTool"]>>): string {
  return (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
}

describe("commitArgsSchema — trace validation", () => {
  test("accepts a well-formed commit with intent + trace", () => {
    const parsed = commitArgsSchema.safeParse(validArgs);
    expect(parsed.success).toBe(true);
  });

  test("rejects a missing intent", () => {
    const { intent: _intent, ...rest } = validArgs;
    const parsed = commitArgsSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formatZodIssues(parsed.error)).toContain("intent");
  });

  test("rejects an empty-string intent", () => {
    const parsed = commitArgsSchema.safeParse({ ...validArgs, intent: "   " });
    expect(parsed.success).toBe(false);
  });

  test("rejects an empty trace (no task, no turns)", () => {
    const parsed = commitArgsSchema.safeParse({ ...validArgs, trace: { taskDescription: "", turns: [], decisions: [] } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = formatZodIssues(parsed.error);
      expect(msg).toContain("trace.taskDescription");
      expect(msg).toContain("trace.turns");
    }
  });

  test("rejects a trace with a malformed turn (bad role, empty content)", () => {
    const parsed = commitArgsSchema.safeParse({
      ...validArgs,
      trace: { ...validTrace, turns: [{ role: "narrator", content: "", timestamp: "not-a-date" }] },
    });
    expect(parsed.success).toBe(false);
  });

  test("decisions may be omitted (defaults to [])", () => {
    const { decisions: _decisions, ...traceRest } = validTrace;
    const parsed = commitArgsSchema.safeParse({ ...validArgs, trace: traceRest });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.trace.decisions).toEqual([]);
  });

  test("rejects a file path with a leading slash", () => {
    const parsed = commitArgsSchema.safeParse({ ...validArgs, files: [{ path: "/etc/passwd", content: "x" }] });
    expect(parsed.success).toBe(false);
  });
});

describe("orbit_commit — tool wrapper", () => {
  test("lists the tool with input/output schemas", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      const { tools } = await client.listTools();
      const commit = tools.find((t) => t.name === "orbit_commit");
      expect(commit?.inputSchema).toBeTruthy();
      expect(commit?.outputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  test("valid intent + trace: posts to /repos/:id/commits and returns structuredContent", async () => {
    let calledUrl = "";
    let calledBody: unknown;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledUrl = String(url);
      calledBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(
        JSON.stringify({
          id: "commit_1",
          gitSha: "abc123",
          repoId: "repo_demo",
          agentId: agent.id,
          message: validArgs.message,
          intent: validArgs.intent,
          traceId: "trace_1",
          parentIds: [],
          filesChanged: [{ path: "src/health.ts", changeType: "added", additions: 1, deletions: 0 }],
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_commit", arguments: validArgs });
      expect(res.isError).not.toBe(true);
      expect(calledUrl).toBe("http://a:4000/api/repos/repo_demo/commits");
      expect((calledBody as { intent: string }).intent).toBe(validArgs.intent);
      expect((calledBody as { trace: { turns: unknown[] } }).trace.turns).toHaveLength(1);
      expect(res.structuredContent).toMatchObject({ id: "commit_1", gitSha: "abc123" });
    } finally {
      await close();
    }
  });

  test("missing intent is rejected client-side, before any call to A", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const { intent: _intent, ...args } = validArgs;
      const res = await client.callTool({ name: "orbit_commit", arguments: args });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
      expect(toolText(res)).toContain("intent");
      expect(called).toBe(false);
    } finally {
      await close();
    }
  });

  test("empty trace (no turns) is rejected client-side, before any call to A", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({
        name: "orbit_commit",
        arguments: { ...validArgs, trace: { taskDescription: "", turns: [], decisions: [] } },
      });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
      expect(toolText(res)).toContain("trace");
      expect(called).toBe(false);
    } finally {
      await close();
    }
  });

  test("malformed trace turn (invalid role) is rejected client-side", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({
        name: "orbit_commit",
        arguments: { ...validArgs, trace: { ...validTrace, turns: [{ role: "narrator", content: "x", timestamp: "2026-01-01T00:00:00.000Z" }] } },
      });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
      expect(called).toBe(false);
    } finally {
      await close();
    }
  });

  test("A's SCOPE_DENIED for a disallowed path surfaces as a clean, actionable error", async () => {
    const fetchImpl = jsonFetch({ error: { code: "SCOPE_DENIED", message: "src/auth/** is not in pathsAllowed" } }, 403);
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({
        name: "orbit_commit",
        arguments: { ...validArgs, files: [{ path: "src/auth/login.ts", content: "x" }] },
      });
      expect(res.isError).toBe(true);
      const text = toolText(res);
      expect(text).toContain("SCOPE_DENIED");
      expect(text).toContain("src/auth/** is not in pathsAllowed");
      expect(text.toLowerCase()).toContain("hint");
    } finally {
      await close();
    }
  });

  test("missing repoId (no binding, no arg) surfaces a clean INVALID_INPUT tool error", async () => {
    const { client, close } = await harness({ repoId: null, fetchImpl: jsonFetch({}) });
    try {
      const res = await client.callTool({ name: "orbit_commit", arguments: validArgs });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
    } finally {
      await close();
    }
  });

  test("explicit repoId argument overrides the connection-bound repo", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({
          id: "commit_1",
          gitSha: "abc123",
          repoId: "repo_other",
          agentId: agent.id,
          message: validArgs.message,
          intent: validArgs.intent,
          traceId: null,
          parentIds: [],
          filesChanged: [],
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      await client.callTool({ name: "orbit_commit", arguments: { ...validArgs, repoId: "repo_other" } });
      expect(calledUrl).toContain("/api/repos/repo_other/commits");
    } finally {
      await close();
    }
  });
});
