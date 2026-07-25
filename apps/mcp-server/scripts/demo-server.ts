#!/usr/bin/env bun
/**
 * Manual two-terminal demo harness (PRD §6 deliverable #5, §8 "the demo").
 *
 *   bun run demo:server
 *
 * Starts the fake Workstream A stub (`fake-orbit-api.ts`) plus a real
 * orbit-mcp HTTP server on a fixed port, seeds the demo repo's target file,
 * and blocks. Pair it with `.mcp.demo-agent1.json` / `.mcp.demo-agent2.json`
 * to run the story with two real, separate Claude Code sessions:
 *
 *   Terminal A: claude --mcp-config apps/mcp-server/.mcp.demo-agent1.json
 *     "Read src/auth/login.ts and add rate limiting to the login endpoint.
 *      If you hit a dead end, publish a failed_approach context packet and
 *      commit your partial work with a trace before stopping."
 *
 *   Terminal B: claude --mcp-config apps/mcp-server/.mcp.demo-agent2.json
 *     "Finish the rate-limiting task on src/auth/login.ts."
 *     (Watch it receive agent 1's packet, unprompted, on its first
 *      orbit_read_file call.)
 *
 * For an automated, assertion-driven run of the same narrative that's safe to
 * loop for flake-hunting, see `scripts/demo.ts` (`bun run demo`) instead.
 */

import type { OrbitMcpConfig } from "../src/config.js";
import { runHttp } from "../src/transports/http.js";
import { log } from "../src/logger.js";
import { startFakeOrbitApi } from "./fake-orbit-api.js";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = HERE.replace(/\/scripts\/$/, "");
const KEYS = `${ROOT}/keys.example.json`;
const REPO_ID = "repo_demo";
const DEMO_PORT = 8788;

const api = startFakeOrbitApi();
process.on("exit", () => {
  try {
    api.stop();
  } catch {
    /* best effort */
  }
});

api.seedFile(
  REPO_ID,
  "src/auth/login.ts",
  ["export async function login(req: Request): Promise<Response> {", "  // TODO: rate limit this endpoint", "  return handleCredentials(req);", "}"].join(
    "\n",
  ),
);

log.info("fake Workstream A up", { url: api.url });

const config: OrbitMcpConfig = {
  transport: "http",
  apiUrl: api.url,
  repoId: REPO_ID,
  apiKey: null,
  keysFile: KEYS,
  keysInline: null,
  sessionHeartbeatMs: 30_000,
  http: { port: DEMO_PORT, path: "/mcp", corsOrigins: [] },
};

await runHttp(config);

console.log(`
Orbit demo server ready — http://localhost:${DEMO_PORT}/mcp

  Terminal A: claude --mcp-config apps/mcp-server/.mcp.demo-agent1.json
  Terminal B: claude --mcp-config apps/mcp-server/.mcp.demo-agent2.json

Ctrl+C to stop.
`);
