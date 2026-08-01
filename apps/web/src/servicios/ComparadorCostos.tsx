import { useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from "recharts";
import { Info, TrendingDown } from "lucide-react";
import type { Textos } from "./i18n";

// Comparador de costos.
//
// Es la sección más fácil de convertir en mentira, así que tiene una regla:
// **los supuestos los pone el visitante y el precio lo pone el servidor.**
//
// Nada de "ahorra hasta un 80%". Un ahorro depende enteramente de contra qué se
// compara, y eso solo lo sabe quien está del otro lado: cuánto le toma hoy y
// cuánto vale esa hora. Por eso los cuatro números de entrada son suyos, están
// a la vista, y el bloque de supuestos dice qué NO está contando — incluido el
// costo de equivocarse, que es el que motiva el producto y el único que no se
// puede estimar con una regla de tres.
//
// El precio por llamada llega del OpenAPI vivo (`x-x402.precioUsd`). Si el muro
// está apagado y el endpoint no publica precio, se muestra cero y se dice.

// Gris para el estado actual, índigo para las dos formas de usar NomiCheck.
// El semáforo del motor (verde/ámbar/coral) NO se toca: acá nada se juzga
// correcto ni incorrecto, solo se comparan tres costos.
const COLOR_HOY = "#94a3b8";
const COLOR_EMPRESA = "#5b50e8";
const COLOR_AGENTE = "#9a8ef8";

function Campo({
  etiqueta,
  valor,
  onChange,
  sufijo,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  sufijo?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-[color:var(--color-ink)] leading-tight block">
        {etiqueta}
      </span>
      <div className="mt-1 flex items-center rounded-md border border-slate-200 focus-within:border-[color:var(--color-indigo)] focus-within:ring-2 focus-within:ring-[color:var(--color-indigo)]/15 transition">
        <input
          type="number"
          min={0}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-2 bg-transparent outline-none font-[family-name:var(--font-mono)] text-sm tabular-nums"
        />
        {sufijo && (
          <span className="pr-2.5 text-[10px] text-[color:var(--color-muted)] whitespace-nowrap">
            {sufijo}
          </span>
        )}
      </div>
    </label>
  );
}

export default function ComparadorCostos({
  t,
  precioUsdPorLlamada,
}: {
  t: Textos;
  /** `x-x402.precioUsd` de `/liquidar`, leído del servidor. `null` = todavía no
   *  publica precio (el muro está apagado). */
  precioUsdPorLlamada: number | null;
}) {
  const c = t.comparador;
  const [volumen, setVolumen] = useState("40");
  const [minutosHoy, setMinutosHoy] = useState("25");
  const [costoHora, setCostoHora] = useState("35000");
  const [minutosPortal, setMinutosPortal] = useState("4");
  const [trm, setTrm] = useState("4000");

  const n = (s: string) => Math.max(0, Number(s) || 0);
  const vol = n(volumen);
  const porHora = n(costoHora);
  const tasa = n(trm);
  const precioLlamadaCop = (precioUsdPorLlamada ?? 0) * tasa;

  const costoHoy = (n(minutosHoy) / 60) * porHora * vol;
  // La empresa también paga las llamadas: usa el mismo endpoint. Lo que baja
  // no es el precio, es el tiempo humano.
  const costoEmpresa = (n(minutosPortal) / 60) * porHora * vol + precioLlamadaCop * vol;
  // El agente no pone minutos de persona: arma el JSON, llama y lee la firma.
  const costoAgente = precioLlamadaCop * vol;

  const datos = [
    { nombre: c.hoy, valor: Math.round(costoHoy), fill: COLOR_HOY, detalle: c.detalleHoy },
    {
      nombre: c.comoEmpresa,
      valor: Math.round(costoEmpresa),
      fill: COLOR_EMPRESA,
      detalle: c.detalleEmpresa,
    },
    {
      nombre: c.comoAgente,
      valor: Math.round(costoAgente),
      fill: COLOR_AGENTE,
      detalle: c.detalleAgente,
    },
  ];

  const pesos = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");
  const diferencia = Math.round(costoHoy - costoAgente);

  return (
    <div className="grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-8 items-start">
      {/* ── Supuestos, editables ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <Campo etiqueta={c.volumen} valor={volumen} onChange={setVolumen} />
        <Campo etiqueta={c.minutosHoy} valor={minutosHoy} onChange={setMinutosHoy} sufijo="min" />
        <Campo etiqueta={c.costoHora} valor={costoHora} onChange={setCostoHora} sufijo="COP" />
        <Campo
          etiqueta={c.minutosPortal}
          valor={minutosPortal}
          onChange={setMinutosPortal}
          sufijo="min"
        />
        <Campo etiqueta={c.trm} valor={trm} onChange={setTrm} sufijo="COP/USD" />

        {precioUsdPorLlamada === null && (
          <p className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--color-muted)] pt-1">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
            {c.sinPrecio}
          </p>
        )}
      </div>

      {/* ── Resultado ────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                <XAxis
                  dataKey="nombre"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval={0}
                />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {/* La cifra va SOBRE la barra y no en un tooltip: el número es
                      el argumento, y esconderlo detrás de un hover lo pierde en
                      móvil, donde no existe el hover. */}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={(v: number) => pesos(v)}
                    style={{ fontSize: 11, fill: "#16203a", fontFamily: "var(--font-mono)" }}
                  />
                  {datos.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-4 grid sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            {datos.map((d) => (
              <div key={d.nombre}>
                <dt className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--color-ink)]">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: d.fill }}
                    aria-hidden
                  />
                  {d.nombre}
                </dt>
                <dd className="mt-1 font-[family-name:var(--font-mono)] text-sm tabular-nums text-[color:var(--color-ink)]">
                  {pesos(d.valor)}{" "}
                  <span className="text-[10px] text-[color:var(--color-muted)]">{c.porMes}</span>
                </dd>
                <dd className="text-[10px] text-[color:var(--color-muted)] mt-0.5">{d.detalle}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4 rounded-lg bg-[color:var(--color-navy)] text-white px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-[family-name:var(--font-display)]">
              {c.ahorroTitulo}
            </p>
            <p className="mt-1 text-xs text-white/55 max-w-md leading-relaxed">{c.ahorroPie}</p>
          </div>
          <p className="font-[family-name:var(--font-mono)] tabular-nums text-3xl font-semibold flex items-center gap-2">
            <TrendingDown
              className="w-6 h-6 text-[color:var(--color-verde)]"
              aria-hidden
            />
            {pesos(diferencia)}
          </p>
        </div>

        {/* Lo que el cálculo NO cuenta. Va a la vista y no en letra chica: un
            comparador sin sus supuestos es publicidad, no una herramienta. */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-[family-name:var(--font-display)]">
            {c.supuestosTitulo}
          </p>
          <ul className="mt-3 space-y-2">
            {c.supuestos.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed">
                <Info className="w-3.5 h-3.5 text-[color:var(--color-muted)] shrink-0 mt-px" aria-hidden />
                <span className="text-[color:var(--color-ink)]/75">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
