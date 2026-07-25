import { Elysia } from "elysia";
import { db } from "../db/index.ts";
import { bus } from "../events/index.ts";
import { requireRepo } from "../store/repos.ts";

const HEARTBEAT_MS = 15000;

/**
 * SSE stream for a repo (PRD §4.2 `GET /api/repos/:id/events`). Emits every
 * OrbitEvent for the repo as a named SSE event. A periodic comment heartbeat
 * keeps proxies from closing the idle connection (PRD risk mitigation), and the
 * stream tears down cleanly when the client disconnects (request.signal).
 */
export const eventRoutes = new Elysia().get(
  "/api/repos/:id/events",
  ({ params, request }) => {
    requireRepo(db(), params.id); // throws NOT_FOUND → handled before streaming
    const encoder = new TextEncoder();
    const signal = request.signal;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, HEARTBEAT_MS);

        try {
          for await (const event of bus.stream(params.id, signal)) {
            const frame = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
            controller.enqueue(encoder.encode(frame));
          }
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed by client disconnect
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  },
);
