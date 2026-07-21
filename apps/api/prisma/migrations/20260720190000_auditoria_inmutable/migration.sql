-- Auditoría inmutable (SDD §15, pilar 1 — parte B).
--
-- Diseño:
--   * Poblada por trigger PL/pgSQL — no depende de que el service llame a
--     un helper (defensa en profundidad: cualquier UPDATE/DELETE directo
--     al schema queda registrado).
--   * usuarioId viene de current_setting('app.usuario_actual', true), que
--     conAuditoria() setea con SET LOCAL dentro de la transacción de cada
--     mutación. auth.uid() es NULL porque Prisma conecta como superuser sin
--     sesión Supabase (misma limitación documentada en 20260716214300_rls_policies).
--   * Inmutabilidad: RLS solo-SELECT para autenticados + REVOKE UPDATE, DELETE.
--     Prisma es superuser (BYPASSRLS + bypass GRANT), así que el service en
--     apps/api SÍ podría manipularla — la doble capa protege a los clientes
--     futuros que usen roles authenticated/anon de Supabase, mismo criterio
--     que la migración de RLS del proyecto.
--   * `registroId` es TEXT (no INTEGER): AuditoriaCambio cubre tablas con
--     PK bigint (Empleado) y en el futuro puede cubrir otras con PK UUID o
--     compuesta — el string universal evita reformarla al agregar tablas.

CREATE TABLE "AuditoriaCambio" (
  "id" BIGSERIAL PRIMARY KEY,
  "empresaId" INTEGER,
  "usuarioId" UUID,
  "tabla" TEXT NOT NULL,
  "registroId" TEXT NOT NULL,
  "accion" TEXT NOT NULL CHECK ("accion" IN ('INSERT','UPDATE','DELETE')),
  "valoresAnteriores" JSONB,
  "valoresNuevos" JSONB,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditoriaCambio_empresaId_creadoEn_idx" ON "AuditoriaCambio"("empresaId", "creadoEn" DESC);
CREATE INDEX "AuditoriaCambio_tabla_registroId_idx" ON "AuditoriaCambio"("tabla", "registroId");

-- Trigger genérico. TG_ARGV[0] = nombre de la columna que apunta a empresa
-- en la tabla auditada ("empresaId"). Si la tabla no tiene esa columna
-- directa (p. ej. ReciboPago cuando se agregue con join), el trigger deja
-- empresaId en NULL — el query de listado hace el join con PeriodoNomina.
CREATE OR REPLACE FUNCTION fn_auditar_cambio() RETURNS TRIGGER AS $$
DECLARE
  usuario_txt TEXT;
  usuario_uuid UUID;
  empresa_col TEXT := TG_ARGV[0];
  empresa_id INT;
  registro_txt TEXT;
  antes_json JSONB;
  despues_json JSONB;
BEGIN
  usuario_txt := current_setting('app.usuario_actual', true);
  IF usuario_txt IS NOT NULL AND usuario_txt <> '' THEN
    BEGIN
      usuario_uuid := usuario_txt::UUID;
    EXCEPTION WHEN others THEN
      usuario_uuid := NULL; -- setting inválido, se registra el cambio sin autor
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    antes_json := to_jsonb(OLD);
    despues_json := NULL;
    registro_txt := (antes_json ->> 'id');
    IF empresa_col IS NOT NULL AND empresa_col <> '' THEN
      empresa_id := (antes_json ->> empresa_col)::INT;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    antes_json := to_jsonb(OLD);
    despues_json := to_jsonb(NEW);
    registro_txt := (despues_json ->> 'id');
    IF empresa_col IS NOT NULL AND empresa_col <> '' THEN
      empresa_id := (despues_json ->> empresa_col)::INT;
    END IF;
  ELSE -- INSERT
    antes_json := NULL;
    despues_json := to_jsonb(NEW);
    registro_txt := (despues_json ->> 'id');
    IF empresa_col IS NOT NULL AND empresa_col <> '' THEN
      empresa_id := (despues_json ->> empresa_col)::INT;
    END IF;
  END IF;

  INSERT INTO "AuditoriaCambio"
    ("empresaId","usuarioId","tabla","registroId","accion","valoresAnteriores","valoresNuevos")
  VALUES
    (empresa_id, usuario_uuid, TG_TABLE_NAME, registro_txt, TG_OP, antes_json, despues_json);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Triggers sobre las tres tablas críticas (nómina + contratos + empleado).
-- ReciboPago no tiene empresaId directo — el registrador queda con NULL y
-- el query de listado hace JOIN con PeriodoNomina para filtrar por empresa.
CREATE TRIGGER "auditoria_ReciboPago"
  AFTER INSERT OR UPDATE OR DELETE ON "ReciboPago"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('');

CREATE TRIGGER "auditoria_PeriodoNomina"
  AFTER INSERT OR UPDATE OR DELETE ON "PeriodoNomina"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('empresaId');

CREATE TRIGGER "auditoria_Empleado"
  AFTER INSERT OR UPDATE OR DELETE ON "Empleado"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('empresaId');

-- RLS + GRANT (protege los roles authenticated/anon que Supabase asigna a
-- los JWT; Prisma corre como superuser y sigue pudiendo escribir — la
-- app usa esa capacidad SOLO desde el trigger, no debería escribir directo).
ALTER TABLE "AuditoriaCambio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AuditoriaCambio_select_own_empresa" ON "AuditoriaCambio"
  FOR SELECT
  USING (true); -- el filtrado por empresa vive en el service (mismo criterio que RLS de otras tablas)
REVOKE UPDATE, DELETE ON "AuditoriaCambio" FROM PUBLIC;
