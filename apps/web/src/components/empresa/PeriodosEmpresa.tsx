import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { diaSemana, formatCOP, formatRangoFechas, HORARIO_BASE_DEFAULT, rangoFechas, type Festivo, type HorarioDia, type ResultadoNomina } from "@pv/reglas";
import { listarFestivos } from "../../api";
import {
  crearPeriodo,
  editarPeriodo,
  guardarEmpleadosIncluidos,
  guardarTurnos,
  liquidarPeriodo,
  listarEmpleados,
  listarPeriodos,
  listarRecibos,
  obtenerEmpleadosIncluidos,
  obtenerTurnos,
  revertirPeriodo,
  type Empleado,
  type IssueQA,
  type Periodo,
  type Recibo,
  type RechazoQA,
  type RespuestaPaginada,
  type Turno,
} from "../../apiEmpresa";
import SelectFiltro from "../filtros/SelectFiltro.tsx";
import Paginador from "../filtros/Paginador.tsx";
import { useFiltrosUrl } from "../filtros/useFiltrosUrl.ts";
import PaycheckCard from "../PaycheckCard.tsx";
import ValidationRow from "../ValidationRow.tsx";
import ComprobanteNomina from "../ComprobanteNomina.tsx";
import DateRangeField from "../DateRangeField.tsx";
import EmptyState from "../EmptyState.tsx";
import HorarioSemanalEditor from "../HorarioSemanalEditor.tsx";

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

// El comprobante imprimible (ComprobanteNomina) trabaja sobre la forma
// ResultadoNomina del motor — el Recibo de Prisma no la tiene exactamente
// (viene de la persistencia, no del cálculo en vivo), así que se adapta
// aquí en vez de duplicar la lógica de armado en el backend.
function comoResultadoNomina(r: Recibo): ResultadoNomina {
  return {
    modo: r.empleado?.tipoNomina === "turnos" ? "turnos" : "salario-fijo",
    periodoDesde: "",
    periodoHasta: "",
    salarioBasicoMensual: r.empleado?.salarioBase ?? r.contratista?.honorariosMensuales ?? 0,
    lineas: r.lineas,
    totalDevengos: r.totalDevengado,
    totalDeducciones: r.totalDeducido,
    netoEsperado: r.neto,
    advertencias: r.advertencias,
    issues: [],
  };
}

function horasDelTurno(t: Turno): number {
  const [hi, mi] = t.horaInicio.split(":").map(Number);
  const [hf, mf] = t.horaFin.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  if (minutos < 0) minutos += 24 * 60; // cruce de medianoche
  return minutos / 60;
}

type EstadoPeriodo = "" | "borrador" | "liquidado" | "pagado";
type FiltrosPeriodos = { estado: EstadoPeriodo; desde: string; hasta: string; page: number };
const DEFAULTS_PERIODOS: FiltrosPeriodos = { estado: "", desde: "", hasta: "", page: 1 };

