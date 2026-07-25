import { Elysia, t } from "elysia";
import { db } from "../db/index.ts";
import { bus } from "../events/index.ts";
import { createCommit, getCommitDetail, getTrace, listCommits } from "../store/commits.ts";

const TurnSchema = t.Object({
  role: t.Union([t.Literal("human"), t.Literal("agent"), t.Literal("tool")]),
  content: t.String({ maxLength: 4000 }),
  timestamp: t.String(),
});

const DecisionSchema = t.Object({
  question: t.String(),
  chosen: t.String(),
  rejected: t.Array(t.String()),
  reasoning: t.String(),
});

const TraceSchema = t.Object({
  taskDescription: t.String({ minLength: 1 }),
  turns: t.Array(TurnSchema),
  decisions: t.Array(DecisionSchema),
});

const CreateCommitSchema = t.Object({
  files: t.Array(
    t.Object({ path: t.String({ minLength: 1 }), content: t.String() }),
    { minItems: 1 },
  ),
  message: t.String({ minLength: 1 }),
  intent: t.String(),
  agentId: t.Optional(t.Union([t.String(), t.Null()])),
  parentIds: t.Optional(t.Array(t.String())),
  trace: t.Optional(t.Union([TraceSchema, t.Null()])),
});

export const commitRoutes = new Elysia()
  .post(
    "/api/repos/:id/commits",
    async ({ params, body, headers, set }) => {
      // The MCP server passes the authoring agent via `X-Orbit-Agent-Id` on every
      // request (§5). Prefer that identity; fall back to an explicit body agentId.
      const agentId = body.agentId ?? headers["x-orbit-agent-id"] ?? null;
      const commit = await createCommit(db(), params.id, { ...body, agentId });
      bus.emit(params.id, { type: "commit.created", payload: commit });
      set.status = 201;
      return commit;
    },
    { body: CreateCommitSchema },
  )
  .get(
    "/api/repos/:id/commits",
    ({ params, query }) => ({
      // Frozen §4.2 contract: paginated envelope, not a bare array.
      commits: listCommits(db(), params.id, {
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      }),
    }),
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )
  .get("/api/commits/:id", ({ params }) => getCommitDetail(db(), params.id))
  .get("/api/traces/:id", ({ params }) => getTrace(db(), params.id));
