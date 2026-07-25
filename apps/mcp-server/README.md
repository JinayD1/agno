# @orbit/mcp-server — Workstream B

The Orbit MCP server: agents interact with version control through typed tool
calls instead of raw git. This is the "agents are first-class users" pillar.

## Status — Tasks 1–6 complete

All of Workstream B's PRD §6 scope is in place and verified end-to-end:

- **MCP server scaffold** on the TypeScript SDK (`McpServer`).
- **Both transports**: `stdio` (local dev) and **Streamable HTTP** (hosted, §9),
  the latter on `Bun.serve` via the SDK's web-standard transport.
- **Auth binding**: every connection is bound to one `AgentIdentity` via API key
  (`Authorization: Bearer` for HTTP, `ORBIT_API_KEY` for stdio). Keys resolve
  through a registry (offline inline agent, or hydrated from Workstream A).
- **Internal REST client** that carries agent identity (`Authorization` +
  `X-Orbit-Agent-Id`) on every call to Workstream A (§4.2).
- **Typed error mapper** for A's error contract (§4.4: `NOT_FOUND`,
  `SCOPE_DENIED`, `INVALID_INPUT`, `CONFLICT`, `INTERNAL`) → clean, actionable
  MCP tool errors.
- **All 8 PRD tools** registered (plus `orbit_whoami` for diagnostics):
  `orbit_read_tree`, `orbit_read_file`, `orbit_commit`, `orbit_history`,
  `orbit_get_trace`, `orbit_publish_context`, `orbit_query_context`,
  `orbit_session_update` — all following the same wrapper pattern (validate
  input, resolve repoId, call `ctx.rest`, map errors via `toToolError`, return
  `content` + `structuredContent`).
- **Context auto-injection** (Task 4, "the magic"): `orbit_read_file` appends
  any context packets whose `relatedPaths` match the file just read.
- **Session lifecycle** (Task 5): register on connect, heartbeat, end on
  disconnect.
- **Two-agent demo** (Task 6): automated (`bun run demo`, loop-safe for
  flake-hunting) and manual (`bun run demo:server` + two live Claude Code
  sessions via `.mcp.demo-agent{1,2}.json`) versions of PRD §8's story,
  backed by an in-memory `fake-orbit-api.ts` stand-in for Workstream A.

### Definition of done (PRD §6)

- ✅ Claude Code connects via `.mcp.json`/`--mcp-config`, lists all 8 tools,
  completes a full task using only Orbit tools (no git commands) — verified
  by `scripts/smoke.ts` and `scripts/demo.ts`.
- ✅ Context injection round-trip verified across two separate agent sessions
  — `scripts/demo.ts`, run 15x sequentially + 8x in parallel with zero flakes.
- ✅ Scope-denied write returns a clean, actionable error to the agent —
  `test/commit.test.ts` and `test/context.test.ts`.

### `orbit_read_tree`

| | |
|---|---|
| Input | `repoId?: string` (defaults to the connection's bound repo), `ref?: string` (defaults to the repo's default branch) |
| Output | `{ repoId: string; ref: string; nodes: { path: string; type: "file" \| "dir"; size?: number }[] }` |

### `orbit_read_file`

| | |
|---|---|
| Input | `repoId?: string`, `path: string` (required, repo-relative), `ref?: string` |
| Output | `{ repoId: string; ref: string; path: string; content: string; size: number; context?: ContextPacket[] }` |

`context` is auto-injected (Task 4, PRD §6 "the magic"): after the file read
succeeds, the tool queries `GET /repos/:id/context?path=` for packets whose
`relatedPaths` match, and appends any hits to the response — omitted entirely
when nothing matches. The lookup is best-effort: if it fails, the file read
still succeeds and `context` is just absent, logged as a `warn`. See
`orbit_publish_context`/`orbit_query_context` below.

Both tools resolve `repoId` from the explicit argument first, falling back to
the connection's bound repo (`ORBIT_REPO_ID`); if neither is set they return a
clean `INVALID_INPUT` tool error rather than calling A.

### `orbit_commit` (Task 3)

| | |
|---|---|
| Input | `repoId?: string`, `files: { path: string; content: string }[]` (≥1), `message: string`, `intent: string` (required, one-line why), `trace: { taskDescription: string; turns: { role: "human"\|"agent"\|"tool"; content: string; timestamp: string }[] (≥1); decisions?: { question: string; chosen: string; rejected: string[]; reasoning: string }[] }` |
| Output | The created `OrbitCommit` |

Wraps `POST /repos/:id/commits`. `intent` and `trace` are validated against
`src/schemas.ts`'s `commitArgsSchema` — mirroring `ConversationTrace` — before
the request ever reaches A: missing `intent`, an empty/missing
`trace.taskDescription`, a `trace.turns` with zero entries, or a malformed
turn/decision all come back as one clean `INVALID_INPUT` tool error with a
fix-it hint, never touching the platform. The tool's advertised `inputSchema`
is intentionally permissive (types only) so *every* validation failure — not
just the ones the MCP SDK's own arg parser would catch — flows through that
same formatter, matching how A's `SCOPE_DENIED` (a disallowed write path)
comes back through the same `toToolError` pipeline: both look identical to
the agent.

