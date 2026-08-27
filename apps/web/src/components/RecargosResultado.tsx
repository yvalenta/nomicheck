import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Info, Moon, Plus, Sun, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCOP } from "@pv/reglas";
import type { LineaRecargo, ResultadoRecargos } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import { esHoraExtra, hayDobleLineaDominicalNocturna, totalizar, valorPorHora } from "./recargosLineas.ts";

// El resultado plano de esta calculadora escondía su pregunta más frecuente:
// por qué 34 horas de recargo nocturno valen $99.218 y 34 horas extra diurnas
// valen $354.350. No es un error de cuentas — es que una paga solo el
// porcentaje y la otra paga la hora completa más el recargo. Todo lo que se
// dibuja acá existe para que esa diferencia se vea antes de que se pregunte.

const INDIGO = "#5b50e8";
const VERDE = "#0d9488";
const SLATE = "#94a3b8";

/** Icono por naturaleza de la línea — se decide por código, igual que todo lo demás. */
function iconoDe(codigo: string) {
  if (codigo.includes("DOMINICAL") && codigo.includes("NOCTURN")) return <Moon size={14} />;
  if (codigo.includes("DOMINICAL")) return <CalendarDays size={14} />;
  if (codigo.includes("NOCTURN")) return <Moon size={14} />;
  return <Sun size={14} />;
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

/** Entrada escalonada: cada línea aparece un poco después de la anterior. */
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

/** Reparto del total entre lo que paga solo el porcentaje y lo que paga hora completa. */
function Reparto({ recargos, extras }: { recargos: number; extras: number }) {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAncho(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const total = recargos + extras;
  if (total <= 0) return null;
  const pct = (v: number) => (ancho ? `${((v / total) * 100).toFixed(1)}%` : "0%");

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        <div className="transition-[width] duration-700 ease-out" style={{ width: pct(recargos), background: INDIGO }} />
        <div className="transition-[width] duration-700 ease-out" style={{ width: pct(extras), background: VERDE }} />
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <i className="w-2 h-2 rounded-full inline-block" style={{ background: INDIGO }} />
            Recargos · solo el porcentaje
          </span>
          <span className="text-xs font-semibold tabular-nums text-ink">{formatCOP(recargos)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <i className="w-2 h-2 rounded-full inline-block" style={{ background: VERDE }} />
            Horas extra · hora completa + recargo
          </span>
          <span className="text-xs font-semibold tabular-nums text-ink">{formatCOP(extras)}</span>
        </div>
      </div>
    </div>
  );
}

/** Cuánto pesa cada concepto — la pregunta que se hace cualquiera al ver el total. */
function PesoPorConcepto({ lineas }: { lineas: LineaRecargo[] }) {
  const datos = [...lineas]
    .sort((a, b) => b.valorCalculado - a.valorCalculado)
    .map((l) => ({
      // Se recorta el sufijo de tramo normativo ("… (desde jul-2025)"), que no
      // cabe en el eje; el prefijo NO, porque "diurna" a secas no distingue un
      // recargo de una hora extra, que es justo lo que este gráfico compara.
      nombre: l.concepto.replace(/ \(.*\)$/, ""),
      valor: l.valorCalculado,
      horas: l.horas ?? 0,
      fill: esHoraExtra(l.codigo) ? VERDE : INDIGO,
    }));

  return (
    <div style={{ height: Math.max(96, datos.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="nombre"
            width={132}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fill: "#64748b" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(91,80,232,0.06)" }}
            formatter={(v, _n, p) => [`${formatCOP(Number(v))} · ${p.payload.horas} h`, "Valor"]}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={14} animationDuration={700}>
            {datos.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: unknown) => formatCOP(Number(v))}
              style={{ fontSize: 10, fill: "#16203a", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Lo que vale una hora en cada modalidad, contra la hora ordinaria.
 *
 * Es la comparación que explica el total sin aritmética: la barra gris es la
 * hora que ya está en el salario; las demás, lo que se paga por una hora de
 * cada tipo. Sale de dividir cada línea entre sus horas — no se recalcula la
 * tarifa acá.
 */
function ValorDeLaHora({ ordinaria, lineas }: { ordinaria: number; lineas: LineaRecargo[] }) {
  const filas = [
    { nombre: "Ordinaria", valor: ordinaria, color: SLATE },
    ...lineas
      .map((l) => {
        const v = valorPorHora(l);
        return v === null
          ? null
          : {
              nombre: l.concepto.replace(/ \(.*\)$/, ""),
              valor: v,
              color: esHoraExtra(l.codigo) ? VERDE : INDIGO,
            };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  ];
  const tope = Math.max(...filas.map((f) => f.valor));

  return (
    <div className="flex flex-col gap-2">
      {filas.map((f, i) => (
        <Aparecer key={f.nombre} retraso={i * 70}>
          <div className="flex items-center gap-2.5">
            <span className="w-[132px] shrink-0 text-[11px] text-muted leading-tight">{f.nombre}</span>
            <div className="flex-1 h-5 rounded-md bg-slate-50 overflow-hidden">
              <div
                className="h-full rounded-md transition-[width] duration-700 ease-out"
                style={{ width: `${(f.valor / tope) * 100}%`, background: f.color, opacity: 0.9 }}
              />
            </div>
            <span className="w-[76px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink">
              {formatCOP(Math.round(f.valor))}
            </span>
          </div>
        </Aparecer>
      ))}
      <p className="text-[11px] text-muted leading-relaxed mt-0.5">
        La hora ordinaria es la referencia: no se vuelve a pagar en un recargo, sí en una hora extra.
      </p>
    </div>
  );
}

/** Cada línea con su icono, sus horas, su tarifa y su ley. */
function DetalleLineas({ lineas }: { lineas: LineaRecargo[] }) {
  return (
    <div className="flex flex-col">
      {lineas.map((l, i) => {
        const extra = esHoraExtra(l.codigo);
        return (
          <Aparecer key={l.codigo} retraso={i * 70}>
            <div className="flex items-start gap-2.5 py-2 border-b border-borde last:border-0">
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  extra ? "bg-teal-50 text-teal-700" : "bg-indigo-soft text-mint-dark"
                }`}
              >
                {iconoDe(l.codigo)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink leading-tight">{l.concepto}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {l.horas} h
                  {l.recargoPct !== undefined && ` · ${Math.round(l.recargoPct * 100)}%`}
                  {extra ? " · hora completa + recargo" : " · solo el recargo"}
                </p>
                {l.ley && <p className="text-[10px] text-muted/80 mt-0.5">{l.ley}</p>}
              </div>
              <span className="text-sm font-semibold tabular-nums text-ink shrink-0">
                {formatCOP(l.valorCalculado)}
              </span>
            </div>
          </Aparecer>
        );
      })}
    </div>
  );
}

export default function RecargosResultado({
  resultado,
  salarioMensual,
}: {
  resultado: ResultadoRecargos;
  /** Para decir cuánto suma el mes; 0 u omitido si no se conoce. */
  salarioMensual?: number;
}) {
  const t = totalizar(resultado.lineas);
  const sobreSalario = salarioMensual && salarioMensual > 0 ? (resultado.total / salarioMensual) * 100 : null;

  return (
    <PaycheckCard titulo="Resultado aproximado">
      <div className="px-3 pt-2">
        <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">{formatCOP(resultado.total)}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tono="indigo">{formatCOP(resultado.valorHoraOrdinaria)} / hora ordinaria</Chip>
          {t.horasExtras > 0 && <Chip tono="verde">{t.horasExtras} h extra</Chip>}
          {t.horasRecargos > 0 && <Chip>{t.horasRecargos} h con recargo</Chip>}
          {sobreSalario !== null && <Chip>+{sobreSalario.toFixed(0)}% sobre tu salario</Chip>}
        </div>
      </div>

      {t.recargos > 0 && t.extras > 0 && (
        <Seccion icono={<Clock3 size={13} />} titulo="Cómo se reparte">
          <Reparto recargos={t.recargos} extras={t.extras} />
        </Seccion>
      )}

      <Seccion icono={<TrendingUp size={13} />} titulo="Cuánto pesa cada concepto">
        <PesoPorConcepto lineas={resultado.lineas} />
      </Seccion>

      <Seccion icono={<Plus size={13} />} titulo="Lo que vale una hora de cada tipo">
        <ValorDeLaHora ordinaria={resultado.valorHoraOrdinaria} lineas={resultado.lineas} />
      </Seccion>

      <Seccion icono={<Sun size={13} />} titulo="Línea por línea">
        <DetalleLineas lineas={resultado.lineas} />
      </Seccion>

      {/* La duda cara de esta pantalla: las mismas horas en dos renglones. */}
      {hayDobleLineaDominicalNocturna(resultado.lineas) && (
        <div className="mx-3 mt-3 flex gap-2 rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
          <Info size={14} className="shrink-0 mt-px" />
          <span>
            Tus horas nocturnas de domingo/festivo aparecen en <strong>dos renglones</strong> —el recargo dominical y
            el nocturno— porque se acumulan sobre las mismas horas. No es un cobro doble: cada renglón suma un
            porcentaje distinto.
          </span>
        </div>
      )}

      <div className="mx-3 mt-3 mb-2 rounded-xl bg-slate-50 border border-borde p-3">
        <p className="text-xs text-muted leading-relaxed">
          Los recargos sobre horas ordinarias suman <strong className="text-ink">solo el porcentaje</strong> (la hora
          base ya está en tu salario); las horas extra se pagan{" "}
          <strong className="text-ink">completas más su recargo</strong>. Por eso las mismas horas valen distinto
          según cómo se clasifiquen.
        </p>
      </div>
    </PaycheckCard>
  );
}
