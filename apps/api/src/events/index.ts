import type { OrbitEvent } from "@orbit/types";

/**
 * In-process event bus (PRD §5 "SSE event bus — in-process emitter → SSE
 * fanout"). Mutating endpoints call `bus.emit(repoId, event)`; the SSE route
 * (`GET /api/repos/:id/events`) calls `bus.stream(repoId)` to fan the events out
 * to connected clients. Events are scoped per repo — a subscriber only receives
 * events for the repo it subscribed to.
 *
 * This module is transport-agnostic: it knows nothing about HTTP/SSE framing.
 * That lives in the route layer (T3.1).
 */

export type Subscriber = (event: OrbitEvent) => void;

export interface Subscription {
  unsubscribe(): void;
}

export class EventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  /** Deliver an event to every subscriber of `repoId`. Synchronous fanout. */
  emit(repoId: string, event: OrbitEvent): void {
    const set = this.subscribers.get(repoId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch {
        // A misbehaving subscriber must not break fanout to the others.
      }
    }
  }

  subscribe(repoId: string, fn: Subscriber): Subscription {
    let set = this.subscribers.get(repoId);
    if (!set) {
      set = new Set();
      this.subscribers.set(repoId, set);
    }
    set.add(fn);
    return {
      unsubscribe: () => {
        const s = this.subscribers.get(repoId);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) this.subscribers.delete(repoId);
      },
    };
  }

  subscriberCount(repoId: string): number {
    return this.subscribers.get(repoId)?.size ?? 0;
  }

  /**
   * Async iterator of events for a repo, suitable for driving an SSE response.
   * Buffers events that arrive between pulls so none are dropped. Ends cleanly
   * when `signal` aborts (e.g. client disconnects).
   */
  async *stream(repoId: string, signal?: AbortSignal): AsyncGenerator<OrbitEvent> {
    const queue: OrbitEvent[] = [];
    let wake: (() => void) | null = null;
    let closed = false;

    const sub = this.subscribe(repoId, (event) => {
      queue.push(event);
      wake?.();
    });

    const onAbort = () => {
      closed = true;
      wake?.();
    };
    if (signal) {
      if (signal.aborted) closed = true;
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      while (!closed) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (closed) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
      // Drain anything buffered before the abort.
      while (queue.length > 0) yield queue.shift()!;
    } finally {
      sub.unsubscribe();
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Shared singleton used by the running server. */
export const bus = new EventBus();
