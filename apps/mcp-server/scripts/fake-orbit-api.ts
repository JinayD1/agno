#!/usr/bin/env bun
/**
 * Minimal in-memory stand-in for Workstream A's REST API (PRD §4.2).
 *
 * Implements just enough of the contract for `scripts/demo.ts` /
 * `scripts/demo-server.ts` to run for real — file read/tree, commits,
 * context packets, sessions — so Workstream B's demo doesn't block on
 * Workstream A shipping. Speaks the exact §4.2 request/response shapes, so
 * nothing on the MCP server side (`src/rest-client.ts`) needs to change when
 * the real API is available; this file can simply be deleted then.
 *
 * Not a reference implementation of A's design (no SQLite, no git engine, no
 * scope enforcement) — just enough state to make the demo's story true.
 */

import { nanoid } from "nanoid";
import type { AgentSession, ContextPacket, FileChange, OrbitCommit, OrbitErrorBody, OrbitErrorCode } from "@orbit/types";

export interface FakeOrbitApi {
  url: string;
  /** Seed a file's initial content, as if committed at repo setup. */
  seedFile(repoId: string, path: string, content: string): void;
  stop(): void;
}

interface RepoState {
  files: Map<string, string>;
  commits: OrbitCommit[];
}

function fakeGitSha(): string {
  return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function startFakeOrbitApi(opts: { port?: number } = {}): FakeOrbitApi {
  const repos = new Map<string, RepoState>();
  const contextPackets: ContextPacket[] = [];
  const sessions = new Map<string, AgentSession>();

  function repo(id: string): RepoState {
    let r = repos.get(id);
    if (!r) {
      r = { files: new Map(), commits: [] };
      repos.set(id, r);
    }
    return r;
  }

  function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
  }

  function errorRes(status: number, code: OrbitErrorCode, message: string): Response {
    const body: OrbitErrorBody = { error: { code, message } };
    return json(body, status);
  }

  const server = Bun.serve({
    port: opts.port ?? 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const agentId = req.headers.get("x-orbit-agent-id") ?? "agent_unknown";
      const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api", "repos", ":id", "file"]

      try {
        if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "repos" && parts[3] === "tree") {
          const repoId = decodeURIComponent(parts[2]!);
          const ref = url.searchParams.get("ref") ?? "main";
          const r = repo(repoId);
          const nodes = [...r.files.entries()].map(([path, content]) => ({ path, type: "file" as const, size: content.length }));
          return json({ repoId, ref, nodes });
        }

        if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "repos" && parts[3] === "file") {
          const repoId = decodeURIComponent(parts[2]!);
          const path = url.searchParams.get("path");
          const ref = url.searchParams.get("ref") ?? "main";
          if (!path) return errorRes(400, "INVALID_INPUT", "path query param is required");
          const content = repo(repoId).files.get(path);
          if (content === undefined) return errorRes(404, "NOT_FOUND", `No file at "${path}" in ${repoId}@${ref}`);
          return json({ repoId, ref, path, content, size: content.length });
        }

        if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "repos" && parts[3] === "commits") {
          const repoId = decodeURIComponent(parts[2]!);
          const body = (await req.json()) as {
            files: Array<{ path: string; content: string }>;
            message: string;
            intent: string;
            trace?: { taskDescription: string; turns: unknown[]; decisions: unknown[] } | null;
          };
          const r = repo(repoId);
          const filesChanged: FileChange[] = body.files.map((f) => {
            const existing = r.files.get(f.path);
            const changeType: FileChange["changeType"] = existing === undefined ? "added" : "modified";
            r.files.set(f.path, f.content);
            return { path: f.path, changeType, additions: f.content.split("\n").length, deletions: 0 };
          });
          const commit: OrbitCommit = {
            id: `commit_${nanoid(10)}`,
            gitSha: fakeGitSha(),
            repoId,
            agentId,
            message: body.message,
            intent: body.intent,
            traceId: body.trace ? `trace_${nanoid(10)}` : null,
            parentIds: r.commits.length > 0 ? [r.commits[r.commits.length - 1]!.id] : [],
            filesChanged,
            createdAt: new Date().toISOString(),
          };
          r.commits.push(commit);
          return json(commit, 201);
        }

        if (req.method === "POST" && parts.length === 2 && parts[0] === "api" && parts[1] === "context") {
          const body = (await req.json()) as {
            repoId: string;
            type: ContextPacket["type"];
            title: string;
            body: string;
            relatedPaths?: string[];
            supersedes?: string | null;
            expiresAt?: string | null;
          };
          const packet: ContextPacket = {
            id: `ctx_${nanoid(10)}`,
            repoId: body.repoId,
            agentId,
            type: body.type,
            title: body.title,
            body: body.body,
            relatedPaths: body.relatedPaths ?? [],
            supersedes: body.supersedes ?? null,
            createdAt: new Date().toISOString(),
            expiresAt: body.expiresAt ?? null,
          };
          contextPackets.push(packet);
          return json(packet, 201);
        }

        if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "repos" && parts[3] === "context") {
          const repoId = decodeURIComponent(parts[2]!);
          const type = url.searchParams.get("type");
          const path = url.searchParams.get("path");
          const packets = contextPackets.filter((p) => {
            if (p.repoId !== repoId) return false;
            if (type && p.type !== type) return false;
            if (path && !p.relatedPaths.includes(path)) return false;
            return true;
          });
          return json({ packets });
        }

        if (req.method === "DELETE" && parts.length === 3 && parts[0] === "api" && parts[1] === "context") {
          const id = decodeURIComponent(parts[2]!);
          const idx = contextPackets.findIndex((p) => p.id === id);
          if (idx === -1) return errorRes(404, "NOT_FOUND", `No context packet "${id}"`);
          contextPackets.splice(idx, 1);
          return new Response(null, { status: 204 });
        }

        if (req.method === "POST" && parts.length === 2 && parts[0] === "api" && parts[1] === "sessions") {
          const body = (await req.json()) as { repoId: string; currentTask?: string | null };
          const session: AgentSession = {
            id: `session_${nanoid(10)}`,
            agentId,
            repoId: body.repoId,
            status: "active",
            currentTask: body.currentTask ?? null,
            lastHeartbeat: new Date().toISOString(),
            startedAt: new Date().toISOString(),
          };
          sessions.set(session.id, session);
          return json(session, 201);
        }

        if (req.method === "PATCH" && parts.length === 3 && parts[0] === "api" && parts[1] === "sessions") {
          const id = decodeURIComponent(parts[2]!);
          const existing = sessions.get(id);
          if (!existing) return errorRes(404, "NOT_FOUND", `No session "${id}"`);
          const body = (await req.json()) as { status?: AgentSession["status"]; currentTask?: string | null };
          const updated: AgentSession = {
            ...existing,
            status: body.status ?? existing.status,
            currentTask: body.currentTask !== undefined ? body.currentTask : existing.currentTask,
            lastHeartbeat: new Date().toISOString(),
          };
          sessions.set(id, updated);
          return json(updated);
        }

        return errorRes(404, "NOT_FOUND", `No route for ${req.method} ${url.pathname}`);
      } catch (err) {
        return errorRes(500, "INTERNAL", err instanceof Error ? err.message : String(err));
      }
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    seedFile(repoId, path, content) {
      repo(repoId).files.set(path, content);
    },
    stop() {
      server.stop(true);
    },
  };
}

if (import.meta.main) {
  const api = startFakeOrbitApi({ port: Number(process.env.PORT ?? 4500) });
  console.log(`fake-orbit-api listening on ${api.url}`);
}
