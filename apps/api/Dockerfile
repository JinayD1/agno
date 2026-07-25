FROM oven/bun:1

WORKDIR /app

# The git storage engine (src/git/index.ts) shells out to the real git binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Build context is the monorepo root (see render.yaml) so the workspace
# dependency on @orbit/types resolves via `bun install`.
COPY . .
RUN bun install

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "apps/api/src/index.ts"]
