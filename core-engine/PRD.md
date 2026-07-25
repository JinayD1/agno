# Orbit — PRD v1
### Code collaboration rebuilt for agentic development

---

## 1. Product Thesis

GitHub was built 20 years ago for humans merging code. Today, agents are the primary committers — but they interact with version control by shelling out to git commands designed for humans, and every commit throws away the most valuable artifact: the reasoning that produced it.

**Orbit is a code collaboration platform where agents are first-class users:**

1. **Agent-native interface.** Agents never run raw git commands. Every operation (read code, open a change, commit, review, merge, query history) is a typed tool call exposed via an MCP server. Humans get a clean web UI over the same data.
2. **Reasoning-attached commits.** Every commit stores not just the diff, but the conversation, intent, and decision trail that led to it. Debugging becomes "trace back to the why," not "guess from the diff."
3. **Agent context layer (A2A).** Agents on the same project share structured context — discovered constraints, failed approaches, open threads — through a shared context store with a pub/sub protocol, so parallel agents don't duplicate work or collide.

Git remains the storage substrate underneath. No migration required — Orbit syncs from existing repos.

### Positioning line
> "GitHub versions your code. Orbit versions your code *and the reasoning behind it* — built for teams where agents do the committing and humans do the commanding."

---

## 2. Scope for v1 (Prototype)

**In scope:**
- Single project / single repo per workspace
- Local git repo as storage backend (bare repo managed by the platform)
- MCP server with the core agent toolset (8 tools, defined below)
- Commit objects with attached ConversationTrace
- Agent identity + scoped permissions (path-level, merge yes/no)
- Shared context store with SSE-based live updates
- Web UI: repo browser, commit view w/ reasoning trace, live agent feed

**Out of scope for v1 (cut list):**
- GitHub sync/import (stub the interface, implement later)
- Multi-repo, orgs, billing, auth beyond simple API keys
- Vector/semantic code layer
- Merge conflict auto-resolution
- Non-Claude agent support

**Stack:** Bun + Elysia (backend), SQLite (metadata + context store), raw git via `simple-git` or direct CLI wrapping (storage), React + Vite (frontend), SSE (live updates), MCP TypeScript SDK (agent interface).

---

## 3. System Architecture (shared understanding)

```
┌─────────────────────────────────────────────────────┐
│                    React Web UI                      │  ← Workstream C
│   repo browser · commit + reasoning view · live feed │
└───────────────▲─────────────────────▲───────────────┘
                │ REST                │ SSE
┌───────────────┴─────────────────────┴───────────────┐
│              Core Platform API (Elysia)              │  ← Workstream A
│  repos · commits · traces · agents · permissions     │
│  SQLite (metadata)      Bare git repo (code storage) │
└───────────────▲─────────────────────▲───────────────┘
                │ internal API        │ internal API
┌───────────────┴──────────┐ ┌────────┴────────────────┐
│   Orbit MCP Server       │ │  Context Layer (A2A)     │  ← Workstream B
│  8 typed agent tools     │ │  context packets store   │
│  agent identity/scopes   │ │  pub/sub via SSE         │
└──────────────────────────┘ └─────────────────────────┘
         ▲                            ▲
         │ MCP (stdio/SSE)            │
   Claude Code / other agents ────────┘
```

---

## 4. Integration Contracts (READ FIRST — all three people)

These contracts are frozen before anyone writes feature code. All three workstreams build against them. They live in a shared package: `packages/orbit-types`.

### 4.1 Core Types

