import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Gavel, Info, Scale, TriangleAlert } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { calcularIndemnizacion, type ParametrosPublicos, type ResultadoIndemnizacion } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import DateField from "./DateField.tsx";
import IndemnizacionResultado, { IndemnizacionSinLugar } from "./IndemnizacionResultado.tsx";

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
  parametros: ParametrosPublicos | null;
  onAtras: () => void;
}

export default function IndemnizacionCalculadora({ parametros, onAtras }: Props) {
  const [tipoContrato, setTipoContrato] = useState<TipoContrato>("indefinido");
  const [salarioMensual, setSalarioMensual] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [fechaTerminacion, setFechaTerminacion] = useState("");
  const [fechaVencimientoPactada, setFechaVencimientoPactada] = useState("");
  const [conJustaCausa, setConJustaCausa] = useState(false);
  const [enPeriodoPrueba, setEnPeriodoPrueba] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIndemnizacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [desgloseAbierto, setDesgloseAbierto] = useState(false);

  const conTermino = tipoContrato === "fijo" || tipoContrato === "obra_labor";
  const listo =
    Number(salarioMensual) > 0 &&
    fechaTerminacion &&
    (conTermino ? fechaVencimientoPactada : fechaIngreso);

  // El motor rechaza un vencimiento que no sea posterior a la terminación
  // ("el contrato ya se habría cumplido"). Es un error seguro: avisarlo acá
  // ahorra el viaje al API y explica algo que el mensaje crudo no dice — que
  // un contrato que llegó a su fecha no genera indemnización.
  // Solo bloquea cuando de verdad se va a evaluar la fecha: el período de
  // prueba y la justa causa resuelven en $0 antes de mirarla, así que ahí
  // advertir sería ruido sobre una respuesta que igual es correcta.
  const vencimientoInvalido =
    conTermino &&
    !enPeriodoPrueba &&
    !conJustaCausa &&
    !!fechaVencimientoPactada &&
    !!fechaTerminacion &&
    fechaVencimientoPactada <= fechaTerminacion;

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCalculando(true);
    setError(null);
    setResultado(null);
    setDesgloseAbierto(false);
    try {
      const datos = conTermino
        ? {
            tipoContrato: tipoContrato as "fijo" | "obra_labor",
            salarioMensual: Number(salarioMensual),
            fechaTerminacion,
            fechaVencimientoPactada,
            conJustaCausa,
            enPeriodoPrueba,
          }
        : {
            tipoContrato: tipoContrato as "indefinido" | "tiempo_parcial",
            salarioMensual: Number(salarioMensual),
            fechaIngreso,
            fechaTerminacion,
            conJustaCausa,
            enPeriodoPrueba,
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

            {vencimientoInvalido && (
              <p className="flex gap-2 -mt-2 rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
                <Info size={14} className="shrink-0 mt-px" />
                <span>
                  El contrato llegó a su fecha de vencimiento: terminarlo ahí es cumplirlo, no romperlo, así que{" "}
                  <strong>no genera indemnización</strong>. Para estimar una, la fecha de vencimiento pactada tiene que ser
                  posterior a la de terminación.
                </span>
              </p>
            )}

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={enPeriodoPrueba}
                onChange={(e) => setEnPeriodoPrueba(e.target.checked)}
                className="w-4 h-4 accent-coral"
              />
              <Clock size={16} className="text-muted" /> Terminado dentro del período de prueba
            </label>

            {!enPeriodoPrueba && (
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={conJustaCausa}
                  onChange={(e) => setConJustaCausa(e.target.checked)}
                  className="w-4 h-4 accent-coral"
                />
                <Gavel size={16} className="text-muted" /> La empresa alega justa causa comprobada
              </label>
            )}
          </div>
        </PaycheckCard>

        <button
          type="submit"
          disabled={!listo || calculando || vencimientoInvalido}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculando ? "Calculando…" : "Calcular indemnización"}
        </button>
      </form>

      {error && (
        <div className="flex gap-2.5 rounded-2xl bg-red-50 text-coral text-sm p-3.5">
          <TriangleAlert size={17} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {resultado && (
        <Aparecer>
          {resultado.valor === 0 ? (
            <IndemnizacionSinLugar resultado={resultado}>
              <AlcanceNota onVerOtras={onAtras} />
            </IndemnizacionSinLugar>
          ) : (
            <IndemnizacionResultado
              resultado={resultado}
              abierto={desgloseAbierto}
              onAlternar={() => setDesgloseAbierto((v) => !v)}
            >
              <AlcanceNota onVerOtras={onAtras} />
            </IndemnizacionResultado>
          )}
        </Aparecer>
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

/** Entrada suave del resultado — evita que el bloque aparezca de golpe bajo el botón. */
function Aparecer({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Lo que este cálculo NO cubre.
 *
 * Es la confusión más cara de esta pantalla: la indemnización es la sanción
 * por romper el contrato antes de tiempo, no la liquidación. Una planilla de
 * liquidación típica —prima, cesantías, intereses, vacaciones— puede sumar
 * varios millones con la indemnización en cero, y ambas cosas ser correctas.
 */
function AlcanceNota({ onVerOtras }: { onVerOtras: () => void }) {
  return (
    <div className="mx-3 mb-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-xs text-muted leading-relaxed">
        Esto es <strong className="text-ink">solo la indemnización</strong> — lo que se debe por terminar el contrato
        antes de tiempo y sin justa causa. <strong className="text-ink">No incluye</strong> prima, cesantías, intereses
        ni vacaciones: eso es la <em>liquidación</em>, se calcula aparte y se paga aunque la indemnización sea $0.
      </p>
      <button
        onClick={onVerOtras}
        className="mt-2 text-xs font-semibold text-mint-dark hover:underline"
      >
        Ver las calculadoras de prima y cesantías →
      </button>
    </div>
  );
}
