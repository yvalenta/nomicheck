import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  HelpCircle,
  Loader2,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Textos } from "./i18n";

// La calculadora GRATIS de la landing, contra el endpoint real.
//
// Es `/liquidacion-final` y no otro a propósito: es el único de los cinco
// cálculos que queda fuera del muro x402 por decisión, justamente para que se
// pueda probar sin pagar (ver `x402Config.ts` del API). Si algún día entra al
// muro, esta sección deja de funcionar en frío — y eso se vería acá mismo,
// porque el resultado sale del servidor, no de una copia del motor en el
// navegador. Duplicar el cálculo acá seria contradecir el producto entero: lo
// que se vende es una salida FIRMADA, y una cuenta hecha en el cliente no
// tiene firma que valga.

interface Linea {
  codigo: string;
  concepto: string;
  valorCalculado: number;
  ley: string;
}

/** `supuestos` y `advertencias` vienen como texto plano; `noSolicitado` como
 *  objeto con código. Se acepta cualquiera de las dos formas a propósito: si el
 *  contrato cambia de una a otra, la landing sigue mostrando el texto en vez de
 *  pintar filas vacías — que es lo que hacía cuando esto estaba mal tipado, y
 *  no se notó hasta verlo en pantalla. */
type Nota = string | { codigo?: string; motivo?: string };

interface Resultado {
  externalId: string;
  lineas: Linea[];
  total: number;
  supuestos: Nota[];
  advertencias: Nota[];
  noSolicitado: Nota[];
}

function texto(n: Nota): string {
  return typeof n === "string" ? n : (n.motivo ?? "");
}

interface Respuesta {
  reglasHash: string;
  reglasVerificadasAl: string;
  resultados: Resultado[];
  signature: { algo: string; valor: string; publicKeyId: string };
}

const HOY = new Date().toISOString().slice(0, 10);

// Familia índigo, NO el semáforo del motor.
//
// El sistema de diseño reserva verde/ámbar/coral para el veredicto de una
// línea (correcto / revisar / discrepancia). Usarlos acá para distinguir
// conceptos los volvería decorativos, y entonces un ámbar dejaría de querer
// decir "revisa esto" en el resto del producto. Estas barras no juzgan nada:
// solo separan cuatro conceptos, así que van en una sola familia.
const COLORES = ["#5b50e8", "#7c6cf5", "#9a8ef8", "#b9b0fb", "#d5d0fd"];

function pesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

/** Nombre corto para el eje del gráfico: "Liquidación final — prima" no entra. */
function corto(concepto: string): string {
  const parte = concepto.split("—").pop() ?? concepto;
  return parte.trim().replace(/^intereses a las cesantías$/i, "int. cesantías");
}

