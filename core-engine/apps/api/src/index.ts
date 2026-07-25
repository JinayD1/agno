import { Elysia } from "elysia";
import type { OrbitErrorBody } from "@orbit/types";
import { OrbitError } from "./errors.ts";
import { db } from "./db/index.ts";
import { repoRoutes } from "./routes/repos.ts";
import { commitRoutes } from "./routes/commits.ts";
import { agentRoutes } from "./routes/agents.ts";
import { contextRoutes } from "./routes/context.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import { eventRoutes } from "./routes/events.ts";

export function createApp() {
  const app = new Elysia()
    // Global error handler → §4.4 error contract: { error: { code, message } }.
    .onError(({ error, code, set }) => {
      if (error instanceof OrbitError) {
        set.status = error.status;
        return error.toBody();
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return {
          error: { code: "NOT_FOUND", message: "Route not found" },
        } satisfies OrbitErrorBody;
      }
      if (code === "VALIDATION") {
        set.status = 400;
        return {
          error: { code: "INVALID_INPUT", message: String((error as Error).message) },
        } satisfies OrbitErrorBody;
      }
      set.status = 500;
      return {
        error: { code: "INTERNAL", message: String((error as Error)?.message ?? error) },
      } satisfies OrbitErrorBody;
    })
    .get("/health", () => ({ status: "ok", service: "orbit-api" }))
    .use(repoRoutes)
    .use(commitRoutes)
    .use(agentRoutes)
    .use(contextRoutes)
    .use(sessionRoutes)
    .use(eventRoutes);

  return app;
}

// Only boot a listener when run directly (not when imported by tests).
if (import.meta.main) {
  db(); // open + migrate the shared DB on startup
  const port = Number(process.env.PORT ?? 3001);
  createApp().listen(port);
  console.log(`orbit-api listening on http://localhost:${port}`);
}
