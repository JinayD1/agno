# @orbit/mcp-server — Workstream B

The Orbit MCP server: agents interact with version control through typed tool
calls instead of raw git. This is the "agents are first-class users" pillar.

## Status — Task 1 complete

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
- One diagnostic tool, `orbit_whoami`, to verify the binding. The 8 core tools
  land in Tasks 2–5 by adding `register*Tools(server, ctx)` in `src/server.ts`.

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
bun test          # unit tests: errors, config, auth, rest client
bun run smoke     # end-to-end: real MCP client over stdio + http, no A required
```

`bun run smoke` connects a genuine MCP client over both transports, lists tools,
calls `orbit_whoami`, and checks that two different keys bind to two different
agents, invalid keys are rejected, and missing auth returns the §4.4 contract.

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
| `src/server.ts` | Per-connection `McpServer` factory; tool registration point |
| `src/transports/stdio.ts` | stdio transport |
| `src/transports/http.ts` | Streamable HTTP transport (per-session agent binding) |
| `src/tools/` | Tool context + tool registrations (diagnostics today) |

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `ORBIT_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `ORBIT_API_URL` | `http://localhost:4000` | Workstream A REST base |
| `ORBIT_REPO_ID` | — | Repo bound to this connection |
| `ORBIT_API_KEY` | — | stdio only; the agent's key |
| `ORBIT_AGENT_KEYS_FILE` | — | JSON key registry (or `ORBIT_AGENT_KEYS` inline) |
| `ORBIT_HTTP_PORT` | `8787` | HTTP transport port |
| `ORBIT_HTTP_PATH` | `/mcp` | MCP endpoint path |
| `ORBIT_CORS_ORIGINS` | — | Comma-separated allowlist (`*` allows all) |
| `ORBIT_LOG_LEVEL` | `info` | `debug`\|`info`\|`warn`\|`error` (stderr only) |
