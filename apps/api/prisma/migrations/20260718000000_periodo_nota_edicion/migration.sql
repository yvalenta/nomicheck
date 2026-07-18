-- Rastro de auditoría al editar las fechas de un PeriodoNomina (solo en borrador).
ALTER TABLE "PeriodoNomina" ADD COLUMN "notaEdicion" TEXT;
ALTER TABLE "PeriodoNomina" ADD COLUMN "editadoEn" TIMESTAMP(3);
