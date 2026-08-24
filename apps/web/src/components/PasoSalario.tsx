import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import type { ParametrosPublicos } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import DateRangeField from "./DateRangeField.tsx";
import { calcularHasta, PERIODICIDAD_LABEL, type Periodicidad } from "../lib/periodicidad.ts";

// Re-export por compatibilidad: el tipo nació aquí y otros lo importan de aquí.
export type { Periodicidad };
export type TipoEmbargo = "ordinario" | "alimentos_o_cooperativa";
export type TipoContrato =
  | "indefinido"
  | "fijo"
  | "obra_labor"
  | "tiempo_parcial"
  | "aprendizaje_sena_lectiva"
  | "aprendizaje_sena_practica"
  | "servicios";

export interface DatosPaso1 {
  salario: string;
  periodicidad: Periodicidad;
  desde: string;
  hasta: string;
  auxilio: boolean;
  tipoContrato: TipoContrato;
  netoRecibido: string;
  aporteAfc: string;
  prestamo: string;
  ahorro: string;
  reproceso: string;
  embargoTipo: TipoEmbargo | "";
  embargoValor: string;
}

interface Props {
  datos: DatosPaso1;
  onCambio: (datos: DatosPaso1) => void;
  onSiguiente: () => void;
  parametros: ParametrosPublicos | null;
}

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";


const TIPO_CONTRATO_LABEL: Record<TipoContrato, string> = {
  indefinido: "Término indefinido",
  fijo: "Término fijo",
  obra_labor: "Por obra o labor",
  tiempo_parcial: "Tiempo parcial",
  aprendizaje_sena_lectiva: "Aprendizaje SENA — etapa lectiva",
  aprendizaje_sena_practica: "Aprendizaje SENA — etapa práctica",
  servicios: "Prestación de servicios (contratista independiente)",
};

// calcularHasta y las etiquetas de periodicidad viven en lib/periodicidad.ts
// desde el 2026-08-20 — la empresa usa la misma regla en "nuevo periodo".

// Estos cuatro tipos son contrato laboral ordinario con derecho pleno a
// auxilio de transporte y deducciones de ley completas — solo cambia su
// preaviso/indemnización al terminar (fuera del alcance de este verificador).
const TIPOS_LABORALES_ORDINARIOS: TipoContrato[] = ["indefinido", "fijo", "obra_labor", "tiempo_parcial"];

