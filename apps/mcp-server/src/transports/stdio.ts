/**
 * stdio transport (local dev). One process = one agent. The key comes from
 * ORBIT_API_KEY; stdout is reserved for JSON-RPC, so all logging goes to stderr.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { OrbitMcpConfig } from "../config.js";
import { createAuthProvider } from "../auth.js";
import { createOrbitServer } from "../server.js";
import { OrbitError } from "../errors.js";
import { log } from "../logger.js";

export async function runStdio(config: OrbitMcpConfig): Promise<void> {
  if (!config.apiKey) {
    throw new OrbitError("INVALID_INPUT", "stdio transport requires ORBIT_API_KEY.");
  }

  const auth = createAuthProvider(config);
  const agent = await auth.authenticate(config.apiKey);

  const server = createOrbitServer({
    agent,
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    repoId: config.repoId,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("orbit-mcp ready on stdio", { agentId: agent.id, repoId: config.repoId, apiUrl: config.apiUrl });

  // Clean shutdown so the SDK flushes and closes the transport.
  const shutdown = async (signal: string) => {
    log.info("shutting down", { signal });
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
