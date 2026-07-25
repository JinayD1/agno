import type { OrbitErrorBody, OrbitErrorCode } from "@orbit/types";

const STATUS_BY_CODE: Record<OrbitErrorCode, number> = {
  NOT_FOUND: 404,
  SCOPE_DENIED: 403,
  INVALID_INPUT: 400,
  CONFLICT: 409,
  INTERNAL: 500,
};

/**
 * Canonical Orbit error. Throw this anywhere in a route/service and the global
 * error handler (see index.ts) serializes it to the §4.4 contract:
 *   { error: { code, message } }  with the mapped HTTP status.
 */
export class OrbitError extends Error {
  readonly code: OrbitErrorCode;
  readonly status: number;

  constructor(code: OrbitErrorCode, message: string) {
    super(message);
    this.name = "OrbitError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  toBody(): OrbitErrorBody {
    return { error: { code: this.code, message: this.message } };
  }

  static notFound(message: string) {
    return new OrbitError("NOT_FOUND", message);
  }
  static scopeDenied(message: string) {
    return new OrbitError("SCOPE_DENIED", message);
  }
  static invalidInput(message: string) {
    return new OrbitError("INVALID_INPUT", message);
  }
  static conflict(message: string) {
    return new OrbitError("CONFLICT", message);
  }
  static internal(message: string) {
    return new OrbitError("INTERNAL", message);
  }
}

export function httpStatusFor(code: OrbitErrorCode): number {
  return STATUS_BY_CODE[code];
}
