import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Referencia legal con ayuda contextual: el texto de la ley se muestra con
// subrayado punteado; al pasar el mouse o enfocar con teclado aparece una
// burbuja con la explicación. Posición fija calculada desde el trigger para no
// recortarse dentro de un modal con scroll. Patrón "tooltip/hint" (namethatui).
interface Props {
  ley: string;
  children: ReactNode; // explicación
}

export default function LegalRef({ ley, children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  function mostrar() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom + 6 });
    setAbierto(true);
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={mostrar}
        onMouseLeave={() => setAbierto(false)}
        onFocus={mostrar}
        onBlur={() => setAbierto(false)}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-mint border-b border-dotted border-mint/60 leading-tight cursor-help focus:outline-none focus:ring-2 focus:ring-mint/40 rounded-sm"
      >
        {ley}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      {abierto &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[90] w-64 max-w-[80vw] rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-ink shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
            style={{ left: pos.x, top: pos.y }}
          >
            <p className="font-mono text-[11px] font-semibold text-mint mb-1">{ley}</p>
            <p className="text-muted">{children}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
