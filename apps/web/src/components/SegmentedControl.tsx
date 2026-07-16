interface Props<T extends string> {
  opciones: { valor: T; etiqueta: string }[];
  activo: T;
  onCambio: (valor: T) => void;
}

export default function SegmentedControl<T extends string>({ opciones, activo, onCambio }: Props<T>) {
  return (
    <div className="inline-flex rounded-full bg-slate-200/70 p-1 gap-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          onClick={() => onCambio(o.valor)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ease-in-out ${
            activo === o.valor
              ? "bg-white text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
