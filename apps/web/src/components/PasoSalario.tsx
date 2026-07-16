import { useEffect } from "react";
import { ArrowRight, Bus, CalendarRange, Gavel, PiggyBank, Wallet } from "lucide-react";
import type { ParametrosPublicos } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";

export type Periodicidad = "semanal" | "quincenal" | "mensual" | "personalizado";
export type TipoEmbargo = "ordinario" | "alimentos_o_cooperativa";

export interface DatosPaso1 {
  salario: string;
  periodicidad: Periodicidad;
  desde: string;
  hasta: string;
  auxilio: boolean;
  netoRecibido: string;
  aporteAfc: string;
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
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

const PERIODICIDAD_LABEL: Record<Periodicidad, string> = {
  semanal: "Semanal (7 días)",
  quincenal: "Quincenal (15 días)",
  mensual: "Mensual",
  personalizado: "Personalizado",
};

// Fecha fin sugerida a partir de la fecha de inicio y la periodicidad — el
// usuario puede editarla libremente después (eso la pasa a "personalizado").
function calcularHasta(desde: string, periodicidad: Periodicidad): string {
  if (!desde || periodicidad === "personalizado") return "";
  const d = new Date(`${desde}T00:00:00Z`);
  if (periodicidad === "semanal") d.setUTCDate(d.getUTCDate() + 6);
  else if (periodicidad === "quincenal") d.setUTCDate(d.getUTCDate() + 14);
  else {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

export default function PasoSalario({ datos, onCambio, onSiguiente, parametros }: Props) {
  const listo = Number(datos.salario) > 0 && datos.desde && datos.hasta && datos.desde <= datos.hasta;

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

  function cambiarDesde(desde: string) {
    const hasta = datos.periodicidad === "personalizado" ? datos.hasta : calcularHasta(desde, datos.periodicidad);
    onCambio({ ...datos, desde, hasta });
  }

  function cambiarHasta(hasta: string) {
    // Editar "Hasta" a mano es la forma de elegir otra fecha: se desmarca
    // del cálculo automático para que no se sobrescriba después.
    onCambio({ ...datos, hasta, periodicidad: "personalizado" });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) onSiguiente();
      }}
    >
      <PaycheckCard titulo="Tu salario">
        <div className="px-3 pb-3 pt-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <Wallet size={16} className="text-mint-dark" /> Salario básico mensual pactado
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

          {!superaTopeAuxilio && (
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={datos.auxilio}
                onChange={(e) => set("auxilio", e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <Bus size={16} className="text-muted" /> Recibo auxilio de transporte
            </label>
          )}
          {superaTopeAuxilio && (
            <p className="text-xs text-muted flex items-center gap-2">
              <Bus size={16} className="text-muted shrink-0" />
              No aplica auxilio de transporte: tu salario supera{" "}
              {parametros?.auxilioTransporteTopeSmlmv} SMLMV (Decreto de salario mínimo vigente).
            </p>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <PiggyBank size={16} className="text-coral" /> Aporte a cuenta AFC (opcional)
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={datos.aporteAfc}
              onChange={(e) => set("aporteAfc", e.target.value)}
              className={inputCls}
              placeholder="Monto mensual autorizado, si aplica"
            />
            <span className="text-xs text-muted font-normal">
              Descuento por convenio que autorizaste a tu empleador — no afecta tu salud ni tu
              pensión.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <Gavel size={16} className="text-coral" /> Embargo judicial (opcional)
            </span>
            <select
              value={datos.embargoTipo}
              onChange={(e) => set("embargoTipo", e.target.value as DatosPaso1["embargoTipo"])}
              className={inputCls}
            >
              <option value="">No tengo</option>
              <option value="ordinario">Ordinario (bancos, tarjetas, créditos)</option>
              <option value="alimentos_o_cooperativa">Cuota alimentaria / cooperativa</option>
            </select>
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
          </label>
        </div>
      </PaycheckCard>

      <PaycheckCard titulo="Periodo a revisar">
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span className="flex items-center gap-2">
                <CalendarRange size={16} className="text-mint-dark" /> Desde
              </span>
              <input
                required
                type="date"
                value={datos.desde}
                onChange={(e) => cambiarDesde(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Hasta</span>
              <input
                required
                type="date"
                value={datos.hasta}
                onChange={(e) => cambiarHasta(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          {datos.periodicidad !== "personalizado" && (
            <p className="text-xs text-muted">
              Calculada automáticamente según la periodicidad — puedes editarla si tu periodo real
              fue distinto.
            </p>
          )}
        </div>
      </PaycheckCard>

      <PaycheckCard titulo="Para comparar (opcional)">
        <div className="px-3 pb-3 pt-1">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            ¿Cuánto te consignaron?
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={datos.netoRecibido}
              onChange={(e) => set("netoRecibido", e.target.value)}
              className={inputCls}
              placeholder="El neto de tu comprobante o cuenta"
            />
          </label>
        </div>
      </PaycheckCard>

      <button
        type="submit"
        disabled={!listo}
        className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente: tu semana <ArrowRight size={18} />
      </button>
    </form>
  );
}
