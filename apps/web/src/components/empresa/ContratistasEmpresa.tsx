import { useEffect, useState } from "react";
import { Briefcase, Plus } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { crearContratista, listarContratistas, type Contratista } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function ContratistasEmpresa() {
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function recargar() {
    listarContratistas()
      .then(setContratistas)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(recargar, []);

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

      {mostrarForm && <FormContratista onGuardar={agregar} />}

      <PaycheckCard>
        {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Cargando…</p>}
        {!cargando && contratistas.length === 0 && (
          <p className="text-sm text-muted px-3 py-6 text-center">Aún no tienes contratistas.</p>
        )}
        <div className="flex flex-col">
          {contratistas.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200"
            >
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
            </div>
          ))}
        </div>
      </PaycheckCard>
    </div>
  );
}

function FormContratista({ onGuardar }: { onGuardar: (d: Omit<Contratista, "id" | "activo">) => void }) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [honorariosMensuales, setHonorariosMensuales] = useState("");

  return (
    <PaycheckCard titulo="Nuevo contratista">
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
        <input
          required
          type="number"
          placeholder="Honorarios mensuales"
          value={honorariosMensuales}
          onChange={(e) => setHonorariosMensuales(e.target.value)}
          className={inputCls}
        />
        <button
          type="submit"
          className="rounded-xl bg-mint text-white font-semibold py-2.5 hover:bg-mint-dark transition-colors duration-200"
        >
          Guardar contratista
        </button>
      </form>
    </PaycheckCard>
  );
}
