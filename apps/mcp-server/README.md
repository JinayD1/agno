# @orbit/mcp-server — Workstream B

The Orbit MCP server: agents interact with version control through typed tool
calls instead of raw git. This is the "agents are first-class users" pillar.

## Status — Tasks 1–2 complete

Foundation is in place and verified end-to-end:

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
- One diagnostic tool, `orbit_whoami`, to verify the binding.
- **Read tools** (`orbit_read_tree`, `orbit_read_file`) — thin typed wrappers
  over `GET /repos/:id/tree` and `GET /repos/:id/file` (§4.2), with zod
  input/output schemas registered via `outputSchema` so responses carry both
  `content` (human-readable) and schema-validated `structuredContent`. This is
  the wrapper pattern the remaining 6 tools (Tasks 3–5) follow.

The remaining core tools land in Tasks 3–5 by adding `register*Tools(server,
ctx)` calls in `src/server.ts`, same as `registerReadTools`.

### `orbit_read_tree`

| | |
|---|---|
| Input | `repoId?: string` (defaults to the connection's bound repo), `ref?: string` (defaults to the repo's default branch) |
| Output | `{ repoId: string; ref: string; nodes: { path: string; type: "file" \| "dir"; size?: number }[] }` |

### `orbit_read_file`

| | |
|---|---|
| Input | `repoId?: string`, `path: string` (required, repo-relative), `ref?: string` |
| Output | `{ repoId: string; ref: string; path: string; content: string; size: number }` |

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
bun test          # unit tests: errors, config, auth, rest client, read tools
bun run smoke     # end-to-end: real MCP client over stdio + http, no A required
```

`bun run smoke` connects a genuine MCP client over both transports, lists tools
(including schemas for `orbit_read_tree`/`orbit_read_file`), calls
`orbit_whoami`, and checks that two different keys bind to two different
agents, invalid keys are rejected, and missing auth returns the §4.4 contract.
It also calls the read tools to prove input validation and A-unreachable error
mapping — Workstream A doesn't exist in this repo yet, so `test/read.test.ts`
is what actually exercises a full REST round trip (via a mocked `fetch`).

## Connecting Claude Code

See `.mcp.example.json`. HTTP form:

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

## Layout

| File | Purpose |
|---|---|
| `src/index.ts` | Entrypoint; selects transport from `ORBIT_TRANSPORT`/`--transport` |
| `src/config.ts` | Env config load + validation |
| `src/auth.ts` | API key → `AgentIdentity` binding (registry + A hydration) |
| `src/rest-client.ts` | Identity-carrying REST client for all §4.2 endpoints |
| `src/errors.ts` | `OrbitError` + §4.4 mapper + MCP tool-error formatting |
| `src/schemas.ts` | zod validation for `orbit_commit`'s `intent` + `trace` args (Task 3) |
| `src/server.ts` | Per-connection `McpServer` factory; tool registration point |
| `src/session.ts` | `SessionManager` — session lifecycle (start/heartbeat/update/end) |
| `src/transports/stdio.ts` | stdio transport |
| `src/transports/http.ts` | Streamable HTTP transport (per-session agent binding) |
| `src/tools/` | Tool context + tool registrations (diagnostics, read, history, session tools today) |

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
