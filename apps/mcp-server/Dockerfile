FROM oven/bun:1

WORKDIR /app

# Build context is the monorepo root (see render.yaml) so the workspace
# dependency on @orbit/types resolves via `bun install`.
COPY . .
RUN bun install

ENV NODE_ENV=production
EXPOSE 8787

CMD ["bun", "apps/mcp-server/src/index.ts"]