### `orbit_publish_context` / `orbit_query_context` (Task 4)

| | |
|---|---|
| `orbit_publish_context` input | `repoId?: string`, `type: "constraint" \| "failed_approach" \| "open_thread" \| "discovery" \| "handoff"`, `title: string` (≤120 chars), `body: string` (≤8000 chars), `relatedPaths?: string[]` (defaults to `[]`), `supersedes?: string`, `expiresAt?: string \| null` |
| `orbit_publish_context` output | The created `ContextPacket` |
| `orbit_query_context` input | `repoId?: string`, `type?: ContextPacketType`, `path?: string` |
| `orbit_query_context` output | `{ packets: ContextPacket[] }` |

Wrap `POST /context` and `GET /repos/:id/context?type=&path=`. Like
`orbit_commit`, `orbit_publish_context`'s args are validated client-side
against `src/schemas.ts`'s `publishContextArgsSchema` before the request
reaches A — an invalid `type`, or `title`/`body` over their length limits,
comes back as one clean `INVALID_INPUT` tool error.

This pair is what makes `orbit_read_file`'s auto-injection possible: publish a
packet with `relatedPaths` covering the files it concerns, and any agent that
later reads one of those paths sees it without asking.

### Session lifecycle (Task 5)

Each connection registers an `AgentSession` on connect and ends it on
disconnect, via `src/session.ts`'s `SessionManager` (bound into `ToolContext`
as `ctx.session`, same pattern as `ctx.rest`):

- **Start** — `POST /api/sessions` fires as soon as the per-connection server is
  created (best-effort: a failure here logs and doesn't tear down the MCP
  connection — tools still work without session tracking). Skipped entirely if
  the connection isn't bound to a repo, since `StartSessionRequest` requires one.
- **Heartbeat** — `PATCH /api/sessions/:id` on an interval (`ORBIT_SESSION_HEARTBEAT_MS`,
  default 30s) while connected, so the live feed doesn't show a stale session.
- **End** — wired to the SDK's `server.onclose`, which fires on both an explicit
  `.close()` and a client-initiated disconnect, so `PATCH status: "ended"` fires
  either way.

### `orbit_session_update`

| | |
|---|---|
| Input | `currentTask: string \| null` (short description of the current subtask; `null` clears it) |
| Output | The updated `AgentSession` |

Reports the agent's current task on the session registered at connect —
powers the live human feed. Returns a `CONFLICT` tool error if session
registration hasn't completed or failed (e.g. no repo bound).

### `orbit_history`

| | |
|---|---|
| Input | `repoId?: string`, `path?: string`, `agentId?: string`, `since?: string` (ISO 8601), `limit?: number`, `cursor?: string` |
| Output | `{ commits: OrbitCommit[]; nextCursor?: string }` |

Wraps `GET /repos/:id/commits`, filterable by path/agent/since — replaces
`git log`/`git log --follow`.

### `orbit_get_trace`

