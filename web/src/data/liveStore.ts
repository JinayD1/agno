import type { AgentSession, OrbitEvent } from "@orbit/types";
import { REPOS, toFileChanges } from "./fixtures";
import { CONTEXT_PACKETS } from "./contextPackets";

// Mock stand-in for the SSE stream at GET /api/repos/:id/events (PRD §4.3).
// Seeds a plausible session/event history, then ticks heartbeats and rotates
// task text on an interval so the Live Feed visibly updates with zero
// refresh — same contract shape (OrbitEvent/AgentSession) a real
// EventSource-backed implementation would deliver, so swapping in the real
// stream later only touches this file.

const TASK_ROTATION: Record<string, string[]> = {
  atlas: [
    "Investigating payout worker timeout spikes",
    "Cross-checking AZ failover windows against retry logs",
    "Drafting a backoff tuning proposal",
  ],
  nova: [
    "Auditing contrast ratios across button variants",
    "Re-running visual regression suite",
    "Patching remaining spacing tokens",
  ],
  rho: [
    "Extending idempotency coverage to retried refunds",
    "Mapping refund retry edge cases",
    "Writing tests for the (order_id, amount) dedup layer",
  ],
};

let sessions: AgentSession[] = [
  { id: "session_atlas", agentId: "atlas", repoId: "payments-service", status: "active", currentTask: TASK_ROTATION.atlas[0], lastHeartbeat: "2026-07-25T09:11:00Z", startedAt: "2026-07-25T08:40:00Z" },
  { id: "session_nova", agentId: "nova", repoId: "design-system", status: "active", currentTask: TASK_ROTATION.nova[0], lastHeartbeat: "2026-07-25T13:24:00Z", startedAt: "2026-07-25T13:00:00Z" },
  { id: "session_rho", agentId: "rho", repoId: "payments-service", status: "active", currentTask: TASK_ROTATION.rho[0], lastHeartbeat: "2026-07-25T09:58:00Z", startedAt: "2026-07-24T16:35:00Z" },
  { id: "session_juno", agentId: "juno", repoId: "docs-site", status: "idle", currentTask: null, lastHeartbeat: "2026-07-23T16:22:00Z", startedAt: "2026-07-23T15:50:00Z" },
  { id: "session_vega", agentId: "vega", repoId: "infra-terraform", status: "idle", currentTask: null, lastHeartbeat: "2026-07-24T09:45:00Z", startedAt: "2026-07-24T09:00:00Z" },
];

function commit(repoId: string, commitId: string) {
  const repo = REPOS.find((r) => r.id === repoId)!;
  const c = repo.commits.find((x) => x.id === commitId)!;
  return { repoId, c };
}

function seedEvents(): OrbitEvent[] {
  const events: OrbitEvent[] = [];
  const push = (e: OrbitEvent) => events.push(e);

  push({ type: "session.started", payload: { ...sessions[4], status: "active" } });
  const { c: i1 } = commit("infra-terraform", "i1");
  push({ type: "commit.created", payload: toOrbitCommit("infra-terraform", i1) });
  push({ type: "session.started", payload: { ...sessions[3], status: "active" } });
  const packet1 = CONTEXT_PACKETS.find((p) => p.id === "ctx_ttl60")!;
  push({ type: "context.published", payload: packet1 });
  const { c: c1 } = commit("payments-service", "c1");
  push({ type: "context.published", payload: CONTEXT_PACKETS.find((p) => p.id === "ctx_redis_rejected")! });
  push({ type: "commit.created", payload: toOrbitCommit("payments-service", c1) });
  push({ type: "context.published", payload: CONTEXT_PACKETS.find((p) => p.id === "ctx_ttl90")! });
  const { c: c2 } = commit("payments-service", "c2");
  push({ type: "commit.created", payload: toOrbitCommit("payments-service", c2) });
  push({ type: "session.started", payload: sessions[1] });
  const { c: d1 } = commit("design-system", "d1");
  push({ type: "commit.created", payload: toOrbitCommit("design-system", d1) });

  return events;
}

// Minimal, mock-only OrbitCommit projection — see the note in types.ts about
// the local Commit model vs. the still-undefined GET /api/commits/:id shape.
function toOrbitCommit(repoId: string, c: ReturnType<typeof commit>["c"]) {
  return {
    id: `commit_${c.id}`,
    gitSha: c.gitSha,
    repoId,
    agentId: c.authorId,
    message: c.message,
    intent: c.intent,
    traceId: `trace_${c.id}`,
    parentIds: [],
    filesChanged: toFileChanges(c),
    createdAt: new Date().toISOString(),
  };
}

let events: OrbitEvent[] = seedEvents();

type Listener = (sessions: AgentSession[], events: OrbitEvent[], latest: OrbitEvent) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  const active = sessions.filter((s) => s.status === "active");
  if (active.length === 0) return;
  const target = active[Math.floor(Math.random() * active.length)]!;
  const rotation = TASK_ROTATION[target.agentId];
  const nextTask = rotation && Math.random() < 0.4 ? rotation[Math.floor(Math.random() * rotation.length)]! : target.currentTask;
  const updated: AgentSession = { ...target, lastHeartbeat: new Date().toISOString(), currentTask: nextTask };
  sessions = sessions.map((s) => (s.id === updated.id ? updated : s));
  const event: OrbitEvent = { type: "session.updated", payload: updated };
  events = [...events, event];
  for (const l of listeners) l(sessions, events, event);
}

export function getSessions(): AgentSession[] {
  return sessions;
}

export function getEvents(): OrbitEvent[] {
  return events;
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer) timer = setInterval(tick, 4500);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
