import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, ChevronDown, Info, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCOP } from "@pv/reglas";
import type { DesgloseIndemnizacion, ResultadoIndemnizacion } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import { marcasDeAnios } from "./indemnizacionMarcas.ts";

// La lectura larga del resultado: la cifra sola no dice de dónde sale, y el
// desglose en filas de texto se lee como una factura. Todo lo que se dibuja acá
// sale de `resultado.desglose` — los coeficientes que USÓ el motor en esta
// corrida, no una segunda implementación de la regla en el navegador. Si la ley
// cambia en `@pv/reglas`, estos gráficos cambian solos; si alguien los hiciera
// recalculando acá, mentirían el día que cambie.

const INDIGO = "#5b50e8";
const VERDE = "#0d9488";
const AMBAR = "#f59e0b";
const SLATE = "#94a3b8";

function fecha(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es });
}

/** "1 año 4 meses" — la antigüedad en la unidad en que la gente la piensa. */
function antiguedad(dias: number): string {
  const anios = Math.floor(dias / 360);
  const meses = Math.floor((dias % 360) / 30);
  const partes = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? "año" : "años"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  if (partes.length === 0) return `${dias} días`;
  return partes.join(" ");
}

function Chip({ children, tono = "slate" }: { children: React.ReactNode; tono?: "indigo" | "slate" | "ambar" }) {
  const cls = {
    indigo: "bg-indigo-soft text-mint-dark",
    slate: "bg-slate-100 text-muted",
    ambar: "bg-amber-50 text-amber-700",
  }[tono];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Título de sección dentro del resultado — separa gráficos sin cajas anidadas. */
function Seccion({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {icono} {titulo}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/**
 * Línea de tiempo del contrato.
 *
 * El tramo lleno es el que el resultado cobra: para el indefinido, la
 * antigüedad que generó los días; para el término fijo, lo que faltaba del
 * plazo. Es la única forma de que "días de indemnización" deje de ser un número
 * suelto y se vea contra el contrato del que salió.
 */
function LineaDeTiempo({
  desde,
  hasta,
  etiquetaDesde,
  etiquetaHasta,
  color,
  nota,
  marcas = [],
}: {
  desde: string;
  hasta: string;
  etiquetaDesde: string;
  etiquetaHasta: string;
  color: string;
  nota: string;
  /** Cortes en % del tramo (los años cumplidos): sin ellos la barra es un rectángulo lleno que no dice nada. */
  marcas?: { pct: number; etiqueta: string }[];
}) {
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAncho(100));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${ancho}%`, background: color }}
        />
        {marcas.map((m) => (
          <span
            key={m.pct}
            title={m.etiqueta}
            className="absolute top-0 h-full w-px bg-white/70"
            style={{ left: `${m.pct}%` }}
          />
        ))}
      </div>
      {marcas.length > 0 && (
        <div className="relative h-3">
          {marcas.map((m) => (
            <span
              key={m.pct}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-muted"
              style={{ left: `${m.pct}%` }}
            >
              {m.etiqueta}
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-between gap-3 mt-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted">{etiquetaDesde}</p>
          <p className="text-xs font-semibold text-ink">{fecha(desde)}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted">{etiquetaHasta}</p>
          <p className="text-xs font-semibold text-ink">{fecha(hasta)}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{nota}</p>
    </div>
  );
}

/** Barra apilada de días: primer año vs. años adicionales, con su valor en pesos. */
function ComposicionDias({
  salarioDiario,
  diasPrimerAnio,
  diasAdicionales,
  diasPorAnioAdicional,
}: {
  salarioDiario: number;
  diasPrimerAnio: number;
  diasAdicionales: number;
  diasPorAnioAdicional: number;
}) {
  const total = diasPrimerAnio + diasAdicionales;
  const pct = (d: number) => `${((d / total) * 100).toFixed(1)}%`;
  const pesos = (d: number) => formatCOP(Math.round(salarioDiario * d));

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        <div style={{ width: pct(diasPrimerAnio), background: INDIGO }} title="Primer año" />
        {diasAdicionales > 0 && (
          <div style={{ width: pct(diasAdicionales), background: VERDE }} title="Años adicionales" />
        )}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <i className="w-2 h-2 rounded-full inline-block" style={{ background: INDIGO }} />
            Primer año · {diasPrimerAnio} días
          </span>
          <span className="text-xs font-semibold tabular-nums text-ink">{pesos(diasPrimerAnio)}</span>
        </div>
        {diasAdicionales > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <i className="w-2 h-2 rounded-full inline-block" style={{ background: VERDE }} />
              Antigüedad extra · {diasAdicionales} días ({diasPorAnioAdicional}/año)
            </span>
            <span className="text-xs font-semibold tabular-nums text-ink">{pesos(diasAdicionales)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cómo habría crecido la indemnización con la antigüedad.
 *
 * Usa los coeficientes de ESTE cálculo (`diasPrimerAnio`, `diasPorAnioAdicional`,
 * `salarioDiario`), no una copia de la regla: la curva es el mismo motor
 * evaluado en otras antigüedades. El punto marcado es el caso real.
 */
function CurvaAntiguedad({
  salarioDiario,
  diasPrimerAnio,
  diasPorAnioAdicional,
  aniosServidos,
  valor,
}: {
  salarioDiario: number;
  diasPrimerAnio: number;
  diasPorAnioAdicional: number;
  aniosServidos: number;
  valor: number;
}) {
  const enAnios = (a: number) =>
    Math.round(salarioDiario * (diasPrimerAnio + diasPorAnioAdicional * Math.max(0, a - 1)));

  const tope = Math.max(5, Math.ceil(aniosServidos) + 2);
  const datos = [];
  for (let a = 0; a <= tope + 0.001; a += 0.25) {
    const anios = Math.round(a * 100) / 100;
    datos.push({ anios, valor: enAnios(anios) });
  }

  return (
    <div>
      <div className="h-36 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradIndem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INDIGO} stopOpacity={0.28} />
                <stop offset="100%" stopColor={INDIGO} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="anios"
              type="number"
              domain={[0, tope]}
              ticks={Array.from({ length: tope + 1 }, (_, i) => i)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v: number) => `${v}a`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`}
            />
            <Tooltip
              cursor={{ stroke: SLATE, strokeDasharray: "3 3" }}
              formatter={(v: number) => [formatCOP(v), "Indemnización"]}
              labelFormatter={(a: number) => `${a} años de antigüedad`}
              contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
            <Area
              type="stepAfter"
              dataKey="valor"
              stroke={INDIGO}
              strokeWidth={2}
              fill="url(#gradIndem)"
              isAnimationActive
              animationDuration={700}
            />
            <ReferenceLine x={aniosServidos} stroke={SLATE} strokeDasharray="3 3" />
            <ReferenceDot x={aniosServidos} y={valor} r={5} fill={INDIGO} stroke="#fff" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted mt-1 leading-relaxed">
        El punto es tu caso ({aniosServidos} años). La curva sube por escalones porque los días adicionales se
        acumulan por año servido.
      </p>
    </div>
  );
}

