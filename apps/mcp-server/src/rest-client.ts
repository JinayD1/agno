/**
 * Internal REST client for Workstream A's API (PRD §4.2).
 *
 * One instance is bound per MCP connection and carries that connection's agent
 * identity on EVERY request:
 *   - `Authorization: Bearer <apiKey>`  — A resolves/authenticates the caller
 *   - `X-Orbit-Agent-Id: <agent.id>`    — explicit identity MCP passes through
 *
 * A remains the single scope-enforcement point (§5); B pre-checks elsewhere for
 * better messages. All non-2xx responses become typed `OrbitError`s (§4.4).
 */

import type {
  AgentIdentity,
  AgentSession,
  ConversationTrace,
  ContextPacket,
  CreateCommitRequest,
  OrbitCommit,
  PublishContextRequest,
  ReadFileResponse,
  ReadTreeResponse,
  StartSessionRequest,
  UpdateSessionRequest,
} from "@orbit/types";
import { OrbitError } from "./errors.js";
import { log } from "./logger.js";

export interface OrbitRestClientOptions {
  apiUrl: string;
  agent: AgentIdentity;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms (default 15s). */
  timeoutMs?: number;
}

type QueryParams = Record<string, string | number | undefined>;

export interface HistoryQuery {
  path?: string;
  agentId?: string;
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface ContextQuery {
  type?: string;
  path?: string;
}

export class OrbitRestClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  readonly agent: AgentIdentity;

  constructor(opts: OrbitRestClientOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/+$/, "");
    this.agent = opts.agent;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  // ── core ──────────────────────────────────────────────────────────────────

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(this.apiUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: QueryParams; body?: unknown } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Orbit-Agent-Id": this.agent.id,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new OrbitError(
        "INTERNAL",
        aborted
          ? `Request to Workstream A timed out after ${this.timeoutMs}ms (${method} ${path})`
          : `Failed to reach Workstream A (${method} ${path})`,
        { cause: err, retriable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    log.debug("A request", { method, path, status: res.status });

    if (!res.ok) throw await OrbitError.fromResponse(res);

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new OrbitError("INTERNAL", `Workstream A returned non-JSON for ${method} ${path}`, { cause: err });
    }
  }

  // ── repos / files ───────────────────────────────────────────────────────────

  readTree(repoId: string, ref?: string): Promise<ReadTreeResponse> {
    return this.request("GET", `/api/repos/${encodeURIComponent(repoId)}/tree`, { query: { ref } });
  }

  readFile(repoId: string, path: string, ref?: string): Promise<ReadFileResponse> {
    return this.request("GET", `/api/repos/${encodeURIComponent(repoId)}/file`, { query: { path, ref } });
  }

  // ── commits / traces ─────────────────────────────────────────────────────────

  createCommit(repoId: string, body: CreateCommitRequest): Promise<OrbitCommit> {
    return this.request("POST", `/api/repos/${encodeURIComponent(repoId)}/commits`, { body });
  }

  listCommits(repoId: string, query: HistoryQuery = {}): Promise<{ commits: OrbitCommit[]; nextCursor?: string }> {
    return this.request("GET", `/api/repos/${encodeURIComponent(repoId)}/commits`, {
      query: query as QueryParams,
    });
  }

  getCommit(commitId: string): Promise<OrbitCommit & { trace?: ConversationTrace | null }> {
    return this.request("GET", `/api/commits/${encodeURIComponent(commitId)}`);
  }

  getTrace(traceId: string): Promise<ConversationTrace> {
    return this.request("GET", `/api/traces/${encodeURIComponent(traceId)}`);
  }

  // ── agents ────────────────────────────────────────────────────────────────────

  getAgent(agentId: string): Promise<AgentIdentity> {
    return this.request("GET", `/api/agents/${encodeURIComponent(agentId)}`);
  }

  // ── context ─────────────────────────────────────────────────────────────────

  publishContext(body: PublishContextRequest): Promise<ContextPacket> {
    return this.request("POST", `/api/context`, { body });
  }

  queryContext(repoId: string, query: ContextQuery = {}): Promise<{ packets: ContextPacket[] }> {
    return this.request("GET", `/api/repos/${encodeURIComponent(repoId)}/context`, { query: query as QueryParams });
  }

  retractContext(packetId: string): Promise<void> {
    return this.request("DELETE", `/api/context/${encodeURIComponent(packetId)}`);
  }

  // ── sessions ──────────────────────────────────────────────────────────────────

  startSession(body: StartSessionRequest): Promise<AgentSession> {
    return this.request("POST", `/api/sessions`, { body });
  }

  updateSession(sessionId: string, body: UpdateSessionRequest): Promise<AgentSession> {
    return this.request("PATCH", `/api/sessions/${encodeURIComponent(sessionId)}`, { body });
  }

  listSessions(repoId: string): Promise<{ sessions: AgentSession[] }> {
    return this.request("GET", `/api/repos/${encodeURIComponent(repoId)}/sessions`);
  }
}
