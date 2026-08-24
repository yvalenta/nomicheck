import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Bus, CalendarClock, Coins, Info, PiggyBank, TrendingUp, Wallet } from "lucide-react";
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
import type { ResultadoCesantias } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import { DIAS_ANIO_COMERCIAL, proyectar, serieHastaElAnio } from "./cesantiasProyeccion.ts";

// Las cesantías son una prestación que se ACUMULA, y el resultado plano las
// mostraba como un saldo suelto: $172.222 no dice si eso es mucho, poco, ni
// hacia dónde va. Lo que se dibuja acá es el tiempo — de dónde viene ese saldo
// y en qué termina si el año se completa.

const INDIGO = "#5b50e8";
const VERDE = "#0d9488";
const SLATE = "#94a3b8";

function fecha(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es });
}

function Chip({ children, tono = "slate" }: { children: React.ReactNode; tono?: "indigo" | "slate" | "verde" }) {
  const cls = {
    indigo: "bg-indigo-soft text-mint-dark",
    verde: "bg-teal-50 text-teal-700",
    slate: "bg-slate-100 text-muted",
  }[tono];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

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

function Aparecer({ retraso = 0, children }: { retraso?: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), retraso);
    return () => clearTimeout(id);
  }, [retraso]);
  return (
    <div
      className={`transition-all duration-500 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
    >
      {children}
    </div>
  );
}

/**
 * De qué está hecha la base.
 *
 * Es la sorpresa útil de esta calculadora: el auxilio de transporte NO es un
 * extra que va por fuera — entra a la base y sube las cesantías. Mostrarlo
 * como parte de la barra evita la pregunta de por qué el resultado no cuadra
 * con "un mes de salario".
 */
function ComposicionBase({ base, auxilio }: { base: number; auxilio: number }) {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAncho(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const salario = base - auxilio;
  const pct = (v: number) => (ancho ? `${((v / base) * 100).toFixed(1)}%` : "0%");

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        <div className="transition-[width] duration-700 ease-out" style={{ width: pct(salario), background: INDIGO }} />
        {auxilio > 0 && (
          <div className="transition-[width] duration-700 ease-out" style={{ width: pct(auxilio), background: VERDE }} />
        )}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <i className="w-2 h-2 rounded-full inline-block" style={{ background: INDIGO }} />
            Salario mensual
          </span>
          <span className="text-xs font-semibold tabular-nums text-ink">{formatCOP(salario)}</span>
        </div>
        {auxilio > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Bus size={12} style={{ color: VERDE }} /> Auxilio de transporte
            </span>
            <span className="text-xs font-semibold tabular-nums text-ink">{formatCOP(auxilio)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-borde pt-1.5">
          <span className="text-xs font-semibold text-ink">Base de liquidación</span>
          <span className="text-xs font-bold tabular-nums text-ink">{formatCOP(base)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Cómo se acumula el saldo hasta completar el año.
 *
 * Las dos áreas son cesantías e intereses. La línea punteada es el corte que se
 * pidió; lo que queda a la derecha es proyección — el mismo resultado escalado,
 * no una regla reimplementada acá.
 */
function Acumulacion({
  base,
  fechaCorte,
}: {
  base: { dias: number; cesantias: number; intereses: number };
  fechaCorte: string;
}) {
  const serie = serieHastaElAnio(base);
  const alAnio = proyectar(base, Math.max(DIAS_ANIO_COMERCIAL, base.dias));

  return (
    <div>
      <div className="h-40 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INDIGO} stopOpacity={0.3} />
                <stop offset="100%" stopColor={INDIGO} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dias"
              type="number"
              domain={[0, serie.at(-1)!.dias]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v: number) => `${v}d`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)}
            />
            <Tooltip
              cursor={{ stroke: SLATE, strokeDasharray: "3 3" }}
              formatter={(v: number, n) => [formatCOP(v), n === "cesantias" ? "Cesantías" : "Intereses"]}
              labelFormatter={(d: number) => `${d} días trabajados`}
              contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="cesantias"
              stroke={INDIGO}
              strokeWidth={2}
              fill="url(#gradCes)"
              animationDuration={700}
            />
            <Area
              type="monotone"
              dataKey="intereses"
              stroke={VERDE}
              strokeWidth={2}
              fill={VERDE}
              fillOpacity={0.14}
              animationDuration={700}
            />
            <ReferenceLine x={base.dias} stroke={SLATE} strokeDasharray="3 3" />
            <ReferenceDot x={base.dias} y={base.cesantias} r={5} fill={INDIGO} stroke="#fff" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted mt-1 leading-relaxed">
        El punto es tu corte del {fecha(fechaCorte)} ({base.dias} días). Si completás el año trabajado, las cesantías
        llegan a <strong className="text-ink">≈ {formatCOP(alAnio.cesantias)}</strong> —un mes de la base— y los
        intereses a <strong className="text-ink">≈ {formatCOP(alAnio.intereses)}</strong>. Lo que está a la derecha
        de la línea es proyección: sale de escalar tu propio resultado, y por eso va con “≈”.
      </p>
    </div>
  );
}

/** Lo acumulado hoy, en dos piezas: el saldo y su rendimiento. */
function LoAcumulado({ cesantias, intereses, tasa }: { cesantias: number; intereses: number; tasa: number }) {
  const total = cesantias + intereses;
  const filas = [
    { nombre: "Cesantías", valor: cesantias, color: INDIGO, nota: "un mes de la base por año trabajado" },
    {
      nombre: "Intereses",
      valor: intereses,
      color: VERDE,
      nota: `${Math.round(tasa * 100)}% anual sobre el saldo, proporcional al tiempo`,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {filas.map((f, i) => (
        <Aparecer key={f.nombre} retraso={i * 90}>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: f.color }} />
                {f.nombre}
              </span>
              <span className="text-sm font-bold tabular-nums text-ink">{formatCOP(f.valor)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${(f.valor / total) * 100}%`, background: f.color }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1">{f.nota}</p>
          </div>
        </Aparecer>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-borde pt-2">
        <span className="text-xs font-semibold text-ink">Total acumulado al corte</span>
        <span className="text-sm font-bold tabular-nums text-ink">{formatCOP(total)}</span>
      </div>
    </div>
  );
}

