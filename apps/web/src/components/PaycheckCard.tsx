import type { ReactNode } from "react";

interface Props {
  titulo?: string;
  children: ReactNode;
  className?: string;
}

export default function PaycheckCard({ titulo, children, className = "" }: Props) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}>
      {titulo && (
        <h3 className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {titulo}
        </h3>
      )}
      <div className="px-2 pb-2">{children}</div>
    </section>
  );
}
