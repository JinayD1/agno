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
