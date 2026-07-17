CREATE TABLE "Contratista" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "honorariosMensuales" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contratista_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contratista_empresaId_documento_key" ON "Contratista"("empresaId", "documento");
CREATE INDEX "Contratista_empresaId_idx" ON "Contratista"("empresaId");

ALTER TABLE "Contratista" ADD CONSTRAINT "Contratista_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ReciboPago: empleadoId pasa a nullable, agrega contratistaId — un recibo
-- pertenece a exactamente uno de los dos (nunca ambos, nunca ninguno).
ALTER TABLE "ReciboPago" ALTER COLUMN "empleadoId" DROP NOT NULL;
ALTER TABLE "ReciboPago" ADD COLUMN "contratistaId" INTEGER;

ALTER TABLE "ReciboPago" ADD CONSTRAINT "ReciboPago_contratistaId_fkey"
    FOREIGN KEY ("contratistaId") REFERENCES "Contratista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ReciboPago_contratistaId_periodoId_key" ON "ReciboPago"("contratistaId", "periodoId");

ALTER TABLE "ReciboPago" ADD CONSTRAINT "recibo_pertenece_a_uno"
    CHECK ((("empleadoId" IS NOT NULL)::int + ("contratistaId" IS NOT NULL)::int) = 1);
