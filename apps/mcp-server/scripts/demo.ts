#!/usr/bin/env bun
/**
 * End-to-end two-agent context-sharing demo (PRD §6 deliverable #5, §8 "the demo").
 *
 *   bun run demo
 *
 * Runs the full narrative for real, over two separate MCP connections against
 * one live orbit-mcp HTTP server (backed by `fake-orbit-api.ts` — Workstream A
 * doesn't exist in this repo yet, but the fake speaks the exact §4.2 contract,
 * so nothing here changes once the real API ships):
 *
 *   Agent 1 (agent_dev1): reads the target file, hits a dead end trying an
 *   in-memory rate limiter, publishes a `failed_approach` context packet, and
 *   commits the partial (broken) attempt with a trace explaining why.
 *
 *   Agent 2 (agent_dev2): on a brand-new connection with zero coordination,
 *   reads the SAME file and gets agent 1's packet auto-injected into the
 *   response. It ships the real fix, explicitly rejecting the dead end in its
 *   own trace, and commits.
 *
 * Each run gets a fresh in-memory API + server + random port, so it's
 * deterministic and safe to loop for flake-hunting:
 *
 *   for i in $(seq 1 20); do bun run demo || break; done
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startFakeOrbitApi } from "./fake-orbit-api.js";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = HERE.replace(/\/scripts\/$/, "");
const KEYS = `${ROOT}/keys.example.json`;
const ENTRY = `${ROOT}/src/index.ts`;
const REPO_ID = "repo_demo";
const TARGET_PATH = "src/auth/login.ts";

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

function toolText(res: ToolResult): string {
  return (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
}

/** For calls the demo's narrative depends on: log + throw on failure instead of limping on with bad state. */
function requireOk(res: ToolResult, label: string): Record<string, unknown> {
  if (res.isError) {
    failures++;
    console.log(`  ✗ ${label} failed:`, toolText(res));
    throw new Error(`${label} failed`);
  }
  console.log(`  ✓ ${label}`);
  return res.structuredContent as Record<string, unknown>;
}

