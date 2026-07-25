#!/usr/bin/env bun
/**
 * Orbit MCP server entrypoint (Workstream B).
 *
 * Picks a transport from ORBIT_TRANSPORT:
 *   - "stdio" (default) — local dev; agent key from ORBIT_API_KEY
 *   - "http"            — hosted Streamable HTTP; key from Authorization header
 *
 * `--transport <kind>` on argv overrides the env var.
 */

import { loadConfig } from "./config.js";
import { runStdio } from "./transports/stdio.js";
import { runHttp } from "./transports/http.js";
import { OrbitError } from "./errors.js";
import { log } from "./logger.js";

function transportFromArgv(argv: string[]): string | undefined {
  const i = argv.indexOf("--transport");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const override = transportFromArgv(process.argv.slice(2));
  if (override) process.env.ORBIT_TRANSPORT = override;

  const config = loadConfig();
  log.info("starting orbit-mcp", { transport: config.transport, apiUrl: config.apiUrl, repoId: config.repoId });

  if (config.transport === "http") {
    await runHttp(config);
  } else {
    await runStdio(config);
  }
}

main().catch((err) => {
  const e = OrbitError.from(err);
  log.error("fatal", { code: e.code, message: e.message });
  process.exit(1);
});
