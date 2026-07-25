/**
 * Streamable HTTP transport (hosted — PRD §9).
 *
 * Runs on Bun.serve using the SDK's web-standard transport
 * (`handleRequest(Request) → Response`). Each MCP session gets its own transport
 * + server, bound to the agent resolved from that session's initialize request.
 * Subsequent requests are routed by `mcp-session-id` and re-checked against the
 * same API key, so a session can't be hijacked by a different key.
 *
 * Claude Code connects with `{ "type": "http", "url": ".../mcp", "headers": {
 * "Authorization": "Bearer <key>" } }`.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AgentIdentity } from "@orbit/types";
import type { OrbitMcpConfig } from "../config.js";
import { createAuthProvider, extractBearer, type AuthProvider } from "../auth.js";
import { createOrbitServer, SERVER_NAME, SERVER_VERSION } from "../server.js";
import { OrbitError } from "../errors.js";
import { log } from "../logger.js";

interface SessionEntry {
  sessionId?: string;
  transport: WebStandardStreamableHTTPServerTransport;
  server: ReturnType<typeof createOrbitServer>;
  agent: AgentIdentity;
  apiKey: string;
}

export async function runHttp(config: OrbitMcpConfig): Promise<void> {
  const auth = createAuthProvider(config);
  const sessions = new Map<string, SessionEntry>();
  const mcpPath = config.http.path;

  const corsHeaders = (origin: string | null): Record<string, string> => {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Accept, Last-Event-ID",
      "Access-Control-Expose-Headers": "mcp-session-id",
    };
    const { corsOrigins } = config.http;
    if (corsOrigins.includes("*")) {
      headers["Access-Control-Allow-Origin"] = "*";
    } else if (origin && corsOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Vary"] = "Origin";
    }
    return headers;
  };

  const jsonError = (status: number, err: OrbitError, origin: string | null): Response =>
    new Response(JSON.stringify(err.toBody()), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });

  const withCors = (res: Response, origin: string | null): Response => {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };

  const createSession = async (agent: AgentIdentity, apiKey: string): Promise<SessionEntry> => {
    const entry = { agent, apiKey } as SessionEntry;
    entry.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        entry.sessionId = sid;
        sessions.set(sid, entry);
        log.info("session initialized", { sessionId: sid, agentId: agent.id, name: agent.name });
      },
      onsessionclosed: (sid) => {
        sessions.delete(sid);
        void entry.server.close();
        log.info("session closed", { sessionId: sid, agentId: agent.id });
      },
    });
    entry.server = createOrbitServer({
      agent,
      apiUrl: config.apiUrl,
      apiKey,
      repoId: config.repoId,
      sessionHeartbeatMs: config.sessionHeartbeatMs,
    });
    await entry.server.connect(entry.transport);
    return entry;
  };

  const handleMcp = async (req: Request, origin: string | null): Promise<Response> => {
    const apiKey = extractBearer(req.headers.get("authorization"));
    if (!apiKey) {
      return jsonError(401, new OrbitError("SCOPE_DENIED", "Missing Authorization: Bearer <key> header."), origin);
    }

    const sessionId = req.headers.get("mcp-session-id");

    // Existing session → route to its transport after re-checking the key.
    if (sessionId) {
      const entry = sessions.get(sessionId);
      if (!entry) {
        return jsonError(404, new OrbitError("NOT_FOUND", "Unknown or expired MCP session."), origin);
      }
      if (entry.apiKey !== apiKey) {
        return jsonError(403, new OrbitError("SCOPE_DENIED", "This session is bound to a different agent key."), origin);
      }
      return withCors(await entry.transport.handleRequest(req), origin);
    }

    // No session id → must be an initialize (POST). Authenticate and create one.
    if (req.method !== "POST") {
      return jsonError(400, new OrbitError("INVALID_INPUT", "Missing mcp-session-id header."), origin);
    }

    let agent: AgentIdentity;
    try {
      agent = await (auth as AuthProvider).authenticate(apiKey);
    } catch (err) {
      const e = OrbitError.from(err);
      return jsonError(e.httpStatus ?? 401, e, origin);
    }

    const entry = await createSession(agent, apiKey);
    return withCors(await entry.transport.handleRequest(req), origin);
  };

  const server = Bun.serve({
    port: config.http.port,
    idleTimeout: 255, // keep long-lived SSE streams alive; clients auto-reconnect (§10)
    fetch: async (req) => {
      const url = new URL(req.url);
      const origin = req.headers.get("origin");

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      if (url.pathname === "/healthz") {
        return Response.json(
          { ok: true, server: SERVER_NAME, version: SERVER_VERSION, sessions: sessions.size },
          { headers: corsHeaders(origin) },
        );
      }
      if (url.pathname === mcpPath) {
        try {
          return await handleMcp(req, origin);
        } catch (err) {
          const e = OrbitError.from(err);
          log.error("unhandled MCP error", { code: e.code, message: e.message });
          return jsonError(e.httpStatus ?? 500, e, origin);
        }
      }
      return jsonError(404, new OrbitError("NOT_FOUND", `No route for ${url.pathname}`), origin);
    },
  });

  log.info("orbit-mcp ready on http", {
    url: `http://localhost:${server.port}${mcpPath}`,
    health: `http://localhost:${server.port}/healthz`,
    apiUrl: config.apiUrl,
  });

  const shutdown = async (signal: string) => {
    log.info("shutting down", { signal, activeSessions: sessions.size });
    for (const entry of sessions.values()) {
      try {
        await entry.server.close();
      } catch {
        // best effort
      }
    }
    await server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
