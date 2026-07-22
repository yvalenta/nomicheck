/** Select nativo con estilo consistente para filtros — la opción vacía
 * ("Todas", "Cualquiera"…) representa "sin filtro" y es la que devuelve el
 * value "" que useFiltrosUrl borra automáticamente del URL. */
export default function SelectFiltro<T extends string>({
  value,
  onChange,
  opciones,
  todasLabel = "Todas",
  className = "",
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  opciones: { valor: T; etiqueta: string }[];
  todasLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T | "")}
      className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint ${className}`}
    >
      <option value="">{todasLabel}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}
