/**
 * Read tools: `orbit_read_tree` + `orbit_read_file` (PRD §6, deliverable #1).
 *
 * Thin typed wrappers over A's `GET /repos/:id/tree` and `GET /repos/:id/file`
 * (§4.2) — the pattern every later tool (commit, history, context, sessions)
 * follows: validate input, resolve repoId, call `ctx.rest`, map errors via
 * `toToolError`, return both `content` (human-readable) and `structuredContent`
 * (schema-validated) so agents can consume either.
 *
 * Task 4 adds auto-injection (PRD §6 "the magic"): `orbit_read_file` queries
 * context packets whose `relatedPaths` match the file just read and appends
 * them to the response, so an agent reading `src/auth/login.ts` sees another
 * agent's `failed_approach` on that path without asking for it. Best-effort —
 * if the context lookup fails, the file read still succeeds; the agent just
 * doesn't get the (non-essential) warning.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ReadFileResponse, ReadTreeResponse } from "@orbit/types";
import type { ToolContext } from "./context.js";
import { contextPacketShape } from "./context-packets.js";
import { OrbitError, toToolError } from "../errors.js";
import { log } from "../logger.js";

/** structuredContent is typed `{[x: string]: unknown}` by the SDK; our response DTOs are exact. */
function asStructuredContent<T extends object>(value: T): { [x: string]: unknown } {
  return value as unknown as { [x: string]: unknown };
}

const repoIdInput = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Repo id to read. Defaults to the repo this connection is bound to " +
      "(ORBIT_REPO_ID); only needed if that isn't set or you want another repo.",
  );

const refInput = z
  .string()
  .min(1)
  .optional()
  .describe("Branch, tag, or commit sha to read at. Defaults to the repo's default branch.");

const treeNodeShape = {
  path: z.string().describe("Repo-relative path."),
  type: z.enum(["file", "dir"]),
  size: z.number().optional().describe("Size in bytes, files only."),
};

const readTreeInputShape = {
  repoId: repoIdInput,
  ref: refInput,
};

const readTreeOutputShape = {
  repoId: z.string(),
  ref: z.string().describe("Resolved ref (branch/sha)."),
  nodes: z.array(z.object(treeNodeShape)),
};

const readFileInputShape = {
  repoId: repoIdInput,
  path: z.string().min(1).describe('Repo-relative file path to read, e.g. "src/index.ts".'),
  ref: refInput,
};

const readFileOutputShape = {
  repoId: z.string(),
  ref: z.string(),
  path: z.string(),
  content: z.string(),
  size: z.number(),
  context: z
    .array(z.object(contextPacketShape))
    .optional()
    .describe(
      "Context packets other agents published whose `relatedPaths` match this file — auto-injected, " +
        "no need to call `orbit_query_context` separately. Absent/empty when none match.",
    ),
};

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

export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_read_tree",
    {
      title: "Read file tree",
      description:
        "Get the file tree of an Orbit repo at a ref. Replaces `ls`/clone browsing — " +
        "use this instead of shelling out to git.",
      inputSchema: readTreeInputShape,
      outputSchema: readTreeOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);
        const result: ReadTreeResponse = await ctx.rest.readTree(repoId, input.ref);
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
    "orbit_read_file",
    {
      title: "Read file",
      description:
        "Read a file's contents at a ref, by repo-relative path. Use `orbit_read_tree` " +
        "first if you don't already know the path. Automatically includes any `context` packets " +
        "other agents published for this path (constraints, failed approaches, open threads) — " +
        "check the `context` field before making changes here.",
      inputSchema: readFileInputShape,
      outputSchema: readFileOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);
        const result: ReadFileResponse = await ctx.rest.readFile(repoId, input.path, input.ref);

        const packets = await queryMatchingContext(ctx, repoId, input.path);
        const withContext = packets.length > 0 ? { ...result, context: packets } : result;

        return {
          content: [{ type: "text", text: JSON.stringify(withContext, null, 2) }],
          structuredContent: asStructuredContent(withContext),
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}

/**
 * Best-effort auto-injection lookup: packets whose `relatedPaths` match
 * `path`, via A's `path=` filter on `GET /repos/:id/context` (§4.2). A failure
 * here must not fail the read — it just means the agent doesn't get the
 * (non-essential) heads-up this call would have added.
 */
async function queryMatchingContext(ctx: ToolContext, repoId: string, path: string) {
  try {
    const { packets } = await ctx.rest.queryContext(repoId, { path });
    return packets;
  } catch (err) {
    log.warn("context auto-injection lookup failed; returning file without context", {
      repoId,
      path,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
