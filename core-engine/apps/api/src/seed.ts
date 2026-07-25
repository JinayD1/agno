import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { TraceInput } from "@orbit/types";
import { createDb } from "./db/index.ts";
import { createRepo } from "./store/repos.ts";
import { createAgent } from "./store/agents.ts";
import { createCommit } from "./store/commits.ts";
import { publishContext } from "./store/context.ts";
import { startSession } from "./store/sessions.ts";

/**
 * Seed a demo repo + 2 agents + 10 traced commits (PRD §5 deliverable #6).
 * Also publishes a couple of context packets and opens a live session so
 * Workstream C's context board and live feed have data to render.
 *
 * Destructive: wipes the configured DB + data dir first for a reproducible demo.
 * Run from the repo root:  bun apps/api/src/seed.ts
 */

const dbPath = process.env.ORBIT_DB ?? "orbit.db";
const dataDir = resolve(process.env.ORBIT_DATA_DIR ?? "data/repos");

await rm(dbPath, { force: true });
await rm(`${dbPath}-shm`, { force: true });
await rm(`${dbPath}-wal`, { force: true });
await rm(dataDir, { recursive: true, force: true });

const db = createDb(dbPath);

const repo = await createRepo(db, { name: "orbit-demo" });

const builder = createAgent(db, {
  name: "claude-code-builder-1",
  model: "claude-sonnet-4-6",
  ownerHuman: "jinay",
  scopes: { pathsAllowed: ["src/**"], canMerge: true, canReview: true },
});

const fixer = createAgent(db, {
  name: "claude-code-fixer-2",
  model: "claude-sonnet-4-6",
  ownerHuman: "vibhor",
  // Can touch src/** but explicitly NOT the secrets subtree.
  scopes: { pathsAllowed: ["src/**", "!src/secrets/**"], canMerge: false, canReview: true },
});

const t0 = Date.now();
const iso = (offsetMin: number) => new Date(t0 + offsetMin * 60_000).toISOString();

function trace(task: string, human: string, agent: string, decision: TraceInput["decisions"][number]): TraceInput {
  return {
    taskDescription: task,
    turns: [
      { role: "human", content: human, timestamp: iso(0) },
      { role: "agent", content: agent, timestamp: iso(1) },
    ],
    decisions: [decision],
  };
}

interface CommitSpec {
  agentId: string;
  message: string;
  intent: string;
  files: { path: string; content: string }[];
  trace: TraceInput;
}

