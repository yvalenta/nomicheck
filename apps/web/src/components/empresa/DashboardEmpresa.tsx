import { Fragment, useEffect, useMemo, useState } from "react";
import { LogOut, Mail, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { supabase } from "../../lib/supabase";
import {
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado,
  invitarEmpleado,
  liquidarFinalEmpleado,
  listarEmpleados,
  retirarEmpleado,
  type DatosEmpleado,
  type Empleado,
} from "../../apiEmpresa";
import { obtenerParametros, type ParametrosPublicos } from "../../api";
import PaycheckCard from "../PaycheckCard.tsx";
import SegmentedControl from "../SegmentedControl.tsx";
import DateField from "../DateField.tsx";
import EmptyState from "../EmptyState.tsx";
import Skeleton from "../Skeleton.tsx";
import Combobox from "../Combobox.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

const TIPO_CONTRATO_OPCIONES: { value: Empleado["tipoContrato"]; label: string }[] = [
  { value: "indefinido", label: "Término indefinido" },
  { value: "fijo", label: "Término fijo" },
  { value: "obra_labor", label: "Por obra o labor" },
  { value: "tiempo_parcial", label: "Tiempo parcial" },
  { value: "aprendizaje_sena_lectiva", label: "Aprendizaje SENA — etapa lectiva" },
  { value: "aprendizaje_sena_practica", label: "Aprendizaje SENA — etapa práctica" },
];

type FiltroEstado = "activos" | "retirados" | "todos";

// Acción inline abierta sobre una fila (reemplaza los window.prompt/alert
// que había antes: todo se captura y confirma dentro de la propia fila).
type AccionFila = { id: number; tipo: "invitar" | "retirar" | "eliminar" } | null;

export default function DashboardEmpresa() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [accion, setAccion] = useState<AccionFila>(null);
  const [filtro, setFiltro] = useState<FiltroEstado>("activos");
  const [busqueda, setBusqueda] = useState("");

  const [parametros, setParametros] = useState<ParametrosPublicos | null>(null);

  function recargar() {
    listarEmpleados()
      .then(setEmpleados)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    recargar();
    obtenerParametros().then(setParametros);
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empleados
      .filter((e) =>
        filtro === "activos" ? e.activo : filtro === "retirados" ? !e.activo : true
      )
      .filter((e) => !q || e.nombre.toLowerCase().includes(q) || e.documento.toLowerCase().includes(q));
  }, [empleados, filtro, busqueda]);

  const activos = empleados.filter((e) => e.activo);
  const nominaMensual = activos.reduce((s, e) => s + e.salarioBase, 0);

  function notificar(mensaje: string) {
    setExito(mensaje);
    setError(null);
    window.setTimeout(() => setExito(null), 5000);
  }

  async function agregar(datos: DatosEmpleado) {
    setError(null);
    try {
      await crearEmpleado(datos);
      setMostrarForm(false);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el empleado");
    }
  }

  async function editar(id: number, datos: DatosEmpleado) {
    setError(null);
    try {
      await actualizarEmpleado(id, datos);
      setEditandoId(null);
      notificar("Cambios guardados.");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar los cambios");
    }
  }

  async function eliminar(id: number) {
    setError(null);
    try {
      await eliminarEmpleado(id);
      setAccion(null);
      notificar("Empleado eliminado (no tenía historial de nómina).");
      recargar();
    } catch (e) {
      setAccion(null);
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  async function invitar(id: number, email: string) {
    setError(null);
    try {
      const { estado } = await invitarEmpleado(id, email);
      setAccion(null);
      notificar(
        estado === "correo_enviado"
          ? "Invitación enviada por correo — la persona define su contraseña al aceptar."
          : "Invitación enviada — le aparecerá como notificación en su cuenta de NomiCheck."
      );
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo invitar");
    }
  }

  async function retirar(id: number, fechaRetiro: string) {
    setError(null);
    try {
      await retirarEmpleado(id, fechaRetiro);
      setAccion(null);
      notificar("Retiro registrado — el historial se conserva y puedes liquidar sus prestaciones finales.");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el retiro");
    }
  }

  async function liquidarFinal(id: number) {
    setError(null);
    try {
      const recibo = await liquidarFinalEmpleado(id);
      notificar(`Liquidación final generada. Neto: ${formatCOP(recibo.neto)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-ink">Tus colaboradores</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline"
          >
            <Plus size={16} /> Agregar
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-coral"
          >
            <LogOut size={15} /> Salir
          </button>
        </div>
      </div>

      {/* Resumen compacto */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat etiqueta="Colaboradores activos" valor={String(activos.length)} />
        <Stat etiqueta="Nómina base mensual" valor={formatCOP(nominaMensual)} />
        <Stat etiqueta="Retirados" valor={String(empleados.length - activos.length)} />
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {exito && <p className="rounded-xl bg-emerald-50 text-mint-dark text-sm p-3">{exito}</p>}

      {mostrarForm && <FormEmpleado smlmv={parametros?.smlmv} onGuardar={agregar} />}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <SegmentedControl<FiltroEstado>
          opciones={[
            { valor: "activos", etiqueta: "Activos" },
            { valor: "retirados", etiqueta: "Retirados" },
            { valor: "todos", etiqueta: "Todos" },
          ]}
          activo={filtro}
          onCambio={setFiltro}
        />
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o documento…"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
      </div>

      <PaycheckCard>
        {cargando && <Skeleton filas={3} />}
        {!cargando && visibles.length === 0 && (
          <EmptyState
            icon={UserRound}
            titulo={empleados.length === 0 ? "Aún no tienes colaboradores" : "Sin resultados para este filtro"}
            descripcion={empleados.length === 0 ? "Agrega tu primer colaborador con el botón de arriba." : undefined}
          />
        )}
        <div className="flex flex-col">
          {visibles.map((e) => (
            <Fragment key={e.id}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    e.activo ? "bg-emerald-50 text-mint-dark" : "bg-slate-100 text-muted"
                  }`}
                >
                  <UserRound size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {e.nombre}
                    {!e.activo && <span className="ml-2 text-xs text-muted">(retirado)</span>}
                  </p>
                  <p className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                    <span>{e.documento} · {e.tipoNomina === "turnos" ? "Por turnos" : "Salario fijo"}</span>
                    <EstadoCuenta empleado={e} />
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink tabular-nums shrink-0">
                  {formatCOP(e.salarioBase)}
                </p>
                <button
                  onClick={() => {
                    setEditandoId(editandoId === e.id ? null : e.id);
                    setAccion(null);
                  }}
                  title="Editar"
                  className="text-muted hover:text-mint-dark shrink-0"
                >
                  <Pencil size={16} />
                </button>
                {!(e.usuarioId && e.invitacionAceptadaEn) && (
                  <button
                    onClick={() => setAccion({ id: e.id, tipo: "invitar" })}
                    title={e.usuarioId ? "Reenviar / cambiar invitación" : "Invitar a crear su cuenta"}
                    className="text-muted hover:text-mint-dark shrink-0"
                  >
                    <Mail size={17} />
                  </button>
                )}
                <button
                  onClick={() => setAccion({ id: e.id, tipo: "eliminar" })}
                  title="Eliminar (solo si fue creado por error)"
                  className="text-muted hover:text-coral shrink-0"
                >
                  <Trash2 size={16} />
                </button>
                {!e.fechaRetiro && (
                  <button
                    onClick={() => setAccion({ id: e.id, tipo: "retirar" })}
                    title="Registrar retiro"
                    className="text-xs text-muted hover:text-coral shrink-0 underline"
                  >
                    Retirar
                  </button>
                )}
                {e.fechaRetiro && (
                  <button
                    onClick={() => liquidarFinal(e.id)}
                    title="Liquidar prestaciones finales"
                    className="text-xs text-mint-dark hover:underline shrink-0"
                  >
                    Liquidar final
                  </button>
                )}
              </div>

              {accion?.id === e.id && accion.tipo === "invitar" && (
                <FormInvitar onEnviar={(email) => invitar(e.id, email)} onCancelar={() => setAccion(null)} />
              )}
              {accion?.id === e.id && accion.tipo === "retirar" && (
                <FormRetirar
                  minimo={e.fechaIngreso}
                  onConfirmar={(fecha) => retirar(e.id, fecha)}
                  onCancelar={() => setAccion(null)}
                />
              )}
              {accion?.id === e.id && accion.tipo === "eliminar" && (
                <div className="mx-3 mb-2 rounded-xl bg-red-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-coral">
                  <span className="flex-1">
                    ¿Eliminar definitivamente a {e.nombre}? Solo es posible si fue creado por error (sin
                    historial de nómina) — si tiene recibos, usa "Retirar".
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => eliminar(e.id)} className="rounded-lg bg-coral text-white text-xs px-3 py-1.5">
                      Sí, eliminar
                    </button>
                    <button
                      onClick={() => setAccion(null)}
                      className="rounded-lg border border-slate-200 bg-white text-ink text-xs px-3 py-1.5"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {editandoId === e.id && (
                <FormEmpleado smlmv={parametros?.smlmv} inicial={e} onGuardar={(datos) => editar(e.id, datos)} />
              )}
            </Fragment>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

// Estado de la cuenta del colaborador, derivado de usuarioId + invitacionAceptadaEn.
function EstadoCuenta({ empleado }: { empleado: Empleado }) {
  const { texto, clase } = !empleado.usuarioId
    ? { texto: "Sin cuenta", clase: "bg-slate-100 text-muted" }
    : empleado.invitacionAceptadaEn
      ? { texto: "Cuenta activa", clase: "bg-emerald-50 text-mint-dark" }
      : { texto: "Invitación pendiente", clase: "bg-amber-50 text-amber-700" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${clase}`}>{texto}</span>;
}

function Stat({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3">
      <p className="text-xs text-muted">{etiqueta}</p>
      <p className="text-base font-bold text-ink tabular-nums mt-0.5">{valor}</p>
    </div>
  );
}

function FormInvitar({ onEnviar, onCancelar }: { onEnviar: (email: string) => void; onCancelar: () => void }) {
  const [email, setEmail] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) onEnviar(email.trim());
      }}
      className="mx-3 mb-2 rounded-xl bg-slate-50 p-3 flex flex-col sm:flex-row gap-2"
    >
      <input
        required
        type="email"
        autoFocus
        placeholder="Correo del colaborador"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`${inputCls} flex-1`}
      />
      <div className="flex gap-2 shrink-0">
        <button type="submit" className="rounded-lg bg-mint text-white text-xs px-3 py-1.5">
          Enviar invitación
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-200 bg-white text-ink text-xs px-3 py-1.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormRetirar({
  minimo,
  onConfirmar,
  onCancelar,
}: {
  minimo: string;
  onConfirmar: (fecha: string) => void;
  onCancelar: () => void;
}) {
  const [fecha, setFecha] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (fecha) onConfirmar(fecha);
      }}
      className="mx-3 mb-2 rounded-xl bg-slate-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
    >
      <span className="text-xs text-muted flex-1">
        Fecha de retiro — el historial se conserva y podrás liquidar sus prestaciones finales.
      </span>
      <DateField required value={fecha} onChange={setFecha} minimo={minimo} placeholder="Fecha de retiro" />
      <div className="flex gap-2 shrink-0">
        <button type="submit" className="rounded-lg bg-coral text-white text-xs px-3 py-1.5">
          Confirmar retiro
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-200 bg-white text-ink text-xs px-3 py-1.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormEmpleado({
  inicial,
  smlmv,
  onGuardar,
}: {
  inicial?: Empleado;
  smlmv?: number;
  onGuardar: (d: DatosEmpleado) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [documento, setDocumento] = useState(inicial?.documento ?? "");
  const [salarioBase, setSalarioBase] = useState(inicial ? String(inicial.salarioBase) : "");
  const [tipoNomina, setTipoNomina] = useState<Empleado["tipoNomina"]>(inicial?.tipoNomina ?? "turnos");
  const [auxilioTransporte, setAuxilioTransporte] = useState(inicial?.auxilioTransporte ?? true);
  const [fechaIngreso, setFechaIngreso] = useState(inicial?.fechaIngreso.slice(0, 10) ?? "");
  const [tipoContrato, setTipoContrato] = useState<Empleado["tipoContrato"]>(inicial?.tipoContrato ?? "indefinido");

  return (
    <PaycheckCard titulo={inicial ? `Editar a ${inicial.nombre}` : "Nuevo colaborador"} className={inicial ? "mx-3 mb-2" : ""}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar({ nombre, documento, salarioBase: Number(salarioBase), tipoNomina, auxilioTransporte, fechaIngreso, tipoContrato });
        }}
        className="px-3 pb-3 pt-1 flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
          <input required placeholder="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="number"
              placeholder="Salario básico"
              value={salarioBase}
              onChange={(e) => setSalarioBase(e.target.value)}
              className={inputCls}
            />
            <select value={tipoNomina} onChange={(e) => setTipoNomina(e.target.value as Empleado["tipoNomina"])} className={inputCls}>
              <option value="turnos">Por turnos</option>
              <option value="fijo">Salario fijo</option>
            </select>
          </div>
          {smlmv && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start">
              <input
                type="checkbox"
                checked={Number(salarioBase) === smlmv}
                onChange={(e) => { if (e.target.checked) setSalarioBase(String(smlmv)); }}
                className="w-3.5 h-3.5 accent-mint"
              />
              Autocompletar salario mínimo vigente ({formatCOP(smlmv)})
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Tipo de contrato
          <Combobox
            value={tipoContrato}
            onChange={(v) => setTipoContrato(v as Empleado["tipoContrato"])}
            opciones={TIPO_CONTRATO_OPCIONES}
            buscarPlaceholder="Buscar tipo de contrato…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Fecha de ingreso (antigüedad para cesantías, prima y vacaciones)
          <DateField required value={fechaIngreso} onChange={setFechaIngreso} placeholder="Fecha de ingreso" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={auxilioTransporte}
            onChange={(e) => setAuxilioTransporte(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          Recibe auxilio de transporte
        </label>
        <button
          type="submit"
          className="rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200"
        >
          {inicial ? "Guardar cambios" : "Guardar colaborador"}
        </button>
      </form>
    </PaycheckCard>
  );
}
