/**
 * Builds a per-connection Orbit MCP server bound to one agent.
 *
 * Task 1 registers only the diagnostic toolset; Tasks 2–5 add the 8 core tools
 * by calling additional `register*Tools(server, ctx)` functions here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentIdentity } from "@orbit/types";
import { OrbitRestClient } from "./rest-client.js";
import type { ToolContext } from "./tools/context.js";
import { registerDiagnosticTools } from "./tools/diagnostics.js";
import { log } from "./logger.js";

export const SERVER_NAME = "orbit-mcp";
export const SERVER_VERSION = "0.1.0";

export interface CreateServerOptions {
  agent: AgentIdentity;
  apiUrl: string;
  apiKey: string;
  repoId: string | null;
  fetchImpl?: typeof fetch;
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

  const ctx: ToolContext = { agent: opts.agent, rest, repoId: opts.repoId };

  // Task 1: diagnostics only. Tasks 2–5 register the 8 core tools here.
  registerDiagnosticTools(server, ctx);

  log.debug("orbit server created", { agentId: opts.agent.id, repoId: opts.repoId });
  return server;
}
