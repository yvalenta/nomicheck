-- Auditoría de `Usuario` (SDD §15 pilar 1B — paso 5 de
-- tareas/2026-08-31-matriz-permisos-y-multiorg.md).
--
-- Nace con `POST /auth/empresa-activa`. Ese endpoint mueve `Usuario.empresaId`,
-- que es de dónde `requiereAuth` saca el rol efectivo de cada request: cambiar
-- ese puntero es cambiar con qué permisos entra una cuenta. Hasta acá, `Usuario`
-- era la única tabla de autorización que se podía escribir SIN dejar rastro —
-- `Empleado`, `PeriodoNomina`, `ReciboPago` y `Empresa` ya escriben en
-- AuditoriaCambio. El servicio envuelve el UPDATE en `conAuditoria` para que el
-- trigger sepa quién fue; sin este trigger ese wrapper no registraba nada.
--
-- Y no cubre solo el cambio de empresa: `reasignarAdminEmpresa` y
-- `quitarAdminEmpresa` degradan cuentas a "individual" con un UPDATE directo, y
-- el rastro de quién le quitó el rol de admin a quién tampoco existía.
--
-- El argumento del trigger es "empresaId", igual que en Empleado/PeriodoNomina:
-- la fila de auditoría queda con la empresa NUEVA del usuario, que es la que
-- puede leerla en su bitácora. Consecuencias que quedan dichas a propósito:
--   * Un cambio que deja `empresaId` en NULL (quitar un admin, registrar una
--     cuenta individual) queda con empresa NULL y no aparece en ninguna
--     bitácora — sigue en la tabla, que es donde vive el histórico.
--   * `valoresAnteriores` lleva el id de la empresa ANTERIOR, así que el admin
--     de la nueva ve un entero que no puede resolver a un nombre. Es el mínimo
--     que hace útil la entrada ("esta cuenta venía de otra empresa"); si algún
--     día molesta, el lugar para recortarlo es el trigger, no el servicio.
CREATE TRIGGER "auditoria_Usuario"
  AFTER INSERT OR UPDATE OR DELETE ON "Usuario"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('empresaId');
