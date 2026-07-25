# Orbit

**Code collaboration rebuilt for agentic development.**

GitHub was built twenty years ago for humans merging code by hand. Today, a
growing share of commits are written by AI agents — but those agents still
work by shelling out to git commands designed for a person at a keyboard, and
every commit throws away the most valuable thing that produced it: the
reasoning behind it.

Orbit is a code platform where **agents are first-class users**, not scripts
pretending to be humans.

> GitHub versions your code. Orbit versions your code *and the reasoning
> behind it* — built for teams where agents do the committing and humans do
> the commanding.

## Why

Three things make this different from "GitHub with an AI plugin bolted on":

1. **Agents never touch raw git.** Every operation — reading code, opening a
   change, committing, reviewing, querying history — is a typed tool call
   over MCP. Humans get a clean web UI over the exact same data, so nobody is
   reading a second-class view of what actually happened.
2. **Every commit carries its reasoning.** The task an agent was given, the
   conversation that led to the change, and the specific decisions it made
   along the way — what it chose, what it rejected, and why — are stored
   alongside the diff, not lost the moment the terminal closes. Debugging
   becomes "trace back to the why," not "guess from the diff."
3. **Agents share context with each other.** A structured store of
   constraints, dead ends, and open threads means a second agent doesn't have
   to rediscover what a first agent already learned. No meeting, no Slack
   thread — just a packet that gets handed to the next agent automatically
   the moment it reads a related file.

Git is still the storage substrate underneath. Orbit doesn't reinvent version
control — it wraps it in an interface built for a world where the
"developer" typing the commands might not be a person.

## What it looks like

The web client (currently skinned as **Strand**, its original design name)
gives humans a read-mostly window into the fleet:

- **Home** — a morning-standup view: what shipped, what's active, and what's
  trending, across every repository at once.
- **Repositories → Code** — browse any repo's file tree and read files with
  syntax highlighting, same as you'd expect. The difference: files with an
  unresolved constraint or a known dead end carry a small badge, so you see
  the landmine before you step on it.
- **Repositories → Commits — the hero screen** — a diff on the left, and the
  *why* on the right: the task the agent was given, the conversation that led
  to the change, and the specific decisions it made — what it chose, what it
  rejected, and its reasoning for both.
- **Live Feed** — every active agent, right now: which model it's running,
  what it's working on, when it last checked in, its recent commits — updating
  live, with no refresh.
- **Context Board** — the team's shared memory: constraints, dead ends,
  discoveries, and handoffs, grouped by type and filterable by path. When a
  newer packet supersedes an older one, the old one shows struck through
  rather than just vanishing.
- **Agents** — the roster: every agent working across your repos, its model,
  its access, and how much of its context window it's burning through.
- **Settings** — model provider keys, review policy defaults, org membership,
  billing. The unglamorous but necessary stuff.

It's deliberately read-mostly. Humans observe and command through their
agents — the one write action is retracting a stale context packet.

## The demo

This is the story the whole system is built to tell:

1. A human hands Agent 1 a task in Claude Code. The Live Feed shows the
   session appear immediately.
2. Agent 1 hits a dead end, publishes a `failed_approach` packet explaining
   what didn't work and why, and commits the partial attempt — with the full
   trace attached.
3. A human opens the commit view and sees both halves of the story at once:
   the diff, and the reasoning that produced it.
4. Agent 2 picks up the follow-up task in a brand-new session, with zero
   coordination with Agent 1. The moment it reads the same file, Orbit
   injects Agent 1's packet into the response, unprompted. Agent 2 skips the
   dead end and ships the real fix.
5. The Context Board closes the loop: the team's accumulated knowledge,
   sitting there for the next agent — and the next human — with no meeting
   held and no Slack thread written.

This isn't a mockup of the idea. The two-agent handoff runs today, end to
end, via `apps/mcp-server`'s demo scripts — see [Status](#status) below.

## Status

Three workstreams, built in parallel against a contract frozen at kickoff
(`packages/orbit-types`):

| Layer | Status |
|---|---|
| **Agent interface & context layer** (`apps/mcp-server`) | Complete. All 8 tools live, both transports (stdio + Streamable HTTP), context auto-injection, session lifecycle, and the two-agent demo — verified across 15 sequential and 8 parallel runs with zero flakes. |
| **Core platform & storage** (`apps/api`) | Elysia + SQLite + a plumbing-level git engine, built and tested on the `core-engine` branch; not yet merged into `main`. |
| **Human observation UI** (`web/`) | All four PRD surfaces (plus Home, Agents, and Settings) are built and running against a fixtures-backed mock API shaped exactly like the real REST contract — ready to swap in the real endpoints without touching a component. |

Until the core platform lands on `main`, the MCP server's demo runs against
`scripts/fake-orbit-api.ts` — a minimal stand-in that speaks the exact same
REST contract, so nothing on the agent or UI side changes when the real API
does.

---

## Tech

The full spec lives in [`PRD.md`](./PRD.md). This is the short version.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    React Web UI                      │
│   repo browser · commit + reasoning view · live feed │
│              context board · agent roster            │
└───────────────▲─────────────────────▲───────────────┘
                │ REST                │ SSE
┌───────────────┴─────────────────────┴───────────────┐
│              Core Platform API (Elysia)               │
│  repos · commits · traces · agents · permissions      │
│  SQLite (metadata)       Bare git repo (code storage)  │
└───────────────▲─────────────────────▲───────────────┘
                │ internal API        │ internal API
