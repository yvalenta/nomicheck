import { useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, CheckCircle2, ChevronRight, Plus, Trash2 } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  crearPeriodo,
  guardarTurnos,
  liquidarPeriodo,
  listarEmpleados,
  listarPeriodos,
  listarRecibos,
  obtenerTurnos,
  type Empleado,
  type Periodo,
  type Recibo,
  type Turno,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";
import ValidationRow from "../ValidationRow.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

const ESTADO_ETIQUETA: Record<Periodo["estado"], string> = {
  borrador: "Borrador",
  liquidado: "Liquidado",
  pagado: "Pagado",
};
const ESTADO_CLASE: Record<Periodo["estado"], string> = {
  borrador: "bg-slate-100 text-muted",
  liquidado: "bg-emerald-50 text-mint-dark",
  pagado: "bg-blue-50 text-blue-600",
};

export default function PeriodosEmpresa() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [seleccionado, setSeleccionado] = useState<Periodo | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listarPeriodos()
      .then(setPeriodos)
      .catch((e) => setError(e.message));
  }

  useEffect(recargar, []);

  if (seleccionado) {
    return (
      <DetallePeriodo
        periodo={seleccionado}
        onAtras={() => {
          setSeleccionado(null);
          recargar();
        }}
        onCambio={(p) => setSeleccionado(p)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-ink">Periodos de nómina</h2>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline"
        >
          <Plus size={16} /> Nuevo periodo
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {mostrarForm && (
        <FormPeriodo
          onCreado={(p) => {
            setMostrarForm(false);
            setPeriodos((prev) => [p, ...prev]);
          }}
        />
      )}

      <PaycheckCard>
        {periodos.length === 0 && (
          <p className="text-sm text-muted px-3 py-6 text-center">Aún no tienes periodos creados.</p>
        )}
        <div className="flex flex-col">
          {periodos.map((p) => (
            <button
              key={p.id}
              onClick={() => setSeleccionado(p)}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200 text-left"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  {p.fechaInicio} — {p.fechaFin}
                </p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ESTADO_CLASE[p.estado]}`}>
                {ESTADO_ETIQUETA[p.estado]}
              </span>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function FormPeriodo({ onCreado }: { onCreado: (p: Periodo) => void }) {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <PaycheckCard titulo="Nuevo periodo">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            onCreado(await crearPeriodo({ fechaInicio, fechaFin }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo crear el periodo");
          }
        }}
        className="px-3 pb-3 pt-1 flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <input required type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} />
          <input required type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} />
        </div>
        {error && <p className="text-coral text-sm">{error}</p>}
        <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200">
          <CalendarPlus size={16} /> Crear periodo
        </button>
      </form>
    </PaycheckCard>
  );
}

function DetallePeriodo({
  periodo,
  onAtras,
  onCambio,
}: {
  periodo: Periodo;
  onAtras: () => void;
  onCambio: (p: Periodo) => void;
}) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liquidando, setLiquidando] = useState(false);

  useEffect(() => {
    listarEmpleados().then(setEmpleados);
    if (periodo.estado === "borrador") {
      obtenerTurnos(periodo.id).then(setTurnos);
    } else {
      listarRecibos(periodo.id).then(setRecibos);
    }
  }, [periodo.id, periodo.estado]);

  const empleadosTurnos = empleados.filter((e) => e.tipoNomina === "turnos");

  function agregarTurno() {
    if (empleadosTurnos.length === 0) return;
    setTurnos((prev) => [
      ...prev,
      { empleadoId: empleadosTurnos[0].id, fecha: periodo.fechaInicio, horaInicio: "10:00", horaFin: "17:00" },
    ]);
  }

  function actualizarTurno(i: number, cambios: Partial<Turno>) {
    setTurnos((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...cambios } : t)));
  }

  function quitarTurno(i: number) {
    setTurnos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setError(null);
    try {
      await guardarTurnos(periodo.id, turnos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los turnos");
    }
  }

  async function liquidar() {
    setLiquidando(true);
    setError(null);
    try {
      await guardarTurnos(periodo.id, turnos);
      const nuevos = await liquidarPeriodo(periodo.id);
      setRecibos(nuevos);
      onCambio({ ...periodo, estado: "liquidado" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar el periodo");
    } finally {
      setLiquidando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-1">
        <button onClick={onAtras} className="text-muted hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-bold text-ink">
          {periodo.fechaInicio} — {periodo.fechaFin}
        </h2>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ESTADO_CLASE[periodo.estado]}`}>
          {ESTADO_ETIQUETA[periodo.estado]}
        </span>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {periodo.estado === "borrador" ? (
        <>
          <PaycheckCard titulo="Turnos capturados">
            <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
              {empleadosTurnos.length === 0 && (
                <p className="text-sm text-muted py-3">No tienes colaboradores con nómina por turnos.</p>
              )}
              {turnos.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={t.empleadoId}
                    onChange={(e) => actualizarTurno(i, { empleadoId: Number(e.target.value) })}
                    className={`${inputCls} flex-1`}
                  >
                    {empleadosTurnos.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={t.fecha} onChange={(e) => actualizarTurno(i, { fecha: e.target.value })} className={inputCls} />
                  <input type="time" value={t.horaInicio} onChange={(e) => actualizarTurno(i, { horaInicio: e.target.value })} className={inputCls} />
                  <input type="time" value={t.horaFin} onChange={(e) => actualizarTurno(i, { horaFin: e.target.value })} className={inputCls} />
                  <button onClick={() => quitarTurno(i)} className="text-coral shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={agregarTurno}
                disabled={empleadosTurnos.length === 0}
                className="flex items-center gap-1 text-sm text-mint-dark hover:underline self-start mt-1 disabled:opacity-40"
              >
                <Plus size={16} /> Agregar turno
              </button>
            </div>
          </PaycheckCard>

          <div className="flex gap-3">
            <button
              onClick={guardar}
              className="flex-1 rounded-xl border border-slate-200 bg-white text-ink font-medium py-3 hover:bg-slate-50 transition-colors duration-200"
            >
              Guardar borrador
            </button>
            <button
              onClick={liquidar}
              disabled={liquidando}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
            >
              <CheckCircle2 size={18} /> {liquidando ? "Liquidando…" : "Liquidar periodo"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {recibos.map((r) => (
            <PaycheckCard key={r.id} titulo={r.empleado?.nombre ?? r.contratista?.nombre ?? "—"}>
              <div className="flex flex-col">
                {r.lineas.map((l, i) => (
                  <ValidationRow key={i} linea={l} />
                ))}
              </div>
              <div className="border-t border-slate-100 mx-3 py-2.5 px-3 flex justify-between text-sm font-semibold text-ink">
                <span>Neto</span>
                <span className="tabular-nums">{formatCOP(r.neto)}</span>
              </div>
            </PaycheckCard>
          ))}
        </div>
      )}
    </div>
  );
}
