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
§4.2 contract, so nothing on the agent or UI side changes when the real API
does.