async function connectAgent(port: number, apiKey: string, name: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function main(): Promise<void> {
  console.log("Orbit — two-agent context-sharing demo\n");

  const api = startFakeOrbitApi();
  api.seedFile(
    REPO_ID,
    TARGET_PATH,
    ["export async function login(req: Request): Promise<Response> {", "  // TODO: rate limit this endpoint", "  return handleCredentials(req);", "}"].join(
      "\n",
    ),
  );

  // Randomized so repeated/looped runs (flake-hunting) never collide on a stale port.
  const httpPort = 8800 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn(["bun", "run", ENTRY], {
    env: {
      ...process.env,
      ORBIT_TRANSPORT: "http",
      ORBIT_HTTP_PORT: String(httpPort),
      ORBIT_API_URL: api.url,
      ORBIT_REPO_ID: REPO_ID,
      ORBIT_AGENT_KEYS_FILE: KEYS,
      ORBIT_LOG_LEVEL: "warn",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  try {
    let up = false;
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`http://localhost:${httpPort}/healthz`);
        if (r.ok) {
          up = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await Bun.sleep(100);
    }
    check("orbit-mcp http server came up", up);
    if (!up) throw new Error("orbit-mcp server did not become healthy in time");

    // ── Agent 1: hits a dead end ────────────────────────────────────────────
    console.log("\n[agent 1 — agent_dev1]");
    const agent1 = await connectAgent(httpPort, "orbit_sk_dev_agent1", "demo-agent-1");

    requireOk(
      await agent1.callTool({ name: "orbit_session_update", arguments: { currentTask: "Add rate limiting to POST /login" } }),
      "agent 1 reports its task",
    );

    const read1 = requireOk(await agent1.callTool({ name: "orbit_read_file", arguments: { path: TARGET_PATH } }), "agent 1 reads the target file");
    check("no context yet — nothing published before agent 1's read", read1.context === undefined, read1.context);

    const publish = requireOk(
      await agent1.callTool({
        name: "orbit_publish_context",
        arguments: {
          type: "failed_approach",
          title: "In-memory rate limit counter doesn't work across instances",
          body:
            "Tried an in-process `Map<ip, count>` counter with a fixed window. Works locally but the " +
            "service runs behind a load balancer with multiple instances, so each instance has its own " +
            "counter and the effective limit scales with instance count. Needs a shared store (Redis or " +
            "the DB) instead.",
          relatedPaths: [TARGET_PATH],
        },
      }),
      "agent 1 publishes a failed_approach packet",
    );
    check("published packet is typed failed_approach", publish.type === "failed_approach", publish);
    const publishedPacketId = publish.id as string;

    const brokenLoginTs = [
      "const attempts = new Map<string, number>(); // dead end — see published context",
      "",
      "export async function login(req: Request): Promise<Response> {",
      "  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';",
      "  attempts.set(ip, (attempts.get(ip) ?? 0) + 1); // broken across instances",
      "  return handleCredentials(req);",
      "}",
    ].join("\n");

    requireOk(
      await agent1.callTool({
        name: "orbit_commit",
        arguments: {
          files: [{ path: TARGET_PATH, content: brokenLoginTs }],
          message: "wip: in-memory rate limit attempt (broken across instances, see context)",
          intent: "checkpoint the rate-limiting attempt before handing off",
          trace: {
            taskDescription: "Add rate limiting to POST /login",
            turns: [
              { role: "human", content: "Add rate limiting to the login endpoint.", timestamp: new Date().toISOString() },
              {
                role: "agent",
                content:
                  "Tried an in-memory counter; discovered it breaks across instances. Publishing a failed_approach and checkpointing.",
                timestamp: new Date().toISOString(),
              },
            ],
            decisions: [
              {
                question: "Where to store rate-limit counters?",
                chosen: "TBD — needs a shared store",
                rejected: ["In-process Map — doesn't work with multiple instances behind the load balancer"],
                reasoning: "Each instance has an independent counter, so the effective limit scales with instance count.",
              },
            ],
          },
        },
      }),
      "agent 1 commits the partial (broken) attempt with a trace",
    );

    await agent1.close();

    // ── Agent 2: picks up the follow-up, gets the packet auto-injected ──────
    console.log("\n[agent 2 — agent_dev2]");
    const agent2 = await connectAgent(httpPort, "orbit_sk_dev_agent2", "demo-agent-2");

    const read2 = requireOk(await agent2.callTool({ name: "orbit_read_file", arguments: { path: TARGET_PATH } }), "agent 2 reads the same file");
    const injected = (read2.context ?? []) as Array<{ id: string; type: string; title: string }>;
    check("agent 2's read auto-injects exactly agent 1's packet — unprompted", injected.length === 1 && injected[0]?.id === publishedPacketId, injected);

    const fixedLoginTs = [
      "import { rateLimiter } from '../shared/rate-limiter'; // Redis-backed, shared across instances",
      "",
      "export async function login(req: Request): Promise<Response> {",
      "  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';",
      "  if (await rateLimiter.tooMany(ip)) return new Response('Too Many Requests', { status: 429 });",
      "  return handleCredentials(req);",
      "}",
    ].join("\n");

    requireOk(
      await agent2.callTool({
        name: "orbit_commit",
        arguments: {
          files: [{ path: TARGET_PATH, content: fixedLoginTs }],
          message: "Add Redis-backed rate limiting to POST /login",
          intent: "ship rate limiting that works across all instances",
          trace: {
            taskDescription: "Finish rate limiting on the login endpoint",
            turns: [
              { role: "human", content: "Pick up the rate-limiting task from agent 1.", timestamp: new Date().toISOString() },
              {
                role: "agent",
                content:
                  "orbit_read_file surfaced agent 1's failed_approach on this path — skipped the in-memory " +
                  "counter and went straight to a shared store.",
                timestamp: new Date().toISOString(),
              },
            ],
            decisions: [
              {
                question: "Where to store rate-limit counters?",
                chosen: "Redis-backed shared counter",
                rejected: ["In-process Map — flagged by agent 1's context packet as broken across instances"],
                reasoning: "A shared store keeps the limit correct regardless of instance count; avoids re-discovering agent 1's dead end.",
              },
            ],
          },
        },
      }),
      "agent 2 ships the real fix, explicitly rejecting the avoided dead end",
    );

    const finalRead = requireOk(await agent2.callTool({ name: "orbit_read_file", arguments: { path: TARGET_PATH } }), "final read of the committed file");
    check("the committed file now contains the real fix", typeof finalRead.content === "string" && finalRead.content.includes("rateLimiter"), finalRead.content);

    await agent2.close();
  } catch (err) {
    console.error("\nDemo aborted:", err instanceof Error ? err.message : err);
  } finally {
    proc.kill();
    api.stop();
  }

  console.log(`\n${failures === 0 ? "DEMO PASSED — context injection round-trip verified across two agent sessions" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
