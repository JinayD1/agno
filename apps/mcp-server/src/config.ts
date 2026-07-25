/**
 * Environment configuration for the Orbit MCP server.
 *
 * One process serves one transport (stdio for local dev, Streamable HTTP for
 * hosted — PRD §9). All other settings are shared.
 */

import { OrbitError } from "./errors.js";

export type TransportKind = "stdio" | "http";

export interface HttpConfig {
  port: number;
  /** MCP endpoint path, e.g. "/mcp". */
  path: string;
  /** Allowed CORS origins (exact matches). Empty = no browser CORS headers emitted. */
  corsOrigins: string[];
}

export interface OrbitMcpConfig {
  transport: TransportKind;
  /** Base URL of Workstream A's REST API (e.g. http://localhost:4000). */
  apiUrl: string;
  /** Repo this connection is bound to (single repo per workspace, v1). */
  repoId: string | null;
  /** Per-connection API key for stdio mode (HTTP reads it from the Authorization header). */
  apiKey: string | null;
  /** Path to the JSON key registry mapping apiKey → agent. */
  keysFile: string | null;
  /** Inline JSON key registry (alternative to keysFile), from ORBIT_AGENT_KEYS. */
  keysInline: string | null;
  /** Session heartbeat interval in ms (PATCH /sessions/:id while connected). */
  sessionHeartbeatMs: number;
  http: HttpConfig;
}

function parseTransport(raw: string | undefined): TransportKind {
  const v = (raw ?? "stdio").toLowerCase();
  if (v === "stdio" || v === "http") return v;
  throw new OrbitError("INVALID_INPUT", `ORBIT_TRANSPORT must be "stdio" or "http", got "${raw}"`);
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new OrbitError("INVALID_INPUT", `ORBIT_HTTP_PORT must be a valid port, got "${raw}"`);
  }
  return n;
}

function nonEmpty(raw: string | undefined): string | null {
  const v = raw?.trim();
  return v ? v : null;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new OrbitError("INVALID_INPUT", `${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrbitMcpConfig {
  const transport = parseTransport(env.ORBIT_TRANSPORT);
  const apiUrl = (nonEmpty(env.ORBIT_API_URL) ?? "http://localhost:4000").replace(/\/+$/, "");

  const config: OrbitMcpConfig = {
    transport,
    apiUrl,
    repoId: nonEmpty(env.ORBIT_REPO_ID),
    apiKey: nonEmpty(env.ORBIT_API_KEY),
    keysFile: nonEmpty(env.ORBIT_AGENT_KEYS_FILE),
    keysInline: nonEmpty(env.ORBIT_AGENT_KEYS),
    sessionHeartbeatMs: parsePositiveInt(env.ORBIT_SESSION_HEARTBEAT_MS, 30_000, "ORBIT_SESSION_HEARTBEAT_MS"),
    http: {
      port: parsePort(env.ORBIT_HTTP_PORT, 8787),
      path: nonEmpty(env.ORBIT_HTTP_PATH) ?? "/mcp",
      corsOrigins: (nonEmpty(env.ORBIT_CORS_ORIGINS) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };

  // Transport-specific invariants.
  if (config.transport === "stdio" && !config.apiKey) {
    throw new OrbitError(
      "INVALID_INPUT",
      "stdio transport requires ORBIT_API_KEY (the agent's key). Set it in your .mcp.json env or shell.",
    );
  }
  if (!config.http.path.startsWith("/")) {
    throw new OrbitError("INVALID_INPUT", `ORBIT_HTTP_PATH must start with "/", got "${config.http.path}"`);
  }

  return config;
}
