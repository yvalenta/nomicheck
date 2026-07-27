interface Props<T extends string> {
  opciones: { valor: T; etiqueta: string }[];
  activo: T;
  onCambio: (valor: T) => void;
  /** Se dispara al pasar el mouse / enfocar una opción inactiva. Lo usa el
   * panel para precargar el chunk de esa sección: cuando el usuario finalmente
   * hace clic, el JS ya está en caché y el cambio se siente instantáneo. */
  onPreparar?: (valor: T) => void;
}

export default function SegmentedControl<T extends string>({
  opciones,
  activo,
  onCambio,
  onPreparar,
}: Props<T>) {
  return (
    // Con muchas secciones la fila no cabe en móvil: scroll horizontal propio
    // (sin barra visible) en vez de romper el layout o apilar en dos líneas.
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex rounded-full bg-slate-200/70 p-1 gap-1">
        {opciones.map((o) => (
          <button
            key={o.valor}
            onClick={() => onCambio(o.valor)}
            onMouseEnter={() => activo !== o.valor && onPreparar?.(o.valor)}
            onFocus={() => activo !== o.valor && onPreparar?.(o.valor)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ease-in-out ${
              activo === o.valor
                ? "bg-white text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
