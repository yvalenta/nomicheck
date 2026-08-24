import { CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Calendar } from "./ui/calendar.tsx";

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  value: string; // YYYY-MM-DD, mismo formato que <input type="date"> — o "" si no hay valor.
  onChange: (fecha: string) => void;
  placeholder?: string;
  required?: boolean;
  /** YYYY-MM-DD — deshabilita fechas anteriores (ej. no retirar antes del ingreso). */
  minimo?: string;
  /** YYYY-MM-DD — deshabilita fechas posteriores (ej. un turno fuera del periodo). */
  maximo?: string;
  /** Clases extra para el botón (ancho en flex/grid: "w-full", "sm:flex-1"). */
  className?: string;
}

// Reemplaza <input type="date"> por un selector con calendario visible (mismo
// componente en toda la app: Calendar + Popover, ya instalados vía shadcn/
// react-day-picker). Sigue produciendo un string YYYY-MM-DD — los llamadores
// no cambian su manejo de estado, solo el input nativo por este.
export default function DateField({ value, onChange, placeholder = "Selecciona una fecha", required, minimo, maximo, className = "" }: Props) {
  const seleccionada = value ? parseISO(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${inputCls} flex items-center justify-between gap-2 text-left ${!value ? "text-muted" : "text-ink"} ${className}`}
        >
          <span>{seleccionada ? format(seleccionada, "d MMM yyyy", { locale: es }) : placeholder}</span>
          <CalendarDays size={16} className="text-muted shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={seleccionada}
          defaultMonth={seleccionada}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          required={required}
          disabled={
            // Array = OR de matchers. Un solo objeto {before, after} seria el
            // INTERVALO entre ambas — lo contrario de lo que se quiere aca.
            minimo || maximo
              ? [
                  ...(minimo ? [{ before: parseISO(minimo) }] : []),
                  ...(maximo ? [{ after: parseISO(maximo) }] : []),
                ]
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
