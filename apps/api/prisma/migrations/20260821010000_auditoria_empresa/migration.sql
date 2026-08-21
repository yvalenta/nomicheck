-- Empresa era la única tabla editable sin rastro en la auditoría inmutable:
-- empleados, periodos, recibos y pagos ya escriben en ella. Nace junto con
-- PUT /empresa/datos — el NIT provisional de un seed se corrige desde el
-- panel, y el cambio queda con autor. Para esta tabla el "empresaId" del
-- registro es su propio id.
CREATE TRIGGER "auditoria_Empresa"
  AFTER INSERT OR UPDATE OR DELETE ON "Empresa"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('id');
