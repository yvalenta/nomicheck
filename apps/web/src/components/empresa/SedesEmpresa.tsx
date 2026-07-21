import { useEffect, useState } from "react";
import { Building2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import {
  asignarStaff,
  crearSede,
  eliminarSede,
  listarSedes,
  listarStaff,
  quitarStaff,
  type Sede,
  type StaffEmpresa,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

// Sedes + staff empresarial (SDD §15, pilar 1). Solo admin_empresa ve esta
// pestaña — el auditor y el analista_rrhh no pueden gestionar quién entra.
export default function SedesEmpresa() {
  const [sedes, setSedes] = useState<Sede[] | null>(null);
  const [staff, setStaff] = useState<StaffEmpresa[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    setError(null);
    try {
      const [s, st] = await Promise.all([listarSedes(), listarStaff()]);
      setSedes(s);
      setStaff(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <Building2 size={18} className="text-mint-dark" /> Sedes y personal
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Divide tu empresa por sucursales/departamentos y asigna analistas de nómina o auditores
          — cada analista ve solo su(s) sede(s); el auditor ve todo pero no puede modificar.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      <PanelSedes sedes={sedes} onCambio={recargar} />
      <PanelStaff staff={staff} sedes={sedes ?? []} onCambio={recargar} />
    </div>
  );
}

function PanelSedes({ sedes, onCambio }: { sedes: Sede[] | null; onCambio: () => void }) {
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      await crearSede(nombre);
      setNombre("");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setCreando(false);
    }
  }

  async function borrar(s: Sede) {
    if (!confirm(`¿Eliminar la sede "${s.nombre}"? Sus colaboradores quedan sin sede asignada y los analistas ligados a ella pierden ese acceso.`)) return;
    try {
      await eliminarSede(s.id);
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <PaycheckCard titulo="Sedes">
      <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
        <form onSubmit={crear} className="flex gap-2">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Sede Medellín, Bogotá centro…"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creando}
            className="flex items-center gap-1.5 rounded-xl bg-mint text-white text-sm font-semibold px-3 py-2 hover:bg-mint-dark disabled:opacity-50"
          >
            <Plus size={14} /> Crear
          </button>
        </form>
        {error && <p className="text-coral text-xs">{error}</p>}

        {sedes === null && <p className="text-sm text-muted text-center py-2">Cargando…</p>}
        {sedes && sedes.length === 0 && (
          <p className="text-sm text-muted text-center py-2">
            Aún no tienes sedes — tu empresa opera como una sola sucursal. Puedes seguir así.
          </p>
        )}
        {sedes && sedes.length > 0 && (
          <div className="flex flex-col divide-y divide-slate-100">
            {sedes.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{s.nombre}</p>
                  <p className="text-xs text-muted">
                    {s._count.empleados} colaborador(es) · {s._count.analistas} analista(s)
                  </p>
                </div>
                <button onClick={() => borrar(s)} className="text-muted hover:text-coral" title="Eliminar sede">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PaycheckCard>
  );
}

function PanelStaff({
  staff,
  sedes,
  onCambio,
}: {
  staff: StaffEmpresa[] | null;
  sedes: Sede[];
  onCambio: () => void;
}) {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"analista_rrhh" | "auditor">("analista_rrhh");
  const [sedeIds, setSedeIds] = useState<Set<number>>(new Set());
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar(e: React.FormEvent) {
    e.preventDefault();
    setAsignando(true);
    setError(null);
    try {
      await asignarStaff({ email, rol, sedeIds: [...sedeIds] });
      setEmail("");
      setSedeIds(new Set());
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo asignar");
    } finally {
      setAsignando(false);
    }
  }

  async function quitar(s: StaffEmpresa) {
    if (!confirm(`¿Quitar a ${s.nombre} (${s.rol}) de tu empresa? La cuenta seguirá existiendo pero sin acceso.`)) return;
    try {
      await quitarStaff(s.id);
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar");
    }
  }

  return (
    <PaycheckCard titulo="Personal de plataforma">
      <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
        <form onSubmit={asignar} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-muted flex items-start gap-1.5">
            <UserPlus size={13} className="mt-0.5" />
            La persona debe registrarse primero en /login. Aquí solo la vinculas a tu empresa con un rol y (opcional) sus sedes.
          </p>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@empresa.com"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as "analista_rrhh" | "auditor")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="analista_rrhh">Analista de RR.HH. (opera sobre su(s) sede(s))</option>
            <option value="auditor">Auditor (solo lectura de toda la empresa)</option>
          </select>
          {rol === "analista_rrhh" && sedes.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted">Sedes asignadas (dejar vacío = ve toda la empresa)</p>
              {sedes.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sedeIds.has(s.id)}
                    onChange={(e) =>
                      setSedeIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                  {s.nombre}
                </label>
              ))}
            </div>
          )}
          {error && <p className="text-coral text-xs">{error}</p>}
          <button
            type="submit"
            disabled={asignando}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-mint text-white text-sm font-semibold px-3 py-2 hover:bg-mint-dark disabled:opacity-50"
          >
            <UserPlus size={14} /> Asignar acceso
          </button>
        </form>

        {staff === null && <p className="text-sm text-muted text-center py-2">Cargando…</p>}
        {staff && staff.length === 0 && (
          <p className="text-sm text-muted text-center py-2 flex items-center justify-center gap-2">
            <Users size={14} /> Aún no has asignado analistas ni auditores.
          </p>
        )}
        {staff && staff.length > 0 && (
          <div className="flex flex-col divide-y divide-slate-100">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{s.nombre}</p>
                  <p className="text-xs text-muted truncate">
                    {s.email} · {s.rol === "analista_rrhh" ? "Analista RR.HH." : "Auditor"}
                    {s.sedeIds.length > 0 && ` · ${s.sedeIds.length} sede(s)`}
                    {s.rol === "analista_rrhh" && s.sedeIds.length === 0 && " · toda la empresa"}
                  </p>
                </div>
                <button onClick={() => quitar(s)} className="text-muted hover:text-coral" title="Quitar acceso">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PaycheckCard>
  );
}
