import { ArrowRight, Bus, CalendarRange, PiggyBank, Wallet } from "lucide-react";
import PaycheckCard from "./PaycheckCard.tsx";

export interface DatosPaso1 {
  salario: string;
  desde: string;
  hasta: string;
  auxilio: boolean;
  netoRecibido: string;
  aporteAfc: string;
}

interface Props {
  datos: DatosPaso1;
  onCambio: (datos: DatosPaso1) => void;
  onSiguiente: () => void;
}

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function PasoSalario({ datos, onCambio, onSiguiente }: Props) {
  const listo = Number(datos.salario) > 0 && datos.desde && datos.hasta && datos.desde <= datos.hasta;

  function set<K extends keyof DatosPaso1>(k: K, v: DatosPaso1[K]) {
    onCambio({ ...datos, [k]: v });
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

          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={datos.auxilio}
              onChange={(e) => set("auxilio", e.target.checked)}
              className="w-4 h-4 accent-emerald-500"
            />
            <Bus size={16} className="text-muted" /> Recibo auxilio de transporte
          </label>

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
        </div>
      </PaycheckCard>

      <PaycheckCard titulo="Periodo a revisar">
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span className="flex items-center gap-2">
              <CalendarRange size={16} className="text-mint-dark" /> Desde
            </span>
            <input
              required
              type="date"
              value={datos.desde}
              onChange={(e) => set("desde", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            <span>Hasta</span>
            <input
              required
              type="date"
              value={datos.hasta}
              onChange={(e) => set("hasta", e.target.value)}
              className={inputCls}
            />
          </label>
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
