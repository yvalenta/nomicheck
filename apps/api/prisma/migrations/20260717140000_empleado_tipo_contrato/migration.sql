-- indefinido (default) | aprendizaje_sena_lectiva | aprendizaje_sena_practica.
ALTER TABLE "Empleado" ADD COLUMN "tipoContrato" TEXT NOT NULL DEFAULT 'indefinido';
