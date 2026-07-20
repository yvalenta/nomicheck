import { useState } from "react";
import { ArrowLeft, Bus, Gift } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { calcularPrima, type ParametrosPublicos, type ResultadoPrima } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import DateField from "./DateField.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  parametros: ParametrosPublicos | null;
  onAtras: () => void;
}

export default function PrimaCalculadora({ parametros, onAtras }: Props) {
  const [salarioMensual, setSalarioMensual] = useState("");
  const [recibeAuxilioTransporte, setRecibeAuxilioTransporte] = useState(true);
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [fechaCorte, setFechaCorte] = useState("");
  const [resultado, setResultado] = useState<ResultadoPrima | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  const listo = Number(salarioMensual) > 0 && fechaIngreso && fechaCorte;

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCalculando(true);
    setError(null);
    setResultado(null);
    try {
      setResultado(
        await calcularPrima({
          salarioMensual: Number(salarioMensual),
          recibeAuxilioTransporte,
          fechaIngreso,
          fechaCorte,
        })
      );
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
          <Gift size={20} className="text-mint-dark" /> Prima de servicios
        </h2>
        <p className="text-sm text-muted mt-1">
          Un estimado aproximado — no reemplaza una liquidación oficial.
        </p>
      </div>

      <form onSubmit={calcular} className="flex flex-col gap-4">
        <PaycheckCard titulo="Tus datos">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-4">
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

            {parametros && (
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start -mt-2">
                <input
                  type="checkbox"
                  checked={Number(salarioMensual) === parametros.smlmv}
                  onChange={(e) => { if (e.target.checked) setSalarioMensual(String(parametros.smlmv)); }}
                  className="w-3.5 h-3.5 accent-mint"
                />
                Autocompletar salario mínimo vigente ({formatCOP(parametros.smlmv)})
              </label>
            )}

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={recibeAuxilioTransporte}
                onChange={(e) => setRecibeAuxilioTransporte(e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              <Bus size={16} className="text-muted" /> Recibo auxilio de transporte (hace base de prima)
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Fecha de ingreso (o inicio del semestre si ya te pagaron la anterior)</span>
              <DateField required value={fechaIngreso} onChange={setFechaIngreso} placeholder="Fecha de ingreso" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Fecha de corte (ej: 30 de junio o 20 de diciembre)</span>
              <DateField required value={fechaCorte} onChange={setFechaCorte} placeholder="Fecha de corte" minimo={fechaIngreso || undefined} />
            </label>
          </div>
        </PaycheckCard>

        <button
          type="submit"
          disabled={!listo || calculando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculando ? "Calculando…" : "Calcular prima"}
        </button>
      </form>

      {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}

      {resultado && (
        <PaycheckCard titulo="Resultado aproximado">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted">Días considerados</span>
              <span className="text-sm font-medium text-ink tabular-nums">{resultado.diasTrabajadosAcumulado}</span>
            </div>
            {resultado.auxilioIncluido > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted">Auxilio de transporte en la base</span>
                <span className="text-sm font-medium text-ink tabular-nums">{formatCOP(resultado.auxilioIncluido)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold text-ink">Prima estimada</span>
              <span className="text-lg font-bold text-ink tabular-nums">{formatCOP(resultado.prima)}</span>
            </div>
            {resultado.advertencias.map((a) => (
              <p key={a} className="rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">{a}</p>
            ))}
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
