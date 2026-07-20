import { CalendarRange } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { formatRangoFechas } from "@pv/reglas";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Calendar } from "./ui/calendar.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  desde: string; // YYYY-MM-DD, o "" si no hay valor.
  hasta: string;
  onCambio: (desde: string, hasta: string) => void;
  placeholder?: string;
  required?: boolean;
}

// Un solo calendario en modo "range" para elegir un período (desde/hasta) de
// un clic: mismo Popover + Calendar que DateField, pero con dos meses
// visibles y la franja entre extremos resaltada — reemplaza el patrón de dos
// DateField lado a lado para todo lo que es literalmente "un período"
// (periodo de nómina, periodo a revisar).
export default function DateRangeField({ desde, hasta, onCambio, placeholder = "Selecciona un período", required }: Props) {
  const rango = {
    from: desde ? parseISO(desde) : undefined,
    to: hasta ? parseISO(hasta) : undefined,
  };
  const hayRango = desde && hasta;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-required={required}
          className={`${inputCls} flex items-center justify-between gap-2 text-left ${!hayRango ? "text-muted" : "text-ink"}`}
        >
          <span>
            {hayRango
              ? formatRangoFechas(desde, hasta)
              : desde
                ? `${format(rango.from!, "d MMM yyyy", { locale: es })} — …`
                : placeholder}
          </span>
          <CalendarRange size={16} className="text-muted shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={rango}
          defaultMonth={rango.from}
          onSelect={(r) => {
            onCambio(r?.from ? format(r.from, "yyyy-MM-dd") : "", r?.to ? format(r.to, "yyyy-MM-dd") : "");
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