export default function CesantiasResultado({ resultado }: { resultado: ResultadoCesantias }) {
  const punto = {
    dias: resultado.diasTrabajadosAcumulado,
    cesantias: resultado.cesantias,
    intereses: resultado.interesesCesantias,
  };
  const meses = resultado.baseMensual > 0 ? resultado.cesantias / resultado.baseMensual : 0;

  return (
    <PaycheckCard titulo="Resultado aproximado">
      <div className="px-3 pt-2">
        <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">{formatCOP(resultado.cesantias)}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tono="indigo">{resultado.diasTrabajadosAcumulado} días acumulados</Chip>
          <Chip tono="verde">+ {formatCOP(resultado.interesesCesantias)} de intereses</Chip>
          <Chip>{meses.toFixed(2)} meses de la base</Chip>
        </div>
        <p className="text-xs text-muted mt-2">
          Del {fecha(resultado.fechaIngreso)} al {fecha(resultado.fechaCorte)}
        </p>
      </div>

      <Seccion icono={<Wallet size={13} />} titulo="Sobre qué se liquida">
        <ComposicionBase base={resultado.baseMensual} auxilio={resultado.auxilioIncluido} />
      </Seccion>

      <Seccion icono={<TrendingUp size={13} />} titulo="Cómo se acumula">
        <Acumulacion base={punto} fechaCorte={resultado.fechaCorte} />
      </Seccion>

      <Seccion icono={<Coins size={13} />} titulo="Lo que llevas al corte">
        <LoAcumulado
          cesantias={resultado.cesantias}
          intereses={resultado.interesesCesantias}
          tasa={resultado.tasaInteresAnual}
        />
      </Seccion>

      {resultado.advertencias.map((a) => (
        <div key={a} className="mx-3 mt-3 flex gap-2 rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
          <Info size={14} className="shrink-0 mt-px" />
          <span>{a}</span>
        </div>
      ))}

      <Seccion icono={<CalendarClock size={13} />} titulo="La letra chica">
        <div className="rounded-xl bg-slate-50 border border-borde p-3">
          <p className="text-xs text-muted leading-relaxed">{resultado.explicacion}</p>
          <p className="text-[11px] text-muted mt-2 font-medium">{resultado.ley}</p>
        </div>
      </Seccion>

      <div className="px-3 pt-3 pb-2 flex items-center gap-1.5 text-[11px] text-muted">
        <PiggyBank size={13} /> Estimado informativo — no reemplaza tu liquidación oficial.
      </div>
    </PaycheckCard>
  );
}
