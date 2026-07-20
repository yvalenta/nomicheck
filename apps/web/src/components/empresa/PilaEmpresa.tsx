import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Info, Landmark } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { listarPeriodos, obtenerPilaPeriodo, type Periodo, type PilaPeriodo } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

// Liquidación PILA exacta por periodo (SDD §14) — a diferencia del panel de
// Costos (estimado gerencial, mismo salario cada mes), usa el IBC real de
// cada recibo ya liquidado: valores exactos, sin generar el archivo de
// planilla que se sube a un operador PILA (fuera de alcance, ver footer).
export default function PilaEmpresa() {
  const [periodos, setPeriodos] = useState<Periodo[] | null>(null);
  const [periodoId, setPeriodoId] = useState<number | null>(null);
  const [exonerado, setExonerado] = useState(true);
  const [datos, setDatos] = useState<PilaPeriodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abiertoId, setAbiertoId] = useState<number | null>(null);

  useEffect(() => {
    listarPeriodos().then((ps) => {
      const liquidados = ps.filter((p) => p.estado !== "borrador");
      setPeriodos(liquidados);
      if (liquidados.length > 0) setPeriodoId(liquidados[0].id);
    });
  }, []);

  useEffect(() => {
    if (periodoId === null) return;
    setCargando(true);
    setError(null);
    obtenerPilaPeriodo(periodoId, exonerado)
      .then(setDatos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [periodoId, exonerado]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <Landmark size={18} className="text-mint-dark" /> Liquidación PILA por periodo
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Aportes patronales sobre el IBC real del periodo liquidado — no un estimado mensual.
        </p>
      </div>

      {periodos !== null && periodos.length === 0 && (
        <p className="rounded-xl bg-slate-50 text-muted text-sm p-3">
          Todavía no tienes ningún periodo liquidado — la PILA exacta necesita recibos reales.
        </p>
      )}

      {periodos !== null && periodos.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Periodo
            <select
              value={periodoId ?? ""}
              onChange={(e) => setPeriodoId(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fechaInicio.slice(0, 10)} — {p.fechaFin.slice(0, 10)} ({p.estado})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-ink px-1">
            <input
              type="checkbox"
              checked={exonerado}
              onChange={(e) => setExonerado(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 mt-0.5"
            />
            <span>
              Empresa contribuyente de renta (exoneración Ley 1607 de 2012, art. 25)
              <span className="block text-xs text-muted font-normal">
                Exonera salud patronal, SENA e ICBF para salarios menores a 10 SMLMV (evaluado sobre el
                salario pactado, no el IBC del periodo).
              </span>
            </span>
          </label>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {datos && (
        <div className="grid grid-cols-2 gap-3">
          <Stat etiqueta="IBC total del periodo" valor={formatCOP(datos.totales.ibcTotal)} />
          <Stat etiqueta="Costo patronal total" valor={formatCOP(datos.totales.costoTotalPeriodo)} destacado />
        </div>
      )}

      {periodos !== null && periodos.length > 0 && (
        <PaycheckCard titulo="Por colaborador">
          {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Calculando…</p>}
          {!cargando && datos && datos.empleados.length === 0 && (
            <p className="text-sm text-muted px-3 py-6 text-center">
              Este periodo no tiene recibos de empleados.
            </p>
          )}
          <div className="flex flex-col">
            {!cargando &&
              datos?.empleados.map((e) => (
                <Fragment key={e.empleadoId}>
                  <button
                    onClick={() => setAbiertoId(abiertoId === e.empleadoId ? null : e.empleadoId)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors duration-200 text-left w-full"
                  >
                    {abiertoId === e.empleadoId ? (
                      <ChevronDown size={16} className="text-muted shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{e.nombre}</p>
                      <p className="text-xs text-muted">Clase de riesgo ARL {["I", "II", "III", "IV", "V"][e.claseRiesgoArl - 1]}</p>
                    </div>
                    {e.pila ? (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-ink tabular-nums">
                          {formatCOP(e.pila.costoTotalPeriodo)}
                        </p>
                        <p className="text-xs text-muted tabular-nums">IBC {formatCOP(e.pila.ibcPeriodo)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted shrink-0">Aprendiz SENA — sin IBC</p>
                    )}
                  </button>

                  {abiertoId === e.empleadoId && e.pila && (
                    <div className="mx-3 mb-2 rounded-xl bg-slate-50 p-3 flex flex-col gap-1.5">
                      <div className="flex justify-between text-sm text-ink">
                        <span>IBC del periodo</span>
                        <span className="tabular-nums">{formatCOP(e.pila.ibcPeriodo)}</span>
                      </div>
                      {e.pila.lineas.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3 text-sm">
                          <span className="text-muted">
                            {l.concepto}
                            {l.pct !== undefined && ` (${(l.pct * 100).toFixed(l.pct < 0.01 ? 3 : 1)}%)`}
                            <span className="block text-[11px] opacity-70">{l.ley}</span>
                          </span>
                          <span className="tabular-nums text-ink shrink-0">{formatCOP(l.valor)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold text-ink border-t border-slate-200 pt-1.5 mt-0.5">
                        <span>Costo total del periodo</span>
                        <span className="tabular-nums">{formatCOP(e.pila.costoTotalPeriodo)}</span>
                      </div>
                      {e.pila.advertencias.map((a, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-xs text-muted mt-1">
                          <Info size={13} className="shrink-0 mt-0.5" /> {a}
                        </p>
                      ))}
                    </div>
                  )}
                </Fragment>
              ))}
          </div>
        </PaycheckCard>
      )}

      <p className="text-xs text-muted text-center px-4">
        Valores exactos por IBC real del periodo — no genera el archivo/formato de planilla que se sube
        a un operador PILA (Aportes en Línea, SOI, etc.), eso requiere un operador autorizado.
      </p>
    </div>
  );
}

function Stat({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div
      className={`rounded-2xl shadow-sm border px-4 py-3 ${
        destacado ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100"
      }`}
    >
      <p className="text-xs text-muted">{etiqueta}</p>
      <p className={`text-base font-bold tabular-nums mt-0.5 ${destacado ? "text-mint-dark" : "text-ink"}`}>
        {valor}
      </p>
    </div>
  );
}
