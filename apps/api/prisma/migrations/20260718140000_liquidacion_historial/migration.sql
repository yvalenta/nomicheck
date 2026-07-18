-- Historial personal de liquidaciones guardadas (flujo delayed auth del
-- verificador anónimo). Snapshot del ResultadoNomina, propiedad de un Usuario.
CREATE TABLE "Liquidacion" (
    "id" SERIAL NOT NULL,
    "usuarioId" UUID NOT NULL,
    "resultado" JSONB NOT NULL,
    "netoEsperado" DOUBLE PRECISION NOT NULL,
    "netoRecibido" DOUBLE PRECISION,
    "periodoDesde" TEXT,
    "periodoHasta" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Liquidacion_usuarioId_idx" ON "Liquidacion" ("usuarioId");

ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
