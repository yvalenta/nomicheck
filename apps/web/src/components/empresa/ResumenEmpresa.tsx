import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

// Inicio del panel (SDD §06; dirección C de la propuesta 2026-08-20). Primera
// pantalla: cifras de una ojeada + la ACCIÓN del periodo como protagonista —
// liquidar es a lo que la empresa viene, así que va en su propio bloque
// midnight en vez de escondida en una pestaña. Cero endpoints nuevos: compone
// costos + cumplimiento, lo que ya exponía el backend. Sin título de página a
// propósito: el contexto vive una sola vez en el header, no repetido aquí.

const INDIGO = "#5b50e8";
const TEAL = "#0e9e8f";
const AMBER = "#f59e0b";
const ROSE = "#e11d48";

type NivelCumplimiento = SemaforoCumplimiento["nivel"];

const NIVEL_META: Record<
  NivelCumplimiento,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  verde: { label: "En regla", color: TEAL, Icon: CheckCircle2 },
  amarillo: { label: "Con avisos", color: AMBER, Icon: AlertTriangle },
  rojo: { label: "Requiere acción", color: ROSE, Icon: AlertTriangle },
};

// Colores de las iniciales, rotando: índigo / teal / ámbar suaves.
const AVATARES = [
  "bg-indigo-soft text-mint-dark",
  "bg-teal-50 text-teal-700",
  "bg-amber-50 text-amber-700",
];

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

const ATAJOS: { etiqueta: string; ruta: string }[] = [
  { etiqueta: "PILA", ruta: "/pila" },
  { etiqueta: "Discrepancias", ruta: "/discrepancias" },
  { etiqueta: "Auditoría", ruta: "/auditoria" },
  { etiqueta: "Sedes", ruta: "/sedes" },
];

