#!/usr/bin/env bun
/**
 * End-to-end smoke test: connect a real MCP client over BOTH transports, list
 * tools, and call tools to prove the wrapper pattern end-to-end.
 *
 *   bun run scripts/smoke.ts
 *
 * Uses the offline key registry (keys.example.json) so it needs no Workstream A
 * for auth binding (Task 1) or tool listing/schema checks (Task 2). Workstream
 * A doesn't exist in this repo yet, so the read-tool calls here only prove that
 * a real REST round trip is attempted and A-unreachable maps to a clean
 * INTERNAL tool error — not that live tree/file data comes back.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = HERE.replace(/\/scripts\/$/, "");
const KEYS = `${ROOT}/keys.example.json`;
const ENTRY = `${ROOT}/src/index.ts`;

const baseEnv = {
  ORBIT_API_URL: "http://localhost:4000",
  ORBIT_REPO_ID: "repo_demo",
  ORBIT_AGENT_KEYS_FILE: KEYS,
  ORBIT_LOG_LEVEL: "warn",
};

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

async function testStdio() {
  console.log("\n[stdio transport]");
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", ENTRY],
    env: { ...baseEnv, ORBIT_TRANSPORT: "stdio", ORBIT_API_KEY: "orbit_sk_dev_agent1" },
  });
  const client = new Client({ name: "smoke-client", version: "0.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  check("lists orbit_whoami", names.includes("orbit_whoami"), names);
  check("lists orbit_read_tree", names.includes("orbit_read_tree"), names);
  check("lists orbit_read_file", names.includes("orbit_read_file"), names);

  const readTree = tools.tools.find((t) => t.name === "orbit_read_tree");
  const readFile = tools.tools.find((t) => t.name === "orbit_read_file");
  check("orbit_read_tree declares input + output schemas", Boolean(readTree?.inputSchema && readTree?.outputSchema));
  check("orbit_read_file declares input + output schemas", Boolean(readFile?.inputSchema && readFile?.outputSchema));

  const res = await client.callTool({ name: "orbit_whoami", arguments: {} });
  const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
  const parsed = JSON.parse(text);
  check("whoami resolves the bound agent", parsed.agentId === "agent_dev1", parsed);
  check("whoami reports the bound repo", parsed.boundRepoId === "repo_demo", parsed);
  check("whoami reflects agent scopes", Array.isArray(parsed.scopes?.pathsAllowed), parsed.scopes);

  // A doesn't exist in this repo yet — prove the wrapper still round-trips
  // cleanly to a REST call attempt and maps the failure to an actionable error.
  const missingPath = await client.callTool({ name: "orbit_read_file", arguments: {} });
  check("orbit_read_file rejects a missing `path` with a clean tool error", missingPath.isError === true, missingPath);

  const treeCall = await client.callTool({ name: "orbit_read_tree", arguments: {} });
  const treeText = (treeCall.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
  check(
    "orbit_read_tree attempts A and reports a clean error when A is unreachable",
    treeCall.isError === true && treeText.includes("INTERNAL"),
    treeText,
  );

  await client.close();
}

async function startHttpServer(): Promise<() => void> {
  const proc = Bun.spawn(["bun", "run", ENTRY], {
    env: { ...process.env, ...baseEnv, ORBIT_TRANSPORT: "http", ORBIT_HTTP_PORT: "8799" },
    stdout: "inherit",
    stderr: "inherit",
  });
  // Wait for /healthz to answer.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://localhost:8799/healthz");
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(100);
  }
  return () => proc.kill();
}

async function testHttp() {
  console.log("\n[http transport]");
  const stop = await startHttpServer();
  try {
    const health = await (await fetch("http://localhost:8799/healthz")).json();
    check("health endpoint responds", health.ok === true, health);

    // Valid key.
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:8799/mcp"), {
      requestInit: { headers: { Authorization: "Bearer orbit_sk_dev_agent2" } },
    });
    const client = new Client({ name: "smoke-client", version: "0.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();
    check("lists orbit_whoami over http", tools.tools.some((t) => t.name === "orbit_whoami"));

    const res = await client.callTool({ name: "orbit_whoami", arguments: {} });
    const text = (res.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    check("http key binds to agent_dev2", parsed.agentId === "agent_dev2", parsed);
    check("agent_dev2 can merge (distinct scopes)", parsed.scopes?.canMerge === true, parsed.scopes);
    await client.close();

    // Invalid key → clean 401, connection refused.
    const badTransport = new StreamableHTTPClientTransport(new URL("http://localhost:8799/mcp"), {
      requestInit: { headers: { Authorization: "Bearer totally-invalid" } },
    });
    const badClient = new Client({ name: "smoke-client", version: "0.0.0" });
    let rejected = false;
    try {
      await badClient.connect(badTransport);
    } catch {
      rejected = true;
    }
    check("invalid key is rejected", rejected);

    // Missing auth → 401 from the raw endpoint.
    const noAuth = await fetch("http://localhost:8799/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    const body = await noAuth.json();
    check("missing auth → 401 with error contract", noAuth.status === 401 && body.error?.code === "SCOPE_DENIED", {
      status: noAuth.status,
      body,
    });
  } finally {
    stop();
  }
}

await testStdio();
await testHttp();

console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} SMOKE CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
