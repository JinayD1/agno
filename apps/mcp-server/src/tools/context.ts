/**
 * Shared context passed to every tool handler. Each MCP connection gets its own
 * ToolContext, so `agent` and `rest` are already bound to the caller — tools
 * never have to figure out "who am I".
 */

import type { AgentIdentity } from "@orbit/types";
import type { OrbitRestClient } from "../rest-client.js";
import type { SessionManager } from "../session.js";

export interface ToolContext {
  /** The identity this connection is bound to. */
  agent: AgentIdentity;
  /** REST client that carries `agent` on every call to Workstream A. */
  rest: OrbitRestClient;
  /** Repo bound to this connection (single repo per workspace, v1). */
  repoId: string | null;
  /** Tracks this connection's registered session (start/heartbeat/update/end). */
  session: SessionManager;
}
