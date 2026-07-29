import { esDevengoBase, formatCOP, type ResultadoNomina } from "@pv/reglas";

// Barra proporcional: [base azul][recargos/extras mint][deducciones coral].
export default function FinancialProgressBar({ resultado }: { resultado: ResultadoNomina }) {
  const base = resultado.lineas
    .filter((l) => l.tipo === "devengo" && esDevengoBase(l))
    .reduce((s, l) => s + l.valorCalculado, 0);
  const recargos = resultado.totalDevengos - base;
  const deducciones = resultado.totalDeducciones;
  const total = base + recargos + deducciones;
  if (total <= 0) return null;

  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden">
        <div className="bg-blue-500" style={{ width: pct(base) }} />
        <div className="bg-mint" style={{ width: pct(recargos) }} />
        <div className="bg-coral" style={{ width: pct(deducciones) }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Base {formatCOP(base)}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-mint inline-block" /> Recargos y extras{" "}
          {formatCOP(recargos)}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-coral inline-block" /> Deducciones{" "}
          {formatCOP(deducciones)}
        </span>
      </div>
    </div>
  );
}
