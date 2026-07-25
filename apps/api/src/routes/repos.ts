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
      const ref = query.ref ?? repo.defaultBranch;
      const entries = await readTree(params.id, ref);
      // Frozen §4.2 contract: `nodes` with a "file" | "dir" type (git blob/tree).
      const nodes = entries.map((e) => ({
        path: e.path,
        type: e.type === "tree" ? ("dir" as const) : ("file" as const),
      }));
      return { repoId: params.id, ref, nodes };
    },
    { query: t.Object({ ref: t.Optional(t.String()) }) },
  )
  .get(
    "/api/repos/:id/file",
    async ({ params, query }) => {
      const repo = requireRepo(db(), params.id);
      const ref = query.ref ?? repo.defaultBranch;
      const content = await readFile(params.id, query.path, ref);
      // `size` is part of the frozen ReadFileResponse; derive it from the bytes.
      return {
        repoId: params.id,
        path: query.path,
        ref,
        content,
        size: Buffer.byteLength(content, "utf8"),
      };
    },
    {
      query: t.Object({
        path: t.String({ minLength: 1 }),
        ref: t.Optional(t.String()),
      }),
    },
  );
