#!/usr/bin/env bash
# Deploy / actualización de NomiCheck en producción (VPS homelab).
#
# Uso:  ./deploy.sh [--no-build] [--down]
#
#   --no-build  Solo pull + up, sin reconstruir la imagen (rápido si solo
#               cambiaron reglas o config, no el Dockerfile/dependencias).
#   --down      Para nomicheck-api y nomicheck-db (mantenimiento).
#
# IMPORTANTE — este script opera sobre el stack raíz ~/docker-lab/docker-compose.yml,
# que es la ÚNICA fuente de verdad de nomicheck-api y nomicheck-db en producción.
# apps/nomicheck/docker-compose.prod.yml está deprecado: define los mismos
# container_name, así que levantarlo choca ("container name already in use") y,
# peor, su bloque `environment:` sobrescribe DATABASE_URL para apuntar al
# Postgres local vacío en vez de a Supabase. Ver DEPRECATED-docker-compose.prod.yml.

set -euo pipefail

# Guard: el script es bash (usa [[ ]], BASH_SOURCE, pipefail). Con `sh deploy.sh`
# dash lo ejecuta a medias — DIR queda vacío y los `if` se saltan en silencio.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: ejecuta con bash, no sh:  ./deploy.sh   (o  bash deploy.sh)" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # ~/docker-lab/apps/nomicheck
LAB_DIR="$(cd "$APP_DIR/../.." && pwd)"                   # ~/docker-lab
SERVICES=(nomicheck-db nomicheck-api)

COMPOSE=(docker compose -f "$LAB_DIR/docker-compose.yml" --env-file "$LAB_DIR/.env")

# ── Comprobaciones previas ───────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: $APP_DIR/.env no existe — cópialo de .env.example y rellénalo" >&2
  exit 1
fi
if [[ ! -f "$LAB_DIR/.env" ]]; then
  echo "ERROR: $LAB_DIR/.env no existe (necesario para NOMICHECK_DB_PASSWORD)" >&2
  exit 1
fi
if grep -q 'cambia_esto_ahora' "$APP_DIR/.env"; then
  echo "ERROR: $APP_DIR/.env aún tiene placeholders — edita DB_PASSWORD y JWT_SECRET" >&2
  exit 1
fi
# El PEM de firma debe venir completo por env_file. Si se pierde, el wrapper
# firma con un keypair efímero y los outputs dejan de verificar tras el redeploy.
if ! grep -q 'NOMICHECK_BATCH_SIGNING_KEY_PEM=' "$APP_DIR/.env"; then
  echo "ERROR: falta NOMICHECK_BATCH_SIGNING_KEY_PEM en $APP_DIR/.env" >&2
  exit 1
fi

# ── --down ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--down" ]]; then
  echo "→ Deteniendo NomiCheck (api + db)..."
  "${COMPOSE[@]}" stop "${SERVICES[@]}"
  exit 0
fi

# ── Pull ─────────────────────────────────────────────────────────────────────
echo "→ Pull de cambios..."
git -C "$APP_DIR" pull --ff-only

# ── El sha que se está desplegando ───────────────────────────────────────────
# Se calcula DESPUÉS del pull —es el commit que va a correr, no el que corría— y
# se exporta para que Compose lo inyecte en la API, que lo publica en
# /api/health. Sin esto el sha desplegado solo se sabe entrando a este VPS, y un
# dato que sólo vive acá es un dato que la documentación copia a mano y deja
# envejecer: ya estuvo días afirmando un commit falso.
GIT_SHA="$(git -C "$APP_DIR" rev-parse HEAD)"
export GIT_SHA
echo "→ Desplegando ${GIT_SHA:0:7}"

