-- Una cuenta (Usuario) puede pertenecer a varias empresas a lo largo del tiempo
-- (historial), ligándose a varios Empleado — pero solo una membresía activa
-- aceptada a la vez. Se cambia el @unique de Empleado.usuarioId por un índice
-- único PARCIAL, y se agrega el estado de aceptación de la invitación.

-- 1. Empleado.usuarioId deja de ser único (relación 1:N con Usuario).
DROP INDEX "Empleado_usuarioId_key";

-- 2. Estado de invitación: null con usuarioId seteado = pendiente; con fecha = aceptada.
ALTER TABLE "Empleado" ADD COLUMN "invitacionAceptadaEn" TIMESTAMP(3);

-- 3. Los vínculos históricos (usuarioId ya seteado bajo el flujo viejo) se
--    consideran aceptados desde su creación.
UPDATE "Empleado" SET "invitacionAceptadaEn" = "creadoEn" WHERE "usuarioId" IS NOT NULL;

-- 4. A lo sumo UNA membresía activa aceptada por cuenta (el resto = historial).
--    Prisma no modela índices parciales, va a mano (mismo patrón que los CHECK
--    y RLS de migraciones anteriores).
CREATE UNIQUE INDEX "Empleado_usuario_activo_unico" ON "Empleado" ("usuarioId")
  WHERE "usuarioId" IS NOT NULL AND "invitacionAceptadaEn" IS NOT NULL AND "activo" = true;

-- 5. Correo denormalizado en Usuario (para buscar cuenta por correo al invitar).
--    Se rellena con un backfill puntual desde Supabase Auth tras aplicar.
ALTER TABLE "Usuario" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario" ("email");
