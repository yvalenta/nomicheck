-- Máquina de estados extendida para liquidación asíncrona por lotes (SDD §15,
-- escalabilidad enterprise: 1000+ empleados). El campo `estado` sigue siendo
-- TEXT (no enum nativo) para no partir el patrón actual `borrador·liquidado·
-- pagado`; los nuevos valores son `liquidando`, `liquidado_con_rechazos` y
-- `fallido`. Sin CHECK constraint: la validación vive en la capa de servicio
-- (mismo estilo que hoy).
--
-- Nuevos campos:
--   jobId              — id del job en pg-boss. Null si nunca se encoló.
--   progreso           — 0..100, se actualiza al cerrar cada lote del worker.
--                        NO usa concurrencia optimista (`version`) porque solo
--                        el job dueño escribe mientras estado='liquidando' —
--                        ver comentario en schema.prisma.
--   erroresLiquidacion — JSONB. En `liquidado_con_rechazos`: lista de
--                        empleados que fallaron QA con sus issues. En
--                        `fallido`: detalle del error catastrófico (excepción
--                        del worker no relacionada a QA).
ALTER TABLE "PeriodoNomina" ADD COLUMN "jobId" TEXT;
ALTER TABLE "PeriodoNomina" ADD COLUMN "progreso" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PeriodoNomina" ADD COLUMN "erroresLiquidacion" JSONB;
