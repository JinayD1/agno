import { Elysia, t } from "elysia";
import type { ContextPacket } from "@orbit/types";
import { db } from "../db/index.ts";
import { bus } from "../events/index.ts";
import { OrbitError } from "../errors.ts";
import { publishContext, queryContext, retractContext } from "../store/context.ts";

const PACKET_TYPES = [
  "constraint",
  "failed_approach",
  "open_thread",
  "discovery",
  "handoff",
] as const;

const TypeSchema = t.Union(PACKET_TYPES.map((v) => t.Literal(v)));

export const contextRoutes = new Elysia()
  .post(
    "/api/context",
    ({ body, headers, set }) => {
      // Author identity comes from the MCP connection's `X-Orbit-Agent-Id` header
      // (§5); an explicit body agentId still wins if provided.
      const agentId = body.agentId ?? headers["x-orbit-agent-id"];
      if (!agentId) {
        throw new OrbitError("INVALID_INPUT", "context packet requires an author agentId");
      }
      const packet = publishContext(db(), { ...body, agentId });
      bus.emit(packet.repoId, { type: "context.published", payload: packet });
      set.status = 201;
      return packet;
    },
    {
      body: t.Object({
        repoId: t.String({ minLength: 1 }),
        agentId: t.Optional(t.String({ minLength: 1 })),
        type: TypeSchema,
        title: t.String({ minLength: 1, maxLength: 120 }),
        body: t.String({ maxLength: 8000 }),
        relatedPaths: t.Optional(t.Array(t.String())),
        supersedes: t.Optional(t.Union([t.String(), t.Null()])),
        expiresAt: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .get(
    "/api/repos/:id/context",
    ({ params, query }) => ({
      // Frozen §4.2 contract: `{ packets }` envelope, not a bare array.
      packets: queryContext(db(), params.id, {
        type: query.type as ContextPacket["type"] | undefined,
        path: query.path,
      }),
    }),
    {
      query: t.Object({
        type: t.Optional(TypeSchema),
        path: t.Optional(t.String()),
      }),
    },
  )
  .delete("/api/context/:id", ({ params, set }) => {
    const { repoId } = retractContext(db(), params.id);
    bus.emit(repoId, { type: "context.retracted", payload: { id: params.id } });
    set.status = 204;
    return null;
  });
