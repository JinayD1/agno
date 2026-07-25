/**
 * Structured logger that writes ONLY to stderr.
 *
 * Critical: in stdio transport, stdout is reserved exclusively for the JSON-RPC
 * stream. Any stray stdout write corrupts the MCP protocol. Everything here goes
 * to stderr so the same logger is safe under both transports.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  const raw = (process.env.ORBIT_LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < currentThreshold()) return;
  const line =
    fields && Object.keys(fields).length > 0
      ? `${level.toUpperCase().padEnd(5)} orbit-mcp: ${msg} ${safeJson(fields)}`
      : `${level.toUpperCase().padEnd(5)} orbit-mcp: ${msg}`;
  // Always stderr — never stdout.
  process.stderr.write(line + "\n");
}

function safeJson(fields: Record<string, unknown>): string {
  try {
    return JSON.stringify(fields);
  } catch {
    return "[unserializable fields]";
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
