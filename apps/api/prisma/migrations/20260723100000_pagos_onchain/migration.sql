-- Pago on-chain NO-CUSTODIAL (SDD §17): lotes de USDC nativo en Base para
-- contratistas de servicios. NomiCheck genera el lote y los artefactos de
-- firma (EIP-681 / Safe batch); el EMPLEADOR firma desde su wallet — el
-- servidor jamás tiene llaves privadas. Verificación del txHash contra el
-- RPC de Base cierra el ciclo: batch verificado → periodo 'pagado'.
--
-- Fase 1 SOLO contratistas (Ley 1819/2016, pago comercial). El salario de
-- Empleado se paga SIEMPRE en COP (CST art. 134-136, moneda legal) —
-- Empleado.walletAddress queda como constancia voluntaria, nunca genera pago.

-- Wallets (opt-in, todas nullables)
ALTER TABLE "Contratista" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "Empleado" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "walletPagadora" TEXT;

-- Lote de pago
CREATE TABLE "BatchPago" (
  "id" SERIAL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL,
  "periodoId" INTEGER NOT NULL REFERENCES "PeriodoNomina"("id"),
  -- generado | expirado | verificado | fallido_verificacion
  "estado" TEXT NOT NULL DEFAULT 'generado',
  "red" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "tokenAddress" TEXT NOT NULL,
  "tasaSnapshot" JSONB NOT NULL,
  "totalCop" DOUBLE PRECISION NOT NULL,
  "totalUsdc" DOUBLE PRECISION NOT NULL,
  "txHash" TEXT,
  "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiraEn" TIMESTAMP(3) NOT NULL,
  "verificadoEn" TIMESTAMP(3)
);
CREATE INDEX "BatchPago_empresaId_idx" ON "BatchPago"("empresaId");
CREATE INDEX "BatchPago_periodoId_idx" ON "BatchPago"("periodoId");

CREATE TABLE "PagoItem" (
  "id" SERIAL PRIMARY KEY,
  "batchId" INTEGER NOT NULL REFERENCES "BatchPago"("id") ON DELETE CASCADE,
  "reciboId" INTEGER NOT NULL,
  "destinoWallet" TEXT NOT NULL,
  "montoCop" DOUBLE PRECISION NOT NULL,
  "montoUsdc" DOUBLE PRECISION NOT NULL
);
CREATE INDEX "PagoItem_batchId_idx" ON "PagoItem"("batchId");

-- Auditoría inmutable: BatchPago entra a la bitácora con el mismo trigger
-- genérico de 20260720190000_auditoria_inmutable (tiene empresaId directo).
CREATE TRIGGER "auditoria_BatchPago"
  AFTER INSERT OR UPDATE OR DELETE ON "BatchPago"
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_cambio('empresaId');
