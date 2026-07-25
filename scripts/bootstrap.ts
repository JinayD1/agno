#!/usr/bin/env bun
/**
 * Integration bootstrap — the one command that wires the three layers together.
 *
 * Seeds Workstream A's SQLite DB + bare git repo with a demo repo, two agents,
 * a handful of traced commits, context packets (including a `failed_approach`
 * for the auto-injection demo), and a live session. Then it emits the config the
 * other two layers need to point at A:
 *
 *   - apps/mcp-server/keys.local.json  — maps two API keys → the real agent ids
 *   - apps/mcp-server/.env             — MCP server env (transport, api url, repo, keys)
 *   - web/.env                         — VITE_API_URL + repo id/name for the UI
 *   - .integration.json                — a manifest of everything created
 *
 * Run from the repo root:  bun run bootstrap   (or: bun scripts/bootstrap.ts)
 * Must run before starting the API so they share the same on-disk DB.
 */
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TraceInput } from "@orbit/types";
import { createDb } from "../apps/api/src/db/index.ts";
import { createRepo } from "../apps/api/src/store/repos.ts";
import { createAgent } from "../apps/api/src/store/agents.ts";
import { createCommit } from "../apps/api/src/store/commits.ts";
import { publishContext } from "../apps/api/src/store/context.ts";
import { startSession } from "../apps/api/src/store/sessions.ts";

const ROOT = resolve(import.meta.dir, "..");
const dbPath = process.env.ORBIT_DB ?? resolve(ROOT, "orbit.db");
const dataDir = resolve(process.env.ORBIT_DATA_DIR ?? resolve(ROOT, "data/repos"));

// Fresh, reproducible state every run.
await rm(dbPath, { force: true });
await rm(`${dbPath}-shm`, { force: true });
await rm(`${dbPath}-wal`, { force: true });
await rm(dataDir, { recursive: true, force: true });

process.env.ORBIT_DATA_DIR = dataDir;
const db = createDb(dbPath);

const repo = await createRepo(db, { name: "orbit-demo" });

const builder = createAgent(db, {
  name: "claude-code-builder",
  model: "claude-opus-4-8",
  ownerHuman: "vibhor",
  scopes: { pathsAllowed: ["src/**"], canMerge: true, canReview: true },
});

const fixer = createAgent(db, {
  name: "claude-code-fixer",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  // Can touch src/** but explicitly NOT the secrets subtree — powers the
  // scope-denied demo.
  scopes: { pathsAllowed: ["src/**", "!src/secrets/**"], canMerge: false, canReview: true },
});

const t0 = Date.now();
const iso = (offMin: number) => new Date(t0 + offMin * 60_000).toISOString();
const trace = (
  task: string,
  human: string,
  agent: string,
  decision: TraceInput["decisions"][number],
): TraceInput => ({
  taskDescription: task,
  turns: [
    { role: "human", content: human, timestamp: iso(0) },
    { role: "agent", content: agent, timestamp: iso(1) },
  ],
  decisions: [decision],
});

interface Spec {
  agentId: string;
  message: string;
  intent: string;
  files: { path: string; content: string }[];
  trace: TraceInput;
}

const specs: Spec[] = [
  {
    agentId: builder.id,
    message: "scaffold app entry",
    intent: "create the application entrypoint",
    files: [{ path: "src/index.ts", content: "export function main() {\n  return 'orbit';\n}\n" }],
    trace: trace(
      "Set up the initial app entrypoint",
      "Create a minimal entrypoint for the service.",
      "Adding src/index.ts exporting a main() function.",
      { question: "Module format?", chosen: "ESM", rejected: ["CommonJS"], reasoning: "Bun + modern tooling are ESM-first." },
    ),
  },
  {
    agentId: builder.id,
    message: "add config loader",
    intent: "load configuration from env",
    files: [{ path: "src/config.ts", content: "export const config = {\n  port: Number(process.env.PORT ?? 3001),\n};\n" }],
    trace: trace(
      "Add a configuration loader",
      "We need a configurable port via env.",
      "Reading PORT from process.env with a default of 3001.",
      { question: "Config source?", chosen: "env vars", rejected: ["config file"], reasoning: "12-factor; simplest for the demo." },
    ),
  },
  {
    agentId: fixer.id,
    message: "add input validation util",
    intent: "validate untrusted input centrally",
    files: [{ path: "src/validate.ts", content: "export function isNonEmpty(s: string) {\n  return s.trim().length > 0;\n}\n" }],
    trace: trace(
      "Introduce a validation helper",
      "Guard against empty inputs across the app.",
      "Adding isNonEmpty as the first shared validation primitive.",
      { question: "Validation lib?", chosen: "hand-rolled", rejected: ["zod — overkill for one check"], reasoning: "Keep deps minimal for now." },
    ),
  },
  {
    agentId: fixer.id,
    message: "harden validation",
    intent: "reject overly long input",
    files: [{
      path: "src/validate.ts",
      content:
        "export function isNonEmpty(s: string) {\n  return s.trim().length > 0;\n}\n\n" +
        "export function isWithin(s: string, max: number) {\n  return s.length <= max;\n}\n",
    }],
    trace: trace(
      "Add a length bound check",
      "Prevent unbounded input from reaching storage.",
      "Adding isWithin(s, max); callers combine it with isNonEmpty.",
      { question: "Max length policy?", chosen: "caller-provided", rejected: ["global constant"], reasoning: "Different fields need different bounds." },
    ),
  },
  {
    agentId: builder.id,
    message: "wire config into entry",
    intent: "use config in main",
    files: [{ path: "src/index.ts", content: "import { config } from './config.ts';\n\nexport function main() {\n  return `orbit:${config.port}`;\n}\n" }],
    trace: trace(
      "Use config from the entrypoint",
      "main() should reflect the configured port.",
      "Importing config and returning a port-tagged identifier.",
      { question: "Import style?", chosen: "explicit .ts extension", rejected: ["extensionless"], reasoning: "Bun resolves .ts explicitly." },
    ),
  },
];

