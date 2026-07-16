import { ShieldCheck } from "lucide-react";

interface Props {
  periodo?: { desde: string; hasta: string };
  paso?: string;
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]} ${y}`;
}

export default function HeaderProfile({ periodo, paso }: Props) {
  return (
    <header className="bg-midnight bg-dots text-white">
      <div className="max-w-3xl mx-auto px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-mint/15 border border-mint/30 flex items-center justify-center">
            <ShieldCheck size={22} className="text-mint" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">NomiCheck</h1>
            <p className="text-xs text-slate-400 mt-1">Tu nómina, verificada</p>
          </div>
        </div>
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
      </div>
    </header>
  );
}
