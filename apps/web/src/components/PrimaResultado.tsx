import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Bus, CalendarRange, Gift, Info, Layers, Wallet } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import type { ResultadoPrima, SemestrePrima } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";
import {
  DIAS_MAX_SEMESTRE,
  diasNoComputados,
  etiquetaSemestre,
  fechaMaximaPago,
  repartirPorSemestre,
} from "./primaSemestres.ts";

// La prima no se acumula como las cesantías: se causa por SEMESTRE CALENDARIO,
// cada uno topado en 180 días, y se paga en dos cuotas con fecha. El resultado
// plano mostraba un total y "días considerados" — un número que ni siquiera es
// el que liquidó cuando el tope muerde. Lo que se dibuja acá es esa estructura.

const INDIGO = "#5b50e8";
const VERDE = "#0d9488";
const AMBAR = "#f59e0b";

function fecha(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es });
}

function Chip({ children, tono = "slate" }: { children: React.ReactNode; tono?: "indigo" | "slate" | "ambar" }) {
  const cls = {
    indigo: "bg-indigo-soft text-mint-dark",
    ambar: "bg-amber-50 text-amber-700",
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

/** Salario + auxilio = base. El auxilio hace prima, igual que cesantías. */
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
        <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-1.5">
          <span className="text-xs font-semibold text-ink">Base de liquidación</span>
          <span className="text-xs font-bold tabular-nums text-ink">{formatCOP(base)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Cada semestre con sus días sobre el tope de 180.
 *
 * La barra no es el % del total: es qué tanto del semestre se llenó. Así se ve
 * de una que la prima no crece indefinidamente dentro de un mismo semestre —
 * llega a 180 días y ahí se queda, aunque se sigan trabajando días.
 */
function PorSemestre({ semestres, total }: { semestres: SemestrePrima[]; total: number }) {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAncho(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const partes = repartirPorSemestre(semestres, total);

  return (
    <div className="flex flex-col gap-3">
      {partes.map(({ semestre, valor }, i) => (
        <Aparecer key={semestre.desde} retraso={i * 90}>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-ink">{etiquetaSemestre(semestre)}</span>
              <span className="text-sm font-bold tabular-nums text-ink">{formatCOP(valor)}</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: ancho ? `${(semestre.dias / DIAS_MAX_SEMESTRE) * 100}%` : "0%",
                  background: semestre.topado ? AMBAR : INDIGO,
                }}
              />
            </div>
            <div className="flex justify-between gap-3 mt-1">
              <span className="text-[11px] text-muted">
                {semestre.dias} de {DIAS_MAX_SEMESTRE} días
                {semestre.topado && " · semestre completo"}
              </span>
              <span className="text-[11px] text-muted">
                Se paga máximo el {fecha(fechaMaximaPago(semestre))}
              </span>
            </div>
          </div>
        </Aparecer>
      ))}
    </div>
  );
}

/** Las dos cuotas del año, con la que toca este corte resaltada. */
function Cuotas({ semestres }: { semestres: SemestrePrima[] }) {
  const tienePrimero = semestres.some((s) => s.desde.endsWith("-01-01"));
  const tieneSegundo = semestres.some((s) => s.desde.endsWith("-07-01"));
  const cuotas = [
    { nombre: "Cuota de junio", detalle: "máximo el 30 de junio", activa: tienePrimero },
    { nombre: "Cuota de diciembre", detalle: "máximo el 20 de diciembre", activa: tieneSegundo },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {cuotas.map((c, i) => (
        <Aparecer key={c.nombre} retraso={i * 90}>
          <div
            className={`rounded-xl border p-2.5 h-full ${
              c.activa ? "border-indigo-200 bg-indigo-soft" : "border-slate-100 bg-slate-50"
            }`}
          >
            <p className={`text-xs font-semibold ${c.activa ? "text-mint-dark" : "text-muted"}`}>{c.nombre}</p>
            <p className="text-[11px] text-muted mt-0.5">{c.detalle}</p>
            <p className="text-[11px] text-muted mt-1">
              {c.activa ? "Tu periodo causa esta cuota." : "Fuera de tu periodo."}
            </p>
          </div>
        </Aparecer>
      ))}
    </div>
  );
}

export default function PrimaResultado({ resultado }: { resultado: ResultadoPrima }) {
  const perdidos = diasNoComputados(resultado.diasTrabajadosAcumulado, resultado.diasPrima);
  const meses = resultado.baseMensual > 0 ? resultado.prima / resultado.baseMensual : 0;

  return (
    <PaycheckCard titulo="Resultado aproximado">
      <div className="px-3 pt-2">
        <p className="text-3xl font-bold text-ink tabular-nums tracking-tight">{formatCOP(resultado.prima)}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tono="indigo">{resultado.diasPrima} días que liquidan</Chip>
          <Chip>{meses.toFixed(2)} meses de la base</Chip>
          {perdidos > 0 && <Chip tono="ambar">{perdidos} días fuera del tope</Chip>}
        </div>
        <p className="text-xs text-muted mt-2">
          Del {fecha(resultado.fechaIngreso)} al {fecha(resultado.fechaCorte)}
        </p>
      </div>

      <Seccion icono={<Wallet size={13} />} titulo="Sobre qué se liquida">
        <ComposicionBase base={resultado.baseMensual} auxilio={resultado.auxilioIncluido} />
      </Seccion>

      <Seccion icono={<Layers size={13} />} titulo="Semestre por semestre">
        <PorSemestre semestres={resultado.semestres} total={resultado.prima} />
      </Seccion>

      {/* El tope no es letra chica: son días trabajados que no pagan prima. */}
      {perdidos > 0 && (
        <div className="mx-3 mt-3 flex gap-2 rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
          <Info size={14} className="shrink-0 mt-px" />
          <span>
            Trabajaste <strong>{resultado.diasTrabajadosAcumulado} días</strong>, pero la prima se liquida sobre{" "}
            <strong>{resultado.diasPrima}</strong>: cada semestre calendario aporta máximo {DIAS_MAX_SEMESTRE} días,
            así que {perdidos} {perdidos === 1 ? "día quedó" : "días quedaron"} por fuera. No es un descuento — es
            cómo se cuenta el semestre comercial.
          </span>
        </div>
      )}

      <Seccion icono={<CalendarRange size={13} />} titulo="Cuándo se paga">
        <Cuotas semestres={resultado.semestres} />
      </Seccion>

      {resultado.advertencias.map((a) => (
        <div key={a} className="mx-3 mt-3 flex gap-2 rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
          <Info size={14} className="shrink-0 mt-px" />
          <span>{a}</span>
        </div>
      ))}

      <Seccion icono={<Gift size={13} />} titulo="La letra chica">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
          <p className="text-xs text-muted leading-relaxed">{resultado.explicacion}</p>
          <p className="text-[11px] text-muted mt-2 font-medium">{resultado.ley}</p>
        </div>
      </Seccion>

      <div className="px-3 pt-3 pb-2 text-[11px] text-muted">
        Estimado informativo — no reemplaza tu liquidación oficial.
      </div>
    </PaycheckCard>
  );
}
