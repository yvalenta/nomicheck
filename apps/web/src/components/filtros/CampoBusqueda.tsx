import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/** Input de búsqueda con debounce interno: el usuario tipea sin gatillar un
 * fetch por cada tecla. El commit al padre solo ocurre después de `debounceMs`
 * de inactividad (default 250ms) — cómodo para la mano, sigiloso con el server. */
export default function CampoBusqueda({
  value,
  onChange,
  placeholder = "Buscar…",
  debounceMs = 250,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);

  // El padre puede resetear el valor (ej. cambio de tab); sincroniza si
  // difiere del local — sin esta línea, resetar desde afuera no limpia el input.
  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (local === value) return;
    const t = window.setTimeout(() => onChange(local), debounceMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative flex-1 min-w-[10rem]">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-ink/15 bg-white pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint"
      />
      {local && (
        <button
          type="button"
          onClick={() => setLocal("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
          aria-label="Limpiar"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
