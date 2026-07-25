import { Elysia, t } from "elysia";
import { db } from "../db/index.ts";
import { createRepo, requireRepo } from "../store/repos.ts";
import { readFile, readTree } from "../git/index.ts";

export const repoRoutes = new Elysia()
  .post(
    "/api/repos",
    async ({ body, set }) => {
      set.status = 201;
      return createRepo(db(), body);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        defaultBranch: t.Optional(t.String({ minLength: 1 })),
      }),
    },
  )
  .get("/api/repos/:id", ({ params }) => requireRepo(db(), params.id))
  .get(
    "/api/repos/:id/tree",
    async ({ params, query }) => {
      const repo = requireRepo(db(), params.id);
      const entries = await readTree(params.id, query.ref ?? repo.defaultBranch);
      return { repoId: params.id, ref: query.ref ?? repo.defaultBranch, entries };
    },
    { query: t.Object({ ref: t.Optional(t.String()) }) },
  )
  .get(
    "/api/repos/:id/file",
    async ({ params, query }) => {
      const repo = requireRepo(db(), params.id);
      const content = await readFile(params.id, query.path, query.ref ?? repo.defaultBranch);
      return { repoId: params.id, path: query.path, ref: query.ref ?? repo.defaultBranch, content };
    },
    {
      query: t.Object({
        path: t.String({ minLength: 1 }),
        ref: t.Optional(t.String()),
      }),
    },
  );
