// Thin async wrapper over the fixtures, standing in for Workstream A's REST
// API (PRD.md §4.2) plus its SSE stream (§4.3). Shaped to match the frozen
// @orbit/types contract wherever it applies, so swapping these bodies for
// real `fetch`/`EventSource` calls later is a call-site-only change.
import type { AgentSession, ContextPacket, ContextPacketType, OrbitEvent, TreeNode } from "@orbit/types";
import { AGENTS, HUMANS, REPOS, ACTIVITY, POSTS } from "../data/fixtures";
import { CONTEXT_PACKETS } from "../data/contextPackets";
import { FILE_TREE_NODES, fileContent } from "../data/fileTree";
import { getSessions, getEvents, subscribeLive } from "../data/liveStore";
import type { Agent, Human, Repo, ActivityItem, Post } from "../types";

export async function getAgents(): Promise<Agent[]> {
  return AGENTS;
}

export async function getHumans(): Promise<Human[]> {
  return HUMANS;
}

export async function getRepos(): Promise<Repo[]> {
  return REPOS;
}

export async function getRepo(id: string): Promise<Repo | undefined> {
  return REPOS.find((r) => r.id === id);
}

export async function getActivity(): Promise<ActivityItem[]> {
  return ACTIVITY;
}

export async function getPosts(): Promise<Post[]> {
  return POSTS;
}

/** GET /api/repos/:id/tree?ref= */
export async function getRepoTree(repoId: string): Promise<TreeNode[]> {
  return FILE_TREE_NODES[repoId] ?? [];
}

/** GET /api/repos/:id/file?path=&ref= */
export async function getRepoFile(repoId: string, path: string): Promise<string> {
  return fileContent(repoId, path);
}

/** GET /api/repos/:id/context?type=&path= */
export async function getRepoContext(
  repoId: string,
  filter?: { type?: ContextPacketType; path?: string }
): Promise<ContextPacket[]> {
  return CONTEXT_PACKETS.filter((p) => {
    if (p.repoId !== repoId) return false;
    if (filter?.type && p.type !== filter.type) return false;
    if (filter?.path && !p.relatedPaths.includes(filter.path)) return false;
    return true;
  });
}

/** GET, all repos — the real endpoint is repo-scoped; this mock aggregates for a fleet-wide Context Board. */
export async function getAllContext(): Promise<ContextPacket[]> {
  return CONTEXT_PACKETS;
}

/** DELETE /api/context/:id — the only human-actionable write in v1's read-only UI. */
export async function retractContext(id: string): Promise<void> {
  const idx = CONTEXT_PACKETS.findIndex((p) => p.id === id);
  if (idx !== -1) CONTEXT_PACKETS.splice(idx, 1);
}

/** GET, all repos — the real endpoint is repo-scoped (GET /api/repos/:id/sessions); this mock aggregates for the fleet-wide Live Feed. */
export async function getAllSessions(): Promise<AgentSession[]> {
  return getSessions();
}

export async function getInitialEvents(): Promise<OrbitEvent[]> {
  return getEvents();
}

/** GET /api/repos/:id/events (SSE) — mock ticker standing in until A's stream exists. */
export function subscribeEvents(onUpdate: (sessions: AgentSession[], events: OrbitEvent[], latest: OrbitEvent) => void): () => void {
  return subscribeLive(onUpdate);
}
