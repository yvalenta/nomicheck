-- Auditoría de `MembresiaEmpresa` (SDD §15 pilar 1B — cierre del hallazgo H7
-- de la revisión de seguridad).
--
-- POR QUÉ EXISTE: la autorización se mudó de tabla y la auditoría se quedó
-- donde estaba. `20260830120000_membresia_empresa` partió en dos lo que antes
-- eran `Usuario.empresaId` + `Usuario.rol`:
--   MembresiaEmpresa  → a qué empresas pertenece y CON QUÉ ROL (autorización;
--                       es de acá que `requiereAuth` saca el rol efectivo de
--                       cada request).
--   Usuario.empresaId → en cuál está parada la sesión (puntero, estado volátil).
-- Pero el trigger de autorización que se agregó ese mismo día
-- (`20260830140000_auditoria_usuario`) cuelga de `Usuario`. Resultado: la tabla
-- que decide quién puede qué volvió a ser la única que se podía escribir sin
-- dejar rastro — exactamente el agujero que aquella migración vino a tapar,
-- reabierto una tabla más allá.
--
-- LOS CUATRO CASOS QUE SE PERDÍAN. Los cuatro salen de `src/lib/membresias.ts`,
-- que es el único lugar que otorga y revoca, y de que allí la escritura a
-- `Usuario` sea CONDICIONAL mientras que la escritura a `MembresiaEmpresa` es
-- incondicional:
--
--  1. Alta o cambio de rol sin una sola línea de auditoría. `otorgarMembresia`
--     hace el upsert de la membresía y recién después toca `Usuario`, pero sale
--     temprano si el puntero está parado en OTRA empresa
--     (`perfil.empresaId !== empresaId`) o si ya es coherente. Un
--     POST /empresa/staff que pasa a alguien de `auditor` a `analista_rrhh`
--     mientras esa persona está parada en otra de sus empresas no escribía
--     `Usuario`: el permiso cambiaba y la bitácora quedaba en blanco.
--  2. Baja sin rastro, por el mismo motivo: `revocarMembresia` borra la
--     membresía siempre, y solo mueve el puntero si apuntaba a ESA empresa.
--  3. Baja que sí escribía `Usuario` pero quedaba invisible. Revocar la única
--     membresía deja el puntero en NULL; el trigger de `Usuario` toma el
--     `empresaId` de la fila NUEVA, así que la entrada nacía con
--     `empresaId = NULL` y `listarAuditoria` —que une por empresaId— no la
--     muestra en ninguna bitácora. La baja existía en la tabla y no existía
--     para nadie.
--  4. Baja que reapunta a otra empresa. El puntero cae a la membresía viva más
--     antigua, y la fila quedaba con el empresaId DESTINO: la empresa que
--     revocó no veía la baja que ordenó, y la vecina veía un movimiento de
--     permisos que nunca ordenó.
--
-- Colgando el trigger de `MembresiaEmpresa` los cuatro se cierran por
-- construcción, no por cuidado del servicio: la fila auditada ES la
-- autorización, y su `empresaId` (NOT NULL, parte de la PK) es siempre el de la
-- empresa cuyo permiso cambió — nunca el del puntero, que es estado de sesión y
-- puede estar en cualquier lado o en ninguno.