# ── Imagen ───────────────────────────────────────────────────────────────────
# La imagen NO se construye acá: la construye el CI en cada push y la publica en
# GHCR, etiquetada por sha. Historia (2026-07-29): cinco deploys seguidos
# murieron en `pnpm install` dentro del build — este enlace baja tarballs a
# 3 KiB/s y el chequeo de cadena de suministro de pnpm (491 entradas) tardaba 14
# minutos y expiraba. Subirle el timeout y cachear el store no alcanzó: el
# problema era descargar 491 paquetes por este enlace en cada build. Ahora se
# baja UNA imagen ya construida.
#
# Se baja por SHA, no por `latest`: el compose usa ${GIT_SHA}, así que la imagen
# que corre es exactamente la del commit que el pull acaba de traer — no la
# última que el CI haya publicado, que puede ser de otra rama o de un push
# posterior. Si el CI todavía no terminó de publicar este sha, el pull falla acá
# con un mensaje claro, ANTES de tocar el contenedor que está sirviendo.
#
# `--no-build` pasa a significar "sin pull": levanta con lo que ya esté local.
if [[ "${1:-}" != "--no-build" ]]; then
  echo "→ Bajando la imagen del CI (sha ${GIT_SHA:0:7})..."
  if ! "${COMPOSE[@]}" pull nomicheck-api; then
    echo "✗ No se pudo bajar la imagen ${GIT_SHA:0:7} de GHCR." >&2
    echo "  ¿El CI de ese commit ya terminó? Miralo: gh run list --limit 3" >&2
    exit 1
  fi
fi

# ── Up ───────────────────────────────────────────────────────────────────────
echo "→ Levantando servicios (${SERVICES[*]})..."
"${COMPOSE[@]}" up -d "${SERVICES[@]}"

