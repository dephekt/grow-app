# syntax=docker/dockerfile:1

FROM docker.io/node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.3 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm exec svelte-kit sync
RUN pnpm build
# Bundle the standalone history-recorder sidecar (esbuild is a dev dep, so build
# it before pruning). Runtime deps (mqtt, influxdb-client) stay external.
RUN pnpm build:recorder
RUN pnpm prune --prod

FROM docker.io/node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/build-recorder ./build-recorder
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000

USER node

CMD ["node", "build"]
