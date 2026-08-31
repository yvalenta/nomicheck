import { useEffect, useState } from "react";
import { Building2, CalendarPlus, Eye, Pause, Play, Plus, Trash2, UserCog } from "lucide-react";
import {
  cambiarEstadoEmpresa,
  crearEmpresa,
  entrarEmpresa,
  crearFestivo,
  crearVigencia,
  eliminarFestivo,
  listarEmpresas,
  listarFestivosAdmin,
  listarReglas,
  quitarAdmin,
  reasignarAdmin,
  type EmpresaAdmin,
  type Festivo,
  type ReglaAgrupada,
} from "../../apiAdmin";
import PaycheckCard from "../PaycheckCard.tsx";
import DateField from "../DateField.tsx";
import EmptyState from "../EmptyState.tsx";
import Skeleton from "../Skeleton.tsx";

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function DashboardAdmin() {
  return (
    <div className="flex flex-col gap-6">
      <Empresas />
      <ReglasLegales />
      <Festivos />
    </div>
  );
}

// Onboarding manual de empresas: admin_plataforma puede crear una empresa,
// invitar/reasignar su admin_empresa, quitarlo, y suspender/reactivar el
// acceso de toda la empresa (SDD.md §03 Módulo D).
function Empresas() {
  const [empresas, setEmpresas] = useState<EmpresaAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [exito, setExito] = useState<string | null>(null);
  const [filaReasignar, setFilaReasignar] = useState<number | null>(null);

  function recargar() {
    listarEmpresas()
      .then(setEmpresas)
      .catch((e) => setError(e.message));
  }

  useEffect(recargar, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-ink">Empresas</h2>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline"
        >
          <Plus size={16} /> Nueva empresa
        </button>
      </div>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {exito && <p className="rounded-xl bg-emerald-50 text-mint-dark text-sm p-3">{exito}</p>}

      {mostrarForm && (
        <FormNuevaEmpresa
          onCreada={(emailAdmin) => {
            setMostrarForm(false);
            setExito(`Empresa creada — invitación enviada a ${emailAdmin}.`);
            recargar();
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      <PaycheckCard>
        {empresas === null && !error && <Skeleton filas={3} />}
        {empresas?.length === 0 && <EmptyState icon={Building2} titulo="Todavía no hay empresas registradas" />}
        <div className="flex flex-col">
          {empresas?.map((e) => (
            <FilaEmpresa
              key={e.id}
              empresa={e}
              reasignarAbierto={filaReasignar === e.id}
              onToggleReasignar={() => setFilaReasignar(filaReasignar === e.id ? null : e.id)}
              onCambio={(msg) => {
                setExito(msg);
                setFilaReasignar(null);
                recargar();
              }}
              onError={setError}
            />
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function FilaEmpresa({
  empresa: e,
  reasignarAbierto,
  onToggleReasignar,
  onCambio,
  onError,
}: {
  empresa: EmpresaAdmin;
  reasignarAbierto: boolean;
  onToggleReasignar: () => void;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const [procesando, setProcesando] = useState(false);

  async function quitar(usuarioId: string, nombre: string) {
    if (!confirm(`¿Quitar a ${nombre} como admin de ${e.nombre}? Su cuenta sigue existiendo, solo pierde el acceso.`))
      return;
    setProcesando(true);
    try {
      await quitarAdmin(e.id, usuarioId);
      onCambio(`${nombre} ya no es admin de ${e.nombre}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo quitar el admin");
    } finally {
      setProcesando(false);
    }
  }

  // «Ver como» solo lectura: el server valida y recién entonces se recarga en
  // /empresa (mismo esquema que el selector: el cliente jamás asume el cambio).
  // Sin confirm: entrar es reversible con el Salir de la barra.
  async function entrar() {
    setProcesando(true);
    try {
      await entrarEmpresa(e.id);
      window.location.assign("/empresa");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo entrar a la empresa");
      setProcesando(false);
    }
  }

  async function toggleEstado() {
    const accion = e.activa ? "suspender" : "reactivar";
    if (!confirm(`¿${e.activa ? "Suspender" : "Reactivar"} ${e.nombre}?${e.activa ? " Su admin_empresa y colaboradores no podrán entrar." : ""}`))
      return;
    setProcesando(true);
    try {
      await cambiarEstadoEmpresa(e.id, !e.activa);
      onCambio(`${e.nombre} fue ${accion === "suspender" ? "suspendida" : "reactivada"}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="border-b border-borde last:border-0">
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
          <Building2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
            {e.nombre}
            {!e.activa && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-50 text-coral rounded-full px-1.5 py-0.5">
                Suspendida
              </span>
            )}
          </p>
          <p className="text-xs text-muted truncate">
            NIT {e.nit} · {e.sector} · {e.colaboradores} colaborador{e.colaboradores === 1 ? "" : "es"}
            {e.contratistas > 0 && ` · ${e.contratistas} contratista${e.contratistas === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center flex-wrap gap-x-1.5 text-xs text-muted">
            {e.admins.length > 0 ? (
              e.admins.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1">
                  Admin: {a.nombre}
                  <button
                    disabled={procesando}
                    onClick={() => quitar(a.id, a.nombre)}
                    title="Quitar admin"
                    className="text-muted hover:text-coral disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))
            ) : (
              <span>Sin admin_empresa asignado</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={entrar}
            disabled={procesando || !e.activa}
            title={e.activa ? "Entrar (solo lectura)" : "Suspendida: reactívala para entrar"}
            className="w-8 h-8 rounded-lg border border-slate-200 text-muted hover:text-mint-dark hover:border-mint flex items-center justify-center disabled:opacity-40"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={onToggleReasignar}
            title="Reasignar admin"
            className="w-8 h-8 rounded-lg border border-slate-200 text-muted hover:text-mint-dark hover:border-mint flex items-center justify-center"
          >
            <UserCog size={15} />
          </button>
          <button
            onClick={toggleEstado}
            disabled={procesando}
            title={e.activa ? "Suspender" : "Reactivar"}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-40 ${
              e.activa
                ? "border-slate-200 text-muted hover:text-coral hover:border-coral"
                : "border-mint text-mint-dark"
            }`}
          >
            {e.activa ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <span className="text-xs text-muted">{e.creadoEn.slice(0, 10)}</span>
        </div>
      </div>

      {reasignarAbierto && (
        <div className="px-3 pb-3">
          <FormReasignarAdmin
            empresaId={e.id}
            onOk={(email) => onCambio(`Invitación de admin enviada a ${email} para ${e.nombre}.`)}
            onError={onError}
            onCancelar={onToggleReasignar}
          />
        </div>
      )}
    </div>
  );
}

function FormReasignarAdmin({
  empresaId,
  onOk,
  onError,
  onCancelar,
}: {
  empresaId: number;
  onOk: (email: string) => void;
  onError: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const [nombreAdmin, setNombreAdmin] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await reasignarAdmin(empresaId, { nombreAdmin, emailAdmin });
      onOk(emailAdmin);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo reasignar el admin");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="rounded-xl bg-slate-50 p-3 flex flex-col gap-2.5">
      <p className="text-xs text-muted">
        Invita a un admin_empresa nuevo — si ya hay uno, queda desvinculado (no se borra su cuenta).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          required
          placeholder="Nombre del nuevo admin"
          value={nombreAdmin}
          onChange={(e) => setNombreAdmin(e.target.value)}
          className={inputCls}
        />
        <input
          required
          type="email"
          placeholder="Correo del nuevo admin"
          value={emailAdmin}
          onChange={(e) => setEmailAdmin(e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 rounded-full border border-ink/15 bg-white text-ink text-sm py-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 rounded-full bg-mint text-white font-medium text-sm py-2 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
        >
          {enviando ? "Enviando…" : "Invitar"}
        </button>
      </div>
    </form>
  );
}

function FormNuevaEmpresa({
  onCreada,
  onCancelar,
}: {
  onCreada: (emailAdmin: string) => void;
  onCancelar: () => void;
}) {
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [nit, setNit] = useState("");
  const [sector, setSector] = useState("");
  const [nombreAdmin, setNombreAdmin] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await crearEmpresa({
        nombreAdmin,
        emailAdmin,
        empresa: { nombre: nombreEmpresa, nit, sector },
      });
      onCreada(emailAdmin);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la empresa");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaycheckCard titulo="Nueva empresa">
      <form onSubmit={enviar} className="px-3 pb-3 pt-1 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input required placeholder="Nombre de la empresa" value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} className={inputCls} />
          <input required placeholder="NIT" value={nit} onChange={(e) => setNit(e.target.value)} className={inputCls} />
        </div>
        <input required placeholder="Sector (ej: restaurante)" value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input required placeholder="Nombre del admin" value={nombreAdmin} onChange={(e) => setNombreAdmin(e.target.value)} className={inputCls} />
          <input required type="email" placeholder="Correo del admin" value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} className={inputCls} />
        </div>
        <p className="text-xs text-muted">
          Se le envía un correo de invitación para que defina su propia contraseña — nunca la ves ni la fijas tú.
        </p>
        {error && <p className="text-coral text-sm">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-full border border-ink/15 bg-white text-ink text-sm py-2.5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="flex-1 rounded-full bg-mint text-white font-medium py-2.5 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
          >
            {enviando ? "Creando…" : "Crear e invitar"}
          </button>
        </div>
      </form>
    </PaycheckCard>
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
        <DateField required value={vigenteDesde} onChange={setVigenteDesde} className="w-full" />
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
          <DateField required value={fecha} onChange={setFecha} className="w-full" />
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${inputCls} flex-1`} />
          <button type="submit" className="rounded-full bg-mint text-white px-3 hover:bg-mint-dark transition-colors duration-200">
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