# ── Healthcheck ──────────────────────────────────────────────────────────────
echo "→ Esperando healthcheck de la API..."
for _ in $(seq 1 30); do
  if SALUD="$(curl -sf http://localhost:3002/api/health 2>/dev/null)"; then
    echo "✓ NomiCheck API lista en http://localhost:3002"

    # ── ¿Puede SERVIR, o solo levantó? ───────────────────────────────────────
    # `/api/health` es estático: `{ok, ts, sha}`, sin tocar la base. Dice que el
    # proceso arrancó, no que pueda contestar. `/api/batch/health` sí consulta
    # el ledger de reglas, o sea Prisma y Supabase.
    #
    # La diferencia costó plata el 2026-08-03: este script dio "API lista", se
    # hizo el primer pago x402 real, el muro COBRÓ, y el handler murió contra
    # una conexión a Supabase que todavía no existía. El comprador pagó y
    # recibió un 500 — y en x402 el cobro es inmediato y final, así que no hay
    # forma de devolvérselo.
    #
    # No es un detalle del deploy: el muro cobra ANTES de ejecutar el handler
    # (faremeter liquida en `capture()` y recién después llama a `next()`), así
    # que cualquier ventana en que la API acepte tráfico sin poder servirlo es
    # una ventana en la que se cobra por nada. Se cierra acá, esperando.
    for _ in $(seq 1 20); do
      if curl -sf http://localhost:3002/api/batch/health >/dev/null 2>&1; then
        echo "✓ la API llega a la base: /api/batch/health responde"
        break
      fi
      sleep 2
    done
    if ! curl -sf http://localhost:3002/api/batch/health >/dev/null 2>&1; then
      echo "⚠ la API levantó pero NO llega a la base." >&2
      echo "  Los endpoints con muro van a COBRAR y devolver 500: el comprador" >&2
      echo "  paga y no recibe nada, y el cobro x402 no se puede deshacer." >&2
      echo "  Apagá el muro (X402_ACTIVO=false en $APP_DIR/.env) hasta resolverlo." >&2
    fi

    # ── ¿Lo servido dice qué commit es? ──────────────────────────────────────
    # Exportar GIT_SHA acá no basta: Compose solo pasa al contenedor las
    # variables que su servicio LISTA, y el stack que manda es
    # ~/docker-lab/docker-compose.yml, que no vive en este repo. Sin esa línea
    # la variable se queda en este script y /api/health responde `sha: null`.
    #
    # Se comprueba contra lo SERVIDO y no contra lo que este script cree haber
    # hecho: un deploy que "exportó la variable" y no la entregó se ve idéntico
    # a uno que sí, y esa diferencia es justo la que dejó a la documentación
    # afirmando un commit falso durante días.
    SHA_SERVIDO="$(printf '%s' "$SALUD" | sed -n 's/.*"sha":"\([0-9a-f]*\)".*/\1/p')"
    if [[ "$SHA_SERVIDO" == "$GIT_SHA" ]]; then
      echo "✓ /api/health publica el sha desplegado (${GIT_SHA:0:7})"
    else
      echo "⚠ /api/health NO publica el sha desplegado — responde '${SHA_SERVIDO:-null}'." >&2
      echo "  Agregá esta línea al servicio nomicheck-api de $LAB_DIR/docker-compose.yml:" >&2
      echo "      GIT_SHA: \${GIT_SHA:-}" >&2
      echo "  Hasta entonces, nada fuera de este VPS puede comprobar qué commit corre." >&2
    fi

    # ── ¿El muro x402 cobra, si se pidió que cobre? ──────────────────────────
    # Misma trampa que el sha, y por eso la misma forma de comprobarla: la
    # INTENCIÓN vive en ~/docker-lab/.env, pero Compose solo entrega al
    # contenedor las variables que el servicio LISTA. Un stack sin esas líneas
    # deja el muro apagado y se ve idéntico a "todavía no se desplegó" — con la
    # diferencia de que acá lo que no pasa es que nadie paga.
    #
    # Se mide lo SERVIDO: el endpoint tiene que contestar 402 sin pago.
    # La INTENCIÓN vive en el env_file de la app y no en el del lab: este
    # servicio no declara `environment:` en el compose, se configura entero por
    # `env_file: ./apps/nomicheck/.env`. Mirar el archivo equivocado haría que
    # esta guarda nunca se dispare, que es la peor clase de guarda.
    #
    # ── Por qué la sonda usa un GET y no un POST con `{}` ────────────────────
    #
    # Hasta el 2026-08-16 sondeaba con `POST {}`, y ese cuerpo YA NO llega al
    # muro: desde `42d78fc` un cuerpo mal formado se rechaza con 400 **antes**
    # de liquidar el pago, a propósito, para no cobrarle a un comprador por su
    # propio typo. O sea que la guarda empezó a gritar «NO cobra» en un deploy
    # donde el muro cobraba perfecto — y solo se vio ahora, cinco commits
    # después, porque en el medio nadie desplegó.
    #
    # Una guarda que grita en verde es peor que ninguna: la próxima vez que
    # avise de verdad, nadie le va a creer. Es la misma lección que ya está
    # escrita arriba sobre los reintentos del apex.
    #
    # El `GET` es la sonda correcta porque no depende del contrato del cuerpo:
    # desde `d95cd19` una ruta paga contesta su 402 a cualquier verbo, que es
    # justo lo que hacen el facilitador y los crawlers. Un cuerpo de ejemplo
    # habría vuelto a atar esta guarda a un esquema que puede cambiar.
    if grep -qE '^X402_ACTIVO=true' "$APP_DIR/.env" 2>/dev/null; then
      CODIGO_402="$(curl -s -o /dev/null -w '%{http_code}' \
        http://localhost:3002/api/batch/verificar 2>/dev/null || true)"
      if [[ "$CODIGO_402" == "402" ]]; then
        echo "✓ el muro x402 cobra: un GET a /api/batch/verificar responde 402 sin pago"
      else
        echo "⚠ $APP_DIR/.env pide X402_ACTIVO=true pero lo servido NO cobra" >&2
        echo "  (/api/batch/verificar responde ${CODIGO_402:-sin respuesta}, no 402)." >&2
        echo "  Revisá que el contenedor las esté recibiendo:" >&2
        echo "      docker compose exec nomicheck-api env | grep X402" >&2
        echo "  Si el .env las tiene y el contenedor no, sobró un \`environment:\`" >&2
        echo "  en el compose pisando el env_file con un valor vacío." >&2
      fi
    fi

    "${COMPOSE[@]}" ps "${SERVICES[@]}"
    exit 0
  fi
  sleep 2
done

echo "✗ Timeout — últimos logs de la API:" >&2
# Si el muro está encendido, la causa más probable del timeout está en los logs
# de arriba y es deliberada: `montarMuroX402` REVIENTA al arrancar si la config
# está mal (payTo que no es una dirección, o la wallet comprometida), en vez de
# fallar recién cuando llegue el primer comprador. Se apaga con X402_ACTIVO=false
# en ~/docker-lab/.env y otro deploy.
"${COMPOSE[@]}" logs nomicheck-api --tail 30
exit 1
