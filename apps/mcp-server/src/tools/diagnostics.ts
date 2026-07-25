/**
 * Diagnostic tools. `orbit_whoami` proves the auth binding end-to-end: it echoes
 * the AgentIdentity this connection resolved to, so you can verify a key maps to
 * the right agent before any of the 8 real tools exist.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";
import { toToolError } from "../errors.js";

export function registerDiagnosticTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_whoami",
    {
      title: "Who am I",
      description:
        "Return the Orbit agent identity this connection is bound to (id, name, model, owner, scopes, bound repo). Use to confirm your key resolved to the expected agent.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      try {
        const { agent, repoId } = ctx;
        const summary = {
          agentId: agent.id,
          name: agent.name,
          model: agent.model,
          ownerHuman: agent.ownerHuman,
          scopes: agent.scopes,
          boundRepoId: repoId,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
