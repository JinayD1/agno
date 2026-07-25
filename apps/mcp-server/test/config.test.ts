import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.js";
import { OrbitError } from "../src/errors.js";

const base = { ORBIT_AGENT_KEYS_FILE: "./keys.example.json" } as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  test("defaults to stdio and requires an API key there", () => {
    expect(() => loadConfig({ ...base })).toThrow(OrbitError);
  });

  test("stdio with key parses and strips trailing slash from apiUrl", () => {
    const c = loadConfig({ ...base, ORBIT_API_KEY: "k", ORBIT_API_URL: "http://a:4000/" });
    expect(c.transport).toBe("stdio");
    expect(c.apiUrl).toBe("http://a:4000");
    expect(c.apiKey).toBe("k");
  });

  test("http transport does not require a key and uses defaults", () => {
    const c = loadConfig({ ...base, ORBIT_TRANSPORT: "http" });
    expect(c.transport).toBe("http");
    expect(c.http.port).toBe(8787);
    expect(c.http.path).toBe("/mcp");
  });

  test("rejects an invalid transport", () => {
    expect(() => loadConfig({ ...base, ORBIT_TRANSPORT: "carrier-pigeon" })).toThrow(OrbitError);
  });

  test("rejects an invalid port", () => {
    expect(() => loadConfig({ ...base, ORBIT_TRANSPORT: "http", ORBIT_HTTP_PORT: "99999" })).toThrow(OrbitError);
  });

  test("parses CORS origins into a list", () => {
    const c = loadConfig({ ...base, ORBIT_TRANSPORT: "http", ORBIT_CORS_ORIGINS: "https://a.com, https://b.com" });
    expect(c.http.corsOrigins).toEqual(["https://a.com", "https://b.com"]);
  });
});
