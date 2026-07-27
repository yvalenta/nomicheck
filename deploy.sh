#!/usr/bin/env bash
# Deploy / actualización de NomiCheck en producción (VPS homelab).
# Uso: ./deploy.sh [--no-build] [--down]        ← ojo: NO "sh deploy.sh" (es bash)
#
# --no-build  Solo hace pull+up, no reconstruye la imagen (más rápido si solo
#             cambiaron reglas o config, no el Dockerfile/dependencias).
# --down      Para nomicheck-api y nomicheck-db (mantenimiento). El resto del
#             stack docker-lab (cloudflared, kuma, rails…) sigue arriba.
#
# NomiCheck NO tiene stack propio: sus servicios viven en el compose raíz
# ~/docker-lab/docker-compose.yml junto al resto del homelab, porque comparten
# proxy-network y el túnel de Cloudflare. Levantar aquí un proyecto compose
# aparte choca con los container_name fijos de ese stack y, peor, apuntaría a
# un volumen de Postgres vacío en vez del bind mount ./data/nomicheck-postgres.
# Ver docker-compose.prod.yml (deprecado, no usar).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Raíz del stack homelab: apps/nomicheck/ → docker-lab/. Override con env var.
STACK_DIR="${NOMICHECK_STACK_DIR:-$(cd "$DIR/../.." && pwd)}"
STACK_FILE="$STACK_DIR/docker-compose.yml"
SERVICES=(nomicheck-api nomicheck-db)

if [[ ! -f "$STACK_FILE" ]]; then
  echo "ERROR: no encuentro el compose del homelab en $STACK_FILE"
  echo "       Este script solo corre en la VPS, dentro de docker-lab/apps/nomicheck/."
  echo "       (o exporta NOMICHECK_STACK_DIR apuntando a docker-lab/)"
  exit 1
fi

COMPOSE=(docker compose -f "$STACK_FILE")

# Verificar que .env existe y tiene contraseñas no-placeholder
if [[ ! -f "$DIR/.env" ]]; then
  echo "ERROR: $DIR/.env no existe — copia .env.example y rellena los valores"
  exit 1
fi
if grep -q 'cambia_esto_ahora' "$DIR/.env" 2>/dev/null; then
  echo "ERROR: .env aún tiene placeholders — edita DB_PASSWORD y JWT_SECRET"
  exit 1
fi

# Down explícito (solo los servicios de NomiCheck)
if [[ "${1:-}" == "--down" ]]; then
  echo "→ Deteniendo NomiCheck (resto del stack intacto)..."
  "${COMPOSE[@]}" stop "${SERVICES[@]}"
  exit 0
fi

echo "→ Pull de cambios..."
git -C "$DIR" pull --ff-only

BUILD_FLAG=()
[[ "${1:-}" != "--no-build" ]] && BUILD_FLAG=(--build)

echo "→ Levantando servicios (nomicheck-api + nomicheck-db)..."
"${COMPOSE[@]}" up -d "${BUILD_FLAG[@]}" "${SERVICES[@]}"

echo "→ Esperando healthcheck de la API..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3002/api/health > /dev/null 2>&1; then
    echo "✓ NomiCheck API lista en http://localhost:3002"
    "${COMPOSE[@]}" ps "${SERVICES[@]}"
    exit 0
  fi
  sleep 2
done

echo "✗ Timeout — revisando logs:"
"${COMPOSE[@]}" logs nomicheck-api --tail 30
exit 1
