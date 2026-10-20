# syntax=docker/dockerfile:1.7
# Multi-target image: `web` (Next.js standalone), `worker` (bundled ingestion worker),
# `migrate` (one-shot Prisma migrate deploy + idempotent seed). Web and worker deploy independently.

ARG NODE_IMAGE=node:24.22.0-alpine3.24

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- full dependency install (build tooling, prisma CLI, tsx) ----
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --ignore-scripts && npx prisma generate

# ---- build web + worker ----
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build && npm run worker:build

# ---- production-only node_modules for the worker ----
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --omit=dev --ignore-scripts

# ---- migrate/seed job ----
FROM deps AS migrate
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig.json ./
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx prisma/seed.ts"]

# ---- web ----
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---- worker ----
FROM base AS worker
ENV NODE_ENV=production SERVICE_NAME=worker
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/worker ./dist/worker
COPY --from=build --chown=node:node /app/generated ./generated
COPY package.json ./
USER node
CMD ["node", "--enable-source-maps", "dist/worker/index.mjs"]