export default function PasoSalario({ datos, onCambio, onSiguiente, parametros }: Props) {
  const listo = Number(datos.salario) > 0 && datos.desde && datos.hasta && datos.desde <= datos.hasta;
  const esLaboralOrdinario = TIPOS_LABORALES_ORDINARIOS.includes(datos.tipoContrato);

  function set<K extends keyof DatosPaso1>(k: K, v: DatosPaso1[K]) {
    onCambio({ ...datos, [k]: v });
  }

  const topeAuxilio = parametros ? parametros.smlmv * parametros.auxilioTransporteTopeSmlmv : null;
  const superaTopeAuxilio = topeAuxilio !== null && Number(datos.salario) > topeAuxilio;

  // Si el salario sube por encima del tope, el auxilio deja de aplicar —
  // se destildea automáticamente para que no quede un checkbox activo que
  // el motor de todos modos va a ignorar (con advertencia).
  useEffect(() => {
    if (superaTopeAuxilio && datos.auxilio) set("auxilio", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superaTopeAuxilio]);

  function cambiarPeriodicidad(periodicidad: Periodicidad) {
    const hasta = periodicidad === "personalizado" ? datos.hasta : calcularHasta(datos.desde, periodicidad);
    onCambio({ ...datos, periodicidad, hasta });
  }

  // El calendario en modo rango devuelve desde+hasta juntos (dos clics). Si
  // solo llegó el primer clic (hasta vacío), seguimos calculando "hasta"
  // según la periodicidad como antes; si llegó el rango completo, es una
  // elección manual — se desmarca del cálculo automático (mismo criterio
  // que antes al editar "Hasta" a mano).
  function cambiarPeriodo(desde: string, hasta: string) {
    if (!hasta) {
      const hastaCalculada = datos.periodicidad === "personalizado" ? datos.hasta : calcularHasta(desde, datos.periodicidad);
      onCambio({ ...datos, desde, hasta: hastaCalculada });
    } else {
      onCambio({ ...datos, desde, hasta, periodicidad: "personalizado" });
    }
  }

  function marcarEmbargo(tipo: TipoEmbargo, marcado: boolean) {
    set("embargoTipo", marcado ? tipo : "");
    if (!marcado) set("embargoValor", "");
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) onSiguiente();
      }}
    >
      <PaycheckCard titulo="Tu salario y periodo">
        <div className="px-3 pb-4 pt-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span>
              {datos.tipoContrato === "servicios"
                ? "Honorarios mensuales pactados"
                : "Salario básico mensual pactado"}
            </span>
            <input
              required
              type="number"
              min={1}
              inputMode="numeric"
              value={datos.salario}
              onChange={(e) => set("salario", e.target.value)}
              className={inputCls}
              placeholder="Ej: 1.750.905"
            />
          </label>

          {parametros && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start -mt-2">
              <input
                type="checkbox"
                checked={Number(datos.salario) === parametros.smlmv}
                onChange={(e) => { if (e.target.checked) set("salario", String(parametros.smlmv)); }}
                className="w-3.5 h-3.5 accent-mint"
              />
              Autocompletar salario mínimo vigente ({formatCOP(parametros.smlmv)})
            </label>
          )}

          {!superaTopeAuxilio && esLaboralOrdinario && (
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={datos.auxilio}
                onChange={(e) => set("auxilio", e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              Recibo auxilio de transporte
            </label>
          )}
          {superaTopeAuxilio && esLaboralOrdinario && (
            <p className="text-xs text-muted">
              No aplica auxilio de transporte: tu salario supera{" "}
              {parametros?.auxilioTransporteTopeSmlmv} SMLMV (Decreto de salario mínimo vigente).
            </p>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span>Tipo de contrato</span>
            <select
              value={datos.tipoContrato}
              onChange={(e) => set("tipoContrato", e.target.value as TipoContrato)}
              className={inputCls}
            >
              {(Object.keys(TIPO_CONTRATO_LABEL) as TipoContrato[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_CONTRATO_LABEL[t]}
                </option>
              ))}
            </select>
            {(datos.tipoContrato === "aprendizaje_sena_lectiva" ||
              datos.tipoContrato === "aprendizaje_sena_practica") && (
              <span className="text-xs text-muted font-normal">
                Como aprendiz SENA no aplica auxilio de transporte
                {datos.tipoContrato === "aprendizaje_sena_lectiva"
                  ? " ni ningún aporte a salud/pensión en etapa lectiva (Ley 789 de 2002, art. 30)."
                  : ", y en etapa práctica solo se cotiza salud (sin pensión ni fondo de solidaridad)."}
              </span>
            )}
            {(datos.tipoContrato === "fijo" ||
              datos.tipoContrato === "obra_labor" ||
              datos.tipoContrato === "tiempo_parcial") && (
              <span className="text-xs text-muted font-normal">
                Se liquida igual que un contrato indefinido en este periodo (recargos y deducciones
                de ley no cambian por el tipo de término) — lo que puede ser distinto es el preaviso
                o la indemnización si termina antes de tiempo, algo que este verificador no calcula.
              </span>
            )}
            {datos.tipoContrato === "servicios" && (
              <span className="text-xs text-muted font-normal">
                No es una relación laboral: sin auxilio de transporte, sin recargos ni prestaciones
                sociales. Tú mismo liquidas y pagas tus aportes a salud y pensión por PILA (Ley 1819
                de 2016, art. 244) — te mostramos una referencia de cuánto sería.
              </span>
            )}
          </label>

          {/* El periodo vive con el salario: son la misma pregunta (¿cuánto y
              cuándo?), y el par periodicidad/período aprovecha una sola fila. */}
          <div className="grid gap-4 border-t border-borde pt-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Periodicidad de pago</span>
              <select
                value={datos.periodicidad}
                onChange={(e) => cambiarPeriodicidad(e.target.value as Periodicidad)}
                className={inputCls}
              >
                {(Object.keys(PERIODICIDAD_LABEL) as Periodicidad[]).map((p) => (
                  <option key={p} value={p}>
                    {PERIODICIDAD_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Período a revisar</span>
              <DateRangeField required desde={datos.desde} hasta={datos.hasta} onCambio={cambiarPeriodo} placeholder="Selecciona el período" />
            </label>
          </div>
          {datos.periodicidad !== "personalizado" && (
            <p className="text-xs text-muted -mt-1">
              El fin se calcula solo según la periodicidad — edítalo si tu periodo real fue
              distinto.
            </p>
          )}
        </div>
      </PaycheckCard>

      {datos.tipoContrato !== "servicios" && (
      <PaycheckCard titulo="Deducciones opcionales">
        <div className="px-3 pb-4 pt-1 flex flex-col gap-3.5">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <CheckMonto
              etiqueta="Aporte a cuenta AFC"
              ayuda="Descuento por convenio — no afecta tu salud ni tu pensión."
              marcado={datos.aporteAfc !== ""}
              valor={datos.aporteAfc}
              onMarcar={(m) => set("aporteAfc", m ? "0" : "")}
              onValor={(v) => set("aporteAfc", v)}
            />
            <CheckMonto
              etiqueta="Préstamo con la empresa"
              marcado={datos.prestamo !== ""}
              valor={datos.prestamo}
              onMarcar={(m) => set("prestamo", m ? "0" : "")}
              onValor={(v) => set("prestamo", v)}
            />
            <CheckMonto
              etiqueta="Ahorro programado"
              marcado={datos.ahorro !== ""}
              valor={datos.ahorro}
              onMarcar={(m) => set("ahorro", m ? "0" : "")}
              onValor={(v) => set("ahorro", v)}
            />
            <CheckMonto
              etiqueta="Reproceso"
              ayuda="Descuento por un error o novedad operativa acordada con la empresa."
              marcado={datos.reproceso !== ""}
              valor={datos.reproceso}
              onMarcar={(m) => set("reproceso", m ? "0" : "")}
              onValor={(v) => set("reproceso", v)}
            />
          </div>

          <div className="border-t border-borde pt-3.5 flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={datos.embargoTipo === "ordinario"}
                onChange={(e) => marcarEmbargo("ordinario", e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              Tengo un embargo ordinario (bancos, tarjetas, créditos)
            </label>
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={datos.embargoTipo === "alimentos_o_cooperativa"}
                onChange={(e) => marcarEmbargo("alimentos_o_cooperativa", e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              Tengo un embargo por cuota alimentaria o cooperativa
            </label>
            {datos.embargoTipo && (
              <>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={datos.embargoValor}
                  onChange={(e) => set("embargoValor", e.target.value)}
                  className={inputCls}
                  placeholder="Monto mensual ordenado por el juzgado"
                />
                <span className="text-xs text-muted font-normal">
                  {datos.embargoTipo === "ordinario"
                    ? "Solo es embargable 1/5 del excedente sobre 1 SMLMV (CST art. 154 y 155) — te mostramos el monto realmente aplicable."
                    : "Puede llegar hasta el 50% de tu salario, incluso el mínimo (CST art. 156) — te mostramos el monto realmente aplicable."}
                </span>
              </>
            )}
          </div>
        </div>
      </PaycheckCard>
      )}

      {/* Comparar es terciario: una fila discreta, no una card que compita
          con lo esencial. */}
      <label className="flex flex-col gap-1.5 px-1 text-xs text-muted sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 sm:w-64">
          ¿Cuánto te consignaron? <span className="opacity-70">(opcional, para comparar)</span>
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={datos.netoRecibido}
          onChange={(e) => set("netoRecibido", e.target.value)}
          className={`${inputCls} flex-1 text-sm`}
          placeholder="El neto de tu comprobante o cuenta"
        />
      </label>

      <button
        type="submit"
        disabled={!listo}
        className="flex items-center justify-center gap-2 rounded-full bg-mint text-white font-medium py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {datos.tipoContrato === "servicios" ? "Calcular" : "Siguiente: tu semana"}{" "}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}

function CheckMonto({
  etiqueta,
  ayuda,
  marcado,
  valor,
  onMarcar,
  onValor,
}: {
  etiqueta: string;
  ayuda?: string;
  marcado: boolean;
  valor: string;
  onMarcar: (marcado: boolean) => void;
  onValor: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked)}
          className="w-4 h-4 accent-mint"
        />
        {etiqueta}
      </label>
      {marcado && (
        <>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={valor === "0" ? "" : valor}
            onChange={(e) => onValor(e.target.value)}
            className={inputCls}
            placeholder="Monto mensual"
            autoFocus
          />
          {ayuda && <span className="text-xs text-muted font-normal">{ayuda}</span>}
        </>
      )}
    </div>
  );
}
