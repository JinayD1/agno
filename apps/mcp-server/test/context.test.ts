import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";
import { SessionManager } from "../src/session.js";
import { registerContextTools } from "../src/tools/context-packets.js";
import type { ToolContext } from "../src/tools/context.js";
import { formatZodIssues, publishContextArgsSchema } from "../src/schemas.js";

const agent: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["**"], canMerge: true, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const validArgs = {
  type: "failed_approach",
  title: "Don't use bcrypt here",
  body: "Tried bcrypt for password hashing; the sync API blocks the event loop under load. Use argon2 instead.",
  relatedPaths: ["src/auth/login.ts"],
};

const samplePacket = {
  id: "ctx_1",
  repoId: "repo_demo",
  agentId: "agent_dev1",
  type: "failed_approach",
  title: validArgs.title,
  body: validArgs.body,
  relatedPaths: validArgs.relatedPaths,
  supersedes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
};

/** Boot a real MCP client<->server pair (in-memory transport) around the context tools. */
async function harness(opts: { repoId: string | null; fetchImpl: typeof fetch }): Promise<{ client: Client; close: () => Promise<void> }> {
  const rest = new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: opts.fetchImpl });
  const session = new SessionManager({ rest, repoId: null });
  const ctx: ToolContext = { agent, rest, repoId: opts.repoId, session };

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerContextTools(server, ctx);

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

describe("publishContextArgsSchema — validation", () => {
  test("accepts a well-formed packet", () => {
    const parsed = publishContextArgsSchema.safeParse(validArgs);
    expect(parsed.success).toBe(true);
  });

  test("rejects an invalid type", () => {
    const parsed = publishContextArgsSchema.safeParse({ ...validArgs, type: "vibes" });
    expect(parsed.success).toBe(false);
  });

  test("rejects a title over 120 chars", () => {
    const parsed = publishContextArgsSchema.safeParse({ ...validArgs, title: "x".repeat(121) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formatZodIssues(parsed.error)).toContain("title");
  });

  test("rejects a body over 8000 chars", () => {
    const parsed = publishContextArgsSchema.safeParse({ ...validArgs, body: "x".repeat(8001) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formatZodIssues(parsed.error)).toContain("body");
  });

  test("relatedPaths defaults to [] when omitted", () => {
    const { relatedPaths: _relatedPaths, ...rest } = validArgs;
    const parsed = publishContextArgsSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.relatedPaths).toEqual([]);
  });
});

describe("orbit_publish_context / orbit_query_context — tool wrappers", () => {
  test("lists both tools with input/output schemas", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      const { tools } = await client.listTools();
      const publish = tools.find((t) => t.name === "orbit_publish_context");
      const query = tools.find((t) => t.name === "orbit_query_context");
      expect(publish?.inputSchema).toBeTruthy();
      expect(publish?.outputSchema).toBeTruthy();
      expect(query?.inputSchema).toBeTruthy();
      expect(query?.outputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  test("valid packet: posts to /api/context and returns structuredContent", async () => {
    let calledUrl = "";
    let calledBody: unknown;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledUrl = String(url);
      calledBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(JSON.stringify(samplePacket), { status: 201 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_publish_context", arguments: validArgs });
      expect(res.isError).not.toBe(true);
      expect(calledUrl).toBe("http://a:4000/api/context");
      expect((calledBody as { repoId: string }).repoId).toBe("repo_demo");
      expect((calledBody as { type: string }).type).toBe("failed_approach");
      expect(res.structuredContent).toMatchObject({ id: "ctx_1", type: "failed_approach" });
    } finally {
      await close();
    }
  });

  test("missing type is rejected client-side, before any call to A", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const { type: _type, ...args } = validArgs;
      const res = await client.callTool({ name: "orbit_publish_context", arguments: args });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
      expect(called).toBe(false);
    } finally {
      await close();
    }
  });

  test("title over 120 chars is rejected client-side", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_publish_context", arguments: { ...validArgs, title: "x".repeat(121) } });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
      expect(called).toBe(false);
    } finally {
      await close();
    }
  });

  test("missing repoId (no binding, no arg) surfaces a clean INVALID_INPUT tool error", async () => {
    const { client, close } = await harness({ repoId: null, fetchImpl: jsonFetch({}) });
    try {
      const res = await client.callTool({ name: "orbit_publish_context", arguments: validArgs });
      expect(res.isError).toBe(true);
      expect(toolText(res)).toContain("INVALID_INPUT");
    } finally {
      await close();
    }
  });

  test("orbit_query_context wraps GET /repos/:id/context with type + path filters", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ packets: [samplePacket] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({
        name: "orbit_query_context",
        arguments: { type: "failed_approach", path: "src/auth/login.ts" },
      });
      expect(calledUrl).toContain("/api/repos/repo_demo/context");
      expect(calledUrl).toContain("type=failed_approach");
      expect(calledUrl).toContain("path=src%2Fauth%2Flogin.ts");
      expect(res.isError).not.toBe(true);
      expect((res.structuredContent as { packets: unknown[] }).packets).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test("A's SCOPE_DENIED surfaces as a clean, actionable error", async () => {
    const fetchImpl = jsonFetch({ error: { code: "SCOPE_DENIED", message: "not allowed" } }, 403);
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_publish_context", arguments: validArgs });
      expect(res.isError).toBe(true);
      const text = toolText(res);
      expect(text).toContain("SCOPE_DENIED");
      expect(text.toLowerCase()).toContain("hint");
    } finally {
      await close();
    }
  });
});
