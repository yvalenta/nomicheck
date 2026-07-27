import type { EstadoPeriodo } from "../../apiEmpresa";

// Badge de estado del periodo, compartido por la lista y el detalle (antes el
// mapa de etiquetas/clases vivía suelto dentro de PeriodosEmpresa). Cuando el
// periodo está liquidando acepta un `progreso` y lo muestra inline: el usuario
// ve avanzar el porcentaje sin abrir el periodo.
export const ESTADO_ETIQUETA: Record<EstadoPeriodo, string> = {
  borrador: "Borrador",
  liquidando: "Liquidando…",
  liquidado: "Liquidado",
  liquidado_con_rechazos: "Con rechazos",
  fallido: "Falló",
  pagado: "Pagado",
};

export const ESTADO_CLASE: Record<EstadoPeriodo, string> = {
  borrador: "bg-slate-100 text-muted",
  liquidando: "bg-mint-light/60 text-mint-dark",
  liquidado: "bg-emerald-50 text-mint-dark",
  liquidado_con_rechazos: "bg-amber-50 text-amber-800",
  fallido: "bg-red-50 text-coral",
  pagado: "bg-blue-50 text-blue-600",
};

export default function BadgeEstado({
  estado,
  progreso,
}: {
  estado: EstadoPeriodo;
  /** Solo se usa en `liquidando`: muestra el % y una barra fina bajo el texto. */
  progreso?: number;
}) {
  const enCurso = estado === "liquidando";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${ESTADO_CLASE[estado]}`}
    >
      <span className="flex items-center gap-1.5">
        {enCurso && (
          <span className="h-1.5 w-1.5 rounded-full bg-mint-dark animate-pulse" aria-hidden="true" />
        )}
        {ESTADO_ETIQUETA[estado]}
        {enCurso && progreso != null && <span className="opacity-70">{progreso}%</span>}
      </span>
      {enCurso && progreso != null && (
        <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-white/70">
          <span
            className="block h-full bg-mint-dark transition-[width] duration-500 ease-out"
            style={{ width: `${progreso}%` }}
          />
        </span>
      )}
    </span>
  );
}
