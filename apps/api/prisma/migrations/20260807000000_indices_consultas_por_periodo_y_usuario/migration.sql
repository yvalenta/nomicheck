-- Índices para los patrones de consulta reales que quedaron sin cubrir
-- (auditoría 2026-08-07 contra pg_indexes de producción):
--
--   · Turno / ReciboPago se consultan por periodoId SOLO (turnos del periodo,
--     recibos del periodo, PILA, batch de pago, worker de liquidación) y los
--     índices existentes los tienen como segunda columna — inservibles ahí.
--   · Empleado se busca por usuarioId en los flujos del colaborador
--     (invitaciones pendientes, historial); el parcial
--     "Empleado_usuario_activo_unico" solo cubre activo+aceptado.
--   · Empleado.sedeId filtra el scoping del analista_rrhh.
--   · Liquidacion y PeriodoNomina listan con ORDER BY … DESC — el compuesto
--     sirve filtro + orden de una vez; el índice de una sola columna sobra.

-- CreateIndex
CREATE INDEX "Turno_periodoId_idx" ON "Turno"("periodoId");

-- CreateIndex
CREATE INDEX "ReciboPago_periodoId_idx" ON "ReciboPago"("periodoId");

-- CreateIndex
CREATE INDEX "Empleado_usuarioId_idx" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE INDEX "Empleado_sedeId_idx" ON "Empleado"("sedeId");

-- CreateIndex
CREATE INDEX "Liquidacion_usuarioId_creadoEn_idx" ON "Liquidacion"("usuarioId", "creadoEn" DESC);

-- DropIndex (reemplazado por el compuesto de arriba)
DROP INDEX "Liquidacion_usuarioId_idx";

-- CreateIndex
CREATE INDEX "PeriodoNomina_empresaId_fechaInicio_idx" ON "PeriodoNomina"("empresaId", "fechaInicio" DESC);

-- DropIndex (reemplazado por el compuesto de arriba)
DROP INDEX "PeriodoNomina_empresaId_idx";
