import { useEffect, useState } from "react";
import { Building2, CalendarPlus, Plus, Trash2 } from "lucide-react";
import {
  crearFestivo,
  crearVigencia,
  eliminarFestivo,
  listarEmpresas,
  listarFestivosAdmin,
  listarReglas,
  type EmpresaAdmin,
  type Festivo,
  type ReglaAgrupada,
} from "../../apiAdmin";
import PaycheckCard from "../PaycheckCard.tsx";
import EmptyState from "../EmptyState.tsx";
import Skeleton from "../Skeleton.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function DashboardAdmin() {
  return (
    <div className="flex flex-col gap-6">
      <Empresas />
      <ReglasLegales />
      <Festivos />
    </div>
  );
}

// Vista de solo lectura para admin_plataforma: qué empresas usan la
// plataforma y quién las administra. Crear/reasignar/suspender empresas
// queda para otra ronda (SDD.md §13).
function Empresas() {
  const [empresas, setEmpresas] = useState<EmpresaAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarEmpresas()
      .then(setEmpresas)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink px-1">Empresas</h2>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      <PaycheckCard>
        {empresas === null && !error && <Skeleton filas={3} />}
        {empresas?.length === 0 && <EmptyState icon={Building2} titulo="Todavía no hay empresas registradas" />}
        <div className="flex flex-col">
          {empresas?.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 px-3 py-3 border-b border-slate-100 last:border-0"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{e.nombre}</p>
                <p className="text-xs text-muted truncate">
                  NIT {e.nit} · {e.sector} · {e.colaboradores} colaborador{e.colaboradores === 1 ? "" : "es"}
                  {e.contratistas > 0 && ` · ${e.contratistas} contratista${e.contratistas === 1 ? "" : "s"}`}
                </p>
                <p className="text-xs text-muted truncate">
                  {e.admins.length > 0
                    ? `Admin: ${e.admins.map((a) => a.nombre).join(", ")}`
                    : "Sin admin_empresa asignado"}
                </p>
              </div>
              <span className="text-xs text-muted shrink-0">{e.creadoEn.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function ReglasLegales() {
  const [reglas, setReglas] = useState<ReglaAgrupada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  function recargar() {
    listarReglas()
      .then(setReglas)
      .catch((e) => setError(e.message));
  }

  useEffect(recargar, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink px-1">Reglas legales</h2>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {reglas.map((r) => (
        <PaycheckCard key={r.clave} titulo={r.etiqueta}>
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            <p className="text-xs text-muted">{r.descripcion}</p>
            <div className="flex flex-col gap-1">
              {r.vigencias.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink tabular-nums">
                    {v.valor} {r.unidad === "porcentaje" ? "" : r.unidad}
                  </span>
                  <span className="text-xs text-muted">
                    {v.vigenteDesde} → {v.vigenteHasta ?? "hoy"}
                  </span>
                </div>
              ))}
            </div>
            {editando === r.clave ? (
              <FormNuevaVigencia
                clave={r.clave}
                onCancelar={() => setEditando(null)}
                onCreada={() => {
                  setEditando(null);
                  recargar();
                }}
              />
            ) : (
              <button
                onClick={() => setEditando(r.clave)}
                className="flex items-center gap-1.5 text-xs text-mint-dark hover:underline self-start"
              >
                <Plus size={14} /> Nueva vigencia
              </button>
            )}
          </div>
        </PaycheckCard>
      ))}
    </div>
  );
}

function FormNuevaVigencia({
  clave,
  onCancelar,
  onCreada,
}: {
  clave: string;
  onCancelar: () => void;
  onCreada: () => void;
}) {
  const [valor, setValor] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState("");
  const [fuente, setFuente] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await crearVigencia({ clave, valor: Number(valor), vigenteDesde, fuente: fuente || undefined });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la vigencia");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input required type="number" step="any" placeholder="Nuevo valor" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
        <input required type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className={inputCls} />
      </div>
      <input placeholder="Fuente legal (opcional)" value={fuente} onChange={(e) => setFuente(e.target.value)} className={inputCls} />
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 rounded-lg border border-slate-200 bg-white text-ink text-sm py-1.5">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="flex-1 rounded-lg bg-mint text-white text-sm py-1.5 disabled:opacity-40">
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function Festivos() {
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listarFestivosAdmin()
      .then(setFestivos)
      .catch((e) => setError(e.message));
  }

  useEffect(recargar, []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await crearFestivo({ fecha, nombre });
      setFecha("");
      setNombre("");
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el festivo");
    }
  }

  async function quitar(id: number) {
    await eliminarFestivo(id);
    recargar();
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink px-1">Festivos</h2>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      <PaycheckCard>
        <form onSubmit={agregar} className="px-3 pt-3 flex gap-2">
          <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${inputCls} flex-1`} />
          <button type="submit" className="rounded-xl bg-mint text-white px-3 hover:bg-mint-dark transition-colors duration-200">
            <CalendarPlus size={16} />
          </button>
        </form>
        <div className="flex flex-col mt-2">
          {festivos.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-sm text-ink flex-1">{f.nombre}</span>
              <span className="text-xs text-muted">{f.fecha}</span>
              <button onClick={() => quitar(f.id)} className="text-coral">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}
