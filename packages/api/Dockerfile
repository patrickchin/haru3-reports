# syntax=docker/dockerfile:1.7

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Workspace manifests first for cache-friendly install.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/report-core/package.json packages/report-core/
COPY packages/api/package.json packages/api/

RUN pnpm install --frozen-lockfile --filter @harpa/api...

# Source.
COPY packages/report-core packages/report-core
COPY packages/api packages/api

# Build report-core first so the API can import compiled JS, then build the API.
# pnpm --prod deploy honors publishConfig in report-core/package.json,
# rewriting main/types to ./dist when copied into the runtime image.
RUN pnpm --filter @harpa/report-core build \
 && pnpm --filter @harpa/api build

# Trim devDependencies for the runtime image.
RUN pnpm --filter @harpa/api --prod deploy /out

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /out/package.json ./package.json

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 8080

# Fly.io health check polls /v1/health (configured in fly.toml).
CMD ["node", "dist/index.js"]
