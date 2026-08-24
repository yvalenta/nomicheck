import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, HelpCircle, Loader2, RotateCcw, Save, XCircle } from "lucide-react";
import { esRecargoOExtra, formatCOP, type ResultadoNomina } from "@pv/reglas";
import PaycheckCard from "./PaycheckCard.tsx";
import SegmentedControl from "./SegmentedControl.tsx";
import ValidationRow from "./ValidationRow.tsx";
import FinancialProgressBar from "./FinancialProgressBar.tsx";
import HeatmapDias from "./HeatmapDias.tsx";
import ChatContador from "./ChatContador.tsx";
import ComprobanteNomina from "./ComprobanteNomina.tsx";
import { useGuardarLiquidacion } from "../hooks/useGuardarLiquidacion.ts";

interface Props {
  resultado: ResultadoNomina;
  netoRecibido?: number;
  onVolver: () => void;
}

type Vista = "resumen" | "recargos" | "deducciones";

const TOLERANCIA_PESOS = 1;

export default function Resultado({ resultado, netoRecibido, onVolver }: Props) {
  const [vista, setVista] = useState<Vista>("resumen");
  const [mostrarComprobante, setMostrarComprobante] = useState(false);
  const { guardar, guardando, mensaje } = useGuardarLiquidacion();

  const diferencia = netoRecibido !== undefined ? netoRecibido - resultado.netoEsperado : undefined;
  const coincide = diferencia !== undefined && Math.abs(diferencia) <= TOLERANCIA_PESOS;

  const lineasVisibles = resultado.lineas.filter((l) => {
    if (vista === "recargos")
      return esRecargoOExtra(l);
    if (vista === "deducciones") return l.tipo === "deduccion";
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Semáforo de comparación */}
      {diferencia !== undefined ? (
        <div
          className={`rounded-2xl p-4 flex items-center gap-3 ${
            coincide ? "bg-emerald-50 text-mint-dark" : "bg-red-50 text-coral"
          }`}
        >
          {coincide ? (
            <CheckCircle2 size={24} className="shrink-0" />
          ) : (
            <XCircle size={24} className="shrink-0" />
          )}
          <div className="text-sm">
            <p className="font-semibold">
              {coincide
                ? "Tu pago coincide con lo que dice la ley."
                : diferencia > 0
                  ? `Te pagaron ${formatCOP(diferencia)} de más frente a lo esperado.`
                  : `Te pagaron ${formatCOP(Math.abs(diferencia))} de menos frente a lo esperado.`}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              Esperado {formatCOP(resultado.netoEsperado)} · Recibido {formatCOP(netoRecibido!)}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-4 flex items-center gap-3 bg-slate-100 text-muted">
          <HelpCircle size={22} className="shrink-0" />
          <p className="text-sm">
            Según la ley vigente, tu neto de este periodo debería ser{" "}
            <strong className="text-ink">{formatCOP(resultado.netoEsperado)}</strong>.
          </p>
        </div>
      )}

      {resultado.advertencias.map((a, i) => (
        <div
          key={i}
          className="rounded-2xl p-3.5 bg-amber-50 text-amber-700 flex items-start gap-2.5 text-sm"
        >
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>{a}</span>
        </div>
      ))}

      <PaycheckCard>
        <div className="px-3 py-3">
          <FinancialProgressBar resultado={resultado} />
        </div>
      </PaycheckCard>

      {/* Solo el modo turnos tiene desglose diario — el salario fijo y la
          prestación de servicios no registran jornadas. */}
      {resultado.detalleDias && resultado.detalleDias.length > 0 && (
        <HeatmapDias dias={resultado.detalleDias} />
      )}

      <div className="flex justify-center">
        <SegmentedControl<Vista>
          opciones={[
            { valor: "resumen", etiqueta: "Resumen" },
            { valor: "recargos", etiqueta: "Recargos y extras" },
            { valor: "deducciones", etiqueta: "Deducciones" },
          ]}
          activo={vista}
          onCambio={setVista}
        />
      </div>

      <PaycheckCard>
        <div className="flex flex-col">
          {lineasVisibles.length === 0 && (
            <p className="text-sm text-muted px-3 py-6 text-center">
              No hay conceptos en esta categoría para el periodo.
            </p>
          )}
          {lineasVisibles.map((l, i) => (
            <ValidationRow key={i} linea={l} />
          ))}
        </div>
        <div className="border-t border-borde mx-3 py-3 px-3 flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between text-muted">
            <span>Total devengado</span>
            <span className="font-mono">{formatCOP(resultado.totalDevengos)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Total deducciones</span>
            <span className="font-mono text-coral">−{formatCOP(resultado.totalDeducciones)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-medium text-ink">Neto esperado</span>
            <span className="font-mono text-2xl font-medium text-ink">{formatCOP(resultado.netoEsperado)}</span>
          </div>
        </div>
      </PaycheckCard>

      <button
        onClick={() => guardar(resultado, netoRecibido)}
        disabled={guardando}
        className="flex items-center justify-center gap-2 rounded-full bg-mint text-white font-medium py-3.5 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
      >
        {guardando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
        {guardando ? "Guardando…" : "Guardar liquidación"}
      </button>
      {mensaje && <p className="text-xs text-center text-muted -mt-2">{mensaje}</p>}

      <button
        onClick={() => setMostrarComprobante((v) => !v)}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <FileText size={15} /> {mostrarComprobante ? "Ocultar comprobante" : "Ver comprobante detallado"}
      </button>
      {mostrarComprobante && <ComprobanteNomina resultado={resultado} />}

      <ChatContador resultado={resultado} />

      <p className="text-xs text-muted text-center px-4">
        Estimado informativo — no reemplaza la liquidación oficial ni asesoría legal certificada.
      </p>

      <button
        onClick={onVolver}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <RotateCcw size={15} /> Verificar otro periodo
      </button>
    </div>
  );
}
