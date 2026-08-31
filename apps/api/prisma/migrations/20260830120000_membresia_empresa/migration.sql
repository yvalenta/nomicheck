-- Membresías multi-empresa (SDD §15 — paso 3 de tareas/2026-08-31-matriz-permisos-y-multiorg.md).
--
-- Hasta hoy la pertenencia era `Usuario.empresaId` + `Usuario.rol`: una cuenta
-- = una empresa, así que un admin de dos empresas necesitaba DOS cuentas.
-- Esta tabla parte esa columna en dos responsabilidades:
--   MembresiaEmpresa  → a qué empresas pertenece y con qué rol (autorización).
--   Usuario.empresaId → en cuál está parado ahora (puntero a la empresa activa).
-- El rol pasa a ser POR EMPRESA: la misma persona puede ser admin_empresa en
-- una y auditor en otra. `requiereAuth` valida el puntero contra esta tabla en
-- cada request y saca de aquí el rol efectivo; puntero sin membresía → 403.

-- Sin columna "id": la PK natural es el par (cuenta, empresa), que además
-- impone "un solo rol por persona por empresa" sin un UNIQUE aparte (mismo
-- patrón que UsuarioSede en 20260720170000_sedes_y_roles_granulares).
-- CASCADE en ambos lados: la membresía no sobrevive ni a la cuenta ni a la
-- empresa — es el vínculo entre las dos, no un registro histórico propio.
CREATE TABLE "MembresiaEmpresa" (
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "empresaId" INTEGER NOT NULL REFERENCES "Empresa"("id") ON DELETE CASCADE,
  "rol" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("usuarioId", "empresaId")
);

-- "Quiénes son los miembros de esta empresa" (pantalla de Roles). El sentido
-- contrario — "a qué empresas pertenezco" — lo sirve el prefijo de la PK.
CREATE INDEX "MembresiaEmpresa_empresaId_idx" ON "MembresiaEmpresa"("empresaId");

-- BACKFILL. Cada cuenta que hoy apunta a una empresa ya ES miembro de ella con
-- el rol que tiene: se copia tal cual, para que nadie pierda acceso cuando
-- requiereAuth empiece a exigir membresía.
--
-- `empresaId IS NOT NULL` deja fuera a los admin_plataforma (invariante que el
-- middleware ya afirma: "admin_plataforma nunca tiene empresaId", ver
-- src/middleware/auth.ts) y a los colaboradores libres entre empresas.
-- El `rol <> 'admin_plataforma'` es el cinturón por si alguna fila viola esa
-- invariante: admin_plataforma NO es un rol de membresía — su acceso no depende
-- de pertenecer a nada, y su "ver como" entra por una membresía temporal
-- explícita de rol auditor (paso 6). OJO para el paso 4: la validación del
-- puntero en requiereAuth tiene que saltarse a admin_plataforma, o una fila así
-- (puntero sin membresía) se quedaría en 403.
--
-- ON CONFLICT DO NOTHING para que re-aplicar sea inocuo: la tabla nace vacía,
-- pero esta migración no debe romperse si algo ya insertó membresías.
INSERT INTO "MembresiaEmpresa" ("usuarioId", "empresaId", "rol", "creadoEn")
SELECT "id", "empresaId", "rol", "creadoEn"
FROM "Usuario"
WHERE "empresaId" IS NOT NULL
  AND "rol" <> 'admin_plataforma'
ON CONFLICT ("usuarioId", "empresaId") DO NOTHING;

-- RLS, mismo criterio que 20260716214300_rls_policies: defensa adicional a la
-- del service, nunca la única fuente de autorización. Prisma conecta como
-- superuser (BYPASSRLS), así que esto protege a los roles authenticated/anon
-- de Supabase si algún día leen datos desde el frontend.
ALTER TABLE "MembresiaEmpresa" ENABLE ROW LEVEL SECURITY;

-- Cada quien ve sus propias membresías (es lo que necesita el selector de
-- empresa del header).
CREATE POLICY membresia_propia ON "MembresiaEmpresa"
  FOR SELECT USING ("usuarioId" = auth.uid());

-- Y ve las membresías de la empresa en la que está parado (pantalla de Roles).
-- Se consulta "Usuario" y no esta misma tabla a propósito: una policy sobre
-- "MembresiaEmpresa" que hiciera un subquery a "MembresiaEmpresa" recursa
-- infinitamente en Postgres. Por eso el alcance es la empresa ACTIVA — el
-- filtrado fino por empresa sigue viviendo en el service, igual que en las
-- demás tablas.
CREATE POLICY membresia_empresa ON "MembresiaEmpresa"
  FOR SELECT USING (
    "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
  );

-- Sin policy de INSERT/UPDATE/DELETE a propósito: bajo RLS eso es denegar por
-- defecto. Quién entra o sale de una empresa se decide SOLO en apps/api
-- (invitación aceptada), nunca desde un cliente con JWT de Supabase.