export default function CalculadoraLiquidacion({ t }: { t: Textos }) {
  const c = t.calculadora;
  const [salario, setSalario] = useState("1750905");
  const [ingreso, setIngreso] = useState("2024-03-01");
  const [retiro, setRetiro] = useState(HOY);
  const [auxilio, setAuxilio] = useState(true);
  const [vacaciones, setVacaciones] = useState("0");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Respuesta | null>(null);

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      // El contrato v1 del wrapper publico. `buyer.noExternalLlm` es la
      // constancia de que el calculo es deterministico y no pasa por un modelo.
      const r = await fetch("/api/batch/liquidacion-final", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "1",
          buyer: { noExternalLlm: true },
          // El contrato exige `empresa`, y la calculadora pública no la pide:
          // para el cálculo no cambia nada y para la persona es fricción —
          // el NIT del empleador no se sabe de memoria.
          //
          // Va escrito "(no declarada)" y NO un NIT inventado. Esta respuesta
          // sale FIRMADA: meterle un dato falso convertiría la firma en el aval
          // de una mentira, que es exactamente lo contrario de lo que vende
          // este producto. Así, lo que queda firmado es la verdad — que no se
          // declaró.
          empresa: { nombre: "(no declarada)", nit: "(no declarado)" },
          empleados: [
            {
              externalId: "web",
              salarioBase: Number(salario),
              auxilioTransporte: auxilio,
              fechaIngreso: ingreso,
              fechaRetiro: retiro,
              diasVacacionesTomados: Number(vacaciones) || 0,
            },
          ],
        }),
      });
      const cuerpo = await r.json();
      if (!r.ok) {
        // El 402 tiene que decirse con todas las letras y no como "error":
        // significa que este calculo dejo de ser gratis, que es informacion
        // util, no una falla.
        if (r.status === 402) {
          throw new Error(
            c.error402,
          );
        }
        // Los `fieldErrors` del validador se muestran, no se tragan. Un
        // "invalid_input" pelado obliga a abrir la consola para saber qué
        // campo era — y en una landing nadie abre la consola: se va.
        const campos = cuerpo?.detalle?.fieldErrors as Record<string, string[]> | undefined;
        const detalle = campos
          ? Object.entries(campos)
              .map(([campo, errs]) => `${campo}: ${errs.join(", ")}`)
              .join(" · ")
          : null;
        throw new Error(detalle ?? cuerpo?.error ?? `El servidor respondió ${r.status}`);
      }
      setRes(cuerpo as Respuesta);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.errorGenerico);
    } finally {
      setCargando(false);
    }
  }

  const resultado = res?.resultados?.[0];
  const datos =
    resultado?.lineas.map((l, i) => ({
      nombre: corto(l.concepto),
      valor: l.valorCalculado,
      fill: COLORES[i % COLORES.length],
    })) ?? [];

  return (
    <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-8 items-start">
      {/* ── Formulario ───────────────────────────────────────────────── */}
      <form
        onSubmit={calcular}
        className="bg-white border border-[color:var(--color-papel-2)] rounded-lg p-6 shadow-[6px_6px_0_rgba(15,23,42,0.06)]"
      >
        <div className="flex items-center gap-2 mb-1">
          <ScrollText className="w-4 h-4 text-[color:var(--color-indigo)]" aria-hidden />
          <h3 className="font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)]">
            {c.formTitulo}
          </h3>
        </div>
        <p className="text-xs text-[color:var(--color-muted)] leading-relaxed mb-5">
          {c.formBajada}
        </p>

        <label className="block mb-4">
          <span className="text-xs font-medium text-[color:var(--color-ink)]">
            {c.salario}
          </span>
          <div className="mt-1 flex items-center rounded-md border border-slate-200 focus-within:border-[color:var(--color-indigo)] focus-within:ring-2 focus-within:ring-[color:var(--color-indigo)]/15 transition">
            <span className="pl-3 text-[color:var(--color-muted)] font-[family-name:var(--font-mono)] text-sm">
              $
            </span>
            <input
              type="number"
              min={0}
              required
              value={salario}
              onChange={(e) => setSalario(e.target.value)}
              className="w-full px-2 py-2 bg-transparent outline-none font-[family-name:var(--font-mono)] text-sm tabular-nums"
            />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--color-ink)]">{c.ingreso}</span>
            <input
              type="date"
              required
              value={ingreso}
              onChange={(e) => setIngreso(e.target.value)}
              className="mt-1 w-full px-2 py-2 rounded-md border border-slate-200 outline-none focus:border-[color:var(--color-indigo)] font-[family-name:var(--font-mono)] text-xs"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--color-ink)]">{c.retiro}</span>
            <input
              type="date"
              required
              value={retiro}
              onChange={(e) => setRetiro(e.target.value)}
              className="mt-1 w-full px-2 py-2 rounded-md border border-slate-200 outline-none focus:border-[color:var(--color-indigo)] font-[family-name:var(--font-mono)] text-xs"
            />
          </label>
        </div>

        <label className="block mb-4">
          <span className="text-xs font-medium text-[color:var(--color-ink)]">
            {c.vacaciones}
          </span>
          <input
            type="number"
            min={0}
            value={vacaciones}
            onChange={(e) => setVacaciones(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-md border border-slate-200 outline-none focus:border-[color:var(--color-indigo)] font-[family-name:var(--font-mono)] text-sm tabular-nums"
          />
        </label>

        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={auxilio}
            onChange={(e) => setAuxilio(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--color-indigo)]"
          />
          <span className="text-xs text-[color:var(--color-ink)]">{c.auxilio}</span>
        </label>

        <button
          type="submit"
          disabled={cargando}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--color-indigo)] hover:bg-[color:var(--color-mint-dark)] disabled:opacity-60 text-white font-medium text-sm px-4 py-2.5 transition-colors"
        >
          {cargando ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="w-4 h-4" aria-hidden />
          )}
          {cargando ? c.calculando : c.calcular}
        </button>

        <p className="text-[11px] text-[color:var(--color-muted)] mt-3 leading-relaxed">
          {c.nota}
        </p>
      </form>

      {/* ── Resultado ────────────────────────────────────────────────── */}
      <div className="min-w-0">
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-coral)]/30 bg-[color:var(--color-coral)]/5 p-4">
            <AlertTriangle
              className="w-5 h-5 text-[color:var(--color-coral)] shrink-0 mt-0.5"
              aria-hidden
            />
            <p className="text-sm text-[color:var(--color-ink)]">{error}</p>
          </div>
        )}

        {!error && !resultado && (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
            <ScrollText className="w-8 h-8 mx-auto text-slate-300" aria-hidden />
            <p className="text-sm text-[color:var(--color-muted)] mt-3 max-w-sm mx-auto leading-relaxed">
              {c.vacio}
            </p>
          </div>
        )}

        {resultado && (
          <div className="bg-[color:var(--color-papel)] border border-[color:var(--color-papel-2)] rounded-lg shadow-[8px_8px_0_rgba(15,23,42,0.08)] overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-dashed border-[color:var(--color-papel-2)] flex items-baseline justify-between gap-4 flex-wrap">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)]">
                {c.resultadoTitulo}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--color-ink)]/60">
                {c.reglasAl} {res?.reglasVerificadasAl}
              </p>
            </div>

            {/* El grafico no es adorno: muestra de un vistazo cual concepto pesa
                mas, que es la pregunta que se hace cualquiera al ver el total. */}
            <div className="px-3 pt-5">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datos} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      dataKey="nombre"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      interval={0}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(91,80,232,0.06)" }}
                      formatter={(v: number) => [pesos(v), "Valor"]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                      {datos.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <ul className="divide-y divide-[color:var(--color-papel-2)] mt-2">
              {resultado.lineas.map((l, i) => (
                <li key={l.codigo} className="px-6 py-3 flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: COLORES[i % COLORES.length] }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[color:var(--color-ink)] leading-tight">
                      {corto(l.concepto)}
                    </p>
                    <p className="text-[11px] text-[color:var(--color-ink)]/60 mt-0.5">{l.ley}</p>
                  </div>
                  <span className="font-[family-name:var(--font-mono)] text-sm tabular-nums text-[color:var(--color-ink)]">
                    {pesos(l.valorCalculado)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="px-6 py-4 bg-white/60 border-t border-[color:var(--color-papel-2)] flex items-baseline justify-between">
              <span className="font-[family-name:var(--font-display)] font-semibold text-sm uppercase tracking-wide text-[color:var(--color-ink)]">
                {c.total}
              </span>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-2xl font-semibold text-[color:var(--color-indigo)]">
                {pesos(resultado.total)}
              </span>
            </div>

            {/* Supuestos y ausencias. Van SIEMPRE que existan, y con el mismo
                peso visual que el total: el error caro de una liquidacion no es
                un numero mal sumado, es una linea que nadie pidio y todos
                creyeron cero. */}
            {(resultado.supuestos.length > 0 ||
              resultado.advertencias.length > 0 ||
              resultado.noSolicitado.length > 0) && (
              <div className="px-6 py-4 border-t border-[color:var(--color-papel-2)] space-y-3">
                {/* Los supuestos son ADVERTENCIAS de verdad, no letra chica:
                    dicen "esto podría estar pagándose dos veces". Por eso van
                    en ámbar, que en este producto significa exactamente eso. */}
                {[...resultado.supuestos, ...resultado.advertencias].map((s, i) => (
                  <p key={`s${i}`} className="flex gap-2 text-[11px] leading-relaxed">
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-[color:var(--color-ambar)] shrink-0 mt-px"
                      aria-hidden
                    />
                    <span className="text-[color:var(--color-ink)]/80">{texto(s)}</span>
                  </p>
                ))}
                {/* Lo NO pedido es distinto de lo que vale cero, y esa
                    diferencia es la que hace perder plata. Va en gris para no
                    competir con lo de arriba, pero va. */}
                {resultado.noSolicitado.map((s, i) => (
                  <p key={`n${i}`} className="flex gap-2 text-[11px] leading-relaxed">
                    <HelpCircle
                      className="w-3.5 h-3.5 text-[color:var(--color-muted)] shrink-0 mt-px"
                      aria-hidden
                    />
                    <span className="text-[color:var(--color-ink)]/70">{texto(s)}</span>
                  </p>
                ))}
              </div>
            )}

            {/* La firma es el producto. Se muestra entera y con el link que
                permite comprobarla SIN volver a preguntarnos nada. */}
            <div className="px-6 py-4 bg-[color:var(--color-navy)] text-white/90">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[color:var(--color-verde)]" aria-hidden />
                <p className="text-xs font-medium">{c.firmado}</p>
              </div>
              <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 font-[family-name:var(--font-mono)] text-[10px] text-white/60">
                <div className="min-w-0">
                  <dt className="uppercase tracking-wider text-white/40">{c.llave}</dt>
                  <dd className="truncate text-white/80">{res?.signature.publicKeyId}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="uppercase tracking-wider text-white/40">{c.hashCatalogo}</dt>
                  <dd className="truncate text-white/80">{res?.reglasHash}</dd>
                </div>
              </dl>
              <a
                href="https://ynt.codes/verificar"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs text-white hover:text-[color:var(--color-verde)] transition-colors"
              >
                <BadgeCheck className="w-3.5 h-3.5" aria-hidden />
                {c.verificar}
                <ArrowRight className="w-3 h-3" aria-hidden />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
