-- Qué empleados quedan incluidos en un periodo de nómina — antes era
-- implícito ("todos los activos de la empresa" en liquidarPeriodo). Se
-- explicita en una tabla puente para que la empresa pueda des/marcar
-- colaboradores en un periodo en borrador.
CREATE TABLE "PeriodoNominaEmpleado" (
    "periodoId" INTEGER NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    CONSTRAINT "PeriodoNominaEmpleado_pkey" PRIMARY KEY ("periodoId", "empleadoId")
);

CREATE INDEX "PeriodoNominaEmpleado_empleadoId_idx" ON "PeriodoNominaEmpleado" ("empleadoId");

ALTER TABLE "PeriodoNominaEmpleado" ADD CONSTRAINT "PeriodoNominaEmpleado_periodoId_fkey"
    FOREIGN KEY ("periodoId") REFERENCES "PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeriodoNominaEmpleado" ADD CONSTRAINT "PeriodoNominaEmpleado_empleadoId_fkey"
    FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: reconstruye qué empleados estaban "incluidos" en cada periodo
-- EXISTENTE, para que el comportamiento no cambie retroactivamente.
--   - liquidado/pagado: los que de hecho tienen un ReciboPago (dato exacto,
--     más preciso que "todos los activos" porque refleja quién se liquidó).
--   - borrador: todos los activos de la empresa (mismo criterio implícito
--     que liquidarPeriodo usaba antes de esta tabla).
INSERT INTO "PeriodoNominaEmpleado" ("periodoId", "empleadoId")
SELECT DISTINCT rp."periodoId", rp."empleadoId"
FROM "ReciboPago" rp
JOIN "PeriodoNomina" pn ON pn.id = rp."periodoId"
WHERE rp."empleadoId" IS NOT NULL AND pn.estado IN ('liquidado', 'pagado')
ON CONFLICT DO NOTHING;

INSERT INTO "PeriodoNominaEmpleado" ("periodoId", "empleadoId")
SELECT pn.id, e.id
FROM "PeriodoNomina" pn
JOIN "Empleado" e ON e."empresaId" = pn."empresaId" AND e.activo = true
WHERE pn.estado = 'borrador'
ON CONFLICT DO NOTHING;
