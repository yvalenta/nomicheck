-- La evidencia firmada de un cierre de periodo, que es la unidad de cobro
-- para empresas (ver services/medidorCierres.ts, sitio de afirmación del precio).
--
-- Sin restricción de unicidad sobre periodoId a propósito: reliquidar un periodo
-- escribe una fila nueva, y eso es correcto — la factura es por MES y no por
-- cierre, así que reliquidar suma filas y no montos.

CREATE TABLE "EvidenciaCierre" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "conEvidencia" INTEGER NOT NULL,
    "estadoCierre" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "firma" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenciaCierre_pkey" PRIMARY KEY ("id")
);

-- El estado de cuenta consulta siempre por (empresa, mes).
CREATE INDEX "EvidenciaCierre_empresaId_mes_idx" ON "EvidenciaCierre"("empresaId", "mes");
CREATE INDEX "EvidenciaCierre_periodoId_idx" ON "EvidenciaCierre"("periodoId");

ALTER TABLE "EvidenciaCierre" ADD CONSTRAINT "EvidenciaCierre_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenciaCierre" ADD CONSTRAINT "EvidenciaCierre_periodoId_fkey"
    FOREIGN KEY ("periodoId") REFERENCES "PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
