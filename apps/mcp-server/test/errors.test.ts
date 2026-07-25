import { describe, expect, test } from "bun:test";
import { OrbitError, OrbitAuthError, toToolError } from "../src/errors.js";

describe("OrbitError.fromResponse", () => {
  test("uses body.error.code when valid", async () => {
    const res = new Response(JSON.stringify({ error: { code: "SCOPE_DENIED", message: "nope" } }), { status: 403 });
    const e = await OrbitError.fromResponse(res);
    expect(e.code).toBe("SCOPE_DENIED");
    expect(e.message).toBe("nope");
    expect(e.httpStatus).toBe(403);
  });

  test("falls back to status-derived code when body has no usable code", async () => {
    const res = new Response("plain text error", { status: 404 });
    const e = await OrbitError.fromResponse(res);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.httpStatus).toBe(404);
  });

  test("ignores unknown codes and derives from status", async () => {
    const res = new Response(JSON.stringify({ error: { code: "TEAPOT", message: "x" } }), { status: 409 });
    const e = await OrbitError.fromResponse(res);
    expect(e.code).toBe("CONFLICT");
  });

  test("5xx is retriable", async () => {
    const res = new Response("boom", { status: 502 });
    const e = await OrbitError.fromResponse(res);
    expect(e.code).toBe("INTERNAL");
    expect(e.retriable).toBe(true);
  });
});

describe("OrbitError.from", () => {
  test("passes through OrbitError instances", () => {
    const orig = new OrbitError("CONFLICT", "dup");
    expect(OrbitError.from(orig)).toBe(orig);
  });
  test("wraps plain Errors as retriable INTERNAL", () => {
    const e = OrbitError.from(new Error("network down"));
    expect(e.code).toBe("INTERNAL");
    expect(e.retriable).toBe(true);
    expect(e.message).toBe("network down");
  });
});

describe("OrbitAuthError", () => {
  test("is SCOPE_DENIED with 401 and a hint", () => {
    const e = new OrbitAuthError("bad key");
    expect(e.code).toBe("SCOPE_DENIED");
    expect(e.httpStatus).toBe(401);
    expect(e.hint.length).toBeGreaterThan(0);
  });
});

describe("toToolError", () => {
  test("produces an actionable isError result", () => {
    const r = toToolError(new OrbitError("INVALID_INPUT", "missing intent"));
    expect(r.isError).toBe(true);
    const block = r.content[0] as { type: "text"; text: string };
    expect(block.text).toContain("[INVALID_INPUT] missing intent");
    expect(block.text).toContain("Hint:");
  });
});
