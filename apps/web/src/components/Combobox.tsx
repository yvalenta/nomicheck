import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export interface OpcionCombobox {
  value: string;
  label: string;
  descripcion?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionCombobox[];
  placeholder?: string;
  buscarPlaceholder?: string;
}

// Select con filtro por texto — mismo Popover que DateField, sin dependencias
// nuevas. Pensado para listas donde escanear un <select> largo es más lento
// que escribir 2-3 letras (ej. tipo de contrato, catálogo de conceptos).
export default function Combobox({ value, onChange, opciones, placeholder = "Selecciona una opción", buscarPlaceholder = "Buscar…" }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const seleccionada = opciones.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => o.label.toLowerCase().includes(q));
  }, [opciones, busqueda]);

  return (
    <Popover onOpenChange={(open) => !open && setBusqueda("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${inputCls} flex items-center justify-between gap-2 text-left w-full ${!seleccionada ? "text-muted" : "text-ink"}`}
        >
          <span className="truncate">{seleccionada?.label ?? placeholder}</span>
          <ChevronsUpDown size={16} className="text-muted shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-borde">
          <Search size={14} className="text-muted shrink-0" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={buscarPlaceholder}
            className="flex-1 text-sm outline-none placeholder:text-muted"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtradas.length === 0 && <p className="text-xs text-muted px-3 py-3 text-center">Sin resultados.</p>}
          {filtradas.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors duration-150"
            >
              <Check size={14} className={`shrink-0 ${o.value === value ? "text-mint-dark" : "text-transparent"}`} />
              <span className="flex flex-col">
                <span className="text-ink">{o.label}</span>
                {o.descripcion && <span className="text-xs text-muted">{o.descripcion}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
