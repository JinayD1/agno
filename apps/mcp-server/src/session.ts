/**
 * Session lifecycle for one MCP connection (PRD §6, Task 5).
 *
 * One `SessionManager` is bound per connection, mirroring `OrbitRestClient`:
 *   - `start()`   — POST /api/sessions on connect (best-effort: a failure here
 *                   shouldn't tear down the MCP connection, since tools still
 *                   work without session tracking).
 *   - heartbeat   — PATCH /api/sessions/:id on an interval while connected, so
 *                   the live feed doesn't show a stale/dead session.
 *   - updateTask()— powers `orbit_session_update`; also refreshes the heartbeat.
 *   - end()       — PATCH status="ended" on disconnect, stops the heartbeat timer.
 *
 * If this connection isn't bound to a repo (`repoId` null), session tracking is
 * skipped entirely — `StartSessionRequest` requires a repoId and there's nothing
 * meaningful to register.
 */

import type { AgentSession } from "@orbit/types";
import type { OrbitRestClient } from "./rest-client.js";
import { OrbitError } from "./errors.js";
import { log } from "./logger.js";

export interface SessionManagerOptions {
  rest: OrbitRestClient;
  repoId: string | null;
  /** Heartbeat interval in ms. */
  heartbeatMs?: number;
}

export class SessionManager {
  private readonly rest: OrbitRestClient;
  private readonly repoId: string | null;
  private readonly heartbeatMs: number;
  private sessionId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: SessionManagerOptions) {
    this.rest = opts.rest;
    this.repoId = opts.repoId;
    this.heartbeatMs = opts.heartbeatMs ?? 30_000;
  }

  /** The active session id, if registration has succeeded. */
  get id(): string | null {
    return this.sessionId;
  }

  /** Register this connection as a session. Best-effort — logs and swallows failures. */
  async start(currentTask?: string | null): Promise<void> {
    if (!this.repoId) {
      log.debug("session lifecycle skipped: connection isn't bound to a repo", {
        agentId: this.rest.agent.id,
      });
      return;
    }
    try {
      const session = await this.rest.startSession({ repoId: this.repoId, currentTask: currentTask ?? null });
      this.sessionId = session.id;
      log.info("session started", { sessionId: session.id, agentId: this.rest.agent.id, repoId: this.repoId });
      this.heartbeatTimer = setInterval(() => void this.heartbeat(), this.heartbeatMs);
      this.heartbeatTimer.unref?.();
    } catch (err) {
      const e = OrbitError.from(err);
      log.error("failed to start session", { agentId: this.rest.agent.id, code: e.code, message: e.message });
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await this.rest.updateSession(this.sessionId, { status: "active" });
      log.debug("session heartbeat", { sessionId: this.sessionId });
    } catch (err) {
      const e = OrbitError.from(err);
      log.warn("session heartbeat failed", { sessionId: this.sessionId, code: e.code, message: e.message });
    }
  }

  /** Report the agent's current task — powers the live human feed. */
  async updateTask(currentTask: string | null): Promise<AgentSession> {
    if (!this.sessionId) {
      throw new OrbitError(
        "CONFLICT",
        "No active Orbit session for this connection.",
        { hint: "Session registration either hasn't completed yet or failed at connect time (no repoId bound, or Workstream A was unreachable)." },
      );
    }
    return this.rest.updateSession(this.sessionId, { currentTask, status: "active" });
  }

  /** End the session on disconnect. Stops the heartbeat regardless of outcome. */
  async end(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.sessionId) return;
    const sessionId = this.sessionId;
    this.sessionId = null;
    try {
      await this.rest.updateSession(sessionId, { status: "ended" });
      log.info("session ended", { sessionId });
    } catch (err) {
      const e = OrbitError.from(err);
      log.warn("failed to end session cleanly", { sessionId, code: e.code, message: e.message });
    }
  }
}