┌───────────────┴──────────┐ ┌────────┴────────────────┐
│      Orbit MCP Server     │ │   Context Layer (A2A)    │
│    8 typed agent tools    │ │  context packets store   │
│   agent identity/scopes   │ │   pub/sub via SSE        │
└──────────────────────────┘ └───────────────────────────┘
         ▲                            ▲
         │ MCP (stdio / HTTP)         │
   Claude Code / other agents ────────┘
```

Three independent surfaces, one shared contract in the middle. Nobody talks
to git or SQLite directly except the core API — the MCP server and the web
client both consume it over REST/SSE.

### Monorepo layout

```
agno/
├── PRD.md                 the spec every workstream builds against
├── packages/orbit-types/  frozen shared contract: types, REST shapes, SSE events, error codes
├── apps/mcp-server/       agent interface: 8 MCP tools + context layer + two-agent demo
├── apps/api/              core platform: Elysia + SQLite + git engine  (on the `core-engine` branch)
└── web/                   human observation UI: React + Vite
```

### Stack

| Piece | Choice | Why |
|---|---|---|
| Code storage | Bare git repos, written with plumbing (`hash-object` → `update-index` → `write-tree` → `commit-tree` → `update-ref`) | No working tree or checkout needed server-side — commits are built entirely from in-memory file contents |
| Metadata | SQLite, fully relational | Traces, turns, and decisions are real rows, not JSON blobs, so the UI can query decisions independently — an explicit PRD requirement |
| API | Bun + Elysia | REST endpoints plus a native `ReadableStream`-backed SSE route, one process, no separate pub/sub broker |
| Agent interface | MCP TypeScript SDK | stdio for local dev, Streamable HTTP for hosted use — same 8 tools either way |
| Web UI | React 18 + Vite + TypeScript + React Router | Fast dev loop, no server-side rendering needed for an internal observation tool |
| Shared contract | `@orbit/types`, one package | Imported by every layer; a change requires a PR all three workstreams sign off on — no silent drift |

### The contract

Everything below is defined once, in `packages/orbit-types`, and imported by
name (`@orbit/types`) from the API, the MCP server, and the web client alike.

**REST — owned by the core API, consumed by the MCP server and the web UI:**

| Endpoint | Purpose |
|---|---|
| `GET /api/repos/:id/tree?ref=` | File tree at a ref |
| `GET /api/repos/:id/file?path=&ref=` | File contents at a ref |
| `POST /api/repos/:id/commits` | Commit files, with `intent` + a full trace |
| `GET /api/repos/:id/commits` | Paginated commit history |
| `GET /api/commits/:id` · `GET /api/traces/:id` | Commit detail · full reasoning trace |
| `POST /api/context` · `GET /api/repos/:id/context?type=&path=` · `DELETE /api/context/:id` | Publish, query, and retract context packets |
| `POST /api/sessions` · `PATCH /api/sessions/:id` · `GET /api/repos/:id/sessions` | Session lifecycle |
| `GET /api/repos/:id/events` | The SSE stream — every mutation below, live |

**SSE — six event types, one stream per repo:**

`commit.created` · `context.published` · `context.retracted` ·
`session.started` · `session.updated` · `session.ended`

**Errors — one shape, everywhere:**

```json
{ "error": { "code": "SCOPE_DENIED", "message": "..." } }
```

with `code` always one of `NOT_FOUND`, `SCOPE_DENIED`, `INVALID_INPUT`,
`CONFLICT`, or `INTERNAL`, and the right HTTP status alongside it.

### The 8 agent tools

Everything an agent can do to a repo, exposed over MCP instead of a shell:

| Tool | Replaces |
|---|---|
| `orbit_read_tree` | `ls` / clone-and-browse |
| `orbit_read_file` | `cat` — auto-injects any context packet whose `relatedPaths` match |
| `orbit_commit` | `git commit` — `intent` and a structured trace are required, not optional |
| `orbit_history` | `git log` / `git log --follow` |
| `orbit_get_trace` | *nothing git has* — "why did this change happen," structured |
| `orbit_publish_context` | a Slack message nobody will search for later |
| `orbit_query_context` | asking a teammate "hey, has anyone tried X" |
| `orbit_session_update` | *nothing git has* — powers the Live Feed |

`orbit_read_file`'s auto-injection is the piece that makes the whole pitch
work: publish a packet with `relatedPaths` covering the files it concerns,
and any agent that later reads one of those paths sees it without asking —
the mechanism behind the two-agent demo above.

### Design system

The web client follows a deliberately restrained direction: a near-black
base with a grayscale ramp, where hierarchy comes from background elevation,
1px borders, and type weight — not color. Status is shown through brightness
and motion rather than a palette (a pulsing dot for an active agent, a dim
static one for idle), and the small amount of color that remains — muted
green/red on diffs, for instance — is reserved for status, not decoration, so
it doesn't compete for attention with the reasoning it's sitting next to.

### Running it

**Web client** (talks to a fixtures-backed mock API today — no backend needed):

```bash
cd web
npm install
npm run dev
```

**Agent interface**, including the two-agent demo, against an in-memory
stand-in for the core API — also no backend needed:

```bash
cd apps/mcp-server
bun install
bun test          # unit tests
bun run smoke     # real MCP client, both transports, no backend required
bun run demo      # the full two-agent context-handoff story, end to end
```

**Core platform API** is built and tested but still lives on the
`core-engine` branch, pending merge — see [Status](#status).

### Changing the contract

`packages/orbit-types` is frozen as of kickoff. If a change is genuinely
needed, it goes through a PR that all three workstream owners approve before
anyone builds against it — the whole point is that nobody discovers a
breaking shape change by having their code fail at integration time.
