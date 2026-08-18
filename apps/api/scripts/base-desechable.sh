#!/usr/bin/env bash
# Levanta una Postgres desechable con TODAS las migraciones aplicadas, para
# probar contra una base de verdad sin tocar producción.
#
#     ./scripts/base-desechable.sh          # crea/recrea y aplica
#     ./scripts/base-desechable.sh --borrar # la tira
#
# ── Por qué existe ──────────────────────────────────────────────────────────
#
# Porque el camino obvio NO funciona y falla hacia el lado peligroso. Esto:
#
#     DATABASE_URL="postgresql://...localhost:55433/..." pnpm exec prisma migrate deploy
#
# **aplica la migración a producción.** El CLI de Prisma recarga `apps/api/.env`
# —que apunta al pooler de Supabase— y ese valor gana sobre la variable de la
# línea de comando. Pasarle `--schema` a una copia con su propio `.env` tampoco
# alcanza: vuelve a resolver el mismo `.env`. Y el mensaje de éxito es idéntico
# en los dos casos, así que no hay forma de notarlo leyendo la salida.
#
# Pasó el 2026-08-16 con la migración de `EvidenciaCierre`. Fue aditiva y sin
# datos, así que no dolió; el mismo error con un `ALTER` o un `DROP` sí.
#
# La lección no es "acordate de revisar": es que **el env no es un mecanismo de
# aislamiento acá**. Por eso este script no usa el CLI — aplica los `.sql` con
# psql, contra un contenedor que solo existe para esto.
#
# Del lado del código, la misma regla: pasarle la URL EXPLÍCITA al cliente
# (`new PrismaClient({ datasources: { db: { url } } })`), nunca por env.
set -euo pipefail

CONTENEDOR="${CONTENEDOR:-nomicheck-base-desechable}"
PUERTO="${PUERTO:-55433}"
IMAGEN="${IMAGEN:-postgres:17-alpine}"
URL="postgresql://postgres:test@localhost:${PUERTO}/medidor"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--borrar" ]]; then
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  echo "→ $CONTENEDOR eliminado"
  exit 0
fi

if ! docker inspect "$CONTENEDOR" >/dev/null 2>&1; then
  echo "→ levantando $CONTENEDOR ($IMAGEN) en :$PUERTO"
  docker run -d --name "$CONTENEDOR" \
    -e POSTGRES_PASSWORD=test -e POSTGRES_DB=medidor \
    -p "${PUERTO}:5432" "$IMAGEN" >/dev/null
else
  docker start "$CONTENEDOR" >/dev/null
fi

for _ in $(seq 1 30); do
  docker exec "$CONTENEDOR" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "→ base limpia"
docker exec "$CONTENEDOR" psql -q -U postgres \
  -c "DROP DATABASE IF EXISTS medidor;" -c "CREATE DATABASE medidor;" >/dev/null

# El esquema `auth` lo pone Supabase, no nuestras migraciones — pero la de RLS
# referencia `auth.uid()`. Un stub alcanza: acá nadie autentica.
docker exec -i "$CONTENEDOR" psql -q -U postgres -d medidor >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
SQL

n=0
for d in "$DIR"/prisma/migrations/*/; do
  [[ -f "$d/migration.sql" ]] || continue
  if ! docker exec -i "$CONTENEDOR" psql -v ON_ERROR_STOP=1 -q -U postgres -d medidor < "$d/migration.sql" >/dev/null 2>&1; then
    echo "✗ falló $(basename "$d")" >&2
    docker exec -i "$CONTENEDOR" psql -v ON_ERROR_STOP=1 -U postgres -d medidor < "$d/migration.sql" 2>&1 | tail -5 >&2
    exit 1
  fi
  n=$((n + 1))
done

# Cero migraciones NO es exito. Si el glob no encuentra nada —directorio movido,
# `$DIR` mal resuelto, un checkout a medias— el bucle no itera, `n` queda en 0 y
# sin esta guarda el script imprime un ✓ y sale con 0 habiendo aplicado NADA.
# Despues alguien prueba contra una base vacia creyendo que tiene el esquema.
#
# Es el mismo modo de falla que una sesion hermana pago el 2026-08-18 con un
# chequeo de secretos que "salio limpio" porque en zsh `for d in $VARIABLE` no
# separa palabras: itero una vez sobre la cadena entera y no reviso nada. **Salir
# limpio por vacio se ve igual que salir limpio por sano**, y esa es justo la
# clase de verde que este repo no se puede permitir.
if [[ "$n" -eq 0 ]]; then
  echo "✗ no se aplico NINGUNA migracion — el glob de $DIR/prisma/migrations/*/ no encontro nada." >&2
  echo "  La base quedo vacia. Un '0 migraciones' no es exito: es no haber hecho nada." >&2
  exit 1
fi

echo "✓ $n migraciones aplicadas sobre base vacía"
echo
echo "  $URL"
echo
echo "  Pasala EXPLÍCITA al cliente, no por env:"
echo "    new PrismaClient({ datasources: { db: { url: \"$URL\" } } })"
