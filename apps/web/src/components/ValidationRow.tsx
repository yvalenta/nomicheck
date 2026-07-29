import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Bus,
  CalendarDays,
  CalendarX,
  HandCoins,
  HeartPulse,
  Moon,
  PiggyBank,
  Sun,
  Sunrise,
} from "lucide-react";
import { formatCOP, type CodigoConcepto, type LineaResultado } from "@pv/reglas";

// Ícono por CÓDIGO, no por etiqueta: reescribir un texto ya no cambia el
// ícono, y el compilador avisa si el motor agrega un concepto sin ícono.
const ICONOS: Partial<Record<CodigoConcepto, LucideIcon>> = {
  SALARIO_BASE: Banknote,
  AUXILIO_SOSTENIMIENTO: Banknote,
  AUXILIO_TRANSPORTE: Bus,
  HONORARIOS: Banknote,
  RECARGO_NOCTURNO: Moon,
  RECARGO_NOCTURNO_DOMINICAL: Moon,
  RECARGO_DOMINICAL: CalendarDays,
  HORA_EXTRA_NOCTURNA: Moon,
  HORA_EXTRA_DOMINICAL_DIURNA: CalendarDays,
  HORA_EXTRA_DOMINICAL_NOCTURNA: CalendarDays,
  HORA_EXTRA_DIURNA: Sunrise,
  AJUSTE_AUSENTISMO: CalendarX,
  SALUD_EMPLEADO: HeartPulse,
  PENSION_EMPLEADO: PiggyBank,
  FONDO_SOLIDARIDAD: HandCoins,
};

function iconoDe(codigo: CodigoConcepto): LucideIcon {
  return ICONOS[codigo] ?? Sun;
}

// Fórmula legible para el tooltip, armada con los datos que expone el motor.
function formulaDe(l: LineaResultado): string | null {
  const pct = l.recargoPct !== undefined ? `${(l.recargoPct * 100).toFixed(0)}%` : null;
  if (l.horas !== undefined && pct) {
    const esExtra = l.codigo.startsWith("HORA_EXTRA");
    return `${l.horas} h × valor hora × ${esExtra ? `(100% + ${pct})` : pct}`;
  }
  if (l.base !== undefined && pct) return `${formatCOP(l.base)} × ${pct}`;
  if (l.base !== undefined) return `Base: ${formatCOP(l.base)}`;
  return null;
}

export default function ValidationRow({ linea }: { linea: LineaResultado }) {
  const Icono = iconoDe(linea.codigo);
  const esDeduccion = linea.tipo === "deduccion";
  const formula = formulaDe(linea);

  return (
    <div className="group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-colors duration-200 ease-in-out hover:bg-slate-50">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          esDeduccion ? "bg-red-50 text-coral" : "bg-emerald-50 text-mint-dark"
        }`}
      >
        <Icono size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{linea.concepto}</p>
        {linea.ley && <p className="text-xs text-muted truncate">{linea.ley}</p>}
      </div>

      {linea.horas !== undefined && (
        <span className="text-xs font-semibold bg-slate-100 text-muted rounded-full px-2 py-0.5 shrink-0">
          {linea.horas} h
        </span>
      )}

      <p
        className={`text-sm font-semibold tabular-nums shrink-0 ${
          esDeduccion ? "text-coral" : "text-ink"
        }`}
      >
        {esDeduccion ? "−" : ""}
        {formatCOP(linea.valorCalculado)}
      </p>

      {formula && (
        <div className="pointer-events-none absolute -top-8 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-in-out bg-midnight text-white text-xs rounded-lg px-3 py-1.5 shadow-lg whitespace-nowrap z-10">
          {formula}
        </div>
      )}
    </div>
  );
}