```typescript
// packages/orbit-types/src/index.ts

export interface AgentIdentity {
  id: string;                    // "agent_<nanoid>"
  name: string;                  // "claude-code-vibhor-1"
  model: string;                 // "claude-sonnet-4-6"
  ownerHuman: string;            // human responsible
  scopes: AgentScopes;
  createdAt: string;             // ISO 8601
}

export interface AgentScopes {
  pathsAllowed: string[];        // glob patterns, e.g. ["src/**", "!src/auth/**"]
  canMerge: boolean;
  canReview: boolean;
}

export interface OrbitCommit {
  id: string;                    // "commit_<nanoid>"
  gitSha: string;                // underlying git commit sha
  repoId: string;
  agentId: string | null;        // null = human commit
  message: string;
  intent: string;                // one-line "why", required for agent commits
  traceId: string | null;        // FK to ConversationTrace
  parentIds: string[];
  filesChanged: FileChange[];
  createdAt: string;
}

export interface ConversationTrace {
  id: string;                    // "trace_<nanoid>"
  commitId: string;
  taskDescription: string;       // what the agent was asked to do
  turns: TraceTurn[];            // ordered conversation excerpts
  decisions: Decision[];         // structured key decisions
  createdAt: string;
}

export interface TraceTurn {
  role: "human" | "agent" | "tool";
  content: string;               // may be truncated/summarized, max 4000 chars
  timestamp: string;
}

export interface Decision {
  question: string;              // "Which auth library?"
  chosen: string;                // "jose"
  rejected: string[];            // ["jsonwebtoken — no ESM support"]
  reasoning: string;
}

export interface ContextPacket {
  id: string;                    // "ctx_<nanoid>"
  repoId: string;
  agentId: string;               // author
  type: "constraint" | "failed_approach" | "open_thread" | "discovery" | "handoff";
  title: string;                 // max 120 chars
  body: string;                  // structured markdown, max 8000 chars
  relatedPaths: string[];        // files this context concerns
  supersedes: string | null;     // packet id this replaces
  createdAt: string;
  expiresAt: string | null;      // null = permanent
}

export interface AgentSession {
  id: string;                    // "session_<nanoid>"
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
```

### 4.2 REST API Contract (Workstream A owns, B and C consume)

```
POST   /api/repos                          create repo
GET    /api/repos/:id                      repo metadata
GET    /api/repos/:id/tree?ref=            file tree at ref
GET    /api/repos/:id/file?path=&ref=      file contents
POST   /api/repos/:id/commits              create commit (diff + trace)
GET    /api/repos/:id/commits              list commits (paginated)
GET    /api/commits/:id                    commit detail + trace
GET    /api/traces/:id                     full conversation trace

POST   /api/agents                         register agent identity
GET    /api/agents/:id                     agent detail
PATCH  /api/agents/:id/scopes              update permissions

POST   /api/context                        publish context packet
GET    /api/repos/:id/context?type=&path=  query packets (filterable)
DELETE /api/context/:id                    retract packet

POST   /api/sessions                       start session
PATCH  /api/sessions/:id                   heartbeat / update task / end
GET    /api/repos/:id/sessions             active sessions

GET    /api/repos/:id/events               SSE stream (all events below)
```

### 4.3 SSE Event Schema (Workstream A emits, B and C consume)

```typescript
export type OrbitEvent =
  | { type: "commit.created";  payload: OrbitCommit }
  | { type: "context.published"; payload: ContextPacket }
  | { type: "context.retracted"; payload: { id: string } }
  | { type: "session.started"; payload: AgentSession }
  | { type: "session.updated"; payload: AgentSession }
  | { type: "session.ended";   payload: { id: string } };
```

### 4.4 Error Contract

All API errors: `{ error: { code: string, message: string } }` with proper HTTP status. Codes: `NOT_FOUND`, `SCOPE_DENIED`, `INVALID_INPUT`, `CONFLICT`, `INTERNAL`.

---

## 5. Workstream A — Core Platform & Storage Engine
**Owner: Person 1**

The foundation everyone else builds on. Ship this API surface first (even with stub logic) so B and C are unblocked as early as possible.

### Responsibilities
- Elysia server scaffold, SQLite schema, migrations
- Git storage engine: bare repo per Orbit repo; commits applied via internal service (`applyChange(repoId, files, message) → gitSha`)
- All REST endpoints from §4.2
- SSE event bus (`/api/repos/:id/events`) — in-process emitter → SSE fanout
- Agent identity + scope enforcement middleware (glob path matching on every write)
- ConversationTrace storage and retrieval

### Key design decisions
- **SQLite schema:** tables `repos`, `commits`, `traces`, `trace_turns`, `decisions`, `agents`, `context_packets`, `sessions`. Traces stored relationally, not as JSON blobs, so the UI can query decisions independently.
- **Git isolation:** no other workstream touches git directly. The commit endpoint accepts `{ files: {path, content}[], message, intent, traceId }` and the engine writes the tree, commits, and returns the sha.
- **Scope enforcement lives here**, not in the MCP server. MCP passes agent identity; A is the single enforcement point (defense in depth: B also pre-checks for better error messages).

