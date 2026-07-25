import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "../src/rest-client.js";
import { SessionManager } from "../src/session.js";
import { registerReadTools } from "../src/tools/read.js";
import type { ToolContext } from "../src/tools/context.js";

const agent: AgentIdentity = {
  id: "agent_dev1",
  name: "claude-code-dev-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["**"], canMerge: true, canReview: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Boot a real MCP client<->server pair (in-memory transport) around the read tools. */
async function harness(opts: {
  repoId: string | null;
  fetchImpl: typeof fetch;
}): Promise<{ client: Client; close: () => Promise<void> }> {
  const rest = new OrbitRestClient({ apiUrl: "http://a:4000", agent, apiKey: "k1", fetchImpl: opts.fetchImpl });
  const session = new SessionManager({ rest, repoId: null });
  const ctx: ToolContext = { agent, rest, repoId: opts.repoId, session };

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerReadTools(server, ctx);

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

describe("orbit_read_tree / orbit_read_file — schemas + wrapper pattern", () => {
  test("lists both tools with input/output schemas", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      const { tools } = await client.listTools();
      const tree = tools.find((t) => t.name === "orbit_read_tree");
      const file = tools.find((t) => t.name === "orbit_read_file");
      expect(tree?.inputSchema).toBeTruthy();
      expect(tree?.outputSchema).toBeTruthy();
      expect(file?.inputSchema).toBeTruthy();
      expect(file?.outputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  test("orbit_read_tree wraps GET /repos/:id/tree and returns structuredContent", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({ repoId: "repo_demo", ref: "main", nodes: [{ path: "src", type: "dir" }, { path: "src/index.ts", type: "file", size: 42 }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_tree", arguments: { ref: "main" } });
      expect(calledUrl).toBe("http://a:4000/api/repos/repo_demo/tree?ref=main");
      expect(res.isError).not.toBe(true);
      expect(res.structuredContent).toMatchObject({ repoId: "repo_demo", ref: "main" });
      expect((res.structuredContent as { nodes: unknown[] }).nodes).toHaveLength(2);
    } finally {
      await close();
    }
  });

  test("orbit_read_file wraps GET /repos/:id/file with path + ref", async () => {
    let fileUrl = "";
    const fetchImpl = (async (url: string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/context")) return new Response(JSON.stringify({ packets: [] }), { status: 200 });
      fileUrl = String(url);
      return new Response(
        JSON.stringify({ repoId: "repo_demo", ref: "main", path: "src/index.ts", content: "export {}", size: 10 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: { path: "src/index.ts", ref: "main" } });
      expect(fileUrl).toBe("http://a:4000/api/repos/repo_demo/file?path=src%2Findex.ts&ref=main");
      expect(res.structuredContent).toMatchObject({ path: "src/index.ts", content: "export {}" });
    } finally {
      await close();
    }
  });

  test("explicit repoId argument overrides the connection-bound repo", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ repoId: "repo_other", ref: "main", nodes: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      await client.callTool({ name: "orbit_read_tree", arguments: { repoId: "repo_other" } });
      expect(calledUrl).toContain("/api/repos/repo_other/tree");
    } finally {
      await close();
    }
  });

  test("missing repoId (no binding, no arg) surfaces a clean INVALID_INPUT tool error", async () => {
    const { client, close } = await harness({ repoId: null, fetchImpl: jsonFetch({}) });
    try {
      const res = await client.callTool({ name: "orbit_read_tree", arguments: {} });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("INVALID_INPUT");
    } finally {
      await close();
    }
  });

  test("A's NOT_FOUND for a missing file becomes a clean tool error, not a throw", async () => {
    const fetchImpl = jsonFetch({ error: { code: "NOT_FOUND", message: "no such file" } }, 404);
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: { path: "nope.ts" } });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("NOT_FOUND");
    } finally {
      await close();
    }
  });

  test("rejects a call missing the required `path` argument", async () => {
    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl: jsonFetch({}) });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: {} });
      expect(res.isError).toBe(true);
      const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(text).toContain("path");
    } finally {
      await close();
    }
  });
});

describe("orbit_read_file — context auto-injection", () => {
  const samplePacket = {
    id: "ctx_1",
    repoId: "repo_demo",
    agentId: "agent_other",
    type: "failed_approach",
    title: "Don't use bcrypt here",
    body: "Sync bcrypt blocks the event loop under load. Use argon2 instead.",
    relatedPaths: ["src/auth/login.ts"],
    supersedes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
  };

  /** Routes by URL path so one fetchImpl can serve both the file GET and the context GET. */
  function routedFetch(routes: { file: unknown; context: unknown }): typeof fetch {
    return (async (url: string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/file")) return new Response(JSON.stringify(routes.file), { status: 200 });
      if (u.pathname.endsWith("/context")) return new Response(JSON.stringify(routes.context), { status: 200 });
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;
  }

  test("appends matching context packets to the read response", async () => {
    let contextUrl = "";
    const fetchImpl = (async (url: string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/file")) {
        return new Response(
          JSON.stringify({ repoId: "repo_demo", ref: "main", path: "src/auth/login.ts", content: "export {}", size: 10 }),
          { status: 200 },
        );
      }
      contextUrl = String(url);
      return new Response(JSON.stringify({ packets: [samplePacket] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: { path: "src/auth/login.ts" } });
      expect(res.isError).not.toBe(true);
      expect(contextUrl).toContain("/api/repos/repo_demo/context");
      expect(contextUrl).toContain("path=src%2Fauth%2Flogin.ts");
      const structured = res.structuredContent as { context?: unknown[] };
      expect(structured.context).toHaveLength(1);
      expect((structured.context as Array<{ id: string }>)[0]?.id).toBe("ctx_1");
    } finally {
      await close();
    }
  });

  test("omits the `context` field entirely when nothing matches", async () => {
    const fetchImpl = routedFetch({
      file: { repoId: "repo_demo", ref: "main", path: "src/other.ts", content: "export {}", size: 10 },
      context: { packets: [] },
    });

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: { path: "src/other.ts" } });
      expect(res.isError).not.toBe(true);
      const structured = res.structuredContent as { context?: unknown[] };
      expect(structured.context).toBeUndefined();
    } finally {
      await close();
    }
  });

  test("file read still succeeds if the context lookup fails", async () => {
    const fetchImpl = (async (url: string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/file")) {
        return new Response(
          JSON.stringify({ repoId: "repo_demo", ref: "main", path: "src/auth/login.ts", content: "export {}", size: 10 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "context store down" } }), { status: 500 });
    }) as unknown as typeof fetch;

    const { client, close } = await harness({ repoId: "repo_demo", fetchImpl });
    try {
      const res = await client.callTool({ name: "orbit_read_file", arguments: { path: "src/auth/login.ts" } });
      expect(res.isError).not.toBe(true);
      const structured = res.structuredContent as { content?: string; context?: unknown[] };
      expect(structured.content).toBe("export {}");
      expect(structured.context).toBeUndefined();
    } finally {
      await close();
    }
  });
});
