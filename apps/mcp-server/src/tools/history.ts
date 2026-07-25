/**
 * History tools: `orbit_history` + `orbit_get_trace` (PRD §6, Task 5).
 *
 * Thin typed wrappers over A's `GET /repos/:id/commits` (filterable) and
 * `GET /traces/:id` — the same pattern as `read.ts`: validate input, resolve
 * repoId, call `ctx.rest`, map errors via `toToolError`, return both `content`
 * and `structuredContent`.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";
import { OrbitError, toToolError } from "../errors.js";

/** structuredContent is typed `{[x: string]: unknown}` by the SDK; our response DTOs are exact. */
function asStructuredContent<T extends object>(value: T): { [x: string]: unknown } {
  return value as unknown as { [x: string]: unknown };
}

const repoIdInput = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Repo id to query. Defaults to the repo this connection is bound to " +
      "(ORBIT_REPO_ID); only needed if that isn't set or you want another repo.",
  );

/** Resolve the repoId a call targets: explicit arg wins, else the bound connection repo. */
function resolveRepoId(ctx: ToolContext, input: { repoId?: string }): string {
  const repoId = input.repoId ?? ctx.repoId;
  if (!repoId) {
    throw new OrbitError(
      "INVALID_INPUT",
      "No repoId given and this connection isn't bound to a repo.",
      { hint: 'Pass `repoId` explicitly, or set ORBIT_REPO_ID for this connection.' },
    );
  }
  return repoId;
}

const fileChangeShape = {
  path: z.string(),
  changeType: z.enum(["added", "modified", "deleted", "renamed"]),
  additions: z.number(),
  deletions: z.number(),
};

const commitShape = {
  id: z.string(),
  gitSha: z.string(),
  repoId: z.string(),
  agentId: z.string().nullable(),
  message: z.string(),
  intent: z.string(),
  traceId: z.string().nullable(),
  parentIds: z.array(z.string()),
  filesChanged: z.array(z.object(fileChangeShape)),
  createdAt: z.string(),
};

const historyInputShape = {
  repoId: repoIdInput,
  path: z.string().min(1).optional().describe("Only return commits touching this repo-relative path."),
  agentId: z.string().min(1).optional().describe("Only return commits authored by this agent id."),
  since: z.string().min(1).optional().describe("Only return commits at/after this ISO 8601 timestamp."),
  limit: z.number().int().positive().max(200).optional().describe("Max commits to return (default set by Workstream A)."),
  cursor: z.string().min(1).optional().describe("Pagination cursor from a previous call's `nextCursor`."),
};

const historyOutputShape = {
  commits: z.array(z.object(commitShape)),
  nextCursor: z.string().optional(),
};

const traceTurnShape = {
  role: z.enum(["human", "agent", "tool"]),
  content: z.string(),
  timestamp: z.string(),
};

const decisionShape = {
  question: z.string(),
  chosen: z.string(),
  rejected: z.array(z.string()),
  reasoning: z.string(),
};

const traceInputShape = {
  traceId: z.string().min(1).describe("Trace id, usually a commit's `traceId` from `orbit_history`."),
};

const traceOutputShape = {
  id: z.string(),
  commitId: z.string(),
  taskDescription: z.string(),
  turns: z.array(z.object(traceTurnShape)),
  decisions: z.array(z.object(decisionShape)),
  createdAt: z.string(),
};

export function registerHistoryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_history",
    {
      title: "Query commit history",
      description:
        "List commits for a repo, filterable by path, agent, and since-timestamp. Replaces " +
        "`git log`/`git log --follow` — use this instead of shelling out to git.",
      inputSchema: historyInputShape,
      outputSchema: historyOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);
        const result = await ctx.rest.listCommits(repoId, {
          path: input.path,
          agentId: input.agentId,
          since: input.since,
          limit: input.limit,
          cursor: input.cursor,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: asStructuredContent(result),
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "orbit_get_trace",
    {
      title: "Get reasoning trace",
      description:
        "Get the full ConversationTrace behind a commit — task description, conversation turns, " +
        'and structured decisions (chosen vs rejected, with reasoning). The "why did this change happen" tool.',
      inputSchema: traceInputShape,
      outputSchema: traceOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const result = await ctx.rest.getTrace(input.traceId);
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
