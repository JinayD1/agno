/**
 * Agent auth binding (PRD §6): every MCP connection is bound to exactly one
 * `AgentIdentity` via an API key.
 *
 *   - HTTP transport: key comes from the `Authorization: Bearer <key>` header.
 *   - stdio transport: key comes from `ORBIT_API_KEY`.
 *
 * A key resolves to an agent through a local registry (file or inline JSON):
 *   { "keys": { "<apiKey>": { "agentId": "agent_x", "agent"?: AgentIdentity } } }
 *
 * If the entry carries an inline `agent`, we use it directly (works fully offline
 * against A's stub). Otherwise we hydrate the identity from A's
 * `GET /api/agents/:id`, keeping A the source of truth for scopes.
 */

import { readFileSync } from "node:fs";
import type { AgentIdentity } from "@orbit/types";
import type { OrbitMcpConfig } from "./config.js";
import { OrbitAuthError, OrbitError } from "./errors.js";
import { log } from "./logger.js";

interface KeyRegistryEntry {
  agentId: string;
  agent?: AgentIdentity;
}

interface KeyRegistry {
  keys: Record<string, KeyRegistryEntry>;
}

export interface AuthProvider {
  /** Resolve an API key to its bound AgentIdentity, or throw OrbitAuthError. */
  authenticate(apiKey: string): Promise<AgentIdentity>;
}

/** Pull a bearer token out of an Authorization header value. */
export function extractBearer(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function loadRegistry(config: OrbitMcpConfig): KeyRegistry {
  let source: string | null = null;
  let origin = "";
  if (config.keysInline) {
    source = config.keysInline;
    origin = "ORBIT_AGENT_KEYS";
  } else if (config.keysFile) {
    origin = config.keysFile;
    try {
      source = readFileSync(config.keysFile, "utf8");
    } catch (err) {
      throw new OrbitError("INVALID_INPUT", `Cannot read ORBIT_AGENT_KEYS_FILE at "${config.keysFile}"`, {
        cause: err,
      });
    }
  }

  if (!source) {
    // No registry configured. Only viable if identities are hydrated purely from
    // A — but without a key→agentId map we can't know which agent a key is. So an
    // empty registry means every key is rejected. Warn loudly at startup.
    log.warn("no agent key registry configured (ORBIT_AGENT_KEYS_FILE / ORBIT_AGENT_KEYS) — all keys will be rejected");
    return { keys: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    throw new OrbitError("INVALID_INPUT", `Agent key registry (${origin}) is not valid JSON`, { cause: err });
  }
  const keys = (parsed as KeyRegistry | undefined)?.keys;
  if (!keys || typeof keys !== "object") {
    throw new OrbitError("INVALID_INPUT", `Agent key registry (${origin}) must be { "keys": { ... } }`);
  }
  return { keys: keys as Record<string, KeyRegistryEntry> };
}

function assertAgentShape(value: unknown, origin: string): AgentIdentity {
  const a = value as Partial<AgentIdentity> | undefined;
  if (
    !a ||
    typeof a.id !== "string" ||
    typeof a.name !== "string" ||
    typeof a.model !== "string" ||
    !a.scopes ||
    !Array.isArray(a.scopes.pathsAllowed)
  ) {
    throw new OrbitError("INTERNAL", `Agent identity from ${origin} is malformed (missing id/name/model/scopes)`);
  }
  return a as AgentIdentity;
}

/**
 * Registry-backed auth provider. Inline agents resolve offline; agentId-only
 * entries hydrate from A. Results are cached per key for the process lifetime.
 */
class RegistryAuthProvider implements AuthProvider {
  private readonly registry: KeyRegistry;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, AgentIdentity>();

  constructor(config: OrbitMcpConfig, fetchImpl: typeof fetch = fetch) {
    this.registry = loadRegistry(config);
    this.apiUrl = config.apiUrl;
    this.fetchImpl = fetchImpl;
  }

  async authenticate(apiKey: string): Promise<AgentIdentity> {
    if (!apiKey) throw new OrbitAuthError("No API key presented.");

    const cached = this.cache.get(apiKey);
    if (cached) return cached;

    const entry = this.registry.keys[apiKey];
    if (!entry) throw new OrbitAuthError("API key is not bound to any known agent.");
    if (!entry.agentId || typeof entry.agentId !== "string") {
      throw new OrbitError("INTERNAL", "Key registry entry is missing `agentId`.");
    }

    const agent = entry.agent
      ? assertAgentShape(entry.agent, "key registry")
      : await this.hydrateFromApi(entry.agentId, apiKey);

    if (agent.id !== entry.agentId) {
      throw new OrbitError("INTERNAL", `Registry agentId "${entry.agentId}" does not match resolved agent "${agent.id}".`);
    }

    this.cache.set(apiKey, agent);
    log.info("agent bound", { agentId: agent.id, name: agent.name, model: agent.model });
    return agent;
  }

  private async hydrateFromApi(agentId: string, apiKey: string): Promise<AgentIdentity> {
    const url = `${this.apiUrl}/api/agents/${encodeURIComponent(agentId)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
    } catch (err) {
      throw new OrbitError("INTERNAL", `Failed to reach Workstream A to hydrate agent "${agentId}"`, {
        cause: err,
        retriable: true,
      });
    }
    if (!res.ok) {
      if (res.status === 404) throw new OrbitAuthError(`Agent "${agentId}" not found in Workstream A.`);
      throw await OrbitError.fromResponse(res);
    }
    return assertAgentShape(await res.json(), `A GET /api/agents/${agentId}`);
  }
}

export function createAuthProvider(config: OrbitMcpConfig, fetchImpl: typeof fetch = fetch): AuthProvider {
  return new RegistryAuthProvider(config, fetchImpl);
}
