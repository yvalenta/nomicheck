import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Modal accesible y ligero (patrón shadcn Dialog sin la dependencia): portal a
// <body>, overlay con blur, cierre por Escape / clic-fuera / botón, y bloqueo
// del scroll de fondo. Responsive: hoja centrada en desktop, casi full-width en
// móvil. Reutilizable por cualquier panel del portal.
interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Ancho máximo de la hoja. Default 34rem. */
  maxWidth?: string;
  labelledBy?: string;
}

export default function Modal({ open, onClose, children, maxWidth = "34rem", labelledBy }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-navy/55 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in-0 duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full my-auto rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Botón de cierre estándar para la esquina de la cabecera del modal.
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Cerrar"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-muted transition-colors hover:border-coral hover:text-coral"
    >
      <X size={15} />
    </button>
  );
}
