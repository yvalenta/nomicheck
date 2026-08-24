import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { EstadoLiquidacion, RechazoQA, ErrorCatastrofico } from "../../apiEmpresa";

// UI del pipeline de liquidación asíncrona (SDD §15, escalabilidad
// enterprise). Se muestra cuando el periodo está en un estado != borrador:
//   liquidando               → spinner + barra de progreso (0..100)
//   liquidado                → check verde, listo
//   liquidado_con_rechazos   → banner ámbar con lista de rechazos por empleado
//   fallido                  → banner rojo con el mensaje del error catastrófico
// PeriodosEmpresa lo consume vía usePeriodoEstado (polling 3s automático).

function esRechazoQA(x: unknown): x is RechazoQA {
  return typeof x === "object" && x !== null && "empleadoId" in x && "issues" in x;
}
function esErrorCatastrofico(x: unknown): x is ErrorCatastrofico {
  return typeof x === "object" && x !== null && "mensaje" in x && !("empleadoId" in x);
}

export default function PanelLiquidacion({ estado }: { estado: EstadoLiquidacion }) {
  if (estado.estado === "liquidando") {
    return (
      <div className="rounded-full bg-mint-light/40 border border-mint/40 p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-ink">
          <Loader2 size={16} className="text-mint-dark animate-spin shrink-0" />
          <span className="font-medium">Liquidando…</span>
          <span className="text-muted tabular-nums ml-auto">{estado.progreso}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/60 overflow-hidden">
          <div
            className="h-full bg-mint transition-[width] duration-500 ease-out"
            style={{ width: `${estado.progreso}%` }}
          />
        </div>
        <p className="text-xs text-muted">
          El motor está procesando los recibos por lotes. Puedes cerrar esta pestaña —
          se seguirá liquidando en segundo plano.
        </p>
      </div>
    );
  }

  if (estado.estado === "liquidado_con_rechazos" && Array.isArray(estado.erroresLiquidacion)) {
    const rechazos = estado.erroresLiquidacion.filter(esRechazoQA);
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-medium">
            Liquidado con {rechazos.length} rechazo{rechazos.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-amber-900/80">
          {rechazos.length} colaborador{rechazos.length === 1 ? "" : "es"} no pasaron QA legal
          y quedaron sin recibo. El resto sí se liquidó. Corrige la data y usa "Revertir a
          borrador" para volver a liquidar todo.
        </p>
        <ul className="flex flex-col gap-1.5 mt-1">
          {rechazos.map((r) => (
            <li key={r.empleadoId} className="text-xs bg-white rounded-lg p-2">
              <p className="font-medium text-ink">{r.nombre}</p>
              <ul className="mt-1 space-y-0.5 text-muted">
                {r.issues.map((i, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[10px] bg-amber-100 text-amber-900 px-1 rounded">
                      {i.codigo}
                    </span>{" "}
                    {i.mensaje}
                    <span className="text-[10px] text-muted"> — {i.referenciaLegal}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (estado.estado === "fallido") {
    const err = esErrorCatastrofico(estado.erroresLiquidacion) ? estado.erroresLiquidacion : null;
    return (
      <div className="rounded-xl bg-red-50 border border-red-300 p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-coral">
          <XCircle size={16} className="shrink-0" />
          <span className="font-medium">La liquidación falló</span>
        </div>
        {err && <p className="text-xs text-coral font-mono">{err.mensaje}</p>}
        <p className="text-xs text-muted">
          Los recibos ya calculados en lotes previos quedaron guardados. Revierte a borrador
          para reintentar desde cero.
        </p>
      </div>
    );
  }

  if (estado.estado === "liquidado") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 flex items-center gap-2 text-sm text-emerald-900">
        <CheckCircle2 size={16} className="shrink-0" />
        <span className="font-medium">Liquidado correctamente</span>
      </div>
    );
  }

  return null;
}
