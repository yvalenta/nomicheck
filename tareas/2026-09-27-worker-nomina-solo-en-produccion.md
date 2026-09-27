---
estado: propuesta
dueño: ambos
fecha: 2026-09-27
tema: el worker de pg-boss de la cola `liquidar-nomina` se registra en cualquier instancia que arranque con el `DATABASE_URL` de producción — hace falta una guarda por entorno para que el standby del homelab pueda volver sin competir por los jobs
criterio_cierre: release desplegado con la guarda (p.ej. `NOMINA_WORKER=off` → `apps/api/src/index.ts` no llama a `boss.work`, y lo dice en el log); en Lightsail el log sigue mostrando `Worker registrado en cola "liquidar-nomina"`; en el homelab, con la variable apagada y `SKIP_DB_MIGRATE=true`, el log tras arrancar NO lo muestra ni dice `migrations found`
---

Origen: `nomicheck_ops/tareas/2026-09-27-standby-es-worker-de-produccion.md`
(allá está la evidencia y la decisión de Yonatan). Resumen para una sesión fría:

- `apps/api/src/index.ts:120-133` arranca pg-boss al levantar el proceso y
  `apps/api/src/workers/liquidacionWorker.ts:249-263` hace
  `boss.work(COLA_LIQUIDACION)` sin guarda. El `nomicheck-api` del homelab
  usa la misma base que producción, así que competía por los jobs
  (`SKIP LOCKED`) y podía escribir liquidaciones reales con un sha atrasado.
- `bin/docker-entrypoint:3-6` corre `prisma migrate deploy` salvo
  `SKIP_DB_MIGRATE`: el standby también migraba producción al arrancar.
- Mientras tanto, el contenedor del homelab está PARADO desde el 2026-09-27
  20:44Z y `paridad-standby.timer` está deshabilitado (si no, lo volvía a
  levantar).

La guarda tiene que fallar cerrada del lado correcto: que Lightsail NO pierda
el worker por una variable ausente. Conviene que el default sea encendido y
que el homelab lo apague explícito, o al revés con el valor puesto en el
`deploy.sh` de Lightsail. Decidirlo al diseñar; que lo refute el refutador
(toca dinero). El deploy es de Yonatan.

## Bitácora
- 2026-09-27: declarada desde la sesión de nomicheck_ops que paró el standby.
  Nada tocado en este repo.
