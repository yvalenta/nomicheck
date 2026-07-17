import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, PartyPopper } from "lucide-react";
import {
  diaSemana,
  rangoFechas,
  type Festivo,
  type HorarioDia,
  type NovedadDia,
} from "@pv/reglas";
import PaycheckCard from "./PaycheckCard.tsx";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface EstadoDia {
  trabajo: boolean;
  horaInicio: string;
  horaFin: string;
  // Solo relevante cuando trabajo=false: por defecto un día no trabajado es
  // descanso remunerado (dominical/festivo). El usuario puede marcarlo como
  // ausentismo NO remunerado — el motor nunca reduce el salario en silencio,
  // agrega una línea de deducción explícita (Regla 2, calculadoraTurnos.ts).
  remunerada: boolean;
}

interface Props {
  desde: string;
  hasta: string;
  horarioBase: (HorarioDia | null)[];
  onCambioHorarioBase: (h: (HorarioDia | null)[]) => void;
  festivos: Festivo[];
  onAtras: () => void;
  onCalcular: (novedades: NovedadDia[]) => void;
}

const timeCls =
  "rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-mint/40 transition-shadow duration-200 disabled:opacity-40";

// Estado por defecto de una fecha según festivos + horario base (misma regla
// que aplica el motor server-side).
function estadoDerivado(
  fecha: string,
  horarioBase: (HorarioDia | null)[],
  festivos: Festivo[]
): EstadoDia {
  const esFestivo = festivos.some((f) => f.fecha === fecha);
  const base = esFestivo ? null : horarioBase[diaSemana(fecha)];
  return base
    ? { trabajo: true, horaInicio: base.horaInicio, horaFin: base.horaFin, remunerada: true }
    : { trabajo: false, horaInicio: "10:00", horaFin: "17:00", remunerada: true };
}

