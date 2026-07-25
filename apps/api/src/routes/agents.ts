import { Elysia, t } from "elysia";
import { db } from "../db/index.ts";
import { createAgent, requireAgent, updateScopes } from "../store/agents.ts";

const ScopesSchema = t.Object({
  pathsAllowed: t.Array(t.String()),
  canMerge: t.Boolean(),
  canReview: t.Boolean(),
});

export const agentRoutes = new Elysia()
  .post(
    "/api/agents",
    ({ body, set }) => {
      set.status = 201;
      return createAgent(db(), body);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        model: t.String({ minLength: 1 }),
        ownerHuman: t.String({ minLength: 1 }),
        scopes: ScopesSchema,
      }),
    },
  )
  .get("/api/agents/:id", ({ params }) => requireAgent(db(), params.id))
  .patch(
    "/api/agents/:id/scopes",
    ({ params, body }) => updateScopes(db(), params.id, body),
    { body: ScopesSchema },
  );
