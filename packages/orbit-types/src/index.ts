// packages/orbit-types/src/index.ts
//
// Orbit shared contracts — FROZEN at kickoff (PRD §4).
// Any change requires a PR approved by all three workstreams. No silent drift.

// ─────────────────────────────────────────────────────────────────────────────
// 4.1 Core Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentIdentity {
  id: string; // "agent_<nanoid>"
  name: string; // "claude-code-vibhor-1"
  model: string; // "claude-sonnet-4-6"
  ownerHuman: string; // human responsible
  scopes: AgentScopes;
  createdAt: string; // ISO 8601
}

export interface AgentScopes {
  pathsAllowed: string[]; // glob patterns, e.g. ["src/**", "!src/auth/**"]
  canMerge: boolean;
  canReview: boolean;
}

export interface OrbitCommit {
  id: string; // "commit_<nanoid>"
  gitSha: string; // underlying git commit sha
  repoId: string;
  agentId: string | null; // null = human commit
  message: string;
  intent: string; // one-line "why", required for agent commits
  traceId: string | null; // FK to ConversationTrace
  parentIds: string[];
  filesChanged: FileChange[];
  createdAt: string;
}

export interface ConversationTrace {
  id: string; // "trace_<nanoid>"
  commitId: string;
  taskDescription: string; // what the agent was asked to do
  turns: TraceTurn[]; // ordered conversation excerpts
  decisions: Decision[]; // structured key decisions
  createdAt: string;
}

export interface TraceTurn {
  role: "human" | "agent" | "tool";
  content: string; // may be truncated/summarized, max 4000 chars
  timestamp: string;
}

export interface Decision {
  question: string; // "Which auth library?"
  chosen: string; // "jose"
  rejected: string[]; // ["jsonwebtoken — no ESM support"]
  reasoning: string;
}

export interface ContextPacket {
  id: string; // "ctx_<nanoid>"
  repoId: string;
  agentId: string; // author
  type: ContextPacketType;
  title: string; // max 120 chars
  body: string; // structured markdown, max 8000 chars
  relatedPaths: string[]; // files this context concerns
  supersedes: string | null; // packet id this replaces
  createdAt: string;
  expiresAt: string | null; // null = permanent
}

export type ContextPacketType =
  | "constraint"
  | "failed_approach"
  | "open_thread"
  | "discovery"
  | "handoff";

export interface AgentSession {
  id: string; // "session_<nanoid>"
  agentId: string;
  repoId: string;
  status: "active" | "idle" | "ended";
  currentTask: string | null;
  lastHeartbeat: string;
  startedAt: string;
}

export interface FileChange {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.3 SSE Event Schema (Workstream A emits, B and C consume)
// ─────────────────────────────────────────────────────────────────────────────

export type OrbitEvent =
  | { type: "commit.created"; payload: OrbitCommit }
  | { type: "context.published"; payload: ContextPacket }
  | { type: "context.retracted"; payload: { id: string } }
  | { type: "session.started"; payload: AgentSession }
  | { type: "session.updated"; payload: AgentSession }
  | { type: "session.ended"; payload: { id: string } };

// ─────────────────────────────────────────────────────────────────────────────
// 4.4 Error Contract
// All API errors: { error: { code, message } } with proper HTTP status.
// ─────────────────────────────────────────────────────────────────────────────

export const ORBIT_ERROR_CODES = [
  "NOT_FOUND",
  "SCOPE_DENIED",
  "INVALID_INPUT",
  "CONFLICT",
  "INTERNAL",
] as const;

export type OrbitErrorCode = (typeof ORBIT_ERROR_CODES)[number];

export interface OrbitErrorBody {
  error: {
    code: OrbitErrorCode;
    message: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 REST API Contract (Workstream A owns, B and C consume)
//
// Request/response shapes B relies on. Path/query params are documented inline;
// bodies below are the payloads B's REST client sends.
// ─────────────────────────────────────────────────────────────────────────────

/** Node in a repo file tree (GET /api/repos/:id/tree). */
export interface TreeNode {
  path: string; // repo-relative path
  type: "file" | "dir";
  size?: number; // bytes, files only
}

/** GET /api/repos/:id/tree?ref= */
export interface ReadTreeResponse {
  repoId: string;
  ref: string; // resolved ref (branch/sha)
  nodes: TreeNode[];
}

/** GET /api/repos/:id/file?path=&ref= */
export interface ReadFileResponse {
  repoId: string;
  ref: string;
  path: string;
  content: string;
  size: number;
}

/** POST /api/repos/:id/commits — body */
export interface CreateCommitRequest {
  files: Array<{ path: string; content: string }>;
  message: string;
  intent: string;
  trace?: CreateTraceInput | null;
}

/** Trace as constructed by the agent for a commit (v1: agent-supplied). */
export interface CreateTraceInput {
  taskDescription: string;
  turns: TraceTurn[];
  decisions: Decision[];
}

/** POST /api/context — body (endpoint is not repo-scoped, so repoId travels in body) */
export interface PublishContextRequest {
  repoId: string;
  type: ContextPacketType;
  title: string;
  body: string;
  relatedPaths: string[];
  supersedes?: string | null;
  expiresAt?: string | null;
}

/** POST /api/sessions — body */
export interface StartSessionRequest {
  repoId: string;
  currentTask?: string | null;
}

/** PATCH /api/sessions/:id — body (heartbeat / update task / end) */
export interface UpdateSessionRequest {
  status?: AgentSession["status"];
  currentTask?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side payload aliases (Workstream A). The core API (apps/api) was built
// against these names; they are structurally compatible with the client-facing
// request types above and kept here so all three workstreams share one package.
// ─────────────────────────────────────────────────────────────────────────────

/** A single file write in a commit (== the inline `{ path, content }` above). */
export interface CommitFileInput {
  path: string;
  content: string;
}

/** Trace attached to a commit — server-side alias of `CreateTraceInput`. */
export interface TraceInput {
  taskDescription: string;
  turns: TraceTurn[];
  decisions: Decision[];
}

/**
 * POST /api/repos/:id/commits — body as A parses it. Superset of
 * `CreateCommitRequest`: the server also accepts an explicit `agentId`
 * (the authoring agent, injected by the MCP server) and `parentIds`.
 */
export interface CreateCommitInput {
  files: CommitFileInput[];
  message: string;
  intent: string;
  agentId?: string | null;
  parentIds?: string[];
  trace?: TraceInput | null;
}

/** Convenience alias for the discriminant of `OrbitEvent`. */
export type OrbitEventType = OrbitEvent["type"];
