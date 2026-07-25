/**
 * Context tools: `orbit_publish_context` + `orbit_query_context` (PRD §6, Task 4).
 *
 * Thin typed wrappers over A's `POST /context` and `GET /repos/:id/context`
 * (§4.2) — same pattern as `read.ts`/`history.ts`: validate input, resolve
 * repoId, call `ctx.rest`, map errors via `toToolError`, return both `content`
 * and `structuredContent`.
 *
 * `orbit_publish_context` follows `orbit_commit`'s approach (schemas.ts):
 * strict validation happens client-side against `publishContextArgsSchema`
 * before the request ever reaches A, so malformed packets (bad type, title/body
 * over the length limits) come back as one clean INVALID_INPUT error.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ContextPacket } from "@orbit/types";
import type { ToolContext } from "./context.js";
import { CONTEXT_PACKET_TYPES, formatZodIssues, publishContextArgsSchema } from "../schemas.js";
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
    "Repo id this packet concerns / to query. Defaults to the repo this connection is bound to " +
      "(ORBIT_REPO_ID); only needed if that isn't set or you want another repo.",
  );

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

export const contextPacketShape = {
  id: z.string(),
  repoId: z.string(),
  agentId: z.string(),
  type: z.enum(CONTEXT_PACKET_TYPES),
  title: z.string(),
  body: z.string(),
  relatedPaths: z.array(z.string()),
  supersedes: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
};

const publishContextInputShape = {
  repoId: repoIdInput,
  type: z
    .enum(CONTEXT_PACKET_TYPES)
    .optional()
    .describe("One of: constraint, failed_approach, open_thread, discovery, handoff."),
  title: z.string().optional().describe("Short title, max 120 chars."),
  body: z.string().optional().describe("Structured markdown body, max 8000 chars."),
  relatedPaths: z
    .array(z.string())
    .optional()
    .describe("Repo-relative paths this context concerns. Other agents reading these paths will see this packet auto-injected."),
  supersedes: z.string().min(1).optional().describe("Id of a prior packet this one replaces."),
  expiresAt: z.string().min(1).nullable().optional().describe("ISO 8601 expiry, or omit/null for permanent."),
};

const publishContextOutputShape = contextPacketShape;

const queryContextInputShape = {
  repoId: repoIdInput,
  type: z.enum(CONTEXT_PACKET_TYPES).optional().describe("Only return packets of this type."),
  path: z.string().min(1).optional().describe("Only return packets whose relatedPaths match this repo-relative path."),
};

const queryContextOutputShape = {
  packets: z.array(z.object(contextPacketShape)),
};

export function registerContextTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "orbit_publish_context",
    {
      title: "Publish context packet",
      description:
        "Share a structured piece of context with other agents working on this repo: a `constraint` " +
        "discovered, a `failed_approach` to avoid, a `discovery`, an `open_thread`, or a `handoff`. " +
        "Set `relatedPaths` so it's auto-injected into other agents' `orbit_read_file` calls on those paths.",
      inputSchema: publishContextInputShape,
      outputSchema: publishContextOutputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);

        const parsed = publishContextArgsSchema.omit({ repoId: true }).safeParse(input);
        if (!parsed.success) {
          throw new OrbitError("INVALID_INPUT", `orbit_publish_context rejected: ${formatZodIssues(parsed.error)}`, {
            hint:
              `\`type\` must be one of ${CONTEXT_PACKET_TYPES.join(", ")}. \`title\` (<=120 chars) and \`body\` ` +
              "(<=8000 chars) are required.",
          });
        }

        const { type, title, body, relatedPaths, supersedes, expiresAt } = parsed.data;
        const packet: ContextPacket = await ctx.rest.publishContext({
          repoId,
          type,
          title,
          body,
          relatedPaths,
          supersedes: supersedes ?? null,
          expiresAt: expiresAt ?? null,
        });

        log.info("context packet published", { agentId: ctx.agent.id, repoId, packetId: packet.id, type: packet.type });
        return {
          content: [{ type: "text", text: JSON.stringify(packet, null, 2) }],
          structuredContent: asStructuredContent(packet),
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );

  server.registerTool(
    "orbit_query_context",
    {
      title: "Query context packets",
      description:
        "Pull context other agents have published for this repo — filter by `type` and/or `path`. " +
        "Call this before starting a task to check for constraints, failed approaches, or open threads " +
        "on the paths you're about to touch.",
      inputSchema: queryContextInputShape,
      outputSchema: queryContextOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const repoId = resolveRepoId(ctx, input);
        const result = await ctx.rest.queryContext(repoId, { type: input.type, path: input.path });
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
