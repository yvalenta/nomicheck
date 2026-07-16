-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" UUID,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "salarioBase" DOUBLE PRECISION NOT NULL,
    "tipoNomina" TEXT NOT NULL,
    "auxilioTransporte" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoNomina" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fechaInicio" TEXT NOT NULL,
    "fechaFin" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReciboPago" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "lineas" JSONB NOT NULL,
    "totalDevengado" DOUBLE PRECISION NOT NULL,
    "totalDeducido" DOUBLE PRECISION NOT NULL,
    "neto" DOUBLE PRECISION NOT NULL,
    "liquidadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReciboPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporteDiscrepancia" (
    "id" SERIAL NOT NULL,
    "reciboId" INTEGER NOT NULL,
    "colaboradorId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "respuestaEmpresa" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReporteDiscrepancia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nit_key" ON "Empresa"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE INDEX "Empleado_empresaId_idx" ON "Empleado"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_empresaId_documento_key" ON "Empleado"("empresaId", "documento");

-- CreateIndex
CREATE INDEX "PeriodoNomina_empresaId_idx" ON "PeriodoNomina"("empresaId");

-- CreateIndex
CREATE INDEX "Turno_empleadoId_periodoId_idx" ON "Turno"("empleadoId", "periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReciboPago_empleadoId_periodoId_key" ON "ReciboPago"("empleadoId", "periodoId");

-- CreateIndex
CREATE INDEX "ReporteDiscrepancia_reciboId_idx" ON "ReporteDiscrepancia"("reciboId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodoNomina" ADD CONSTRAINT "PeriodoNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboPago" ADD CONSTRAINT "ReciboPago_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboPago" ADD CONSTRAINT "ReciboPago_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReporteDiscrepancia" ADD CONSTRAINT "ReporteDiscrepancia_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "ReciboPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReporteDiscrepancia" ADD CONSTRAINT "ReporteDiscrepancia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
