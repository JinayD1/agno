import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.ts";
import { OrbitError } from "../src/errors.ts";

const app = createApp();

describe("server", () => {
  test("GET /health returns 200 ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "orbit-api" });
  });

  test("unknown route returns §4.4 NOT_FOUND error shape", async () => {
    const res = await app.handle(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("OrbitError → §4.4 body", () => {
  test("maps codes to HTTP status and serializes body", () => {
    expect(OrbitError.scopeDenied("x").status).toBe(403);
    expect(OrbitError.notFound("x").status).toBe(404);
    expect(OrbitError.invalidInput("x").status).toBe(400);
    expect(OrbitError.conflict("x").status).toBe(409);
    expect(OrbitError.internal("x").status).toBe(500);
    expect(OrbitError.scopeDenied("denied").toBody()).toEqual({
      error: { code: "SCOPE_DENIED", message: "denied" },
    });
  });
});
