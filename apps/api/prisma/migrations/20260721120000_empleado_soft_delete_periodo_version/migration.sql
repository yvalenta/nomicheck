-- Enterprise-grade: soft delete de Empleado + concurrencia optimista en PeriodoNomina.
--
-- 1) Empleado.eliminadoEn: complementa (no reemplaza) el "activo=false" de
--    retiro. Las lecturas filtran eliminadoEn IS NULL por default; el retiro
--    sigue conservando el empleado visible con activo=false + fechaRetiro.
ALTER TABLE "Empleado" ADD COLUMN "eliminadoEn" TIMESTAMP(3);

-- Índice parcial: acelera el "solo vivos" que todas las listas usan.
CREATE INDEX "Empleado_empresaId_eliminadoEn_idx" ON "Empleado" ("empresaId") WHERE "eliminadoEn" IS NULL;

-- 2) PeriodoNomina.version: concurrencia optimista. Cada write bumpea el
--    contador con { increment: 1 } y las actualizaciones exigen la versión
--    actual en el WHERE. Prisma P2025 se traduce a HTTP 409.
ALTER TABLE "PeriodoNomina" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
