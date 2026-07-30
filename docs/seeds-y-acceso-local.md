# Seeds y acceso local

Cómo dejar un entorno de desarrollo utilizable desde cero: qué siembra el seed,
dónde viven las credenciales y cómo conseguir una cuenta con rol de administrador
sin tocar producción.

## Dónde vive cada cosa

La autenticación y los datos están **separados**, y confundirlos es la causa más
común de "no puedo entrar":

| | Dónde | Qué guarda |
|---|---|---|
| **Credenciales** | Supabase Auth — proyecto **hosted** (`SUPABASE_URL` en `.env`) | Correo y contraseña. El `id` del usuario es un UUID. |
| **Datos y roles** | Postgres local del `docker compose` (servicio `db`) | Tabla `Usuario` (`id` = el UUID de Supabase), `Empresa`, `Empleado`, reglas… |

Consecuencia práctica: **el rol no está en Supabase, está en la base local.** La
misma cuenta de correo puede ser `admin_empresa` en tu máquina y `colaborador`
en la de otro. Y como Auth es hosted, *no* hay usuarios de prueba desechables:
cualquier cuenta que crees ahí es real.

## Levantar el entorno

```bash
docker compose up -d          # api (3001), web (5173) y db
```

El entrypoint de dev (`bin/docker-entrypoint.dev`) reinstala dependencias y
regenera el cliente de Prisma, pero **no aplica migraciones** — eso solo lo hace
el de producción. En dev se aplican a mano, y **antes** del seed:

```bash
docker compose exec api ./node_modules/.bin/prisma migrate deploy
```

```bash
pnpm --filter @pv/api db:seed # reglas legales + festivos
```

`prisma/seed.ts` siembra el **catálogo legal** (SMLMV, recargos, UVT, topes…) y
los festivos, no usuarios ni empresas.

### El seed no reemplaza a las migraciones

El seed hace `upsert` por `(clave, vigenteDesde)`. Sobre una base **vacía** eso
alcanza y es idempotente. Sobre una base que ya tiene datos, no siempre:

| Cambio en `semillaLegal.ts` | ¿Basta con re-sembrar? |
|---|---|
| Fila nueva (una `clave` nueva, o un tramo nuevo) | ✅ entra sola |
| Otro `valor` para la misma `(clave, vigenteDesde)` | ✅ se actualiza |
| Cambió el `vigenteDesde` o el `vigenteHasta` de una fila que ya existía | ❌ **hace falta migración** |

El caso rojo es el peligroso y no es hipotético: la fila vieja sobrevive al
re-seed, y como el resolutor elige la de `vigenteDesde` más reciente, puede
ganarle al tramo correcto. Quedan datos contradictorios y el bug intacto. Por eso
la corrección de vigencias del divisor de jornada fue una migración con `DELETE` +
`INSERT` (`20260730140000_vigencias_recargos_y_divisor`) y no un re-seed.

Regla práctica: **si cambió una ventana de vigencia, va migración.** El
procedimiento completo de cómo se cambia un valor legal está en
[`sdd/vault/07_Trazabilidad_Codigo.md`](../sdd/vault/07_Trazabilidad_Codigo.md) §5.

## Conseguir una cuenta con rol de administrador

El registro público crea cuentas con rol `colaborador` o `individual`. Para
`admin_empresa` o `admin_plataforma` hay que asignar el rol a mano en la base
local — es deliberado (SDD §11: no hay auto-registro de administradores).

### 1. Ver qué cuentas existen

```bash
docker compose exec -T db psql -U postgres -d nomicheck_development \
  -c 'SELECT id, nombre, email, rol, "empresaId" FROM "Usuario" ORDER BY rol;'
```

```bash
docker compose exec -T db psql -U postgres -d nomicheck_development \
  -c 'SELECT id, nombre, nit FROM "Empresa";'
```

Si ya hay una cuenta con `rol = admin_empresa` y una `empresaId` con empleados,
entra con ese correo y listo — no hace falta modificar nada.

### 2. Si no hay ninguna: promover una cuenta existente

Regístrate por la app con tu correo (así Supabase Auth crea las credenciales y
la app crea la fila `Usuario`), y después asigna el rol:

```bash
docker compose exec -T db psql -U postgres -d nomicheck_development -c \
  "UPDATE \"Usuario\" SET rol='admin_empresa', \"empresaId\"=<ID_EMPRESA> WHERE email='<TU_CORREO>';"
```

Para revertir:

```bash
docker compose exec -T db psql -U postgres -d nomicheck_development -c \
  "UPDATE \"Usuario\" SET rol='colaborador', \"empresaId\"=NULL WHERE email='<TU_CORREO>';"
```

Este cambio es **solo local**: no toca Supabase ni ningún entorno compartido.

### 3. Administrador de plataforma

Mismo procedimiento con `rol='admin_plataforma'` y `empresaId` en `NULL` — es un
rol de plataforma, no de empresa. Desde `/admin` puede crear empresas e invitar a
su primer `admin_empresa`, que es el camino previsto para onboarding real.

## Cuidado: la verificación de rol falla abierto

En `EmpresaApp.tsx` la comprobación de rol tiene este fallback:

```ts
obtenerMiRol().catch(() => setRolOk(true));
```

Si la API está caída, **cualquier sesión ve la carcasa del panel de empresa**. No
hay fuga de datos —el backend exige `requiereRol` en cada endpoint, así que las
peticiones responden 401/403 y las tablas salen vacías con "Error de red"—, pero
sí despista al depurar: si el panel abre y todo aparece vacío, revisa primero que
la API esté viva antes de sospechar de los permisos.

```bash
curl -s http://localhost:3001/api/health   # {"ok":true,...}
```

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `502 Bad Gateway` en `/api/*` | La API no está corriendo; el proxy de Vite no encuentra el upstream | `docker compose up -d` y esperar a que `/api/health` responda |
| Entras y te rebota a `/colaborador` | Tu `Usuario` local tiene `rol='colaborador'` | Promover el rol (paso 2) o entrar con la cuenta admin |
| El panel abre pero todo sale vacío | La API está caída y el chequeo de rol falló abierto | Levantar la API |
| `Failed to fetch dynamically imported module` | La pestaña quedó abierta desde antes de un build y pide chunks con hash viejo | Ya está cubierto por `lib/lazyConReintento.ts`: recarga una vez sola |
| `port is already allocated` en el `db` | OrbStack u otro Postgres ocupa el 5432 | El binding del host está comentado a propósito en `docker-compose.yml`; la API llega por la red de Docker (`db:5432`) |
| `No hay regla legal vigente` al liquidar un periodo viejo | Tu base quedó sin las migraciones de vigencias; el seed solo no las aplica | `prisma migrate deploy` y después `db:seed` (ver arriba) |
