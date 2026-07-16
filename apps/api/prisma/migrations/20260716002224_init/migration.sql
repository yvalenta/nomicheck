-- CreateTable
CREATE TABLE "ReglaLegal" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "vigenteDesde" TEXT NOT NULL,
    "vigenteHasta" TEXT,
    "fuente" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReglaLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Festivo" (
    "id" SERIAL NOT NULL,
    "fecha" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Festivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "empresaId" INTEGER,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReglaLegal_clave_vigenteDesde_idx" ON "ReglaLegal"("clave", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Festivo_fecha_key" ON "Festivo"("fecha");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");