/** "Equivale a N meses de salario" — la escala en la que la gente decide. */
function EquivalenteMeses({ valor, salarioDiario }: { valor: number; salarioDiario: number }) {
  const meses = valor / (salarioDiario * 30);
  const enteros = Math.min(12, Math.ceil(meses));
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: Math.max(enteros, 1) }, (_, i) => {
          const lleno = Math.min(1, Math.max(0, meses - i));
          return (
            <div key={i} className="flex-1 h-8 rounded-md bg-slate-100 overflow-hidden flex items-end">
              <div
                className="w-full transition-[height] duration-700 ease-out"
                style={{ height: `${lleno * 100}%`, background: INDIGO, opacity: 0.35 + 0.65 * lleno }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-2">
        Equivale a <strong className="text-ink">{meses.toFixed(1)} meses</strong> de tu salario
        {meses > 12 && " (se muestran los primeros 12)"}.
      </p>
    </div>
  );
}

/** Fila etiqueta/valor del detalle numérico. */
function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5">
      <span className={`text-xs ${fuerte ? "font-semibold text-ink" : "text-muted"}`}>{etiqueta}</span>
      <span className={`text-xs tabular-nums shrink-0 ${fuerte ? "font-bold text-ink" : "font-medium text-ink"}`}>
        {valor}
      </span>
    </div>
  );
}

function DetalleNumerico({ resultado, d }: { resultado: ResultadoIndemnizacion; d: DesgloseIndemnizacion }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      {d.base === "indefinido" && (
        <>
          <Fila etiqueta="Salario diario (mes de 30)" valor={formatCOP(d.salarioDiario)} />
          <Fila etiqueta="Ingresó el" valor={fecha(d.fechaIngreso)} />
          <Fila etiqueta="Terminó el" valor={fecha(d.fechaTerminacion)} />
          <Fila etiqueta="Tiempo servido" valor={`${antiguedad(d.diasServidos)} (${d.diasServidos} días)`} />
          <div className="border-t border-slate-200 my-1" />
          <Fila
            etiqueta={`Salario ${d.sobreUmbral ? "≥" : "<"} ${d.umbralSmlmv} SMLMV (${formatCOP(d.smlmv)})`}
            valor={`${d.diasPrimerAnio} + ${d.diasPorAnioAdicional}/año`}
          />
          <Fila etiqueta="Días del primer año" valor={String(d.diasPrimerAnio)} />
          <Fila etiqueta="Días por antigüedad extra" valor={String(d.diasAdicionales)} />
        </>
      )}
      {d.base === "termino_definido" && (
        <>
          <Fila etiqueta="Salario diario (mes de 30)" valor={formatCOP(d.salarioDiario)} />
          <Fila etiqueta="Terminó el" valor={fecha(d.fechaTerminacion)} />
          <Fila etiqueta="Vencía el" valor={fecha(d.fechaVencimientoPactada)} />
          <Fila etiqueta="Días que faltaban" valor={String(d.diasFaltantes)} />
        </>
      )}
      <div className="border-t border-slate-200 my-1" />
      <Fila etiqueta="Días de indemnización" valor={String(resultado.diasIndemnizacion)} />
      <Fila etiqueta="Total" valor={formatCOP(resultado.valor)} fuerte />
      <p className="text-xs text-muted leading-relaxed mt-2 pt-2 border-t border-slate-200">{resultado.explicacion}</p>
    </div>
  );
}

