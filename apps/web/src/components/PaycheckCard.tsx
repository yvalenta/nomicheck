import type { ReactNode } from "react";

interface Props {
  titulo?: string;
  children: ReactNode;
  className?: string;
}

// Rediseño 2026-08-20 ("limpio") + blueprint 2026-08: filete AÚN más fino
// (borde derivado de midnight) con la sombra suave de la dirección C — el
// contacto de 1px y la luz ambiental de 24px. Radio de card fijo en 16px.
// El título es la tinta terciaria en 12px: etiqueta, no titular.
export default function PaycheckCard({ titulo, children, className = "" }: Props) {
  return (
    <section className={`bg-white rounded-2xl border border-borde shadow-suave ${className}`}>
      {titulo && (
        <h3 className="px-5 pt-4 pb-1 text-xs font-medium uppercase tracking-[0.06em] text-quiet">
          {titulo}
        </h3>
      )}
      <div className="px-2 pb-2">{children}</div>
    </section>
  );
}
