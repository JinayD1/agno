#!/usr/bin/env bash
# Launch all three Orbit layers on separate ports for local testing:
#   Workstream A (API + SSE)   → http://localhost:3001
#   Workstream B (MCP server)  → http://localhost:8787/mcp
#   Workstream C (web UI)      → http://localhost:5173
#
# Seeds fresh demo data first (bootstrap), then starts everything and tears it
# all down on Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ Bootstrapping demo data…"
bun scripts/bootstrap.ts

pids=()
cleanup() {
  echo
  echo "▶ Stopping all services…"
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Starting API  → http://localhost:3001"
PORT=3001 bun apps/api/src/index.ts &
pids+=($!)

# Wait for the API to answer before starting the dependents.
for _ in $(seq 1 60); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then break; fi
  sleep 0.25
done

echo "▶ Starting MCP  → http://localhost:8787/mcp"
bun --env-file=apps/mcp-server/.env apps/mcp-server/src/index.ts &
pids+=($!)

echo "▶ Starting Web  → http://localhost:5173"
( cd web && bunx vite --port 5173 --host ) &
pids+=($!)

echo
echo "✅ All three running. Open http://localhost:5173  —  Ctrl-C to stop."
echo
wait
