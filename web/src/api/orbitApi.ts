// Real API client for Workstream A (PRD §4.2 REST + §4.3 SSE). Mirrors the
// surface of `mockApi.ts` so the two are interchangeable behind `api/index.ts`
// (selected by VITE_API_URL). Non-A surfaces (humans, posts, activity) fall back
// to fixtures — A doesn't back them — so only the four live surfaces (repo
// browser, context board, live feed) actually hit the network.
//
// A is single-repo in v1, so every repo-scoped call is bound to VITE_ORBIT_REPO_ID.
// Agent metadata isn't carried on sessions/commits/packets, so we lazily hydrate
// it from `GET /api/agents/:id` into the shared fixture registries the existing
// components already read (agentById / resolvePerson) — no component changes needed.
import type {
  AgentIdentity,
  AgentSession,
  ContextPacket,
  ContextPacketType,
  OrbitCommit,
  OrbitEvent,
  TreeNode,
} from "@orbit/types";
import { AGENTS, REPOS } from "../data/fixtures";
import type { Agent } from "../types";

// Non-A surfaces are identical to the mock — re-export them unchanged.
export { getHumans, getPosts, getActivity, getRepos, getRepo, getAgents } from "./mockApi";

const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const REPO = import.meta.env.VITE_ORBIT_REPO_ID ?? "";
const REPO_NAME = import.meta.env.VITE_ORBIT_REPO_NAME ?? REPO;