-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA FUNCIÓN HERMANA Y NO `fn_auditar_cambio('empresaId')`
-- ───────────────────────────────────────────────────────────────────────────
--
-- La genérica de `20260720190000_auditoria_inmutable` arma el `registroId` con
-- `to_jsonb(NEW) ->> 'id'`. `MembresiaEmpresa` NO tiene columna `id`: su PK es
-- el par ("usuarioId","empresaId") — decisión deliberada de su migración, misma
-- forma que `UsuarioSede`. Con la genérica, `registroId` saldría NULL contra un
-- `NOT NULL`, y como el trigger corre AFTER dentro de la misma transacción, esa
-- violación no dejaría un rastro pobre: abortaría el alta o la baja que
-- queríamos auditar. Sobre esta tabla la genérica no es imprecisa, es un
-- rompimiento de toda escritura.
--
-- La alternativa era enseñarle a `fn_auditar_cambio` a recibir las columnas de
-- la PK. Se descartó: `CREATE OR REPLACE` de esa función reescribe el
-- comportamiento de los seis triggers que ya la usan (ReciboPago,
-- PeriodoNomina, Empleado, Empresa, BatchPago, Usuario), y un arreglo de
-- seguridad no es el lugar para poner en riesgo la auditoría que YA funciona.
-- Esta hermana solo agrega; lo existente no se toca.
--
-- Que el `registroId` sea TEXT ya venía previsto para esto: "AuditoriaCambio
-- cubre tablas con PK bigint (Empleado) y en el futuro puede cubrir otras con
-- PK UUID o compuesta — el string universal evita reformarla al agregar
-- tablas" (20260720190000). Acá esa PK compuesta se serializa como
-- "<usuarioId>:<empresaId>", en el mismo orden que la declara la tabla.
--
-- Dos precisiones sobre qué es quién en la fila resultante:
--   * `AuditoriaCambio.usuarioId` es el AUTOR (sale de `app.usuario_actual`,
--     que setea `conAuditoria`), no la persona afectada. La afectada viaja en
--     `valoresAnteriores`/`valoresNuevos` junto con su rol viejo y nuevo, que
--     es justo el par de datos que faltaba.
--   * `AuditoriaCambio` no tiene FK a `Empresa` ni a `Usuario`, así que las
--     bajas en cascada (borrar la cuenta o la empresa borra sus membresías y
--     dispara este trigger) quedan registradas y sobreviven a lo borrado —que
--     es el punto de una bitácora inmutable—; `listarAuditoria` ya sabe
--     mostrar "(cuenta eliminada)" cuando el autor ya no está.
--
-- La columna de empresa va fija y no por TG_ARGV: esta función es de esta
-- tabla, y un argumento sugeriría que se puede reusar en otra que no tiene la
-- misma PK.
CREATE OR REPLACE FUNCTION fn_auditar_cambio_membresia() RETURNS TRIGGER AS $$
DECLARE
  usuario_txt TEXT;
  usuario_uuid UUID;
  antes_json JSONB;
  despues_json JSONB;
BEGIN
  -- Idéntico a `fn_auditar_cambio`: el autor lo pone `conAuditoria` con
  -- SET LOCAL app.usuario_actual dentro de la transacción de la mutación.
  -- auth.uid() es NULL porque Prisma conecta como superuser sin sesión Supabase.
  usuario_txt := current_setting('app.usuario_actual', true);
  IF usuario_txt IS NOT NULL AND usuario_txt <> '' THEN
    BEGIN
      usuario_uuid := usuario_txt::UUID;
    EXCEPTION WHEN others THEN
      usuario_uuid := NULL; -- setting inválido, se registra el cambio sin autor
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- La empresa es la de la fila BORRADA: la que revocó. Este es el caso 4 —
    -- adónde haya ido a parar el puntero de esa cuenta no entra en la cuenta.
    antes_json := to_jsonb(OLD);
    INSERT INTO "AuditoriaCambio"
      ("empresaId","usuarioId","tabla","registroId","accion","valoresAnteriores","valoresNuevos")
    VALUES
      (OLD."empresaId", usuario_uuid, TG_TABLE_NAME,
       OLD."usuarioId"::TEXT || ':' || OLD."empresaId"::TEXT,
       TG_OP, antes_json, NULL);
    RETURN OLD;
  END IF;

  despues_json := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    antes_json := to_jsonb(OLD);
  END IF;

  INSERT INTO "AuditoriaCambio"
    ("empresaId","usuarioId","tabla","registroId","accion","valoresAnteriores","valoresNuevos")
  VALUES
    (NEW."empresaId", usuario_uuid, TG_TABLE_NAME,
     NEW."usuarioId"::TEXT || ':' || NEW."empresaId"::TEXT,
     TG_OP, antes_json, despues_json);

  -- Un UPDATE que mueve la fila de una empresa a otra deja a la empresa ORIGEN
  -- sin rastro de que perdió a un miembro: la única fila hablaría de la
  -- destino. Ninguna ruta de la app hace eso —`empresaId` es parte de la PK y
  -- el servicio solo hace upsert por par y deleteMany—, pero este trigger
  -- existe justamente para el SQL directo contra el schema ("cualquier
  -- UPDATE/DELETE directo al schema queda registrado", 20260720190000), así que
  -- se registra también del lado de la empresa que lo pierde, con la clave que
  -- la fila tenía allí. Un cambio de `usuarioId` no necesita este par: la
  -- empresa es la misma y la cuenta anterior viaja en `valoresAnteriores`.
  IF TG_OP = 'UPDATE' AND OLD."empresaId" <> NEW."empresaId" THEN
    INSERT INTO "AuditoriaCambio"
      ("empresaId","usuarioId","tabla","registroId","accion","valoresAnteriores","valoresNuevos")
    VALUES
      (OLD."empresaId", usuario_uuid, TG_TABLE_NAME,
       OLD."usuarioId"::TEXT || ':' || OLD."empresaId"::TEXT,
       TG_OP, antes_json, despues_json);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auditoria_MembresiaEmpresa"
  AFTER INSERT OR UPDATE OR DELETE ON "MembresiaEmpresa"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio_membresia();
