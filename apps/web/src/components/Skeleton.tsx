// Placeholder animado que imita la forma del contenido mientras carga —
// reemplaza los "Cargando…" de texto plano (mejor percepción de velocidad,
// ya no hay salto de layout cuando llega la data real).
function Barra({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

// Una fila tipo "tarjeta de lista" — nombre + línea secundaria + valor a la
// derecha. Cubre el caso más común: colaboradores, contratistas, periodos.
export function SkeletonFila() {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3.5 border-b border-borde last:border-0">
      <div className="flex flex-col gap-1.5 flex-1">
        <Barra className="h-4 w-1/3" />
        <Barra className="h-3 w-1/5" />
      </div>
      <Barra className="h-4 w-16" />
    </div>
  );
}

export default function Skeleton({ filas = 3 }: { filas?: number }) {
  return (
    <div>
      {Array.from({ length: filas }, (_, i) => (
        <SkeletonFila key={i} />
      ))}
    </div>
  );
}
