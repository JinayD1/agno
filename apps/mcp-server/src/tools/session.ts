/**
 * `orbit_session_update` (PRD §6, Task 5) — report the agent's current task.
 *
 * Powers the human live feed: the session this connection registered on connect
 * (see `../session.ts`) is PATCHed with the new `currentTask`, bumping its
 * heartbeat in the same call.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";
import { toToolError } from "../errors.js";

/** structuredContent is typed `{[x: string]: unknown}` by the SDK; our response DTOs are exact. */
function asStructuredContent<T extends object>(value: T): { [x: string]: unknown } {
  return value as unknown as { [x: string]: unknown };
}

const sessionUpdateInputShape = {
  currentTask: z
    .string()
    .min(1)
    .nullable()
    .describe('Short human-readable description of what you\'re working on now, e.g. "Refactoring auth middleware". Pass null to clear it.'),
};

const sessionUpdateOutputShape = {
  id: z.string(),
  agentId: z.string(),
  repoId: z.string(),
  status: z.enum(["active", "idle", "ended"]),
  currentTask: z.string().nullable(),
  lastHeartbeat: z.string(),
  startedAt: z.string(),
};

export function registerSessionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_session_update",
    {
      title: "Update session task",
      description:
        "Report what you're currently working on. Powers the live human feed showing active agent " +
        "sessions and their current task in real time. Call this whenever you start a new subtask.",
      inputSchema: sessionUpdateInputShape,
      outputSchema: sessionUpdateOutputShape,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await ctx.session.updateTask(input.currentTask);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: asStructuredContent(result),
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
