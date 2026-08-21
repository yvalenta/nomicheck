import { useMemo, useState } from "react";
import { formatCOP, formatFechaLegible, type DetalleDia } from "@pv/reglas";
import PaycheckCard from "./PaycheckCard.tsx";

interface Props {
  dias: DetalleDia[];
}

// Lunes = 0 … domingo = 6. La semana laboral colombiana se cuenta de lunes a
// domingo (mismo criterio que usa el motor para el tope semanal de extras).
function indiceLunes(fecha: string): number {
  return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

// Intensidad relativa al día más largo del periodo — no a una escala fija:
// una jornada de 7 h debe verse "llena" si nadie trabajó más que eso.
function tono(horas: number, maxHoras: number): string {
  if (horas <= 0) return "var(--color-surface)";
  const t = maxHoras > 0 ? horas / maxHoras : 0;
  // 0.14 → 1.0 de opacidad sobre el índigo de marca.
  return `color-mix(in srgb, var(--color-indigo) ${Math.round((0.14 + t * 0.86) * 100)}%, white)`;
}

export default function HeatmapDias({ dias }: Props) {
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const maxHoras = useMemo(() => Math.max(...dias.map((d) => d.horasTotales), 0), [dias]);
  const detalle = dias.find((d) => d.fecha === seleccion);

  const totales = useMemo(
    () =>
      dias.reduce(
        (acc, d) => ({
          horas: acc.horas + d.horasTotales,
          extra: acc.extra + d.horasExtra,
          conTurno: acc.conTurno + (d.trabajado ? 1 : 0),
        }),
        { horas: 0, extra: 0, conTurno: 0 }
      ),
    [dias]
  );

  if (dias.length === 0) return null;

  // Celdas vacías antes del primer día, para que la columna del calendario
  // caiga en su día de la semana real.
  const relleno = indiceLunes(dias[0].fecha);

  return (
    <PaycheckCard>
      <div className="px-3.5 py-3.5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Días del periodo</h3>
          <p className="text-xs text-muted">
            {totales.conTurno} con turno · {totales.horas} h
            {totales.extra > 0 ? ` · ${totales.extra} h extra` : ""}
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="text-[10px] text-muted text-center font-medium pb-0.5">
              {d}
            </div>
          ))}

          {Array.from({ length: relleno }, (_, i) => (
            <div key={`v${i}`} />
          ))}

          {dias.map((d) => {
            const activo = d.fecha === seleccion;
            const numero = Number(d.fecha.slice(8, 10));
            const claro = maxHoras > 0 && d.horasTotales / maxHoras > 0.55;
            return (
              <button
                key={d.fecha}
                onClick={() => setSeleccion(activo ? null : d.fecha)}
                aria-label={`${formatFechaLegible(d.fecha)}: ${d.horasTotales} horas`}
                aria-pressed={activo}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-150 border ${
                  activo
                    ? "border-mint ring-2 ring-mint/30 scale-105"
                    : "border-slate-200/70 hover:border-mint/50"
                }`}
                style={{ background: tono(d.horasTotales, maxHoras) }}
              >
                <span
                  className={`text-[11px] font-semibold leading-none ${claro ? "text-white" : "text-ink"}`}
                >
                  {numero}
                </span>
                {d.horasTotales > 0 && (
                  <span
                    className={`text-[9px] font-mono leading-none mt-0.5 ${claro ? "text-white/85" : "text-muted"}`}
                  >
                    {d.horasTotales}h
                  </span>
                )}
                {/* El punto marca descanso obligatorio: es el dato con
                    consecuencia legal (recargo del 90%, CST art. 179). */}
                {d.esDominicalFestivo && (
                  <span
                    className={`w-1 h-1 rounded-full mt-0.5 ${
                      d.trabajado ? "bg-ambar" : claro ? "bg-white/50" : "bg-slate-300"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-ambar" /> dominical/festivo trabajado
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-300" /> descanso obligatorio
          </span>
          <span className="flex items-center gap-1 ml-auto">
            menos
            <span className="inline-flex gap-0.5">
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <span
                  key={t}
                  className="w-2.5 h-2.5 rounded-sm border border-slate-200/70"
                  style={{ background: tono(t, 1) }}
                />
              ))}
            </span>
            más
          </span>
        </div>

        {detalle ? (
          <div className="rounded-xl bg-indigo-soft/60 border border-indigo/10 p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-ink">
                {formatFechaLegible(detalle.fecha)}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {detalle.esFestivo && <Etiqueta tono="ambar">Festivo</Etiqueta>}
                {detalle.esDominicalFestivo && !detalle.esFestivo && (
                  <Etiqueta tono="ambar">Domingo</Etiqueta>
                )}
                {!detalle.trabajado && !detalle.ausenciaNoRemunerada && (
                  <Etiqueta tono="slate">Descanso</Etiqueta>
                )}
                {detalle.ausenciaNoRemunerada && (
                  <Etiqueta tono="coral">Ausencia no remunerada</Etiqueta>
                )}
              </div>
            </div>

            {detalle.trabajado ? (
              <div className="flex gap-4 text-xs">
                <Dato etiqueta="Ordinarias" valor={`${detalle.horasOrdinarias} h`} />
                {detalle.horasExtra > 0 && (
                  <Dato etiqueta="Extra" valor={`${detalle.horasExtra} h`} />
                )}
                {detalle.horasNocturnas > 0 && (
                  <Dato etiqueta="Nocturnas" valor={`${detalle.horasNocturnas} h`} />
                )}
                <Dato etiqueta="Total" valor={`${detalle.horasTotales} h`} destacado />
              </div>
            ) : (
              <p className="text-xs text-muted">
                Sin turno. El salario del día se paga igual — el descanso dominical y
                los festivos son remunerados (CST art. 172 y 177).
              </p>
            )}

            <div className="flex flex-col gap-1 text-xs border-t border-indigo/10 pt-2">
              <Fila etiqueta="Salario del día" valor={detalle.salarioDia} />
              {detalle.auxilioDia > 0 && (
                <Fila etiqueta="Auxilio de transporte" valor={detalle.auxilioDia} />
              )}
              {detalle.recargosDia > 0 && (
                <Fila etiqueta="Recargos y extras" valor={detalle.recargosDia} />
              )}
              <Fila etiqueta="Salud y pensión" valor={-detalle.deduccionesDia} />
              <div className="flex justify-between font-semibold text-ink pt-1 border-t border-indigo/10 mt-0.5">
                <span>Neto del día</span>
                <span className="font-mono tabular-nums">{formatCOP(detalle.netoDia)}</span>
              </div>
            </div>

            <p className="text-[10px] text-muted leading-snug">
              Reparto informativo. La nómina no se liquida por día: el salario y el
              auxilio remuneran el mes y acá se reparten entre los días del periodo;
              salud y pensión se calculan sobre el IBC completo. Solo las horas y sus
              recargos son propios del día.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted text-center py-1">
            Toca un día para ver sus horas y cuánto aporta al pago.
          </p>
        )}
      </div>
    </PaycheckCard>
  );
}

function Etiqueta({ children, tono }: { children: React.ReactNode; tono: "ambar" | "slate" | "coral" }) {
  const clases = {
    ambar: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-muted",
    coral: "bg-red-100 text-coral",
  }[tono];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${clases}`}>{children}</span>;
}

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted">{etiqueta}</span>
      <span className={`font-mono tabular-nums ${destacado ? "font-semibold text-ink" : "text-ink"}`}>
        {valor}
      </span>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  const negativo = valor < 0;
  return (
    <div className="flex justify-between">
      <span className="text-muted">{etiqueta}</span>
      <span className={`font-mono tabular-nums ${negativo ? "text-coral" : "text-ink"}`}>
        {negativo ? "−" : ""}
        {formatCOP(Math.abs(valor))}
      </span>
    </div>
  );
}
