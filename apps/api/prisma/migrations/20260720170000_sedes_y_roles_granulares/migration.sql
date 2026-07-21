-- Sede (sucursal/departamento) — SDD §15, pilar 1.
CREATE TABLE "Sede" (
  "id" SERIAL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL REFERENCES "Empresa"("id"),
  "nombre" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Sede_empresaId_nombre_key" ON "Sede"("empresaId", "nombre");
CREATE INDEX "Sede_empresaId_idx" ON "Sede"("empresaId");

-- Tabla puente para el scoping del analista_rrhh (vacío = ve todas las sedes
-- de su empresa; útil para empresas chicas sin sucursales).
CREATE TABLE "UsuarioSede" (
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "sedeId" INTEGER NOT NULL REFERENCES "Sede"("id") ON DELETE CASCADE,
  PRIMARY KEY ("usuarioId", "sedeId")
);
CREATE INDEX "UsuarioSede_sedeId_idx" ON "UsuarioSede"("sedeId");

-- FK opcional en Empleado (null = sin sede asignada, válido).
ALTER TABLE "Empleado" ADD COLUMN "sedeId" INTEGER REFERENCES "Sede"("id");
