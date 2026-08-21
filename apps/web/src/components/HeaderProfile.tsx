import type { ReactNode } from "react";
import { History } from "lucide-react";
import Sello from "./Sello.tsx";

interface Props {
  periodo?: { desde: string; hasta: string };
  paso?: string;
  mostrarMisLiquidaciones?: boolean;
  onVerMisLiquidaciones?: () => void;
  /** Acción del lado derecho (ej. BotonCerrarSesion cuando hay sesión). */
  accion?: ReactNode;
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]} ${y}`;
}

export default function HeaderProfile({ periodo, paso, mostrarMisLiquidaciones, onVerMisLiquidaciones, accion }: Props) {
  return (
    <header className="bg-midnight bg-dots text-white">
      <div className="max-w-3xl mx-auto px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sello size={38} variante="midnight" />
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight leading-none">NomiCheck</h1>
            <p className="text-xs text-slate-400 mt-1">Tu nómina, verificada</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {mostrarMisLiquidaciones && (
            <button
              onClick={onVerMisLiquidaciones}
              className="flex items-center gap-1.5 text-xs font-medium text-mint hover:underline shrink-0"
            >
              <History size={14} /> Mis liquidaciones
            </button>
          )}
          <div className="text-right">
            {periodo ? (
              <>
                <p className="text-xs text-slate-400">Periodo</p>
                <p className="text-sm font-semibold">
                  {formatFecha(periodo.desde)} — {formatFecha(periodo.hasta)}
                </p>
              </>
            ) : (
              paso && <p className="text-xs text-slate-400">{paso}</p>
            )}
          </div>
          {accion}
        </div>
      </div>
    </header>
  );
}
