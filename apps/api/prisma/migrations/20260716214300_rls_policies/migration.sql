-- Políticas RLS (SDD.md §07 "Políticas RLS (Postgres)") — defensa adicional
-- a la del service; nunca la única fuente de autorización.
--
-- Nota: Prisma conecta con el rol "postgres" (superusuario), que Postgres
-- exime de RLS por defecto (BYPASSRLS). Estas políticas protegen cualquier
-- acceso futuro con roles "authenticated"/"anon" de Supabase (p. ej. si algún
-- día se habilita supabase-js de datos en el frontend) — hoy apps/api sigue
-- siendo el único camino de escritura/lectura, con su propio scoping en código.

ALTER TABLE "Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Empresa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Empleado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PeriodoNomina" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Turno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReciboPago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReporteDiscrepancia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReglaLegal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Festivo" ENABLE ROW LEVEL SECURITY;

-- Usuario: cada quien lee/edita su propia fila; admin_empresa lee las de su empresa.
CREATE POLICY usuario_propio ON "Usuario"
  FOR SELECT USING (id = auth.uid());
CREATE POLICY usuario_empresa ON "Usuario"
  FOR SELECT USING (
    "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
  );

-- Empresa: visible para sus propios usuarios.
CREATE POLICY empresa_propia ON "Empresa"
  FOR SELECT USING (
    id = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
  );

-- Empleado, PeriodoNomina, Turno: visibles/editables por la empresa dueña.
CREATE POLICY empleado_empresa ON "Empleado"
  FOR ALL USING (
    "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
  );
CREATE POLICY periodo_empresa ON "PeriodoNomina"
  FOR ALL USING (
    "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
  );
CREATE POLICY turno_empresa ON "Turno"
  FOR ALL USING (
    "empleadoId" IN (
      SELECT id FROM "Empleado"
      WHERE "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
    )
  );

-- ReciboPago: visible por la empresa dueña o por el colaborador propietario.
CREATE POLICY recibo_empresa_o_colaborador ON "ReciboPago"
  FOR SELECT USING (
    "empleadoId" IN (
      SELECT id FROM "Empleado"
      WHERE "empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
         OR "usuarioId" = auth.uid()
    )
  );

-- ReporteDiscrepancia: el colaborador inserta los suyos; la empresa dueña del
-- recibo también los ve.
CREATE POLICY reporte_insertar_propio ON "ReporteDiscrepancia"
  FOR INSERT WITH CHECK ("colaboradorId" = auth.uid());
CREATE POLICY reporte_visible ON "ReporteDiscrepancia"
  FOR SELECT USING (
    "colaboradorId" = auth.uid()
    OR "reciboId" IN (
      SELECT rp.id FROM "ReciboPago" rp
      JOIN "Empleado" e ON e.id = rp."empleadoId"
      WHERE e."empresaId" = (SELECT "empresaId" FROM "Usuario" WHERE id = auth.uid())
    )
  );

-- ReglaLegal, Festivo: lectura pública (los usa también el verificador anónimo).
CREATE POLICY reglalegal_lectura_publica ON "ReglaLegal"
  FOR SELECT USING (true);
CREATE POLICY festivo_lectura_publica ON "Festivo"
  FOR SELECT USING (true);