export default function PeriodosEmpresa() {
  const [filtros, setFiltros] = useFiltrosUrl<FiltrosPeriodos>(DEFAULTS_PERIODOS);
  const [respuesta, setRespuesta] = useState<RespuestaPaginada<Periodo> | null>(null);
  const [seleccionado, setSeleccionado] = useState<Periodo | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listarPeriodos({
      estado: filtros.estado || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      page: filtros.page,
      limit: 25,
    })
      .then(setRespuesta)
      .catch((e) => setError(e.message));
  }

  useEffect(recargar, [filtros.estado, filtros.desde, filtros.hasta, filtros.page]);

  function cambiarFiltro(patch: Partial<FiltrosPeriodos>) {
    setFiltros({ ...patch, page: 1 });
  }

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

  const periodos = respuesta?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1 gap-2">
        <h2 className="text-lg font-bold text-ink">Periodos de nómina</h2>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline shrink-0"
        >
          <Plus size={16} /> Nuevo periodo
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {mostrarForm && (
        <FormPeriodo
          onCreado={() => {
            setMostrarForm(false);
            recargar();
          }}
        />
      )}

      {/* Filtros: estado + rango de fechas (URL-driven, SPA §15). */}
      <div className="flex flex-wrap gap-2 items-center">
        <SelectFiltro<Exclude<EstadoPeriodo, "">>
          value={filtros.estado}
          onChange={(v) => cambiarFiltro({ estado: v })}
          todasLabel="Todos los estados"
          opciones={[
            { valor: "borrador", etiqueta: "Borrador" },
            { valor: "liquidado", etiqueta: "Liquidado" },
            { valor: "pagado", etiqueta: "Pagado" },
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Desde
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => cambiarFiltro({ desde: e.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Hasta
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => cambiarFiltro({ hasta: e.target.value })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
        </label>
        {(filtros.estado || filtros.desde || filtros.hasta) && (
          <button onClick={() => setFiltros(DEFAULTS_PERIODOS)} className="text-xs text-mint-dark hover:underline ml-auto">
            Limpiar
          </button>
        )}
      </div>

      <PaycheckCard>
        {periodos.length === 0 && (
          <p className="text-sm text-muted px-3 py-6 text-center">
            {filtros.estado || filtros.desde || filtros.hasta
              ? "Sin periodos que coincidan con estos filtros."
              : "Aún no tienes periodos creados."}
          </p>
        )}
        <div className="flex flex-col">
          {periodos.map((p) => (
            <button
              key={p.id}
              onClick={() => setSeleccionado(p)}
              className="flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-slate-50 transition-colors duration-200 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  {formatRangoFechas(p.fechaInicio, p.fechaFin)}
                </p>
                {p.notaEdicion && (
                  <p className="text-xs text-muted truncate mt-0.5">✎ Editado — {p.notaEdicion}</p>
                )}
              </div>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${ESTADO_CLASE[p.estado]}`}>
                {ESTADO_ETIQUETA[p.estado]}
              </span>
              <ChevronRight size={16} className="text-muted shrink-0" />
            </button>
          ))}
        </div>
      </PaycheckCard>
      {respuesta && (
        <Paginador
          page={respuesta.page}
          total={respuesta.total}
          limit={respuesta.limit}
          onCambio={(page) => setFiltros({ page })}
        />
      )}
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
        <DateRangeField
          required
          desde={fechaInicio}
          hasta={fechaFin}
          onCambio={(d, h) => {
            setFechaInicio(d);
            setFechaFin(h);
          }}
          placeholder="Selecciona el período"
        />
        {error && <p className="text-coral text-sm">{error}</p>}
        <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200">
          <CalendarPlus size={16} /> Crear periodo
        </button>
      </form>
    </PaycheckCard>
  );
}

function FormEditarPeriodo({
  periodo,
  onGuardado,
  onCancelar,
}: {
  periodo: Periodo;
  onGuardado: (p: Periodo) => void;
  onCancelar: () => void;
}) {
  const [fechaInicio, setFechaInicio] = useState(periodo.fechaInicio);
  const [fechaFin, setFechaFin] = useState(periodo.fechaFin);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <PaycheckCard titulo="Editar fechas del periodo">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setGuardando(true);
          try {
            onGuardado(await editarPeriodo(periodo.id, { fechaInicio, fechaFin, nota }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo editar el periodo");
          } finally {
            setGuardando(false);
          }
        }}
        className="px-3 pb-3 pt-1 flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Período
          <DateRangeField
            required
            desde={fechaInicio}
            hasta={fechaFin}
            onCambio={(d, h) => {
              setFechaInicio(d);
              setFechaFin(h);
            }}
            placeholder="Selecciona el período"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Motivo de la edición (queda registrado)
          <textarea
            required
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: se corrigió la fecha de cierre por error de digitación"
            className={inputCls}
          />
        </label>
        {error && <p className="text-coral text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-xl border border-slate-200 bg-white text-ink font-medium py-2.5 hover:bg-slate-50 transition-colors duration-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
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
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rechazosQA, setRechazosQA] = useState<RechazoQA[] | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [liquidando, setLiquidando] = useState(false);
  const [revertiendo, setRevertiendo] = useState(false);
  const [editandoFechas, setEditandoFechas] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [comprobanteAbierto, setComprobanteAbierto] = useState<number | null>(null);
  // Horario habitual por colaborador — solo vive en el navegador, es un
  // atajo para autocompletar turnos, no se persiste (cada Turno guardado ya
  // trae sus propias horaInicio/horaFin explícitas, ver liquidacionService.ts).
  const [horarios, setHorarios] = useState<Record<number, (HorarioDia | null)[]>>({});
  // Fechas cuyo turno fue generado por "Autocompletar" y el usuario no lo ha
  // tocado a mano — al cambiar el horario habitual estos turnos se
  // resincronizan (o se eliminan si el día ahora es descanso); los que el
  // usuario edita manualmente salen de este set y ya no se vuelven a tocar.
  const [autogenerados, setAutogenerados] = useState<Record<number, Set<string>>>({});
  // Qué empleados quedan incluidos en ESTE periodo — se autopuebla con los
  // activos al crearlo (backend), ajustable acá mientras siga en borrador.
  const [incluidos, setIncluidos] = useState<Set<number>>(new Set());
  const [guardandoIncluidos, setGuardandoIncluidos] = useState(false);

  useEffect(() => {
    listarEmpleados({ limit: 200 }).then((r) => setEmpleados(r.items));
    listarFestivos().then(setFestivos);
    if (periodo.estado === "borrador") {
      obtenerTurnos(periodo.id).then(setTurnos);
      obtenerEmpleadosIncluidos(periodo.id).then((ids) => setIncluidos(new Set(ids)));
    } else {
      listarRecibos(periodo.id).then(setRecibos);
    }
  }, [periodo.id, periodo.estado]);

  async function alternarIncluido(empleadoId: number) {
    const next = new Set(incluidos);
    if (next.has(empleadoId)) next.delete(empleadoId);
    else next.add(empleadoId);
    setGuardandoIncluidos(true);
    setError(null);
    try {
      const ids = await guardarEmpleadosIncluidos(periodo.id, [...next]);
      setIncluidos(new Set(ids));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la selección");
    } finally {
      setGuardandoIncluidos(false);
    }
  }

  function horarioDe(empleadoId: number): (HorarioDia | null)[] {
    return horarios[empleadoId] ?? HORARIO_BASE_DEFAULT;
  }

  function setHorarioDe(empleadoId: number, nuevo: (HorarioDia | null)[]) {
    setHorarios((prev) => ({ ...prev, [empleadoId]: nuevo }));

    const generados = autogenerados[empleadoId];
    if (!generados || generados.size === 0) return;

    setTurnos((prev) =>
      prev.flatMap((t) => {
        if (t.empleadoId !== empleadoId || !generados.has(t.fecha)) return [t];
        const dia = nuevo[diaSemana(t.fecha)];
        // El día pasó a descanso: el turno generado ya no aplica.
        if (!dia) return [];
        // Sigue siendo día de trabajo: refleja el horario nuevo (por si las horas cambiaron).
        return [{ ...t, horaInicio: dia.horaInicio, horaFin: dia.horaFin }];
      })
    );
    setAutogenerados((prev) => {
      const next = new Set(generados);
      for (const fecha of generados) {
        if (!nuevo[diaSemana(fecha)]) next.delete(fecha);
      }
      return { ...prev, [empleadoId]: next };
    });
  }

  // Genera turnos para los días del periodo donde el horario habitual dice
  // "trabajo" — solo para fechas SIN turno ya capturado (no pisa ediciones
  // manuales) y saltando festivos (igual que el wizard anónimo: por defecto
  // son descanso; si de verdad se trabajó el festivo, se agrega a mano con
  // "+ Agregar turno").
  function autocompletar(empleadoId: number) {
    const horario = horarioDe(empleadoId);
    const existentes = new Set(turnos.filter((t) => t.empleadoId === empleadoId).map((t) => t.fecha));
    const nuevos: Turno[] = [];
    for (const fecha of rangoFechas(periodo.fechaInicio, periodo.fechaFin)) {
      if (existentes.has(fecha)) continue;
      if (festivos.some((f) => f.fecha === fecha)) continue;
      const dia = horario[diaSemana(fecha)];
      if (dia) nuevos.push({ empleadoId, fecha, horaInicio: dia.horaInicio, horaFin: dia.horaFin });
    }
    setTurnos((prev) => [...prev, ...nuevos]);
    setAutogenerados((prev) => {
      const next = new Set(prev[empleadoId] ?? []);
      for (const t of nuevos) next.add(t.fecha);
      return { ...prev, [empleadoId]: next };
    });
    setAbiertos((prev) => new Set(prev).add(empleadoId));
    notificar(
      nuevos.length > 0
        ? `${nuevos.length} turno${nuevos.length === 1 ? "" : "s"} generado${nuevos.length === 1 ? "" : "s"} según el horario habitual.`
        : "No había días nuevos que completar según el horario habitual."
    );
  }

  const activos = empleados.filter((e) => e.activo);
  const empleadosTurnos = activos.filter((e) => e.tipoNomina === "turnos" && incluidos.has(e.id));
  const empleadosFijo = activos.filter((e) => e.tipoNomina === "fijo" && incluidos.has(e.id));

  const grupos = useMemo(() => {
    const porId = new Map<number, Turno[]>();
    for (const e of empleadosTurnos) porId.set(e.id, []);
    for (const t of turnos) {
      if (!porId.has(t.empleadoId)) porId.set(t.empleadoId, []);
      porId.get(t.empleadoId)!.push(t);
    }
    return empleadosTurnos.map((e) => ({
      empleado: e,
      turnos: (porId.get(e.id) ?? []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }));
  }, [empleadosTurnos, turnos]);

  function toggle(empleadoId: number) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(empleadoId)) next.delete(empleadoId);
      else next.add(empleadoId);
      return next;
    });
  }

  function agregarTurno(empleadoId: number) {
    setAbiertos((prev) => new Set(prev).add(empleadoId));
    const turnosDelEmpleado = turnos.filter((t) => t.empleadoId === empleadoId);
    const ultimaFecha = turnosDelEmpleado.length > 0 ? turnosDelEmpleado[turnosDelEmpleado.length - 1].fecha : periodo.fechaInicio;
    setTurnos((prev) => [...prev, { empleadoId, fecha: ultimaFecha, horaInicio: "10:00", horaFin: "17:00" }]);
  }

  // Editar/eliminar un turno a mano lo saca del set de "autogenerados": deja
  // de resincronizarse cuando el usuario ajuste el horario habitual después.
  function desmarcarAutogenerado(empleadoId: number, fecha: string) {
    setAutogenerados((prev) => {
      const generados = prev[empleadoId];
      if (!generados || !generados.has(fecha)) return prev;
      const next = new Set(generados);
      next.delete(fecha);
      return { ...prev, [empleadoId]: next };
    });
  }

  function actualizarTurno(turno: Turno, cambios: Partial<Turno>) {
    desmarcarAutogenerado(turno.empleadoId, turno.fecha);
    setTurnos((prev) => prev.map((t) => (t === turno ? { ...t, ...cambios } : t)));
  }

  function quitarTurno(turno: Turno) {
    desmarcarAutogenerado(turno.empleadoId, turno.fecha);
    setTurnos((prev) => prev.filter((t) => t !== turno));
  }

  function notificar(mensaje: string) {
    setExito(mensaje);
    setError(null);
    window.setTimeout(() => setExito(null), 4000);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await guardarTurnos(periodo.id, turnos);
      notificar("Borrador guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los turnos");
    } finally {
      setGuardando(false);
    }
  }

  async function liquidar() {
    setLiquidando(true);
    setError(null);
    setRechazosQA(null);
    try {
      await guardarTurnos(periodo.id, turnos);
      const nuevos = await liquidarPeriodo(periodo.id);
      setRecibos(nuevos);
      onCambio({ ...periodo, estado: "liquidado" });
    } catch (e) {
      // El motor de QA (SDD §15) devuelve 422 con { error, rechazos: [{empleadoId, nombre, issues}] }
      // cuando alguna validación legal falla — mostrar el detalle es mucho más útil
      // que un mensaje suelto: el usuario sabe qué colaborador y qué ley se infringió.
      const body = (e as { body?: { rechazos?: RechazoQA[] } })?.body;
      if (body?.rechazos && body.rechazos.length > 0) {
        setRechazosQA(body.rechazos);
        setError(e instanceof Error ? e.message : null);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo liquidar el periodo");
      }
    } finally {
      setLiquidando(false);
    }
  }

  async function revertir() {
    setRevertiendo(true);
    setError(null);
    try {
      await revertirPeriodo(periodo.id);
      onCambio({ ...periodo, estado: "borrador" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revertir el periodo a borrador. ¿Algún empleado ya reportó un error?");
    } finally {
      setRevertiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="flex items-start gap-2.5 min-w-0">
          <button onClick={onAtras} className="text-muted hover:text-ink shrink-0 mt-0.5">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-ink">
                {formatRangoFechas(periodo.fechaInicio, periodo.fechaFin)}
              </h2>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${ESTADO_CLASE[periodo.estado]}`}>
                {ESTADO_ETIQUETA[periodo.estado]}
              </span>
            </div>
            {periodo.notaEdicion && (
              <p className="text-xs text-muted mt-0.5">
                ✎ Editado {periodo.editadoEn?.slice(0, 10)} — {periodo.notaEdicion}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {periodo.estado === "borrador" && (
            <button
              onClick={() => setEditandoFechas((v) => !v)}
              title="Editar fechas del periodo"
              className="text-muted hover:text-mint-dark"
            >
              <Pencil size={16} />
            </button>
          )}
          {periodo.estado === "liquidado" && (
            <button
              onClick={revertir}
              disabled={revertiendo}
              title="Revertir a borrador para corregir"
              className="flex items-center gap-1 text-xs text-muted hover:text-coral disabled:opacity-40"
            >
              <RotateCcw size={14} /> {revertiendo ? "Revirtiendo…" : "Revertir"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {rechazosQA && <PanelRechazosQA rechazos={rechazosQA} />}
      {exito && <p className="rounded-xl bg-emerald-50 text-mint-dark text-sm p-3">{exito}</p>}

      {editandoFechas && (
        <FormEditarPeriodo
          periodo={periodo}
          onGuardado={(p) => {
            onCambio(p);
            setEditandoFechas(false);
            notificar("Fechas del periodo actualizadas.");
          }}
          onCancelar={() => setEditandoFechas(false)}
        />
      )}

      {periodo.estado === "borrador" ? (
        <>
          <PaycheckCard titulo={`Colaboradores en este periodo (${incluidos.size} de ${activos.length})`}>
            {activos.length === 0 ? (
              <EmptyState icon={UserRound} titulo="No tienes colaboradores activos" />
            ) : (
              <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5">
                {activos.map((e) => (
                  <label key={e.id} className="flex items-center gap-2.5 py-1 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={incluidos.has(e.id)}
                      disabled={guardandoIncluidos}
                      onChange={() => alternarIncluido(e.id)}
                      className="w-4 h-4 accent-mint shrink-0"
                    />
                    <span className="text-ink">{e.nombre}</span>
                    <span className="text-xs text-muted">
                      {e.tipoNomina === "turnos" ? "Por turnos" : "Salario fijo"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </PaycheckCard>

          {empleadosTurnos.length === 0 && (
            <PaycheckCard>
              <p className="text-sm text-muted px-3 py-6 text-center">
                {activos.some((e) => e.tipoNomina === "turnos")
                  ? "Ningún colaborador por turnos está incluido en este periodo todavía."
                  : "No tienes colaboradores activos con nómina por turnos."}
              </p>
            </PaycheckCard>
          )}

          <div className="flex flex-col gap-2.5">
            {grupos.map(({ empleado, turnos: turnosEmpleado }) => {
              const totalHoras = turnosEmpleado.reduce((s, t) => s + horasDelTurno(t), 0);
              const abierto = abiertos.has(empleado.id);
              return (
                <PaycheckCard key={empleado.id}>
                  <button
                    onClick={() => toggle(empleado.id)}
                    className="w-full flex items-center gap-3 px-1 py-1.5 text-left"
                  >
                    {abierto ? (
                      <ChevronDown size={16} className="text-muted shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-muted shrink-0" />
                    )}
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
                      <UserRound size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{empleado.nombre}</p>
                      <p className="text-xs text-muted flex items-center gap-1">
                        <Clock size={11} />
                        {turnosEmpleado.length} turno{turnosEmpleado.length === 1 ? "" : "s"} · {totalHoras.toFixed(1)} h
                      </p>
                    </div>
                  </button>

                  {abierto && (
                    <div className="px-1 pb-1 pt-1 flex flex-col gap-2">
                      <div className="bg-slate-50 rounded-xl">
                        <HorarioSemanalEditor
                          horarioBase={horarioDe(empleado.id)}
                          onCambio={(h) => setHorarioDe(empleado.id, h)}
                        />
                        <div className="px-3 pb-2.5 -mt-1">
                          <button
                            onClick={() => autocompletar(empleado.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-mint-dark hover:underline"
                          >
                            <Sparkles size={13} /> Autocompletar turnos del periodo según este horario
                          </button>
                        </div>
                      </div>
                      {turnosEmpleado.length === 0 && (
                        <p className="text-xs text-muted px-2 py-2">Sin turnos capturados todavía.</p>
                      )}
                      {turnosEmpleado.map((t, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 rounded-xl p-2.5">
                          <input
                            type="date"
                            value={t.fecha}
                            min={periodo.fechaInicio}
                            max={periodo.fechaFin}
                            onChange={(e) => actualizarTurno(t, { fecha: e.target.value })}
                            className={`${inputCls} sm:flex-1`}
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={t.horaInicio}
                              onChange={(e) => actualizarTurno(t, { horaInicio: e.target.value })}
                              className={`${inputCls} flex-1`}
                            />
                            <span className="text-muted text-xs shrink-0">a</span>
                            <input
                              type="time"
                              value={t.horaFin}
                              onChange={(e) => actualizarTurno(t, { horaFin: e.target.value })}
                              className={`${inputCls} flex-1`}
                            />
                            <button onClick={() => quitarTurno(t)} className="text-coral shrink-0 p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => agregarTurno(empleado.id)}
                        className="flex items-center gap-1 text-sm text-mint-dark hover:underline self-start mt-1 px-2"
                      >
                        <Plus size={16} /> Agregar turno
                      </button>
                    </div>
                  )}
                </PaycheckCard>
              );
            })}
          </div>

          {empleadosFijo.length > 0 && (
            <p className="text-xs text-muted px-2">
              {empleadosFijo.length} colaborador{empleadosFijo.length === 1 ? "" : "es"} de salario fijo no
              requiere{empleadosFijo.length === 1 ? "" : "n"} turnos — se liquida
              {empleadosFijo.length === 1 ? "" : "n"} automáticamente al cerrar el periodo.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 rounded-xl border border-slate-200 bg-white text-ink font-medium py-3 hover:bg-slate-50 transition-colors duration-200 disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar borrador"}
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
            <div key={r.id} className="flex flex-col gap-2">
              <PaycheckCard titulo={r.empleado?.nombre ?? r.contratista?.nombre ?? "—"}>
                <div className="flex flex-col">
                  {r.lineas.map((l, i) => (
                    <ValidationRow key={i} linea={l} />
                  ))}
                </div>
                <div className="border-t border-slate-100 mx-3 py-2.5 px-3 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setComprobanteAbierto(comprobanteAbierto === r.id ? null : r.id)}
                    className="flex items-center gap-1.5 text-xs text-mint-dark hover:underline shrink-0"
                  >
                    <FileText size={14} /> {comprobanteAbierto === r.id ? "Ocultar comprobante" : "Ver comprobante"}
                  </button>
                  <div className="flex justify-between gap-3 text-sm font-semibold text-ink">
                    <span>Neto</span>
                    <span className="tabular-nums">{formatCOP(r.neto)}</span>
                  </div>
                </div>
                {r.advertencias.length > 0 && (
                  <div className="mx-3 mb-3 flex flex-col gap-2">
                    {r.advertencias.map((a, i) => (
                      <div key={i} className="rounded-xl p-3 bg-amber-50 text-amber-700 flex items-start gap-2 text-xs">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
                {r.qaIssues && r.qaIssues.length > 0 && (
                  <div className="mx-3 mb-3 flex flex-col gap-2">
                    {r.qaIssues.map((i, idx) => (
                      <div key={idx} className="rounded-xl p-3 bg-amber-50 text-amber-800 flex items-start gap-2 text-xs">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">QA · {i.codigo}</p>
                          <p>{i.mensaje}</p>
                          <p className="opacity-70 mt-0.5">{i.referenciaLegal}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PaycheckCard>

              {comprobanteAbierto === r.id && (
                <ComprobanteNomina
                  resultado={{ ...comoResultadoNomina(r), periodoDesde: periodo.fechaInicio, periodoHasta: periodo.fechaFin }}
                  empleado={r.empleado ?? r.contratista ?? undefined}
                  numero={`NC-${String(r.id).padStart(6, "0")}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rechazos del motor de QA (SDD §15): agrupados por colaborador con el detalle
// de cada infracción — código estable, mensaje y ley citada. Bloquea la
// liquidación; el usuario debe corregir turnos/salario y volver a intentar.
function PanelRechazosQA({ rechazos }: { rechazos: RechazoQA[] }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-3 flex flex-col gap-2">
      <p className="text-sm font-bold text-coral flex items-center gap-2">
        <AlertTriangle size={16} /> La liquidación no pasó las validaciones legales
      </p>
      <p className="text-xs text-coral/80">
        Corrige los siguientes puntos y vuelve a intentar — el sistema no persiste liquidaciones con estos errores.
      </p>
      {rechazos.map((r) => (
        <div key={r.empleadoId} className="rounded-xl bg-white p-3 flex flex-col gap-1.5">
          <p className="text-sm font-medium text-ink">{r.nombre}</p>
          {r.issues.map((i: IssueQA, idx: number) => (
            <div key={idx} className="text-xs text-ink border-l-2 border-coral/40 pl-2">
              <p className="font-medium">{i.codigo}</p>
              <p>{i.mensaje}</p>
              <p className="opacity-70">{i.referenciaLegal}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
