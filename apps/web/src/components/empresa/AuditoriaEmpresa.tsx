import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileClock, MinusCircle, PencilLine, PlusCircle, XCircle } from "lucide-react";
import { listarAuditoria, type EntradaAuditoria } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

// Bitácora inmutable (SDD §15, pilar 1B). Poblada por trigger PL/pgSQL;
// aquí es solo consulta — no hay endpoint de escritura ni permite editar.
const ACCION: Record<EntradaAuditoria["accion"], { label: string; Icono: typeof PlusCircle; clase: string }> = {
  INSERT: { label: "Creado", Icono: PlusCircle, clase: "text-mint-dark" },
  UPDATE: { label: "Editado", Icono: PencilLine, clase: "text-amber-700" },
  DELETE: { label: "Eliminado", Icono: XCircle, clase: "text-coral" },
};

const TABLA_LABEL: Record<string, string> = {
  ReciboPago: "Recibo de pago",
  PeriodoNomina: "Periodo de nómina",
  Empleado: "Colaborador",
};

export default function AuditoriaEmpresa() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    listarAuditoria(100).then(setEntradas).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <FileClock size={18} className="text-mint-dark" /> Auditoría de cambios
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Bitácora inmutable de creación, edición y eliminación sobre nómina, periodos y colaboradores. La escribe el motor por trigger — nadie puede modificar el pasado.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {entradas === null && !error && <p className="text-sm text-muted text-center py-6">Cargando…</p>}
      {entradas && entradas.length === 0 && (
        <PaycheckCard>
          <p className="text-sm text-muted text-center py-6 flex items-center justify-center gap-2">
            <MinusCircle size={14} /> Aún no hay cambios registrados.
          </p>
        </PaycheckCard>
      )}

      {entradas && entradas.length > 0 && (
        <PaycheckCard>
          <div className="flex flex-col divide-y divide-slate-100">
            {entradas.map((e) => {
              const acc = ACCION[e.accion];
              const abre = abierta === e.id;
              return (
                <div key={e.id}>
                  <button
                    onClick={() => setAbierta(abre ? null : e.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 text-left"
                  >
                    {abre ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
                    <acc.Icono size={16} className={`${acc.clase} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-medium">{acc.label}</span>
                        {" "}
                        {(TABLA_LABEL[e.tabla] ?? e.tabla).toLowerCase()}
                        {" "}#{e.registroId}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {new Date(e.creadoEn).toLocaleString("es-CO")}
                        {" · "}
                        {e.usuario ? `${e.usuario.nombre}${e.usuario.email ? ` (${e.usuario.email})` : ""}` : "sin autor registrado"}
                      </p>
                    </div>
                  </button>
                  {abre && (
                    <div className="mx-3 mb-2 rounded-xl bg-slate-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <Diff titulo="Antes" datos={e.valoresAnteriores} />
                      <Diff titulo="Después" datos={e.valoresNuevos} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </PaycheckCard>
      )}
    </div>
  );
}

function Diff({ titulo, datos }: { titulo: string; datos: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="font-medium text-ink mb-1">{titulo}</p>
      {datos === null ? (
        <p className="text-muted italic">—</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all text-muted font-mono text-[11px]">
          {JSON.stringify(datos, null, 2)}
        </pre>
      )}
    </div>
  );
}
