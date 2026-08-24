# syntax=docker/dockerfile:1
# check=error=true;skip=SecretsUsedInArgOrEnv

# Imagen de producción para NomiCheck (monorepo pnpm: apps/api + apps/web + packages/reglas).
# No pensada para desarrollo — usa `pnpm dev` en local para eso.
#
# docker build -t nomicheck \
#   --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
#   --build-arg VITE_SUPABASE_ANON_KEY=<publishable-key> .
# docker run -d -p 80:80 --env-file apps/api/.env --name nomicheck nomicheck

ARG NODE_VERSION=22.18.0
FROM docker.io/library/node:${NODE_VERSION}-slim AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

ENV NODE_ENV="production" \
    PORT="80"

# ---- Etapa de build: instala todas las deps (incl. dev) y compila ----
FROM base AS build

# openssl es requerido por el motor de Prisma en runtime
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# El .npmrc entra ANTES del install: trae los margenes de red que el build
# del VPS necesita para que el chequeo de cadena de suministro no expire.
COPY .npmrc pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/reglas/package.json packages/reglas/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/web/package.json apps/web/package.json

# El store de pnpm va en un cache mount de BuildKit, no dentro de la capa.
#
# Motivo, del 2026-07-29: desde el VPS este install tarda 14+ minutos, porque
# pnpm 11 valida 491 entradas del lockfile contra el registro con tarballs
# bajando a 3 KiB/s. Sin cache, un build interrumpido tira TODO ese trabajo y el
# siguiente empieza de cero. Paso tres veces seguidas.
#
# Con el cache mount, los paquetes y la metadata ya descargados sobreviven entre
# builds. El primero sigue siendo lento; los reintentos, no. Es la diferencia
# entre un enlace lento y un enlace lento que ademas no acumula nada.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY tsconfig.base.json ./
COPY packages/reglas packages/reglas
COPY apps/api apps/api
COPY apps/mcp apps/mcp
COPY apps/web apps/web

RUN pnpm --filter @pv/api exec prisma generate

# Vite incrusta estas variables en el bundle en tiempo de build (no de
# runtime) — deben pasarse como --build-arg. Son claves públicas
# (publishable), seguras para exponer en el navegador; por eso el linter
# de secretos se desactiva arriba solo para este caso.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# `@pv/mcp` va antes que la API por la misma razón que `@pv/reglas`: la API lo
# importa por `main: ./dist/servidor.js` (el MCP sobre HTTP en /api/mcp).
RUN pnpm --filter @pv/reglas build && \
    pnpm --filter @pv/mcp build && \
    pnpm --filter @pv/api build && \
    pnpm --filter @pv/web build

# Solo las dependencias de producción sobreviven al runtime final
RUN pnpm deploy --filter @pv/api --prod --legacy /app/deploy/api

# ---- Etapa final: solo artefactos compilados + deps de producción ----
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

RUN groupadd --system --gid 1001 nomicheck && \
    useradd nomicheck --uid 1001 --gid 1001 --create-home --shell /bin/bash

COPY --chown=nomicheck:nomicheck --from=build /app/deploy/api ./
COPY --chown=nomicheck:nomicheck --from=build /app/apps/api/dist ./dist
COPY --chown=nomicheck:nomicheck --from=build /app/apps/api/prisma ./prisma
COPY --chown=nomicheck:nomicheck --from=build /app/apps/web/dist ./web-dist
COPY --chown=nomicheck:nomicheck bin/docker-entrypoint /app/bin/docker-entrypoint

RUN chmod +x /app/bin/docker-entrypoint

USER 1001:1001

ENTRYPOINT ["/app/bin/docker-entrypoint"]

EXPOSE 80
CMD ["node", "dist/index.js"]