export default function ResumenEmpresa() {
  const [seleccionado, setSeleccionado] = useState<CostoEmpleado | null>(null);
  const navigate = useNavigate();

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

  const mesActual = new Date().toLocaleDateString("es-CO", { month: "long" });

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
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Kpi
          etiqueta="Colaboradores"
          valor={String(costos.empleados.length)}
          sub={`${costos.contratistas.length} contratistas`}
        />
        <Kpi
          etiqueta="Costo total mensual"
          valor={formatCOP(t.costoTotalMensual)}
          sub={`Base ${formatCOP(t.nominaBaseMensual)} · +${sobrecosto}%`}
          tono="destacado"
        />
        <Kpi etiqueta="Sobrecosto real" valor={`+${sobrecosto}%`} sub="Sobre el salario base" />
        <Kpi
          etiqueta="Cumplimiento"
          valor={nivel.label}
          sub={alertasTotal === 0 ? "Sin alertas" : `${alertasTotal} por revisar`}
          tono={cumpl.nivel === "rojo" ? "alerta" : cumpl.nivel === "amarillo" ? "aviso" : undefined}
        />
      </div>

      {/* La acción del periodo + composición */}
      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex items-center justify-between gap-4 rounded-[14px] bg-midnight bg-dots p-5 shadow-accion">
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
              Acción del periodo
            </p>
            <p className="font-display text-lg font-semibold text-white mt-0.5 capitalize">
              Liquidar {mesActual}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {costos.empleados.length} colaborador{costos.empleados.length === 1 ? "" : "es"} ·
              desde los periodos con sus turnos
            </p>
          </div>
          <button
            onClick={() => navigate("/periodos")}
            className="flex shrink-0 items-center gap-2 rounded-[10px] bg-mint px-4 py-2.5 text-sm font-semibold text-white shadow-realce transition-colors hover:bg-mint-dark"
          >
            Liquidar ahora <ArrowRight size={15} />
          </button>
        </div>

        <div className="flex items-center gap-4 rounded-[14px] bg-white p-4 shadow-suave">
          <div className="relative shrink-0">
            <Donut segmentos={composicion} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-display text-sm font-bold tabular-nums text-ink">
                +{sobrecosto}%
              </span>
              <span className="text-[8px] uppercase tracking-wide text-muted">sobrecosto</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
              Costo empleador
            </p>
            {composicion.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: d.color }} />
                <span className="truncate text-xs text-muted">{d.name}</span>
                <b className="ml-auto font-display text-[13px] tabular-nums text-ink">
                  {formatCOP(d.value)}
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Costo por colaborador + semáforo */}
      <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {conCosto.length > 0 && (
          <div className="overflow-hidden rounded-[14px] bg-white shadow-suave">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                Costo por colaborador
              </h3>
              <div className="hidden sm:flex gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-[3px] bg-indigo" /> Salario base
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-[3px] bg-amber-500" /> Carga patronal
                </span>
              </div>
            </div>
            <ul>
              {conCosto.map((e, i) => {
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
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${AVATARES[i % AVATARES.length]}`}
                      >
                        {iniciales(e.nombre)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{e.nombre}</span>
                          <span className="shrink-0 rounded-full bg-indigo-soft px-1.5 py-0.5 text-[9px] font-semibold text-mint-dark">
                            +{sobre}%
                          </span>
                        </div>
                        {/* mini-barra de proporción base vs patronal */}
                        <div
                          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                          style={{ width: `${Math.max(anchoRel, 12)}%` }}
                        >
                          <div className="flex h-full w-full">
                            <span className="h-full bg-indigo" style={{ width: `${basePct}%` }} />
                            <span className="h-full bg-amber-500" style={{ width: `${100 - basePct}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-sm font-semibold tabular-nums text-ink">
                          {formatCOP(total)}
                        </div>
                        <div className="text-[10px] tabular-nums text-muted">
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
            <p className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-muted">
              Toca un colaborador para ver el desglose línea por línea con su fundamento legal.
            </p>
          </div>
        )}

        <div
          className={`rounded-[14px] bg-white p-5 ${
            cumpl.nivel === "rojo" ? "shadow-alerta border border-rose-100" : "shadow-suave"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              Semáforo de cumplimiento
            </h3>
            <button
              onClick={() => navigate("/cumplimiento")}
              className="text-[11px] font-medium text-mint hover:underline"
            >
              Ver control →
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2.5">
            <nivel.Icon size={22} style={{ color: nivel.color }} />
            <div>
              <div className="font-display text-[15px] font-semibold" style={{ color: nivel.color }}>
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
            <AlertaLinea etiqueta="Salarios bajo el mínimo" n={cumpl.salariosBajoMinimo.length} />
            <AlertaLinea etiqueta="Horas extra excedidas" n={cumpl.horasExtraExcedidas.length} />
          </div>
        </div>
      </div>

      {/* Atajos a lo que no tiene destino propio en el menú */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
          Atajos
        </span>
        {ATAJOS.map((a) => (
          <button
            key={a.ruta}
            onClick={() => navigate(a.ruta)}
            className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-muted shadow-suave transition-colors hover:text-ink"
          >
            {a.etiqueta}
          </button>
        ))}
      </div>

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
  const R = 40;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg width={104} height={104} viewBox="0 0 104 104" role="img" aria-label="Composición del costo">
      {segmentos.map((d) => {
        const largo = (d.value / total) * C;
        const offset = -acumulado;
        acumulado += largo;
        return (
          <circle
            key={d.name}
            cx="52"
            cy="52"
            r={R}
            fill="none"
            stroke={d.color}
            strokeWidth="14"
            strokeDasharray={`${largo} ${C - largo}`}
            strokeDashoffset={offset}
            transform="rotate(-90 52 52)"
          >
            <title>{`${d.name}: ${formatCOP(d.value)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function Kpi({
  etiqueta,
  valor,
  sub,
  tono,
}: {
  etiqueta: string;
  valor: string;
  sub: string;
  /** destacado: la cifra que manda (índigo). alerta/aviso: cumplimiento. */
  tono?: "destacado" | "alerta" | "aviso";
}) {
  const caja =
    tono === "destacado"
      ? "border border-indigo/15 bg-gradient-to-br from-white to-indigo-soft/60 shadow-realce"
      : tono === "alerta"
        ? "border border-rose-100 bg-white shadow-alerta"
        : "bg-white shadow-suave";
  const color =
    tono === "destacado"
      ? "text-mint-dark"
      : tono === "alerta"
        ? "text-rose-600"
        : tono === "aviso"
          ? "text-amber-600"
          : "text-ink";
  return (
    <div className={`rounded-[14px] px-4 py-3.5 ${caja}`}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">{etiqueta}</p>
      <p className={`font-display mt-1.5 text-xl font-semibold tabular-nums leading-tight ${color}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function AlertaLinea({ etiqueta, n }: { etiqueta: string; n: number }) {
  const alerta = n > 0;
  return (
    <div
      className={`flex items-center justify-between rounded-[10px] px-3 py-2 text-sm ${
        alerta ? "bg-rose-50" : "bg-slate-50"
      }`}
    >
      <span className={alerta ? "font-medium text-ink" : "text-muted"}>{etiqueta}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
          alerta ? "bg-rose-600 text-white" : "text-teal-700"
        }`}
      >
        {n}
      </span>
    </div>
  );
}
