import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  obtenerCostos,
  obtenerCumplimiento,
  type CostoEmpleado,
  type SemaforoCumplimiento,
} from "../../apiEmpresa";
import Skeleton from "../Skeleton.tsx";
import DetalleColaboradorModal from "./DetalleColaboradorModal.tsx";
import { useDatos } from "../../hooks/useDatos.ts";

// Overview del portal (SDD §06, unificación de marca 2026-07). Primera pantalla
// del panel: cifras de una ojeada + charts recharts sobre datos ya existentes
// (costos + cumplimiento). Cero endpoints nuevos — solo compone lo que ya
// exponía el backend. Paleta índigo/navy, alineada con la entrega del
// marketplace para que producto y entrega se lean como una sola identidad.

const INDIGO = "#5b50e8";
const TEAL = "#0e9e8f";
const AMBER = "#f59e0b";
const ROSE = "#e11d48";

type NivelCumplimiento = SemaforoCumplimiento["nivel"];

const NIVEL_META: Record<
  NivelCumplimiento,
  { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }
> = {
  verde: { label: "En regla", color: TEAL, bg: "bg-teal-50", Icon: CheckCircle2 },
  amarillo: { label: "Con avisos", color: AMBER, bg: "bg-amber-50", Icon: AlertTriangle },
  rojo: { label: "Requiere acción", color: ROSE, bg: "bg-rose-50", Icon: AlertTriangle },
};