| | |
|---|---|
| Input | `traceId: string` (usually a commit's `traceId` from `orbit_history`) |
| Output | The full `ConversationTrace`: `taskDescription`, `turns`, `decisions` |

Wraps `GET /traces/:id` — the "why did this change happen" tool.

## Demo (Task 6) — the two-agent context-sharing story

PRD §8's demo, runnable today without waiting on Workstream A, via
`scripts/fake-orbit-api.ts` — a minimal in-memory stand-in for A's REST API
(file/tree, commits, context, sessions) that speaks the exact §4.2 contract,
so nothing here changes once the real API ships.

**Automated (assertion-driven, safe to loop):**

```bash
bun run demo
# flake-hunting: run it N times, stop on first failure
for i in $(seq 1 20); do bun run demo || break; done
```

Boots the fake API + a real orbit-mcp HTTP server on a random port, then runs
the whole story over two separate MCP connections: agent 1 (`agent_dev1`)
reads `src/auth/login.ts`, hits a dead end on an in-memory rate limiter,
publishes a `failed_approach` packet, and commits the broken partial attempt
with a trace. Agent 2 (`agent_dev2`) then opens a brand-new connection, reads
the same file with zero coordination, and gets agent 1's packet
auto-injected — then ships the real (shared-store) fix. Each step is a
`check()`/`requireOk()` assertion; the script exits non-zero on any failure,
so the loop above is a real flake hunt, not just a demo replay.

**Manual (two live Claude Code sessions):**

```bash
bun run demo:server   # starts the fake API + orbit-mcp on a fixed port, blocks
```

Then, in two separate terminals, connect two real Claude Code sessions as two
different agent identities using the shipped connection configs
(`"type": "http"` + URL + `Authorization` header, PRD §9):

```bash
claude --mcp-config apps/mcp-server/.mcp.demo-agent1.json   # binds agent_dev1
claude --mcp-config apps/mcp-server/.mcp.demo-agent2.json   # binds agent_dev2
```

Ask terminal A to read `src/auth/login.ts`, add rate limiting, hit a dead end
on purpose, publish a `failed_approach`, and commit the partial work. Then ask
terminal B to finish the task — watch it receive terminal A's packet,
unprompted, on its first `orbit_read_file` call.

## Run

```bash
cp .env.example .env            # then edit
# stdio (default)
ORBIT_API_KEY=orbit_sk_dev_agent1 ORBIT_AGENT_KEYS_FILE=./keys.example.json bun run src/index.ts
# http
ORBIT_TRANSPORT=http ORBIT_AGENT_KEYS_FILE=./keys.example.json bun run src/index.ts
```

## Verify

```bash
bun test          # unit tests: errors, config, auth, rest client, read/commit/history/context tools
bun run smoke     # end-to-end: real MCP client over stdio + http, no A required
bun run demo      # end-to-end: two real agent sessions, context auto-injection, against fake-orbit-api.ts
```

`bun run smoke` connects a genuine MCP client over both transports, lists tools
(including schemas for `orbit_read_tree`/`orbit_read_file`), calls
`orbit_whoami`, and checks that two different keys bind to two different
agents, invalid keys are rejected, and missing auth returns the §4.4 contract.
It also calls the read tools to prove input validation and A-unreachable error
mapping — Workstream A doesn't exist in this repo yet, so `test/read.test.ts`
is what actually exercises a full REST round trip (via a mocked `fetch`).

`bun run demo` is the only check that runs *with* a (fake) Workstream A behind
it, so it's the one that actually proves the auto-injection round trip — see
[Demo (Task 6)](#demo-task-6--the-two-agent-context-sharing-story) above.

## Connecting Claude Code

See `.mcp.example.json` for the hosted form. HTTP form:

```json
{
  "mcpServers": {
    "orbit": {
      "type": "http",
      "url": "https://orbit-api.onrender.com/mcp",
      "headers": { "Authorization": "Bearer <your-agent-key>" }
    }
  }
}
```

For the local two-agent demo, use `.mcp.demo-agent1.json` / `.mcp.demo-agent2.json`
instead (same shape, pointed at `bun run demo:server`'s local port with each
demo agent's key baked in) — see [Demo (Task 6)](#demo-task-6--the-two-agent-context-sharing-story).

## Layout

| File | Purpose |
|---|---|
| `src/index.ts` | Entrypoint; selects transport from `ORBIT_TRANSPORT`/`--transport` |
| `src/config.ts` | Env config load + validation |
| `src/auth.ts` | API key → `AgentIdentity` binding (registry + A hydration) |
| `src/rest-client.ts` | Identity-carrying REST client for all §4.2 endpoints |
| `src/errors.ts` | `OrbitError` + §4.4 mapper + MCP tool-error formatting |
| `src/schemas.ts` | zod validation for `orbit_commit`'s `intent`/`trace` (Task 3) and `orbit_publish_context`'s args (Task 4) |
| `src/server.ts` | Per-connection `McpServer` factory; tool registration point |
| `src/session.ts` | `SessionManager` — session lifecycle (start/heartbeat/update/end) |
| `src/transports/stdio.ts` | stdio transport |
| `src/transports/http.ts` | Streamable HTTP transport (per-session agent binding) |
| `src/tools/` | Tool context + tool registrations (diagnostics, read, commit, history, session, context tools) |
| `src/tools/context-packets.ts` | `orbit_publish_context` + `orbit_query_context`, and the shared `contextPacketShape` `orbit_read_file` reuses for its injected `context` field |
| `scripts/smoke.ts` | End-to-end MCP client smoke test (Task 1–2), no backend required |
| `scripts/fake-orbit-api.ts` | In-memory §4.2 stand-in for Workstream A, used only by the demo scripts (Task 6) |
| `scripts/demo.ts` | Automated, assertion-driven two-agent demo — `bun run demo` |
| `scripts/demo-server.ts` | Manual two-terminal demo harness — `bun run demo:server` |
| `.mcp.demo-agent1.json` / `.mcp.demo-agent2.json` | Claude Code connection configs for the two demo agent identities |

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `ORBIT_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `ORBIT_API_URL` | `http://localhost:4000` | Workstream A REST base |
| `ORBIT_REPO_ID` | — | Repo bound to this connection |
| `ORBIT_API_KEY` | — | stdio only; the agent's key |
| `ORBIT_AGENT_KEYS_FILE` | — | JSON key registry (or `ORBIT_AGENT_KEYS` inline) |
| `ORBIT_SESSION_HEARTBEAT_MS` | `30000` | Session heartbeat interval |
| `ORBIT_HTTP_PORT` | `8787` | HTTP transport port |
| `ORBIT_HTTP_PATH` | `/mcp` | MCP endpoint path |
| `ORBIT_CORS_ORIGINS` | — | Comma-separated allowlist (`*` allows all) |
| `ORBIT_LOG_LEVEL` | `info` | `debug`\|`info`\|`warn`\|`error` (stderr only) |
