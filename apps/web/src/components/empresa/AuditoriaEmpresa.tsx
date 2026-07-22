import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileClock, MinusCircle, PencilLine, PlusCircle, XCircle } from "lucide-react";
import { listarAuditoria, type EntradaAuditoria, type RespuestaPaginada } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";
import CampoBusqueda from "../filtros/CampoBusqueda.tsx";
import SelectFiltro from "../filtros/SelectFiltro.tsx";
import Paginador from "../filtros/Paginador.tsx";
import { useFiltrosUrl } from "../filtros/useFiltrosUrl.ts";

// Bitácora inmutable (SDD §15, pilar 1B) con filtros + paginación. Todos
// los filtros viven en la URL (?q=&tabla=&accion=&desde=&hasta=&page=) —
// se pueden compartir por link, y el back del navegador funciona.
const ACCION: Record<string, { label: string; Icono: typeof PlusCircle; clase: string }> = {
  INSERT: { label: "Creado", Icono: PlusCircle, clase: "text-mint-dark" },
  UPDATE: { label: "Editado", Icono: PencilLine, clase: "text-amber-700" },
  DELETE: { label: "Eliminado", Icono: XCircle, clase: "text-coral" },
};

const TABLA_LABEL: Record<string, string> = {
  ReciboPago: "Recibo de pago",
  PeriodoNomina: "Periodo de nómina",
  Empleado: "Colaborador",
};

type Tabla = "ReciboPago" | "PeriodoNomina" | "Empleado";
type Accion = "INSERT" | "UPDATE" | "DELETE";

type Filtros = {
  q: string;
  tabla: Tabla | "";
  accion: Accion | "";
  desde: string;
  hasta: string;
  page: number;
};

const DEFAULTS: Filtros = { q: "", tabla: "", accion: "", desde: "", hasta: "", page: 1 };

export default function AuditoriaEmpresa() {
  const [filtros, setFiltros] = useFiltrosUrl<Filtros>(DEFAULTS);
  const [respuesta, setRespuesta] = useState<RespuestaPaginada<EntradaAuditoria> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    setError(null);
    listarAuditoria({
      q: filtros.q || undefined,
      tabla: filtros.tabla || undefined,
      accion: filtros.accion || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      page: filtros.page,
      limit: 25,
    })
      .then(setRespuesta)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [filtros.q, filtros.tabla, filtros.accion, filtros.desde, filtros.hasta, filtros.page]);

  // Cualquier cambio de filtro (menos page) vuelve a página 1 — de otro
  // modo, filtrar más agresivo desde página 8 mostraría "0 resultados"
  // aunque haya varios en la 1.
  function cambiarFiltro(patch: Partial<Filtros>) {
    setFiltros({ ...patch, page: 1 });
  }

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

      <PaycheckCard>
        <div className="px-3 py-3 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <CampoBusqueda
              value={filtros.q}
              onChange={(q) => cambiarFiltro({ q })}
              placeholder="Buscar por usuario (nombre o email)…"
            />
            <SelectFiltro<Tabla>
              value={filtros.tabla}
              onChange={(v) => cambiarFiltro({ tabla: v })}
              todasLabel="Todas las tablas"
              opciones={[
                { valor: "ReciboPago", etiqueta: "Recibos de pago" },
                { valor: "PeriodoNomina", etiqueta: "Periodos de nómina" },
                { valor: "Empleado", etiqueta: "Colaboradores" },
              ]}
            />
            <SelectFiltro<Accion>
              value={filtros.accion}
              onChange={(v) => cambiarFiltro({ accion: v })}
              todasLabel="Todas las acciones"
              opciones={[
                { valor: "INSERT", etiqueta: "Creaciones" },
                { valor: "UPDATE", etiqueta: "Ediciones" },
                { valor: "DELETE", etiqueta: "Eliminaciones" },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
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
            {(filtros.q || filtros.tabla || filtros.accion || filtros.desde || filtros.hasta) && (
              <button
                onClick={() => setFiltros(DEFAULTS)}
                className="text-xs text-mint-dark hover:underline ml-auto"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </PaycheckCard>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {respuesta && (
        <>
          <PaycheckCard>
            {cargando && <p className="text-sm text-muted text-center py-6">Cargando…</p>}
            {!cargando && respuesta.items.length === 0 && (
              <p className="text-sm text-muted text-center py-6 flex items-center justify-center gap-2">
                <MinusCircle size={14} /> Sin cambios que coincidan con estos filtros.
              </p>
            )}
            {!cargando && respuesta.items.length > 0 && (
              <div className="flex flex-col divide-y divide-slate-100">
                {respuesta.items.map((e) => {
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
            )}
          </PaycheckCard>
          <Paginador
            page={respuesta.page}
            total={respuesta.total}
            limit={respuesta.limit}
            onCambio={(page) => setFiltros({ page })}
          />
        </>
      )}
    </div>
  );
}

function Diff({ titulo, datos }: { titulo: string; datos: unknown }) {
  return (
    <div>
      <p className="font-medium text-ink mb-1">{titulo}</p>
      {datos === null || datos === undefined ? (
        <p className="text-muted italic">—</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all text-muted font-mono text-[11px]">
          {JSON.stringify(datos, null, 2)}
        </pre>
      )}
    </div>
  );
}
