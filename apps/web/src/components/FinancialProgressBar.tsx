import { esDevengoBase, formatCOP, type ResultadoNomina } from "@pv/reglas";

// Barra proporcional: [base índigo][recargos/extras ámbar][deducciones coral].
//
// La base era `bg-blue-500` — un azul de Tailwind ajeno a los tokens, y desde
// que la acción pasó a índigo quedaba a un paso del segmento de al lado: dos
// segmentos casi del mismo color no son una comparación. Ahora el trío sale
// del semáforo de la casa: índigo lo que se devenga por contrato, ámbar lo que
// se suma por tiempo trabajado, coral lo que se descuenta.
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
        <div className="bg-indigo" style={{ width: pct(base) }} />
        <div className="bg-ambar" style={{ width: pct(recargos) }} />
        <div className="bg-coral" style={{ width: pct(deducciones) }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-quiet">
        <span className="flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-indigo inline-block" /> Base {formatCOP(base)}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-ambar inline-block" /> Recargos y extras{" "}
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
