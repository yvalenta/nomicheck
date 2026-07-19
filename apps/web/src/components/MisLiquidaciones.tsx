import { useEffect, useState } from "react";
import { ArrowLeft, FileText, History } from "lucide-react";
import { formatCOP, formatRangoFechas } from "@pv/reglas";
import { listarMisLiquidaciones, type LiquidacionListada } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import ComprobanteNomina from "./ComprobanteNomina.tsx";

interface Props {
  onAtras: () => void;
}

export default function MisLiquidaciones({ onAtras }: Props) {
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionListada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    listarMisLiquidaciones()
      .then(setLiquidaciones)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar tu historial"));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink flex items-center justify-center gap-2">
          <History size={20} className="text-mint-dark" /> Mis liquidaciones
        </h2>
        <p className="text-sm text-muted mt-1">Historial de liquidaciones que has guardado.</p>
      </div>

      {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}

      {liquidaciones === null && !error && (
        <p className="text-sm text-muted text-center">Cargando…</p>
      )}

      {liquidaciones?.length === 0 && (
        <p className="text-sm text-muted text-center px-4">
          Todavía no has guardado ninguna liquidación. Calcula tu nómina y usa "Guardar liquidación" en el resultado.
        </p>
      )}

      {liquidaciones?.map((l) => (
        <div key={l.id} className="flex flex-col gap-2">
          <PaycheckCard
            titulo={
              l.periodoDesde && l.periodoHasta
                ? formatRangoFechas(l.periodoDesde, l.periodoHasta)
                : "Periodo sin datos"
            }
          >
            <div className="px-3 pb-3 pt-1 flex items-center justify-between gap-3">
              <button
                onClick={() => setAbierta(abierta === l.id ? null : l.id)}
                className="flex items-center gap-1.5 text-xs text-mint-dark hover:underline shrink-0"
              >
                <FileText size={14} /> {abierta === l.id ? "Ocultar comprobante" : "Ver comprobante"}
              </button>
              <div className="flex justify-between gap-3 text-sm font-semibold text-ink">
                <span>Neto</span>
                <span className="tabular-nums">{formatCOP(l.netoEsperado)}</span>
              </div>
            </div>
          </PaycheckCard>

          {abierta === l.id && (
            <ComprobanteNomina
              resultado={l.resultado}
              fechaElaboracion={l.creadoEn}
              numero={`LQ-${String(l.id).padStart(6, "0")}`}
            />
          )}
        </div>
      ))}

      <button
        onClick={onAtras}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <ArrowLeft size={15} /> Volver
      </button>
    </div>
  );
}