let committed = 0;
for (const spec of specs) {
  await createCommit(db, repo.id, spec);
  committed++;
}

// Context packets: the board + the auto-injection demo both read these. The
// failed_approach touches src/validate.ts, so any agent reading that file via
// the MCP server gets it injected automatically.
publishContext(db, {
  repoId: repo.id,
  agentId: fixer.id,
  type: "failed_approach",
  title: "Do not use a global max-length constant",
  body: "Tried a single MAX_LEN for all fields — broke long-body fields. Use per-caller bounds via isWithin(s, max).",
  relatedPaths: ["src/validate.ts"],
});
publishContext(db, {
  repoId: repo.id,
  agentId: builder.id,
  type: "constraint",
  title: "ESM only",
  body: "All modules are ESM with explicit .ts import extensions (Bun resolution). No CommonJS.",
  relatedPaths: ["src/index.ts", "src/config.ts"],
});

const session = startSession(db, {
  agentId: builder.id,
  repoId: repo.id,
  currentTask: "Wiring config into the health payload",
});

// ── Emit config for the other two layers ──────────────────────────────────────

const KEY_BUILDER = "orbit_sk_demo_builder";
const KEY_FIXER = "orbit_sk_demo_fixer";

const keysFile = resolve(ROOT, "apps/mcp-server/keys.local.json");
await writeFile(
  keysFile,
  JSON.stringify(
    {
      keys: {
        [KEY_BUILDER]: { agentId: builder.id },
        [KEY_FIXER]: { agentId: fixer.id },
      },
    },
    null,
    2,
  ) + "\n",
);

const mcpEnv = [
  "# Generated by scripts/bootstrap.ts — points the MCP server at Workstream A.",
  "ORBIT_TRANSPORT=http",
  "ORBIT_API_URL=http://localhost:3001",
  `ORBIT_REPO_ID=${repo.id}`,
  "ORBIT_HTTP_PORT=8787",
  // Path is resolved from the repo root (that's where `bun run dev` launches it).
  "ORBIT_AGENT_KEYS_FILE=apps/mcp-server/keys.local.json",
  "ORBIT_CORS_ORIGINS=*",
  "",
].join("\n");
await writeFile(resolve(ROOT, "apps/mcp-server/.env"), mcpEnv);

const webEnv = [
  "# Generated by scripts/bootstrap.ts — points the web UI at Workstream A.",
  "VITE_API_URL=http://localhost:3001",
  `VITE_ORBIT_REPO_ID=${repo.id}`,
  `VITE_ORBIT_REPO_NAME=${repo.name}`,
  "",
].join("\n");
await writeFile(resolve(ROOT, "web/.env"), webEnv);

const manifest = {
  repoId: repo.id,
  repoName: repo.name,
  agents: {
    builder: { id: builder.id, key: KEY_BUILDER },
    fixer: { id: fixer.id, key: KEY_FIXER },
  },
  sessionId: session.id,
  commits: committed,
  api: "http://localhost:3001",
  mcp: "http://localhost:8787/mcp",
  web: "http://localhost:5173",
  db: dbPath,
  dataDir,
};
await writeFile(resolve(ROOT, ".integration.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log("\n✅ Bootstrap complete\n");
console.log(`  repo:     ${repo.id} (${repo.name})`);
console.log(`  agents:   builder=${builder.id}  fixer=${fixer.id}`);
console.log(`  commits:  ${committed}   context: 2 packets   session: ${session.id}`);
console.log("\n  Wrote apps/mcp-server/.env, apps/mcp-server/keys.local.json, web/.env, .integration.json");
console.log("\n  Agent API keys (for .mcp.json / Authorization: Bearer):");
console.log(`    builder → ${KEY_BUILDER}`);
console.log(`    fixer   → ${KEY_FIXER}`);
console.log("\n  Next:  bun run dev   (starts API :3001, MCP :8787, web :5173)\n");
