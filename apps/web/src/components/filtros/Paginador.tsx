import { ChevronLeft, ChevronRight } from "lucide-react";

/** Paginador simple: [◀ 3 / 12 ▶] con contador y navegación. Se oculta si
 * hay una sola página — no llena la UI cuando no hace falta. La ventana de
 * páginas la calcula el llamador (max(1, ceil(total/limit))). */
export default function Paginador({
  page,
  total,
  limit,
  onCambio,
}: {
  page: number;
  total: number;
  limit: number;
  onCambio: (page: number) => void;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  if (totalPaginas <= 1 && total <= limit) {
    return (
      <p className="text-xs text-muted text-center py-1">
        {total} resultado{total === 1 ? "" : "s"}
      </p>
    );
  }
  const anterior = () => onCambio(Math.max(1, page - 1));
  const siguiente = () => onCambio(Math.min(totalPaginas, page + 1));
  const inicio = (page - 1) * limit + 1;
  const fin = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-xs text-muted">
        {inicio}–{fin} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={anterior}
          disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-ink disabled:text-muted disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-ink tabular-nums px-2">
          {page} / {totalPaginas}
        </span>
        <button
          onClick={siguiente}
          disabled={page >= totalPaginas}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-ink disabled:text-muted disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label="Siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
