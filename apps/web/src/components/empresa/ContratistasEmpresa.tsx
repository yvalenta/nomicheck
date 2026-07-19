import { Fragment, useEffect, useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  actualizarContratista,
  crearContratista,
  eliminarContratista,
  listarContratistas,
  type Contratista,
} from "../../apiEmpresa";
import { obtenerParametros, type ParametrosPublicos } from "../../api";
import PaycheckCard from "../PaycheckCard.tsx";
import EmptyState from "../EmptyState.tsx";
import Skeleton from "../Skeleton.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function ContratistasEmpresa() {
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [parametros, setParametros] = useState<ParametrosPublicos | null>(null);

  function recargar() {
    listarContratistas()
      .then(setContratistas)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    recargar();
    obtenerParametros().then(setParametros);
  }, []);

  function notificar(mensaje: string) {
    setExito(mensaje);
    setError(null);
    window.setTimeout(() => setExito(null), 5000);
  }

  async function agregar(datos: Omit<Contratista, "id" | "activo">) {
    setError(null);
    try {
      await crearContratista(datos);
      setMostrarForm(false);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el contratista");
    }
  }

  async function editar(id: number, datos: Omit<Contratista, "id" | "activo">) {
    setError(null);
    try {
      await actualizarContratista(id, datos);
      setEditandoId(null);
      notificar("Cambios guardados.");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar los cambios");
    }
  }

  async function eliminar(id: number) {
    setError(null);
    setConfirmandoId(null);
    try {
      await eliminarContratista(id);
      notificar("Contratista eliminado (no tenía recibos registrados).");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-ink">Contratistas de servicios</h2>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline"
        >
          <Plus size={16} /> Agregar
        </button>
      </div>

      <p className="text-xs text-muted px-1">
        No son contrato laboral (Ley 1819 de 2016, art. 244) — sin auxilio de transporte, recargos
        ni prestaciones sociales; sus aportes a seguridad social los liquidan ellos mismos.
      </p>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {exito && <p className="rounded-xl bg-emerald-50 text-mint-dark text-sm p-3">{exito}</p>}

      {mostrarForm && <FormContratista smlmv={parametros?.smlmv} onGuardar={agregar} />}

      <PaycheckCard>
        {cargando && <Skeleton filas={2} />}
        {!cargando && contratistas.length === 0 && (
          <EmptyState icon={Briefcase} titulo="Aún no tienes contratistas" />
        )}
        <div className="flex flex-col">
          {contratistas.map((c) => (
            <Fragment key={c.id}>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
                  <Briefcase size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{c.nombre}</p>
                  <p className="text-xs text-muted">{c.documento}</p>
                </div>
                <p className="text-sm font-semibold text-ink tabular-nums shrink-0">
                  {formatCOP(c.honorariosMensuales)}
                </p>
                <button
                  onClick={() => {
                    setEditandoId(editandoId === c.id ? null : c.id);
                    setConfirmandoId(null);
                  }}
                  title="Editar"
                  className="text-muted hover:text-mint-dark shrink-0"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setConfirmandoId(c.id)}
                  title="Eliminar (solo si fue creado por error)"
                  className="text-muted hover:text-coral shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {confirmandoId === c.id && (
                <div className="mx-3 mb-2 rounded-xl bg-red-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-coral">
                  <span className="flex-1">
                    ¿Eliminar definitivamente a {c.nombre}? Solo es posible si no tiene recibos registrados.
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => eliminar(c.id)} className="rounded-lg bg-coral text-white text-xs px-3 py-1.5">
                      Sí, eliminar
                    </button>
                    <button
                      onClick={() => setConfirmandoId(null)}
                      className="rounded-lg border border-slate-200 bg-white text-ink text-xs px-3 py-1.5"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {editandoId === c.id && (
                <FormContratista smlmv={parametros?.smlmv} inicial={c} onGuardar={(datos) => editar(c.id, datos)} />
              )}
            </Fragment>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function FormContratista({
  inicial,
  smlmv,
  onGuardar,
}: {
  inicial?: Contratista;
  smlmv?: number;
  onGuardar: (d: Omit<Contratista, "id" | "activo">) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [documento, setDocumento] = useState(inicial?.documento ?? "");
  const [honorariosMensuales, setHonorariosMensuales] = useState(
    inicial ? String(inicial.honorariosMensuales) : ""
  );

  return (
    <PaycheckCard titulo={inicial ? `Editar a ${inicial.nombre}` : "Nuevo contratista"} className={inicial ? "mx-3 mb-2" : ""}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar({ nombre, documento, honorariosMensuales: Number(honorariosMensuales) });
        }}
        className="px-3 pb-3 pt-1 flex flex-col gap-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
          <input required placeholder="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <input
            required
            type="number"
            placeholder="Honorarios mensuales"
            value={honorariosMensuales}
            onChange={(e) => setHonorariosMensuales(e.target.value)}
            className={inputCls}
          />
          {smlmv && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start">
              <input
                type="checkbox"
                checked={Number(honorariosMensuales) === smlmv}
                onChange={(e) => { if (e.target.checked) setHonorariosMensuales(String(smlmv)); }}
                className="w-3.5 h-3.5 accent-mint"
              />
              Autocompletar salario mínimo vigente ({formatCOP(smlmv)})
            </label>
          )}
        </div>
        <button
          type="submit"
          className="rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200"
        >
          {inicial ? "Guardar cambios" : "Guardar contratista"}
        </button>
      </form>
    </PaycheckCard>
  );
}
