/**
 * Typed error layer for Workstream B.
 *
 * Maps Workstream A's error contract (PRD §4.4) — `{ error: { code, message } }`
 * plus HTTP status — into a single `OrbitError` class, and formats those errors
 * into clean, actionable MCP tool results (a Definition-of-Done requirement).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OrbitErrorCode, OrbitErrorBody } from "@orbit/types";
import { ORBIT_ERROR_CODES } from "@orbit/types";

/** Actionable, agent-facing hints per error code. */
const DEFAULT_HINTS: Record<OrbitErrorCode, string> = {
  NOT_FOUND: "The referenced repo, commit, trace, or packet does not exist. Check the id/path/ref.",
  SCOPE_DENIED:
    "This action is outside your agent's scopes. Writes must target a path in `pathsAllowed`; merge/review need the matching scope. Ask your human owner to widen scope, or target an allowed path.",
  INVALID_INPUT:
    "The request payload failed validation. Check required fields (e.g. `intent` on commits) and field limits.",
  CONFLICT: "The operation conflicts with current state (e.g. non-fast-forward or duplicate). Re-read the latest state and retry.",
  INTERNAL: "The platform hit an unexpected error. This is usually transient — retry shortly.",
};

/** HTTP status → default code when the body omits a usable code. */
function codeFromStatus(status: number): OrbitErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "INVALID_INPUT";
    case 401:
    case 403:
      return "SCOPE_DENIED";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    default:
      return "INTERNAL";
  }
}

function isOrbitErrorCode(v: unknown): v is OrbitErrorCode {
  return typeof v === "string" && (ORBIT_ERROR_CODES as readonly string[]).includes(v);
}

export interface OrbitErrorOptions {
  httpStatus?: number;
  hint?: string;
  cause?: unknown;
  /** True for errors worth retrying (network blips, INTERNAL, 5xx). */
  retriable?: boolean;
}

export class OrbitError extends Error {
  readonly code: OrbitErrorCode;
  readonly httpStatus?: number;
  readonly hint: string;
  readonly retriable: boolean;

  constructor(code: OrbitErrorCode, message: string, opts: OrbitErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "OrbitError";
    this.code = code;
    this.httpStatus = opts.httpStatus;
    this.hint = opts.hint ?? DEFAULT_HINTS[code];
    this.retriable = opts.retriable ?? (code === "INTERNAL");
  }

  /** Coerce any thrown value into an OrbitError (network/parse errors → INTERNAL). */
  static from(err: unknown): OrbitError {
    if (err instanceof OrbitError) return err;
    if (err instanceof Error) {
      return new OrbitError("INTERNAL", err.message, { cause: err, retriable: true });
    }
    return new OrbitError("INTERNAL", String(err), { retriable: true });
  }

  /**
   * Build an OrbitError from a failed `fetch` Response, respecting A's §4.4
   * body shape when present and falling back to status-derived codes otherwise.
   */
  static async fromResponse(res: Response): Promise<OrbitError> {
    let code = codeFromStatus(res.status);
    let message = `Request failed with HTTP ${res.status}`;
    try {
      const raw = (await res.json()) as Partial<OrbitErrorBody> & Record<string, unknown>;
      const body = raw?.error;
      if (body && typeof body === "object") {
        if (isOrbitErrorCode(body.code)) code = body.code;
        if (typeof body.message === "string" && body.message.length > 0) message = body.message;
      }
    } catch {
      // Non-JSON error body — keep status-derived defaults.
    }
    return new OrbitError(code, message, {
      httpStatus: res.status,
      retriable: code === "INTERNAL" || res.status >= 500,
    });
  }

  /** The `{ error: { code, message } }` wire form, for re-emitting over HTTP. */
  toBody(): OrbitErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/**
 * Auth-binding failure (invalid/missing API key, unknown agent). Not part of
 * A's data-plane contract; surfaced to agents as SCOPE_DENIED with a 401.
 */
export class OrbitAuthError extends OrbitError {
  constructor(message: string, opts: OrbitErrorOptions = {}) {
    super("SCOPE_DENIED", message, {
      httpStatus: 401,
      hint:
        opts.hint ??
        "The presented API key is missing or not bound to a known agent. Set a valid key in your `.mcp.json` `Authorization` header (HTTP) or `ORBIT_API_KEY` (stdio).",
      ...opts,
    });
    this.name = "OrbitAuthError";
  }
}

/** Format any error as a clean, actionable MCP tool error result. */
export function toToolError(err: unknown): CallToolResult {
  const e = OrbitError.from(err);
  const text = `[${e.code}] ${e.message}\nHint: ${e.hint}`;
  return { isError: true, content: [{ type: "text", text }] };
}
