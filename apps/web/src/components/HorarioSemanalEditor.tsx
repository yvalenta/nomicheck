import type { HorarioDia } from "@pv/reglas";
import PaycheckCard from "./PaycheckCard.tsx";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const timeCls =
  "rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-mint/40 transition-shadow duration-200 disabled:opacity-40";

interface Props {
  horarioBase: (HorarioDia | null)[];
  onCambio: (h: (HorarioDia | null)[]) => void;
  titulo?: string;
  ayuda?: string;
}

// Editor del horario semanal habitual (Dom-Sáb, null = descanso). Compartido
// por el wizard anónimo (PasoSemana.tsx) y la captura de turnos en modo
// empresa (PeriodosEmpresa.tsx) — antes solo existía en el wizard.
export default function HorarioSemanalEditor({ horarioBase, onCambio, titulo, ayuda }: Props) {
  function setDia(idx: number, cambios: (Partial<HorarioDia> & { descanso?: boolean }) | undefined) {
    const nuevo = [...horarioBase];
    if (!cambios || cambios.descanso !== undefined) {
      nuevo[idx] = cambios?.descanso ? null : { horaInicio: "10:00", horaFin: "17:00" };
    } else if (nuevo[idx]) {
      nuevo[idx] = {
        horaInicio: cambios.horaInicio ?? nuevo[idx]!.horaInicio,
        horaFin: cambios.horaFin ?? nuevo[idx]!.horaFin,
      };
    }
    onCambio(nuevo);
  }

  const contenido = (
    <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
      {DIAS_SEMANA.map((nombre, idx) => {
        const h = horarioBase[idx];
        return (
          <div key={nombre} className="flex items-center gap-3">
            <span className="w-9 text-sm font-semibold text-ink">{nombre}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={h !== null}
                onChange={(e) => setDia(idx, { descanso: !e.target.checked })}
                className="w-4 h-4 accent-emerald-500"
              />
              {h ? "Trabajo" : "Descanso"}
            </label>
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                type="time"
                disabled={!h}
                value={h?.horaInicio ?? ""}
                onChange={(e) => setDia(idx, { horaInicio: e.target.value })}
                className={timeCls}
              />
              <span className="text-xs text-muted">—</span>
              <input
                type="time"
                disabled={!h}
                value={h?.horaFin ?? ""}
                onChange={(e) => setDia(idx, { horaFin: e.target.value })}
                className={timeCls}
              />
            </div>
          </div>
        );
      })}
      {ayuda && <p className="text-xs text-muted mt-1">{ayuda}</p>}
    </div>
  );

  return titulo ? <PaycheckCard titulo={titulo}>{contenido}</PaycheckCard> : contenido;
}