export default function ResumenEmpresa() {
  const [seleccionado, setSeleccionado] = useState<CostoEmpleado | null>(null);

  // Una sola carga para las dos fuentes. Cacheada: volver a esta pestaña
  // repinta al instante y revalida en silencio, sin esqueleto de por medio.
  const { datos, cargando, error } = useDatos(
    "resumen",
    async () => {
      const [c, s] = await Promise.all([obtenerCostos(true), obtenerCumplimiento()]);
      return { costos: c, cumpl: s };
    },
  );
  const costos = datos?.costos ?? null;
  const cumpl = datos?.cumpl ?? null;

  if (cargando) return <Skeleton />;
  if (error)
    return <p className="rounded-xl bg-rose-50 text-coral text-sm p-3">{error}</p>;
  if (!costos || !cumpl) return null;

  const t = costos.totales;
  const sobrecosto = Math.round((t.factorPromedio - 1) * 1000) / 10;
  const cargaPatronal = Math.max(0, t.costoTotalMensual - t.nominaBaseMensual);
  const nivel = NIVEL_META[cumpl.nivel];
  const alertasTotal =
    cumpl.aprendicesMalClasificados.length +
    cumpl.salariosBajoMinimo.length +
    cumpl.horasExtraExcedidas.length;

  // Composición del costo empleador: salario base vs. carga patronal
  // (aportes + provisión de prestaciones). El sobrecosto real hecho visible.
  const composicion = [
    { name: "Nómina base", value: t.nominaBaseMensual, color: INDIGO },
    { name: "Carga patronal", value: cargaPatronal, color: AMBER },
  ];

  // Costo total por colaborador — dónde se concentra el gasto. Ordenado de
  // mayor a menor; cada fila abre el detalle línea por línea.
  const conCosto = costos.empleados
    .filter((e) => e.costo)
    .sort((a, b) => b.costo!.costoTotalMensual - a.costo!.costoTotalMensual);
  const maxCosto = conCosto.length ? conCosto[0].costo!.costoTotalMensual : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink">Resumen de tu nómina</h2>
        <p className="text-sm text-muted mt-0.5">
          Costo real, composición y cumplimiento — de una ojeada, sobre los datos ya liquidados.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          Icon={Users}
          etiqueta="Colaboradores activos"
          valor={String(costos.empleados.length)}
          sub={`${costos.contratistas.length} contratistas`}
          tono="indigo"
        />
        <Kpi
          Icon={Wallet}
          etiqueta="Costo total mensual"
          valor={formatCOP(t.costoTotalMensual)}
          sub={`Nómina base ${formatCOP(t.nominaBaseMensual)}`}
          tono="indigo"
          destacado
        />
        <Kpi
          Icon={TrendingUp}
          etiqueta="Sobrecosto real"
          valor={`+${sobrecosto}%`}
          sub="Sobre el salario base"
          tono="amber"
        />
        <Kpi
          Icon={nivel.Icon}
          etiqueta="Cumplimiento"
          valor={nivel.label}
          sub={alertasTotal === 0 ? "Sin alertas" : `${alertasTotal} por revisar`}
          tono={cumpl.nivel === "verde" ? "teal" : cumpl.nivel === "amarillo" ? "amber" : "rose"}
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Composición del costo */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-1">
            Composición del costo empleador
          </h3>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <Donut segmentos={composicion} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold tabular-nums text-ink font-mono">
                  +{sobrecosto}%
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted">sobrecosto</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 text-sm">
              {composicion.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: d.color }}
                  />
                  <span className="text-muted">{d.name}</span>
                  <b className="ml-auto text-ink tabular-nums font-mono text-[13px]">
                    {formatCOP(d.value)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cumplimiento */}
        <div className={`rounded-2xl border border-slate-100 shadow-sm p-5 ${nivel.bg}`}>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-3">
            Semáforo de cumplimiento
          </h3>
          <div className="flex items-center gap-3 mb-4">
            <nivel.Icon size={28} style={{ color: nivel.color }} />
            <div>
              <div className="text-base font-bold" style={{ color: nivel.color }}>
                {nivel.label}
              </div>
              <div className="text-xs text-muted">
                {alertasTotal === 0
                  ? "Todo en orden en este corte"
                  : `${alertasTotal} punto(s) para revisar`}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <AlertaLinea
              etiqueta="Aprendices mal clasificados"
              n={cumpl.aprendicesMalClasificados.length}
            />
            <AlertaLinea
              etiqueta="Salarios bajo el mínimo"
              n={cumpl.salariosBajoMinimo.length}
            />
            <AlertaLinea
              etiqueta="Horas extra excedidas"
              n={cumpl.horasExtraExcedidas.length}
            />
          </div>
        </div>
      </div>

      {/* Costo por colaborador — tabla interactiva, clic para el detalle */}
      {conCosto.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Costo por colaborador
            </h3>
            <div className="hidden sm:flex gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo" /> Salario base
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Carga patronal
              </span>
            </div>
          </div>
          <ul>
            {conCosto.map((e) => {
              const total = e.costo!.costoTotalMensual;
              const base = e.costo!.salarioMensual;
              const patronal = Math.max(0, total - base);
              const anchoRel = maxCosto ? (total / maxCosto) * 100 : 0;
              const basePct = total ? (base / total) * 100 : 0;
              const sobre = Math.round((e.costo!.factorSobreSalario - 1) * 1000) / 10;
              return (
                <li key={e.empleadoId}>
                  <button
                    onClick={() => setSeleccionado(e)}
                    className="group flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:bg-indigo-soft/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{e.nombre}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                          +{sobre}%
                        </span>
                      </div>
                      {/* mini-barra de proporción base vs patronal */}
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden" style={{ width: `${Math.max(anchoRel, 12)}%` }}>
                        <div className="flex h-full w-full">
                          <span className="h-full bg-indigo" style={{ width: `${basePct}%` }} />
                          <span className="h-full bg-amber-500" style={{ width: `${100 - basePct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-bold tabular-nums text-ink">
                        {formatCOP(total)}
                      </div>
                      <div className="font-mono text-[10px] tabular-nums text-muted">
                        base {formatCOP(base)} · patr. {formatCOP(patronal)}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-2.5 text-[11px] text-muted bg-slate-50 border-t border-slate-100">
            Toca un colaborador para ver el desglose línea por línea con su fundamento legal.
          </p>
        </div>
      )}

      <DetalleColaboradorModal empleado={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}

// Donut en SVG puro. Antes esto venía de recharts (<PieChart>), que costaba
// ~347 KB de JS para dibujar dos arcos — más peso que todo el panel junto. Un
// círculo con stroke-dasharray hace lo mismo, anima al entrar y no arrastra
// dependencia. El detalle numérico ya vive en la leyenda de al lado, así que no
// se pierde el tooltip.
function Donut({ segmentos }: { segmentos: { name: string; value: number; color: string }[] }) {
  const total = segmentos.reduce((s, d) => s + d.value, 0) || 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label="Composición del costo">
      {segmentos.map((d) => {
        const largo = (d.value / total) * C;
        const offset = -acumulado;
        acumulado += largo;
        return (
          <circle
            key={d.name}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={d.color}
            strokeWidth="20"
            strokeDasharray={`${largo} ${C - largo}`}
            strokeDashoffset={offset}
            transform="rotate(-90 70 70)"
          >
            <title>{`${d.name}: ${formatCOP(d.value)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function Kpi({
  Icon,
  etiqueta,
  valor,
  sub,
  tono,
  destacado,
}: {
  Icon: typeof Users;
  etiqueta: string;
  valor: string;
  sub: string;
  tono: "indigo" | "amber" | "teal" | "rose";
  destacado?: boolean;
}) {
  const tonos = {
    indigo: { ico: "text-indigo bg-indigo-soft", val: "text-ink" },
    amber: { ico: "text-amber-600 bg-amber-50", val: "text-ink" },
    teal: { ico: "text-teal-600 bg-teal-50", val: "text-ink" },
    rose: { ico: "text-rose-600 bg-rose-50", val: "text-ink" },
  }[tono];
  return (
    <div
      className={`rounded-2xl border shadow-sm px-4 py-3.5 ${
        destacado ? "border-indigo/20 bg-indigo-soft/40" : "border-slate-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{etiqueta}</p>
        <span className={`w-7 h-7 rounded-lg grid place-items-center ${tonos.ico}`}>
          <Icon size={15} />
        </span>
      </div>
      <p className={`text-xl font-bold tabular-nums mt-1.5 font-mono ${tonos.val}`}>{valor}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}

function AlertaLinea({ etiqueta, n }: { etiqueta: string; n: number }) {
  return (
    <div className="flex items-center justify-between text-sm bg-white/60 rounded-lg px-3 py-2">
      <span className="text-ink">{etiqueta}</span>
      <span
        className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${
          n === 0 ? "bg-teal-100 text-teal-700" : "bg-rose-100 text-rose-700"
        }`}
      >
        {n}
      </span>
    </div>
  );
}