### Deliverables & sequence
1. Types package published, server scaffold, SQLite migrations
2. Repo CRUD + git engine + file tree/contents endpoints
3. Commit creation with trace attach + scope enforcement
4. Context packet + session endpoints
5. SSE event bus wired to all mutations
6. Seed script: demo repo + 2 agents + 10 traced commits

### Definition of done
- `bun test` passes for scope enforcement (allowed path, denied path, merge denied)
- Full commit round-trip: POST commit → git sha exists → GET commit returns trace
- SSE emits within 100ms of mutation

---

## 6. Workstream B — Agent Interface (MCP) & Context Layer (A2A)
**Owner: Person 2**

The "agents are first-class users" pillar. This is the demo star — a Claude Code session using Orbit tools instead of git.

### Responsibilities
- Orbit MCP server (TypeScript MCP SDK, stdio + SSE transports)
- The 8 core tools (below) — thin typed wrappers over Workstream A's REST API
- Agent auth: each MCP connection bound to one `AgentIdentity` via API key
- Context layer client behavior: auto-inject relevant context packets into tool responses
- Session lifecycle: register session on connect, heartbeat, end on disconnect

### The 8 tools (v1 toolset)

| Tool | Purpose | Notes |
|---|---|---|
| `orbit_read_tree` | Get file tree | Replaces `ls`/clone browsing |
| `orbit_read_file` | Read file at ref | Response includes any context packets whose `relatedPaths` match |
| `orbit_commit` | Commit files with intent + trace | **Requires** `intent`; trace turns auto-captured from session if available |
| `orbit_history` | Query commit history | Filterable by path, agent, since |
| `orbit_get_trace` | Full reasoning behind a commit | The "why did this change happen" tool |
| `orbit_publish_context` | Share a ContextPacket with other agents | Typed: constraint / failed_approach / discovery / open_thread / handoff |
| `orbit_query_context` | Pull context relevant to current task | Filter by type + path |
| `orbit_session_update` | Report current task | Powers the live human feed |

### Key design decisions
- **Context injection is the magic.** When an agent reads `src/auth/login.ts` and another agent previously published a `failed_approach` packet touching that path, the packet is appended to the read response automatically. The agent doesn't have to know to ask.
- **Trace capture:** v1 keeps it simple — `orbit_commit` accepts a `trace` argument the agent constructs (task, key turns, decisions). Auto-capture from Claude Code JSONL transcripts is a v2 fast-follow (you already scoped this pattern for the handoff-packet build).
- **A2A protocol = context packets over the shared store**, not direct agent-to-agent messaging. Async, durable, queryable beats live chat between agents for v1 — and it demos better ("agent 2 avoided agent 1's dead end without them ever talking").

### Deliverables & sequence
1. MCP scaffold + auth binding + `orbit_read_tree`/`orbit_read_file` against stub API
2. `orbit_commit` with intent + trace validation
3. Context tools + auto-injection on reads
4. Session lifecycle + `orbit_session_update`
5. End-to-end demo script: two Claude Code agents, one publishes `failed_approach`, second avoids it

### Definition of done
- Claude Code connects via `.mcp.json`, lists all 8 tools, completes a full task using only Orbit tools (no git commands)
- Context injection round-trip verified across two separate agent sessions
- Scope-denied write returns a clean, actionable error to the agent

---

## 7. Workstream C — Human Observation UI
**Owner: Person 3**

The "easy human observation" pillar. Humans command; the UI is their bridge into what the fleet is doing and why.

### Responsibilities
- React + Vite app, talks only to Workstream A's REST + SSE
- Four surfaces (below)
- Design system per the Cowork mockup (see COWORK_UI_PROMPT.md)

### Design direction
Linear × Conductor: all-dark, fully monochrome — no accent color. Grayscale ramp on a near-black base; hierarchy from background elevation, 1px borders, and type weight, never from color. Status via brightness and motion (bright pulsing dot = active, dim static = idle). Diffs use `+`/`-` gutters with elevation shifts instead of green/red. Grayscale syntax highlighting. Monospace for code/shas/paths, clean sans elsewhere.

### The four surfaces

