/**
 * Builds a per-connection Orbit MCP server bound to one agent.
 *
 * Task 1 registered the diagnostic toolset; Task 2 added the read tools
 * (`orbit_read_tree`, `orbit_read_file`); Task 3 added `orbit_commit`. Task 5
 * adds session lifecycle (register on connect, heartbeat, end on disconnect)
 * plus the remaining history/session tools. Task 4 registers the context
 * tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "./rest-client.js";
import { SessionManager } from "./session.js";
import type { ToolContext } from "./tools/context.js";
import { registerDiagnosticTools } from "./tools/diagnostics.js";
import { registerReadTools } from "./tools/read.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerSessionTools } from "./tools/session.js";
import { registerCommitTools } from "./tools/commit.js";
import { log } from "./logger.js";

export const SERVER_NAME = "orbit-mcp";
export const SERVER_VERSION = "0.1.0";

export interface CreateServerOptions {
  agent: AgentIdentity;
  apiUrl: string;
  apiKey: string;
  repoId: string | null;
  fetchImpl?: typeof fetch;
  /** Session heartbeat interval in ms (default 30s). */
  sessionHeartbeatMs?: number;
}

export function createOrbitServer(opts: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Orbit exposes version control as typed tools for AI agents. Never run raw git — read, commit, review, and query history through orbit_* tools. Commits require an `intent`. Relevant context packets from other agents are auto-injected into file reads.",
      capabilities: { tools: { listChanged: true } },
    },
  );

  const rest = new OrbitRestClient({
    apiUrl: opts.apiUrl,
    agent: opts.agent,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  });

  const session = new SessionManager({ rest, repoId: opts.repoId, heartbeatMs: opts.sessionHeartbeatMs });
  const ctx: ToolContext = { agent: opts.agent, rest, repoId: opts.repoId, session };

  registerDiagnosticTools(server, ctx);
  registerReadTools(server, ctx);
  registerHistoryTools(server, ctx);
  registerSessionTools(server, ctx);
  registerCommitTools(server, ctx);
  // Task 4 registers the context tools here.

  // Register on connect; end on disconnect (transport close fires this
  // regardless of whether the client disconnected or we called `.close()`).
  void session.start();
  server.server.onclose = () => void session.end();

  log.debug("orbit server created", { agentId: opts.agent.id, repoId: opts.repoId });
  return server;
}