// Register the live repo into the shared list at module load (synchronous) so it
// shows up in the repo browser the moment the app boots in real mode. `main.tsx`
// imports the api barrel for this side effect.
if (API && REPO && !REPOS.some((r) => r.id === REPO)) {
  REPOS.unshift({
    id: REPO,
    name: REPO_NAME,
    visibility: "Private",
    description: "Live Orbit repo — backed by Workstream A",
    language: "TypeScript",
    langColor: "#6E88B3",
    activity: "live",
    agentIds: [],
    trendNote: "connected to Workstream A",
    commits: [],
  });
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Lazily pull an agent's identity from A and register it so agentById /
// resolvePerson resolve it in the live feed and context board.
const hydrating = new Map<string, Promise<void>>();
async function hydrateAgent(agentId: string | null): Promise<void> {
  if (!agentId || AGENTS.some((a) => a.id === agentId) || hydrating.has(agentId)) {
    return hydrating.get(agentId ?? "");
  }
  const p = (async () => {
    try {
      const a = await get<AgentIdentity>(`/api/agents/${encodeURIComponent(agentId)}`);
      if (!AGENTS.some((x) => x.id === a.id)) {
        const agent: Agent = {
          id: a.id,
          name: a.name,
          model: a.model,
          role: "Agent",
          status: "active",
          initials: initialsOf(a.name),
          repos: 1,
          commitsWeek: 0,
          contextUsed: 0,
        };
        AGENTS.push(agent);
      }
    } catch {
      // Non-fatal: the component falls back to showing the raw id.
    }
  })();
  hydrating.set(agentId, p);
  return p;
}

async function hydrateAgents(ids: (string | null)[]): Promise<void> {
  await Promise.all([...new Set(ids)].map((id) => hydrateAgent(id)));
}

// ── Repo browser ──────────────────────────────────────────────────────────────

/** GET /api/repos/:id/tree?ref= */
export async function getRepoTree(repoId: string): Promise<TreeNode[]> {
  const { nodes } = await get<{ nodes: TreeNode[] }>(`/api/repos/${encodeURIComponent(repoId)}/tree`);
  return nodes;
}

/** GET /api/repos/:id/file?path=&ref= */
export async function getRepoFile(repoId: string, path: string): Promise<string> {
  const r = await get<{ content: string }>(
    `/api/repos/${encodeURIComponent(repoId)}/file?path=${encodeURIComponent(path)}`,
  );
  return r.content;
}

/** GET /api/repos/:id/context?type=&path= */
export async function getRepoContext(
  repoId: string,
  filter?: { type?: ContextPacketType; path?: string },
): Promise<ContextPacket[]> {
  const qs = new URLSearchParams();
  if (filter?.type) qs.set("type", filter.type);
  if (filter?.path) qs.set("path", filter.path);
  const query = qs.toString();
  const { packets } = await get<{ packets: ContextPacket[] }>(
    `/api/repos/${encodeURIComponent(repoId)}/context${query ? `?${query}` : ""}`,
  );
  await hydrateAgents(packets.map((p) => p.agentId));
  return packets;
}

// ── Context board ─────────────────────────────────────────────────────────────

export async function getAllContext(): Promise<ContextPacket[]> {
  return getRepoContext(REPO);
}

/** DELETE /api/context/:id */
export async function retractContext(id: string): Promise<void> {
  const res = await fetch(`${API}/api/context/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE context ${id} → ${res.status}`);
}

// ── Live feed ─────────────────────────────────────────────────────────────────

export async function getAllSessions(): Promise<AgentSession[]> {
  const { sessions } = await get<{ sessions: AgentSession[] }>(
    `/api/repos/${encodeURIComponent(REPO)}/sessions`,
  );
  await hydrateAgents(sessions.map((s) => s.agentId));
  return sessions;
}

// A exposes no "list events" endpoint (SSE only), so seed the timeline by
// composing the current commits + context packets + sessions into OrbitEvents.
export async function getInitialEvents(): Promise<OrbitEvent[]> {
  const [commitsRes, packets, sessions] = await Promise.all([
    get<{ commits: OrbitCommit[] }>(`/api/repos/${encodeURIComponent(REPO)}/commits`),
    getRepoContext(REPO),
    getAllSessions(),
  ]);
  const events: OrbitEvent[] = [
    ...commitsRes.commits.map((c) => ({ type: "commit.created" as const, payload: c })),
    ...packets.map((p) => ({ type: "context.published" as const, payload: p })),
    ...sessions.map((s) => ({ type: "session.started" as const, payload: s })),
  ];
  await hydrateAgents([
    ...commitsRes.commits.map((c) => c.agentId),
    ...packets.map((p) => p.agentId),
    ...sessions.map((s) => s.agentId),
  ]);
  // Oldest → newest; the live feed reverses for display.
  return events.sort((a, b) => tsOf(a).localeCompare(tsOf(b)));
}

function tsOf(e: OrbitEvent): string {
  switch (e.type) {
    case "commit.created":
    case "context.published":
      return e.payload.createdAt;
    case "session.started":
      return e.payload.startedAt;
    case "session.updated":
      return e.payload.lastHeartbeat;
    default:
      return "";
  }
}

/**
 * GET /api/repos/:id/events (SSE). Maintains a local session + event list seeded
 * from the initial fetch, applies each incoming OrbitEvent, and notifies the
 * caller with the same (sessions, events, latest) shape the mock ticker used.
 */
export function subscribeEvents(
  onUpdate: (sessions: AgentSession[], events: OrbitEvent[], latest: OrbitEvent) => void,
): () => void {
  let sessions: AgentSession[] = [];
  let events: OrbitEvent[] = [];

  // Seed local state from the current snapshot before applying live deltas.
  void Promise.all([getAllSessions(), getInitialEvents()]).then(([s, e]) => {
    sessions = s;
    events = e;
  });

  const es = new EventSource(`${API}/api/repos/${encodeURIComponent(REPO)}/events`);

  const apply = (event: OrbitEvent) => {
    events = [...events, event];
    switch (event.type) {
      case "session.started":
      case "session.updated": {
        const s = event.payload;
        void hydrateAgent(s.agentId);
        sessions = sessions.some((x) => x.id === s.id)
          ? sessions.map((x) => (x.id === s.id ? s : x))
          : [...sessions, s];
        break;
      }
      case "session.ended":
        sessions = sessions.filter((x) => x.id !== event.payload.id);
        break;
      case "commit.created":
      case "context.published":
        void hydrateAgent(event.payload.agentId);
        break;
    }
    onUpdate(sessions, events, event);
  };

  const handler = (type: OrbitEvent["type"]) => (ev: MessageEvent) => {
    try {
      apply({ type, payload: JSON.parse(ev.data) } as OrbitEvent);
    } catch {
      // ignore malformed frame
    }
  };

  const types: OrbitEvent["type"][] = [
    "commit.created",
    "context.published",
    "context.retracted",
    "session.started",
    "session.updated",
    "session.ended",
  ];
  for (const t of types) es.addEventListener(t, handler(t));

  return () => es.close();
}
