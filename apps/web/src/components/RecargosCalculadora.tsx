import { useState } from "react";
import { ArrowLeft, MoonStar } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { calcularRecargos, type HorasRecargo, type ParametrosPublicos, type ResultadoRecargos } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import DateField from "./DateField.tsx";
import RecargosResultado from "./RecargosResultado.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

// Orden y agrupación de captura: primero los recargos sobre horas ordinarias
// (solo pagan el porcentaje), luego las extras (hora completa + recargo).
const CAMPOS: { grupo: string; campos: { clave: keyof HorasRecargo; label: string }[] }[] = [
  {
    grupo: "Horas ordinarias con recargo",
    campos: [
      { clave: "nocturnas", label: "Nocturnas (día hábil)" },
      { clave: "dominicalesDiurnas", label: "Domingo/festivo diurnas" },
      { clave: "dominicalesNocturnas", label: "Domingo/festivo nocturnas" },
    ],
  },
  {
    grupo: "Horas extra",
    campos: [
      { clave: "extrasDiurnas", label: "Extra diurnas" },
      { clave: "extrasNocturnas", label: "Extra nocturnas" },
      { clave: "extrasDominicalesDiurnas", label: "Extra domingo/festivo diurnas" },
      { clave: "extrasDominicalesNocturnas", label: "Extra domingo/festivo nocturnas" },
    ],
  },
];

interface Props {
  parametros: ParametrosPublicos | null;
  onAtras: () => void;
}

export default function RecargosCalculadora({ parametros, onAtras }: Props) {
  const [salarioMensual, setSalarioMensual] = useState("");
  const [fechaReferencia, setFechaReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [horas, setHoras] = useState<Record<keyof HorasRecargo, string>>({
    nocturnas: "",
    dominicalesDiurnas: "",
    dominicalesNocturnas: "",
    extrasDiurnas: "",
    extrasNocturnas: "",
    extrasDominicalesDiurnas: "",
    extrasDominicalesNocturnas: "",
  });
  const [resultado, setResultado] = useState<ResultadoRecargos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  // El salario TAL COMO se envió: el resultado no lo trae, y leerlo del
  // formulario dejaría el "+X% sobre tu salario" describiendo otro cálculo si
  // alguien edita el campo después de calcular.
  const [salarioUsado, setSalarioUsado] = useState<number | null>(null);

  const hayHoras = Object.values(horas).some((v) => Number(v) > 0);
  const listo = Number(salarioMensual) > 0 && fechaReferencia && hayHoras;

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCalculando(true);
    setError(null);
    setResultado(null);
    try {
      const horasNumericas: HorasRecargo = {};
      for (const [clave, valor] of Object.entries(horas)) {
        if (Number(valor) > 0) horasNumericas[clave as keyof HorasRecargo] = Number(valor);
      }
      setResultado(
        await calcularRecargos({
          salarioMensual: Number(salarioMensual),
          fechaReferencia,
          horas: horasNumericas,
        })
      );
      setSalarioUsado(Number(salarioMensual));
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
          <MoonStar size={20} className="text-mint-dark" /> Recargos y horas extra
        </h2>
        <p className="text-sm text-muted mt-1">
          Con las tarifas vigentes en la fecha que elijas — no reemplaza tu comprobante de nómina.
        </p>
      </div>

      <form onSubmit={calcular} className="flex flex-col gap-4">
        <PaycheckCard titulo="Tus datos">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
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
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                <span>Fecha de referencia</span>
                <DateField required value={fechaReferencia} onChange={setFechaReferencia} placeholder="Fecha de referencia" />
              </label>
            </div>
            {parametros && (
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start">
                <input
                  type="checkbox"
                  checked={Number(salarioMensual) === parametros.smlmv}
                  onChange={(e) => { if (e.target.checked) setSalarioMensual(String(parametros.smlmv)); }}
                  className="w-3.5 h-3.5 accent-mint"
                />
                Autocompletar salario mínimo vigente ({formatCOP(parametros.smlmv)})
              </label>
            )}
          </div>
        </PaycheckCard>

        {CAMPOS.map(({ grupo, campos }) => (
          <PaycheckCard key={grupo} titulo={grupo}>
            <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-3">
              {campos.map(({ clave, label }) => (
                <label key={clave} className="flex flex-col gap-1.5 text-sm text-ink">
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    value={horas[clave]}
                    onChange={(e) => setHoras({ ...horas, [clave]: e.target.value })}
                    className={inputCls}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
          </PaycheckCard>
        ))}

        <button
          type="submit"
          disabled={!listo || calculando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculando ? "Calculando…" : "Calcular recargos"}
        </button>
      </form>

      {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}

      {resultado && (
        // El salario va aparte porque el resultado no lo trae: sirve para decir
        // cuánto suma el mes, y se toma el que se envió, no el del formulario
        // por si se editó después de calcular.
        <RecargosResultado resultado={resultado} salarioMensual={salarioUsado ?? undefined} />
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
