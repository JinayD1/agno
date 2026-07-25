// packages/orbit-types/src/index.ts
//
// FROZEN CONTRACTS (PRD §4). Any change requires a PR approved by all three
// workstreams. Workstreams A (api), B (mcp-server), and C (web) all build
// against these types. Do not add fields ad hoc.

// ─────────────────────────────────────────────────────────────────────────────
// §4.1 Core Types
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
  type: "constraint" | "failed_approach" | "open_thread" | "discovery" | "handoff";
  title: string; // max 120 chars
  body: string; // structured markdown, max 8000 chars
  relatedPaths: string[]; // files this context concerns
  supersedes: string | null; // packet id this replaces
  createdAt: string;
  expiresAt: string | null; // null = permanent
}

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
// §4.3 SSE Event Schema (Workstream A emits, B and C consume)
// ─────────────────────────────────────────────────────────────────────────────

export type OrbitEvent =
  | { type: "commit.created"; payload: OrbitCommit }
  | { type: "context.published"; payload: ContextPacket }
  | { type: "context.retracted"; payload: { id: string } }
  | { type: "session.started"; payload: AgentSession }
  | { type: "session.updated"; payload: AgentSession }
  | { type: "session.ended"; payload: { id: string } };

export type OrbitEventType = OrbitEvent["type"];

// ─────────────────────────────────────────────────────────────────────────────
// §4.4 Error Contract
// ─────────────────────────────────────────────────────────────────────────────

export type OrbitErrorCode =
  | "NOT_FOUND"
  | "SCOPE_DENIED"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "INTERNAL";

export interface OrbitErrorBody {
  error: {
    code: OrbitErrorCode;
    message: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Request payload contracts (derived from §4.2 endpoint bodies). These are the
// shapes clients send; server maps them onto the core types above.
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitFileInput {
  path: string;
  content: string;
}

export interface TraceInput {
  taskDescription: string;
  turns: TraceTurn[];
  decisions: Decision[];
}

export interface CreateCommitInput {
  files: CommitFileInput[];
  message: string;
  intent: string;
  agentId?: string | null;
  parentIds?: string[];
  trace?: TraceInput | null;
}
