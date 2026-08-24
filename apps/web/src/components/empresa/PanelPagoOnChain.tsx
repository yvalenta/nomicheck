import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, Link2, Loader2, Wallet, XCircle } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  generarBatchPago,
  obtenerBatchPago,
  verificarBatchPago,
  type BatchPagoGenerado,
  type BatchPagoVigente,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

// Pago on-chain NO-CUSTODIAL (SDD §17): NomiCheck genera el lote de USDC y
// los artefactos de firma; el EMPLEADOR firma desde su propia wallet (links
// EIP-681 uno a uno, o Safe batch para pagar todo en una transacción). El
// input de txHash cierra el ciclo: verificación contra el RPC de Base →
// batch verificado → periodo `pagado`.
//
// Fase 1 SOLO contratistas — el disclaimer del lote lo repite siempre.

function fmtUsdc(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " USDC";
}

function acortarWallet(w: string): string {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export default function PanelPagoOnChain({
  periodoId,
  onPagado,
}: {
  periodoId: number;
  onPagado: () => void;
}) {
  const [batch, setBatch] = useState<BatchPagoVigente | null>(null);
  const [generado, setGenerado] = useState<BatchPagoGenerado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detalleFallo, setDetalleFallo] = useState<
    { destinoWallet: string; montoUsdc: number; confirmado: boolean }[] | null
  >(null);

  useEffect(() => {
    obtenerBatchPago(periodoId)
      .then(setBatch)
      .catch(() => setBatch(null))
      .finally(() => setCargando(false));
  }, [periodoId]);

  async function generar() {
    setGenerando(true);
    setError(null);
    try {
      const lote = await generarBatchPago(periodoId);
      setGenerado(lote);
      const vigente = await obtenerBatchPago(periodoId);
      setBatch(vigente);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el lote");
    } finally {
      setGenerando(false);
    }
  }

  async function verificar() {
    if (!batch) return;
    setVerificando(true);
    setError(null);
    setDetalleFallo(null);
    try {
      const r = await verificarBatchPago(batch.id, txHash.trim());
      if (r.estado === "verificado") {
        onPagado();
        const vigente = await obtenerBatchPago(periodoId);
        setBatch(vigente);
      }
    } catch (e) {
      const body = (e as { body?: { detalle?: { destinoWallet: string; montoUsdc: number; confirmado: boolean }[] } })
        ?.body;
      if (body?.detalle) setDetalleFallo(body.detalle);
      setError(e instanceof Error ? e.message : "No se pudo verificar el pago");
    } finally {
      setVerificando(false);
    }
  }

  function descargarSafeBatch() {
    if (!generado) return;
    const blob = new Blob([JSON.stringify(generado.safeBatch, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nomicheck-batch-${generado.batchId}-safe.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (cargando) return null;

  const expiraEnMs = batch ? new Date(batch.expiraEn).getTime() - Date.now() : 0;
  const minutosRestantes = Math.max(0, Math.floor(expiraEnMs / 60000));

  return (
    <PaycheckCard titulo="Pago on-chain (USDC en Base)">
      <div className="px-3 pb-3 flex flex-col gap-3">
        {!batch && (
          <>
            <p className="text-xs text-muted leading-relaxed">
              Genera el lote de pago en USDC para los contratistas con wallet registrada. La tasa
              COP→USDC se congela con la TRM oficial del día y el lote queda listo para firmar desde
              tu wallet — NomiCheck nunca toca los fondos.
            </p>
            <button
              onClick={generar}
              disabled={generando}
              className="self-start flex items-center gap-2 rounded-full bg-mint text-white text-sm font-medium px-4 py-2.5 hover:bg-mint-dark transition-colors disabled:opacity-50"
            >
              {generando ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />}
              {generando ? "Generando lote…" : "Generar lote de pago USDC"}
            </button>
          </>
        )}

        {error && <p className="rounded-xl bg-red-50 text-coral text-xs p-3">{error}</p>}

        {batch && (
          <>
            <div className="flex items-center gap-2 text-xs">
              {batch.estado === "verificado" && (
                <span className="flex items-center gap-1.5 text-mint-dark font-semibold">
                  <CheckCircle2 size={14} /> Pagado y verificado on-chain
                </span>
              )}
              {batch.estado === "generado" && (
                <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                  <Clock size={14} /> Lote vigente — expira en {minutosRestantes} min
                </span>
              )}
              {batch.estado === "expirado" && (
                <span className="flex items-center gap-1.5 text-coral font-semibold">
                  <XCircle size={14} /> Lote expirado — genera uno nuevo con tasa fresca
                </span>
              )}
              {batch.estado === "fallido_verificacion" && (
                <span className="flex items-center gap-1.5 text-coral font-semibold">
                  <XCircle size={14} /> La transacción no cubrió todos los pagos
                </span>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted">Total COP</p>
                <p className="font-semibold tabular-nums">{formatCOP(batch.totalCop)}</p>
              </div>
              <div>
                <p className="text-muted">Total USDC</p>
                <p className="font-semibold tabular-nums">{fmtUsdc(batch.totalUsdc)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted">
                  Tasa: TRM {formatCOP(batch.tasaSnapshot.trm)} ({batch.tasaSnapshot.fechaTrm})
                  {batch.tasaSnapshot.primaPct > 0 && ` + prima ${(batch.tasaSnapshot.primaPct * 100).toFixed(1)}%`}
                </p>
                <p className="text-muted font-mono text-[10px] break-all mt-0.5">
                  snapshot {batch.tasaSnapshot.hash.slice(0, 16)}…
                </p>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-slate-100 text-xs">
              {batch.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-muted">{acortarWallet(i.destinoWallet)}</span>
                  <span className="tabular-nums">
                    {formatCOP(i.montoCop)} → <span className="font-semibold">{fmtUsdc(i.montoUsdc)}</span>
                  </span>
                </div>
              ))}
            </div>

            {generado && batch.estado === "generado" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-ink">Firma desde tu wallet:</p>
                <div className="flex flex-wrap gap-2">
                  {generado.items.map((i, idx) => (
                    <a
                      key={idx}
                      href={i.linkEip681}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:border-mint transition-colors"
                    >
                      <Link2 size={12} className="text-mint-dark" />
                      {i.contratista}
                    </a>
                  ))}
                  <button
                    onClick={descargarSafeBatch}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:border-mint transition-colors"
                  >
                    <Download size={12} className="text-mint-dark" /> Safe batch (todo en 1 tx)
                  </button>
                </div>
                {generado.excluidosSinWallet.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    Sin wallet (excluidos del lote): {generado.excluidosSinWallet.join(", ")} — captúralas en
                    la pestaña Contratistas.
                  </p>
                )}
              </div>
            )}

            {(batch.estado === "generado" || batch.estado === "fallido_verificacion") && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  placeholder="txHash de la transacción firmada (0x…)"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-mint/40"
                />
                <button
                  onClick={verificar}
                  disabled={verificando || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())}
                  className="rounded-xl bg-ink text-white text-xs font-semibold px-4 py-2 disabled:opacity-40"
                >
                  {verificando ? "Verificando on-chain…" : "Verificar pago"}
                </button>
              </div>
            )}

            {batch.estado === "expirado" && (
              <button
                onClick={generar}
                disabled={generando}
                className="self-start flex items-center gap-2 rounded-full bg-mint text-white text-xs font-medium px-4 py-2 hover:bg-mint-dark disabled:opacity-50"
              >
                {generando ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
                Regenerar lote con tasa fresca
              </button>
            )}

            {detalleFallo && (
              <div className="rounded-xl bg-red-50 p-3 text-xs flex flex-col gap-1">
                {detalleFallo.map((d, i) => (
                  <p key={i} className={d.confirmado ? "text-mint-dark" : "text-coral"}>
                    {d.confirmado ? "✓" : "✗"} {acortarWallet(d.destinoWallet)} — {fmtUsdc(d.montoUsdc)}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted leading-relaxed border-t border-borde pt-2">
              {batch.disclaimer}
            </p>
          </>
        )}
      </div>
    </PaycheckCard>
  );
}
