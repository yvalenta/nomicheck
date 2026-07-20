import { useState } from "react";
import { ArrowLeft, Gavel, Scale } from "lucide-react";
import { calcularIndemnizacion, type ResultadoIndemnizacion } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import DateField from "./DateField.tsx";

type TipoContrato = "indefinido" | "fijo" | "obra_labor" | "tiempo_parcial";

const TIPO_LABEL: Record<TipoContrato, string> = {
  indefinido: "Término indefinido",
  fijo: "Término fijo",
  obra_labor: "Por obra o labor",
  tiempo_parcial: "Tiempo parcial",
};

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  onAtras: () => void;
}

export default function IndemnizacionCalculadora({ onAtras }: Props) {
  const [tipoContrato, setTipoContrato] = useState<TipoContrato>("indefinido");
  const [salarioMensual, setSalarioMensual] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [fechaTerminacion, setFechaTerminacion] = useState("");
  const [fechaVencimientoPactada, setFechaVencimientoPactada] = useState("");
  const [conJustaCausa, setConJustaCausa] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIndemnizacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  const conTermino = tipoContrato === "fijo" || tipoContrato === "obra_labor";
  const listo =
    Number(salarioMensual) > 0 &&
    fechaTerminacion &&
    (conTermino ? fechaVencimientoPactada : fechaIngreso);

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCalculando(true);
    setError(null);
    setResultado(null);
    try {
      const datos = conTermino
        ? {
            tipoContrato: tipoContrato as "fijo" | "obra_labor",
            salarioMensual: Number(salarioMensual),
            fechaTerminacion,
            fechaVencimientoPactada,
            conJustaCausa,
          }
        : {
            tipoContrato: tipoContrato as "indefinido" | "tiempo_parcial",
            salarioMensual: Number(salarioMensual),
            fechaIngreso,
            fechaTerminacion,
            conJustaCausa,
          };
      setResultado(await calcularIndemnizacion(datos));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink flex items-center justify-center gap-2">
          <Scale size={20} className="text-mint-dark" /> Indemnización por terminación
        </h2>
        <p className="text-sm text-muted mt-1">
          Un estimado aproximado — no reemplaza una liquidación oficial ni asesoría legal.
        </p>
      </div>

      <form onSubmit={calcular} className="flex flex-col gap-4">
        <PaycheckCard titulo="Datos del contrato">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Tipo de contrato</span>
              <select
                value={tipoContrato}
                onChange={(e) => setTipoContrato(e.target.value as TipoContrato)}
                className={inputCls}
              >
                {(Object.keys(TIPO_LABEL) as TipoContrato[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Salario mensual</span>
              <input
                required
                type="number"
                min={1}
                inputMode="numeric"
                value={salarioMensual}
                onChange={(e) => setSalarioMensual(e.target.value)}
                className={inputCls}
                placeholder="Ej: 1.750.905"
              />
            </label>

            {conTermino ? (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                <span>
                  {tipoContrato === "fijo" ? "Fecha de vencimiento pactada" : "Fecha estimada de fin de la obra/labor"}
                </span>
                <DateField required value={fechaVencimientoPactada} onChange={setFechaVencimientoPactada} placeholder="Fecha de vencimiento" />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                <span>Fecha de ingreso</span>
                <DateField required value={fechaIngreso} onChange={setFechaIngreso} placeholder="Fecha de ingreso" />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Fecha de terminación</span>
              <DateField required value={fechaTerminacion} onChange={setFechaTerminacion} placeholder="Fecha de terminación" />
            </label>

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={conJustaCausa}
                onChange={(e) => setConJustaCausa(e.target.checked)}
                className="w-4 h-4 accent-coral"
              />
              <Gavel size={16} className="text-muted" /> La empresa alega justa causa comprobada
            </label>
          </div>
        </PaycheckCard>

        <button
          type="submit"
          disabled={!listo || calculando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculando ? "Calculando…" : "Calcular indemnización"}
        </button>
      </form>

      {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}

      {resultado && (
        <PaycheckCard titulo="Resultado aproximado">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted">Días de indemnización</span>
              <span className="text-sm font-medium text-ink tabular-nums">{resultado.diasIndemnizacion}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold text-ink">Valor estimado</span>
              <span className="text-lg font-bold text-ink tabular-nums">
                {resultado.valor.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">{resultado.explicacion}</p>
            <p className="text-xs text-muted">{resultado.ley}</p>
          </div>
        </PaycheckCard>
      )}

      <button
        onClick={onAtras}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <ArrowLeft size={15} /> Volver
      </button>
    </div>
  );
}
