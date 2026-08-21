import type { ReactNode } from "react";

interface Props {
  titulo?: string;
  children: ReactNode;
  className?: string;
}

// Rediseño 2026-08-20 ("limpio"): filete fino visible en vez de sombra, radio
// contenido, título más quieto. El color dejó de ser decoración en toda la
// app — una card no compite por atención, la información adentro sí.
export default function PaycheckCard({ titulo, children, className = "" }: Props) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 ${className}`}>
      {titulo && (
        <h3 className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {titulo}
        </h3>
      )}
      <div className="px-2 pb-2">{children}</div>
    </section>
  );
}