const specs: CommitSpec[] = [
  {
    agentId: builder.id,
    message: "scaffold app entry",
    intent: "create the application entrypoint",
    files: [{ path: "src/index.ts", content: "export function main() {\n  return 'orbit';\n}\n" }],
    trace: trace(
      "Set up the initial app entrypoint",
      "Create a minimal entrypoint for the service.",
      "Adding src/index.ts exporting a main() function as the entrypoint.",
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
      "We need configurable port via env.",
      "Reading PORT from process.env with a sane default of 3001.",
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
    agentId: builder.id,
    message: "wire config into entry",
    intent: "use config in main",
    files: [{ path: "src/index.ts", content: "import { config } from './config.ts';\n\nexport function main() {\n  return `orbit:${config.port}`;\n}\n" }],
    trace: trace(
      "Use config from the entrypoint",
      "main() should reflect the configured port.",
      "Importing config and returning a port-tagged identifier.",
      { question: "Import style?", chosen: "explicit .ts extension", rejected: ["extensionless"], reasoning: "Bun resolves .ts explicitly; avoids ambiguity." },
    ),
  },
  {
    agentId: fixer.id,
    message: "add logger",
    intent: "structured logging helper",
    files: [{ path: "src/log.ts", content: "export const log = (msg: string) => console.log(`[orbit] ${msg}`);\n" }],
    trace: trace(
      "Add a tiny logger",
      "We need consistent log prefixes.",
      "Single log() helper prefixing [orbit]; can swap for pino later.",
      { question: "Logging lib?", chosen: "console wrapper", rejected: ["pino — defer"], reasoning: "Zero-dep for the prototype." },
    ),
  },
  {
    agentId: builder.id,
    message: "add health module",
    intent: "expose a health check helper",
    files: [{ path: "src/health.ts", content: "export const health = () => ({ status: 'ok' });\n" }],
    trace: trace(
      "Add a health helper",
      "Provide a reusable health payload.",
      "health() returns { status: 'ok' } for the /health route to use.",
      { question: "Shape?", chosen: "{ status }", rejected: ["boolean"], reasoning: "Room to add fields (uptime, version)." },
    ),
  },
  {
    agentId: fixer.id,
    message: "harden validation",
    intent: "reject overly long input",
    files: [{ path: "src/validate.ts", content: "export function isNonEmpty(s: string) {\n  return s.trim().length > 0;\n}\n\nexport function isWithin(s: string, max: number) {\n  return s.length <= max;\n}\n" }],
    trace: trace(
      "Add a length bound check",
      "Prevent unbounded input from reaching storage.",
      "Adding isWithin(s, max); callers combine it with isNonEmpty.",
      { question: "Max length policy?", chosen: "caller-provided", rejected: ["global constant"], reasoning: "Different fields need different bounds." },
    ),
  },
  {
    agentId: builder.id,
    message: "add router skeleton",
    intent: "central place to register routes",
    files: [{ path: "src/router.ts", content: "import { health } from './health.ts';\n\nexport const routes = {\n  '/health': health,\n};\n" }],
    trace: trace(
      "Create a router map",
      "Consolidate route registration.",
      "Simple object map from path to handler; expand as needed.",
      { question: "Router approach?", chosen: "object map", rejected: ["decorator-based"], reasoning: "Least magic; easy to read for the demo." },
    ),
  },
  {
    agentId: fixer.id,
    message: "log requests in router",
    intent: "observability for incoming calls",
    files: [{ path: "src/router.ts", content: "import { health } from './health.ts';\nimport { log } from './log.ts';\n\nexport const routes = {\n  '/health': () => {\n    log('GET /health');\n    return health();\n  },\n};\n" }],
    trace: trace(
      "Add request logging",
      "We should see health hits in the logs.",
      "Wrapping the health handler with a log() call.",
      { question: "Where to log?", chosen: "in handler", rejected: ["global middleware — not built yet"], reasoning: "Middleware layer is a later commit." },
    ),
  },
  {
    agentId: builder.id,
    message: "add version constant",
    intent: "surface build version",
    files: [{ path: "src/version.ts", content: "export const VERSION = '0.1.0';\n" }],
    trace: trace(
      "Add a version constant",
      "Expose the current version for /health.",
      "VERSION constant added; health can include it next.",
      { question: "Version source?", chosen: "hardcoded constant", rejected: ["read package.json at runtime"], reasoning: "Avoid fs read on hot path for the prototype." },
    ),
  },
];

let committed = 0;
for (const spec of specs) {
  await createCommit(db, repo.id, {
    agentId: spec.agentId,
    message: spec.message,
    intent: spec.intent,
    files: spec.files,
    trace: spec.trace,
  });
  committed++;
}

// Context packets so the board + auto-injection demo have material.
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
  relatedPaths: ["src/index.ts", "src/router.ts"],
});

// One active session for the live feed.
const session = startSession(db, {
  agentId: builder.id,
  repoId: repo.id,
  currentTask: "Adding version info to the health payload",
});

console.log("Seed complete:");
console.log(`  repo:     ${repo.id} (${repo.name})`);
console.log(`  agents:   ${builder.id} (builder), ${fixer.id} (fixer)`);
console.log(`  commits:  ${committed}`);
console.log(`  context:  2 packets`);
console.log(`  session:  ${session.id} (active)`);
console.log(`\nTry:  GET /api/repos/${repo.id}/commits`);
