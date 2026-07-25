/**
 * `orbit_commit` — wraps `POST /api/repos/:id/commits` (§4.2, PRD §6 tool #3).
 *
 * `intent` and `trace` are validated against `commitArgsSchema` (schemas.ts)
 * before this ever calls A: empty/malformed traces and missing intent come
 * back as one clean `INVALID_INPUT` tool error instead of a round trip to the
 * platform (Task 3 DoD). The wire-level `inputSchema` below is intentionally
 * permissive (types only, nothing required) so *every* validation failure —
 * not just the ones the MCP SDK's own arg parser would catch — flows through
 * that same formatter. Scope-denied writes from A surface through the same
 * `toToolError` path, so both failure modes look identical to the agent.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OrbitCommit } from "@orbit/types";
import type { ToolContext } from "./context.js";
import { commitArgsSchema, formatZodIssues } from "../schemas.js";
import { OrbitError, toToolError } from "../errors.js";
import { log } from "../logger.js";

/** structuredContent is typed `{[x: string]: unknown}` by the SDK; our response DTOs are exact. */
function asStructuredContent<T extends object>(value: T): { [x: string]: unknown } {
  return value as unknown as { [x: string]: unknown };
}

/** Resolve the repoId a call targets: explicit arg wins, else the bound connection repo. */
function resolveRepoId(ctx: ToolContext, input: { repoId?: string }): string {
  const repoId = input.repoId ?? ctx.repoId;
  if (!repoId) {
    throw new OrbitError("INVALID_INPUT", "No repoId given and this connection isn't bound to a repo.", {
      hint: "Pass `repoId` explicitly, or set ORBIT_REPO_ID for this connection.",
    });
  }
  return repoId;
}

const orbitCommitInputShape = {
  repoId: z
    .string()
    .min(1)
    .optional()
    .describe("Repo id to commit to. Defaults to the repo this connection is bound to (ORBIT_REPO_ID)."),
  files: z
    .array(z.object({ path: z.string(), content: z.string() }))
    .optional()
    .describe("Files to write, repo-relative paths. At least one required."),
  message: z.string().optional().describe("Commit message."),
  intent: z.string().optional().describe("Required one-line 'why' for this commit."),
  trace: z
    .object({
      taskDescription: z.string().optional().describe("What the agent was asked to do."),
      turns: z
        .array(
          z.object({
            role: z.string().describe('One of "human" | "agent" | "tool".'),
            content: z.string(),
            timestamp: z.string(),
          }),
        )
        .optional()
        .describe("Ordered conversation excerpts. At least one required."),
      decisions: z
        .array(
          z.object({
            question: z.string(),
            chosen: z.string(),
            rejected: z.array(z.string()).optional(),
            reasoning: z.string(),
          }),
        )
        .optional()
        .describe("Structured key decisions (chosen vs rejected, with reasoning)."),
    })
    .optional()
    .describe("Reasoning trail behind this commit — task, turns, decisions. Required; empty/malformed traces are rejected."),
};

const fileChangeShape = {
  path: z.string(),
  changeType: z.enum(["added", "modified", "deleted", "renamed"]),
  additions: z.number(),
  deletions: z.number(),
};

const orbitCommitOutputShape = {
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

export function registerCommitTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_commit",
    {
      title: "Commit files",
      description:
        "Commit one or more files with a required `intent` (one-line why) and a `trace` " +
        "(taskDescription, turns, decisions) describing the reasoning behind the change. " +
        "Never run raw git — this is the only way agents write to Orbit. `intent` and `trace` " +
        "are validated before the request reaches the platform; empty or malformed traces are rejected here.",
      inputSchema: orbitCommitInputShape,
      outputSchema: orbitCommitOutputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);

        const parsed = commitArgsSchema.omit({ repoId: true }).safeParse(input);
        if (!parsed.success) {
          throw new OrbitError("INVALID_INPUT", `orbit_commit rejected: ${formatZodIssues(parsed.error)}`, {
            hint:
              "`intent` is required. `trace.taskDescription` and at least one `trace.turns[]` entry are " +
              "also required — Orbit rejects empty or malformed traces client-side before they reach the platform.",
          });
        }

        const { files, message, intent, trace } = parsed.data;
        const commit: OrbitCommit = await ctx.rest.createCommit(repoId, { files, message, intent, trace });

        log.info("commit created", { agentId: ctx.agent.id, repoId, commitId: commit.id, gitSha: commit.gitSha });
        return {
          content: [{ type: "text", text: JSON.stringify(commit, null, 2) }],
          structuredContent: asStructuredContent(commit),
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