/** El resultado con valor: cifra, gráficos de dónde sale, y el detalle exacto. */
export default function IndemnizacionResultado({
  resultado,
  abierto,
  onAlternar,
  children,
}: {
  resultado: ResultadoIndemnizacion;
  abierto: boolean;
  onAlternar: () => void;
  /** La nota de alcance ("esto no es la liquidación") — la aporta el llamador. */
  children?: React.ReactNode;
}) {
  const d = resultado.desglose;
  const salarioDiario = d.base === "sin_lugar" ? 0 : d.salarioDiario;

  return (
    <PaycheckCard titulo="Resultado aproximado">
      <div className="px-3 pt-2">
        <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">{formatCOP(resultado.valor)}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tono="indigo">{resultado.diasIndemnizacion} días de salario</Chip>
          {salarioDiario > 0 && <Chip>{(resultado.valor / (salarioDiario * 30)).toFixed(1)} meses</Chip>}
          <Chip>{resultado.ley}</Chip>
        </div>
      </div>

      {d.base === "indefinido" && (
        <>
          <Seccion icono={<CalendarClock size={13} />} titulo="Tu contrato">
            <LineaDeTiempo
              desde={d.fechaIngreso}
              hasta={d.fechaTerminacion}
              etiquetaDesde="Ingreso"
              etiquetaHasta="Terminación"
              color={INDIGO}
              nota={`${antiguedad(d.diasServidos)} servidos — es la antigüedad la que fija los días, no el tiempo que faltaba.`}
              marcas={marcasDeAnios(d.diasServidos)}
            />
          </Seccion>

          <Seccion icono={<ShieldCheck size={13} />} titulo="De dónde salen los días">
            <ComposicionDias
              salarioDiario={d.salarioDiario}
              diasPrimerAnio={d.diasPrimerAnio}
              diasAdicionales={d.diasAdicionales}
              diasPorAnioAdicional={d.diasPorAnioAdicional}
            />
          </Seccion>

          <Seccion icono={<TrendingUp size={13} />} titulo="Cómo crece con la antigüedad">
            <CurvaAntiguedad
              salarioDiario={d.salarioDiario}
              diasPrimerAnio={d.diasPrimerAnio}
              diasPorAnioAdicional={d.diasPorAnioAdicional}
              aniosServidos={d.aniosServidos}
              valor={resultado.valor}
            />
          </Seccion>
        </>
      )}

      {d.base === "termino_definido" && (
        <>
          <Seccion icono={<CalendarClock size={13} />} titulo="Lo que faltaba del plazo">
            <LineaDeTiempo
              desde={d.fechaTerminacion}
              hasta={d.fechaVencimientoPactada}
              etiquetaDesde="Terminación"
              etiquetaHasta="Vencimiento pactado"
              color={AMBAR}
              nota={`${d.diasFaltantes} días sin trabajar que igual se deben: se pactó un plazo y se rompió antes.`}
            />
          </Seccion>

          <Seccion icono={<ShieldCheck size={13} />} titulo="Cuánto pesa">
            <EquivalenteMeses valor={resultado.valor} salarioDiario={d.salarioDiario} />
          </Seccion>
        </>
      )}

      <div className="px-3 pt-3">
        <button
          onClick={onAlternar}
          aria-expanded={abierto}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-mint-dark hover:bg-slate-50 transition-colors duration-200"
        >
          Ver el detalle numérico
          <ChevronDown size={16} className={`transition-transform duration-300 ease-out ${abierto ? "rotate-180" : ""}`} />
        </button>

        {/* 0fr → 1fr anima la altura sin medirla en JS ni fijar un max-height a ojo. */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="pt-1 pb-2">
              <DetalleNumerico resultado={resultado} d={d} />
            </div>
          </div>
        </div>
      </div>

      {children}
    </PaycheckCard>
  );
}

/** El caso $0: la línea de tiempo sigue, pero el motivo legal manda. */
export function IndemnizacionSinLugar({
  resultado,
  children,
}: {
  resultado: ResultadoIndemnizacion;
  children?: React.ReactNode;
}) {
  return (
    <PaycheckCard titulo="Resultado">
      <div className="px-3 pt-1 pb-1">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-muted flex items-center justify-center shrink-0">
            <Info size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-ink">No hay lugar a indemnización</p>
            <p className="text-sm text-muted mt-1 leading-relaxed">{resultado.explicacion}</p>
            <p className="text-xs text-muted mt-2 font-medium">{resultado.ley}</p>
          </div>
        </div>
      </div>
      {children}
    </PaycheckCard>
  );
}