export default function PasoSemana({
  desde,
  hasta,
  horarioBase,
  onCambioHorarioBase,
  festivos,
  onAtras,
  onCalcular,
}: Props) {
  const fechas = useMemo(() => rangoFechas(desde, hasta), [desde, hasta]);
  // Solo guardamos los días que el usuario tocó; el resto sigue al horario base.
  const [overrides, setOverrides] = useState<Record<string, EstadoDia>>({});

  function estadoDe(fecha: string): EstadoDia {
    return overrides[fecha] ?? estadoDerivado(fecha, horarioBase, festivos);
  }

  function setDia(fecha: string, cambios: Partial<EstadoDia>) {
    setOverrides((prev) => ({ ...prev, [fecha]: { ...estadoDe(fecha), ...cambios } }));
  }

  function setBase(idx: number, cambios: Partial<EstadoDia> & { descanso?: boolean }) {
    const nuevo = [...horarioBase];
    if (cambios.descanso !== undefined) {
      nuevo[idx] = cambios.descanso ? null : { horaInicio: "10:00", horaFin: "17:00" };
    } else if (nuevo[idx]) {
      nuevo[idx] = {
        horaInicio: cambios.horaInicio ?? nuevo[idx]!.horaInicio,
        horaFin: cambios.horaFin ?? nuevo[idx]!.horaFin,
      };
    }
    onCambioHorarioBase(nuevo);
    setOverrides({}); // el horario base cambió: los días vuelven a derivarse
  }

  function calcular() {
    // Novedad = día cuyo estado difiere del derivado del horario base.
    const novedades: NovedadDia[] = [];
    for (const fecha of fechas) {
      const derivado = estadoDerivado(fecha, horarioBase, festivos);
      const actual = estadoDe(fecha);
      const difiere =
        actual.trabajo !== derivado.trabajo ||
        (actual.trabajo &&
          (actual.horaInicio !== derivado.horaInicio || actual.horaFin !== derivado.horaFin)) ||
        (!actual.trabajo && actual.remunerada !== derivado.remunerada);
      if (difiere) {
        novedades.push(
          actual.trabajo
            ? { fecha, trabajo: true, horaInicio: actual.horaInicio, horaFin: actual.horaFin }
            : { fecha, trabajo: false, remunerada: actual.remunerada }
        );
      }
    }
    onCalcular(novedades);
  }

  function etiquetaFecha(fecha: string): string {
    const [, m, d] = fecha.split("-").map(Number);
    return `${DIAS_SEMANA[diaSemana(fecha)]} ${d} ${MESES[m - 1]}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PaycheckCard titulo="Tu semana habitual">
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
                    onChange={(e) => setBase(idx, { descanso: !e.target.checked })}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  {h ? "Trabajo" : "Descanso"}
                </label>
                <div className="flex items-center gap-1.5 ml-auto">
                  <input
                    type="time"
                    disabled={!h}
                    value={h?.horaInicio ?? ""}
                    onChange={(e) => setBase(idx, { horaInicio: e.target.value })}
                    className={timeCls}
                  />
                  <span className="text-xs text-muted">—</span>
                  <input
                    type="time"
                    disabled={!h}
                    value={h?.horaFin ?? ""}
                    onChange={(e) => setBase(idx, { horaFin: e.target.value })}
                    className={timeCls}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted mt-1">
            Este es tu horario normal. Abajo puedes ajustar días puntuales que fueron distintos.
          </p>
        </div>
      </PaycheckCard>

      <PaycheckCard titulo={`Días del periodo (${fechas.length})`}>
        <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5 max-h-80 overflow-y-auto">
          {fechas.map((fecha) => {
            const festivo = festivos.find((f) => f.fecha === fecha);
            const estado = estadoDe(fecha);
            const tocado = fecha in overrides;
            return (
              <div
                key={fecha}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-200 ${
                  tocado ? "bg-emerald-50/60" : "hover:bg-slate-50"
                }`}
              >
                <span className="w-20 text-xs font-medium text-ink shrink-0">
                  {etiquetaFecha(fecha)}
                </span>
                {festivo && (
                  <span title={festivo.nombre}>
                    <PartyPopper size={13} className="text-amber-500 shrink-0" />
                  </span>
                )}
                <label className="flex items-center gap-1 text-xs text-muted shrink-0">
                  <input
                    type="checkbox"
                    checked={estado.trabajo}
                    onChange={(e) => setDia(fecha, { trabajo: e.target.checked })}
                    className="w-3.5 h-3.5 accent-emerald-500"
                  />
                  {estado.trabajo ? "Trabajé" : festivo ? "Festivo" : "Descansé"}
                </label>
                {!estado.trabajo && !festivo && (
                  <label className="flex items-center gap-1 text-xs text-coral shrink-0" title="El salario básico no se reduce en silencio: se agrega una línea de deducción explícita por este día.">
                    <input
                      type="checkbox"
                      checked={!estado.remunerada}
                      onChange={(e) => setDia(fecha, { remunerada: !e.target.checked })}
                      className="w-3.5 h-3.5 accent-coral"
                    />
                    Ausentismo no remunerado
                  </label>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="time"
                    disabled={!estado.trabajo}
                    value={estado.trabajo ? estado.horaInicio : ""}
                    onChange={(e) => setDia(fecha, { horaInicio: e.target.value })}
                    className={timeCls}
                  />
                  <input
                    type="time"
                    disabled={!estado.trabajo}
                    value={estado.trabajo ? estado.horaFin : ""}
                    onChange={(e) => setDia(fecha, { horaFin: e.target.value })}
                    className={timeCls}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </PaycheckCard>

      <div className="flex gap-3">
        <button
          onClick={onAtras}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-ink font-medium px-5 py-3.5 hover:bg-slate-50 transition-colors duration-200"
        >
          <ArrowLeft size={18} /> Atrás
        </button>
        <button
          onClick={calcular}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out"
        >
          Calcular mi nómina <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
