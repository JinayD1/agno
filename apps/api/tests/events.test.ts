import { describe, expect, test } from "bun:test";
import type { AgentSession, OrbitEvent } from "@orbit/types";
import { EventBus } from "../src/events/index.ts";

function sessionEvent(id: string): OrbitEvent {
  const session: AgentSession = {
    id,
    agentId: "agent_1",
    repoId: "repo_1",
    status: "active",
    currentTask: null,
    lastHeartbeat: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };
  return { type: "session.started", payload: session };
}

describe("EventBus fanout", () => {
  test("delivers an emitted event to a subscriber", () => {
    const bus = new EventBus();
    const received: OrbitEvent[] = [];
    bus.subscribe("repo_1", (e) => received.push(e));
    bus.emit("repo_1", sessionEvent("s1"));
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe("session.started");
  });

  test("scopes events per repo (isolation)", () => {
    const bus = new EventBus();
    const a: OrbitEvent[] = [];
    const b: OrbitEvent[] = [];
    bus.subscribe("repo_a", (e) => a.push(e));
    bus.subscribe("repo_b", (e) => b.push(e));
    bus.emit("repo_a", sessionEvent("s1"));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  test("delivers to multiple subscribers of the same repo", () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe("repo_1", () => count++);
    bus.subscribe("repo_1", () => count++);
    bus.emit("repo_1", sessionEvent("s1"));
    expect(count).toBe(2);
  });

  test("unsubscribe stops delivery and cleans up", () => {
    const bus = new EventBus();
    let count = 0;
    const sub = bus.subscribe("repo_1", () => count++);
    bus.emit("repo_1", sessionEvent("s1"));
    sub.unsubscribe();
    bus.emit("repo_1", sessionEvent("s2"));
    expect(count).toBe(1);
    expect(bus.subscriberCount("repo_1")).toBe(0);
  });

  test("emit within 100ms of subscribe reaches handler (PRD DoD)", () => {
    const bus = new EventBus();
    let receivedAt = 0;
    bus.subscribe("repo_1", () => {
      receivedAt = performance.now();
    });
    const emittedAt = performance.now();
    bus.emit("repo_1", sessionEvent("s1"));
    expect(receivedAt - emittedAt).toBeLessThan(100);
  });
});

describe("EventBus.stream", () => {
  test("yields events then ends on abort", async () => {
    const bus = new EventBus();
    const controller = new AbortController();
    const got: OrbitEvent[] = [];

    const consumer = (async () => {
      for await (const event of bus.stream("repo_1", controller.signal)) {
        got.push(event);
      }
    })();

    // let the generator subscribe
    await Bun.sleep(5);
    bus.emit("repo_1", sessionEvent("s1"));
    bus.emit("repo_1", sessionEvent("s2"));
    await Bun.sleep(5);
    controller.abort();
    await consumer;

    expect(got.map((e) => (e.type === "session.started" ? e.payload.id : ""))).toEqual([
      "s1",
      "s2",
    ]);
    expect(bus.subscriberCount("repo_1")).toBe(0);
  });
});
