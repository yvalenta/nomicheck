---
estado: propuesta
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
