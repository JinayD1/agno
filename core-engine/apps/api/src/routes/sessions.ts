import { Elysia, t } from "elysia";
import { db } from "../db/index.ts";
import { bus } from "../events/index.ts";
import { listActiveSessions, startSession, updateSession } from "../store/sessions.ts";

export const sessionRoutes = new Elysia()
  .post(
    "/api/sessions",
    ({ body, set }) => {
      const session = startSession(db(), body);
      bus.emit(session.repoId, { type: "session.started", payload: session });
      set.status = 201;
      return session;
    },
    {
      body: t.Object({
        agentId: t.String({ minLength: 1 }),
        repoId: t.String({ minLength: 1 }),
        currentTask: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .patch(
    "/api/sessions/:id",
    ({ params, body }) => {
      const session = updateSession(db(), params.id, body);
      if (session.status === "ended") {
        bus.emit(session.repoId, { type: "session.ended", payload: { id: session.id } });
      } else {
        bus.emit(session.repoId, { type: "session.updated", payload: session });
      }
      return session;
    },
    {
      body: t.Object({
        status: t.Optional(
          t.Union([t.Literal("active"), t.Literal("idle"), t.Literal("ended")]),
        ),
        currentTask: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .get("/api/repos/:id/sessions", ({ params }) => listActiveSessions(db(), params.id));