1. **Repo browser** — file tree + file viewer with syntax highlighting. Inline badges on files that have active context packets ("2 constraints, 1 open thread").
2. **Commit view (the hero screen)** — split layout: diff on the left, reasoning on the right. Reasoning panel shows: task description → key conversation turns → structured decisions (chosen vs rejected with reasoning). This screen *is* the pitch.
3. **Live agent feed** — active sessions as cards: agent name, model, current task, last heartbeat, recent commits. Updates over SSE. Timeline of events below (commits, context published, sessions started/ended).
4. **Context board** — all active context packets grouped by type, filterable by path. Shows supersession chains. Humans can retract stale packets.

### Key design decisions
- Read-only in v1 except packet retraction. Humans observe and command through their agents; don't build human commit flows.
- SSE-first: the live feed must visibly update mid-demo with zero refresh.
- Build against a mock server (from the shared types + a fixtures file) until A's API is real — contracts in §4 make this safe.

### Deliverables & sequence
1. App scaffold + routing + mock API layer from fixtures
2. Repo browser + file viewer
3. Commit view with reasoning panel
4. Live feed over SSE
5. Context board
6. Swap mocks → real API, polish

### Definition of done
- Commit view renders a full trace (task, turns, decisions) legibly
- Live feed reflects an SSE event within 1s, no refresh
- Every screen works against the seed data from Workstream A

---

## 8. Integration Plan

**Kickoff (all three, together, ~2 hours):** freeze §4 contracts, publish `packages/orbit-types`, agree on monorepo layout:

```
orbit/
├── packages/orbit-types/        # shared contracts (frozen at kickoff)
├── apps/api/                    # Workstream A
├── apps/mcp-server/             # Workstream B
├── apps/web/                    # Workstream C
└── fixtures/                    # shared seed/demo data
```

**Continuous:** any contract change requires a PR to `orbit-types` approved by all three. No silent drift.

**Integration checkpoint 1 (after A's commit path and B's read/commit tools are done):** B's MCP tools hit A's real API for read + commit paths. C still on mocks.

**Integration checkpoint 2 (after A's full API and C's core screens are done):** C swaps to real API. Full loop test: Claude Code commits via MCP → SSE fires → commit appears in live feed → commit view shows trace.

**Demo hardening (final stretch):** run the two-agent context-sharing demo end-to-end 5 times. Fix flakes, script the narrative.

### The demo (what all of this builds toward)
1. Human assigns Agent 1 a task in Claude Code. Live feed shows the session appear.
2. Agent 1 hits a dead end, publishes a `failed_approach` packet, commits partial work with full trace.
3. Human opens the commit view — sees the diff *and* the reasoning: what was tried, what failed, why.
4. Agent 2 starts the follow-up task. On its first file read, Orbit injects Agent 1's packet. Agent 2 skips the dead end, ships the fix, commits with trace.
5. Close on the context board: the team's living knowledge, no meeting held, no Slack thread written.

---

## 9. Deployment

**Local-first for the demo** (no cold starts, no network flakes). Deployed URLs exist for sharing afterward.

| Piece | Where | Notes |
|---|---|---|
| `apps/web` | **Vercel** | Static Vite build. `VITE_API_URL` points at the Render API. |
| `apps/api` + `apps/mcp-server` | **Render** (one web service) | Elysia serves `/api/*` and `/mcp` from a single process. Long-lived process required for git engine, SQLite, and SSE — this is why it can't live on Vercel serverless. |
| Persistence | Render **disk** mounted at `/data` | SQLite file + `data/repos/` bare repos live here. Requires paid instance; free tier has no disk and spins down (killing SSE streams + sessions). |

Additional requirements:
- **MCP transport:** stdio for local dev; **Streamable HTTP** transport for the hosted server. Claude Code connects via `"type": "http"` + URL + `Authorization` header in `.mcp.json`.
- **CORS:** API allowlists the Vercel domain — `EventSource` SSE is CORS-sensitive.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Trace quality depends on agent cooperation | `intent` is a required commit field; trace validated against schema; reject empty traces |
| Context packets go stale and mislead agents | `supersedes` chains + `expiresAt` + human retraction in UI |
| Scope glob matching bugs = security theater | Single enforcement point (A) + dedicated test suite before any demo |
| SSE fanout flakiness during demo | Heartbeats + auto-reconnect in both MCP client and web UI |
| Three-way integration crunch | Contracts frozen at kickoff; two scheduled checkpoints; C on mocks until checkpoint 2 |
