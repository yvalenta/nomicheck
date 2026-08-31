---
estado: hecha
dueño: ambos
fecha: 2026-08-31
tema: matriz de permisos como código y admin multi-empresa sin re-login
criterio_cierre: MembresiaEmpresa migrada con backfill; requiereAuth valida el puntero contra membresía (sin membresía → 403); POST /auth/empresa-activa escribe en AuditoriaCambio; toda ruta /empresa/* pasa por requierePermiso(matriz única); suite negativa cross-tenant por enumeración de rutas en verde
---

Del análisis del 2026-08-31 (sesión de organización): los 6 roles ya existen
(`Usuario.rol`), las guardas están centralizadas (`middleware/auth.ts` +
`lib/alcance.ts` con el ancla que exige el compilador), pero **un usuario
pertenece a lo sumo a UNA empresa** (`Usuario.empresaId`, puntero
denormalizado) — no hay membresías N:M, así que un admin de dos empresas
necesita dos cuentas. Eso es lo que pidió Yonatan cambiar.

Plan por pasos (detalle con archivos exactos en el informe de la sesión):
1. `lib/permisos.ts`: la matriz Permiso→roles como ÚNICA fuente;
   `requierePermiso` reemplaza gradualmente a `requiereRol`.
2. `GET /empresa/permisos` + página de Roles que se renderiza DESDE esa
   matriz (UI y enforcement no pueden divergir). Mockup ya entregado con los
   tokens reales de `apps/web/src/index.css`.
3. `MembresiaEmpresa {usuarioId, empresaId, rol}` + backfill desde
   `Usuario.empresaId/rol` + RLS de la tabla nueva en el mismo SQL.
4. `requiereAuth` valida el puntero contra la membresía y toma el rol de
   ahí. `Usuario.empresaId` pasa a ser "empresa activa" de verdad.
5. `POST /auth/empresa-activa` envuelto en `conAuditoria`; `whoami` devuelve
   `empresas: [{id, nombre, rol}]`; selector en el header de EmpresaApp.
6. "Ver como" de admin_plataforma: membresía temporal explícita rol
   `auditor` (solo lectura), auditada — jamás impersonar credenciales.

Riesgos a cerrar en la misma pasada: `asignarStaff` absorbe cuentas por
email sin consentimiento (pasar a invitación aceptable); `Liquidacion`,
`ReporteDiscrepancia` y `UsuarioSede` fuera del embudo de `alcance.ts`;
non-null assertions de `empresaId` en controllers.

## Bitácora
- 2026-08-31: tarea creada tras el análisis de auth/tenancy (informe completo en la sesión); mockup de la página de Roles entregado a Yonatan.
- 2026-08-31: EN CURSO — implementación arrancada con GO de Yonatan (pasos 1–6). Línea base medida antes de tocar nada: `pnpm test` en apps/api → 55 archivos, 795 pruebas, todas verdes (1,41s).
- 2026-08-31: **código COMPLETO y en verde** (commit `e2fb212`, sin push: repo público). Los 6 pasos escritos: matriz `lib/permisos.ts` (28 permisos × 6 roles) con `requierePermiso` en todas las rutas y `guardas.test.ts` que pone rojo una ruta sin guarda; `MembresiaEmpresa` + 3 migraciones; `requiereAuth` valida el puntero contra la membresía y saca de ahí el rol efectivo; `POST /auth/empresa-activa` auditado; `whoami` devuelve las membresías; selector y página de Roles en la web.
  Medido por esta sesión, no por los agentes: **119 archivos, 1669 pruebas verdes** (apps/api 795 → 952), typecheck limpio en los 4 paquetes.
  **La revisión adversarial fue la que pagó la noche**: encontró que la membresía se LEÍA y nunca se ESCRIBÍA — revocar no revocaba (la persona volvía con un POST) y ninguna alta creaba membresía (el registro habría nacido en 403 al aplicar la migración). 7 hallazgos (2 críticos, 3 altos, 2 medios); re-revisados uno por uno: los 7 cerrados. Las escrituras quedaron en un solo embudo (`lib/membresias.ts`) y la auditoría siguió a la tabla que decide — con el hallazgo de que la función genérica habría **abortado toda alta** por PK compuesta sin columna `id`, así que va una función hermana.
  **NO SE CIERRA la tarea**: su criterio dice "MembresiaEmpresa *migrada* con backfill" y las 3 migraciones están escritas pero **no aplicadas a ninguna BD** — aplicarlas es de Yonatan (lista 2). Orden: `20260830120000_membresia_empresa` → `20260830140000_auditoria_usuario` → `20260830160000_auditoria_membresia`. Hasta entonces el middleware degrada al comportamiento viejo con ventana de 15 min y ruido, no en silencio.
  Riesgos que quedan declarados, no cerrados: el consentimiento de `asignarStaff` (absorber por correo sin aceptación) y `Liquidacion`/`ReporteDiscrepancia` fuera del embudo de `alcance.ts`.
- 2026-08-31: **HECHA — criterio medido completo.** Yonatan aplicó las 3 migraciones con `prisma migrate deploy` (GO directo, en vivo); verificación de solo lectura contra producción: backfill exacto **5/5 membresías**, triggers `auditoria_Usuario` + `auditoria_MembresiaEmpresa` instalados, RLS activo en la tabla nueva, `migrate status` → "Database schema is up to date". Push a `main` hecho con su GO (`7ac7f6b`). Lo único que falta para que el producto SIRVA el comportamiento nuevo es desplegar la API — declarado como tarea propia en nomicheck_ops (los despliegues se gobiernan allá); hasta entonces producción corre el código viejo, que convive sano con el esquema nuevo (medido: la función de auditoría tolera el autor ausente).
