import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { obtenerCostos, type CostosEmpresa as DatosCostos } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";
import { useDatos } from "../../hooks/useDatos.ts";

// Panel de costo total empleador (SDD §13): lo que la nómina cuesta DE
// VERDAD — salario + auxilio + aportes patronales + provisión de
// prestaciones — con cada línea citando su fuente legal (misma
// transparencia del verificador anónimo).
export default function CostosEmpresa() {
  const [exonerado, setExonerado] = useState(true);
  const [abiertoId, setAbiertoId] = useState<number | null>(null);

  // Las dos variantes (con y sin exoneración) se cachean por separado: la
  // primera vez cada una viaja al motor, y a partir de ahí alternar el toggle
  // repinta al instante desde memoria mientras revalida por detrás. El cálculo
  // sigue siendo del backend — aquí no se replica ninguna regla de nómina.
  const { datos, cargando, error } = useDatos<DatosCostos>(
    `costos:${exonerado}`,
    () => obtenerCostos(exonerado),
  );

  const t = datos?.totales;
  const sobrecosto = t ? Math.round((t.factorPromedio - 1) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink">¿Cuánto cuesta tu nómina de verdad?</h2>
        <p className="text-sm text-muted mt-0.5">
          Salario + aportes patronales + provisión de prestaciones, con cada línea citando su ley.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat etiqueta="Colaboradores activos" valor={String(datos!.empleados.length)} />
          <Stat etiqueta="Nómina base" valor={formatCOP(t.nominaBaseMensual)} />
          <Stat etiqueta="Costo total mensual" valor={formatCOP(t.costoTotalMensual)} destacado />
          <Stat etiqueta="Sobrecosto real" valor={`+${sobrecosto}%`} />
        </div>
      )}

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
            Exonera salud patronal, SENA e ICBF para salarios menores a 10 SMLMV. Desmárcala si tu
            entidad no es contribuyente (p. ej. sin ánimo de lucro).
          </span>
        </span>
      </label>

      <PaycheckCard titulo="Costo por colaborador">
        {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Calculando…</p>}
        {!cargando && datos && datos.empleados.length === 0 && (
          <p className="text-sm text-muted px-3 py-6 text-center">No tienes colaboradores activos.</p>
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
                    <p className="text-xs text-muted">Salario base {formatCOP(e.salarioBase)}</p>
                  </div>
                  {e.costo ? (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-ink tabular-nums">
                        {formatCOP(e.costo.costoTotalMensual)}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        ×{e.costo.factorSobreSalario.toFixed(3)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted shrink-0">
                      Aprendiz SENA — sin carga patronal plena
                    </p>
                  )}
                </button>

                {abiertoId === e.empleadoId && e.costo && (
                  <div className="mx-3 mb-2 rounded-xl bg-slate-50 p-3 flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm text-ink">
                      <span>Salario base</span>
                      <span className="tabular-nums">{formatCOP(e.costo.salarioMensual)}</span>
                    </div>
                    {e.costo.lineas.map((l, i) => (
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
                      <span>Costo total mensual</span>
                      <span className="tabular-nums">{formatCOP(e.costo.costoTotalMensual)}</span>
                    </div>
                    {e.costo.advertencias.map((a, i) => (
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

      {datos && datos.contratistas.length > 0 && (
        <PaycheckCard titulo="Contratistas (solo honorarios)">
          <div className="flex flex-col">
            {datos.contratistas.map((c) => (
              <div key={c.contratistaId} className="flex justify-between px-3 py-2.5 text-sm">
                <span className="text-ink">{c.nombre}</span>
                <span className="tabular-nums font-medium text-ink">{formatCOP(c.honorariosMensuales)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted px-3 pb-3">
            No generan aportes patronales ni prestaciones: son prestación de servicios (Ley 1819 de
            2016, art. 244) — sus aportes los liquidan ellos mismos.
          </p>
        </PaycheckCard>
      )}

      <p className="text-xs text-muted text-center px-4">
        Estimado gerencial mensual — no reemplaza la PILA ni el cálculo exacto por días trabajados.
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
