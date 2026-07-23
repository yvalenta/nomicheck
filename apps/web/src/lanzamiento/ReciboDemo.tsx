import { useState } from "react";

// Signature element de la landing (SDD §16 + sdd/marketing/posicionamiento.md):
// el hero NO es una foto o un headline solo — es un recibo real contra el motor,
// con el veredicto línea a línea y la ley citada. La primera pantalla ES el
// argumento del producto, no lo promete.
//
// Datos ficticios pero cifras plausibles del CST vigente jul 2026.

type Estado = "correcto" | "advertencia" | "discrepancia";

interface LineaRecibo {
  concepto: string;
  ley: string;
  pagado: number;
  legal: number;
  formula: string;
  estado: Estado;
}

const LINEAS: LineaRecibo[] = [
  {
    concepto: "Salario base (15 días)",
    ley: "Contrato — 1 SMLMV",
    pagado: 875_452,
    legal: 875_452,
    formula: "$1.750.905 ÷ 30 × 15",
    estado: "correcto",
  },
  {
    concepto: "Recargo dominical (dom 22-jul, 6pm–10pm)",
    ley: "CST art. 179",
    pagado: 15_800,
    legal: 24_312,
    formula: "4h × $8.104/h × 75%",
    estado: "discrepancia",
  },
  {
    concepto: "Recargo nocturno (dom 22-jul, 10pm–2am)",
    ley: "CST art. 168",
    pagado: 0,
    legal: 11_669,
    formula: "4h × $8.104/h × 36%",
    estado: "discrepancia",
  },
  {
    concepto: "Hora extra nocturna festiva (dom, 4h)",
    ley: "CST art. 168 + 179",
    pagado: 32_416,
    legal: 60_780,
    formula: "4h × $8.104/h × 187.5%",
    estado: "discrepancia",
  },
  {
    concepto: "Auxilio de transporte",
    ley: "Ley 15 de 1959",
    pagado: 100_000,
    legal: 100_000,
    formula: "$200.000 × 15/30",
    estado: "correcto",
  },
];

const DOTS: Record<Estado, string> = {
  correcto: "bg-[color:var(--color-verde)]",
  advertencia: "bg-[color:var(--color-ambar)]",
  discrepancia: "bg-[color:var(--color-coral-fuerte)]",
};

const ETIQUETAS: Record<Estado, string> = {
  correcto: "Correcto",
  advertencia: "Revisar",
  discrepancia: "Falta pago",
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("es-CO");
}

export default function ReciboDemo() {
  const [expandida, setExpandida] = useState<number | null>(1);
  const totalPagado = LINEAS.reduce((s, l) => s + l.pagado, 0);
  const totalLegal = LINEAS.reduce((s, l) => s + l.legal, 0);
  const diferencia = totalLegal - totalPagado;

  return (
    <div className="w-full max-w-md mx-auto lg:max-w-none">
      {/* Contenedor tipo comprobante: fondo papel, sombra dura sin blur (evoca
          impresión), esquinas apenas redondeadas para que no se vea "web". */}
      <div className="bg-[color:var(--color-papel)] border border-[color:var(--color-papel-2)] rounded-md shadow-[8px_8px_0_rgba(15,23,42,0.08)]">
        {/* Encabezado del comprobante */}
        <div className="px-5 pt-5 pb-4 border-b border-dashed border-[color:var(--color-papel-2)]">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)]">
                Comprobante de pago
              </p>
              <p className="text-base font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)] mt-0.5">
                Juan P.
              </p>
              <p className="text-xs text-[color:var(--color-ink)]/60">
                Mesero · Restaurante ejemplo
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)]">
                Quincena
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-[color:var(--color-ink)] mt-0.5">
                16 – 31 jul 2026
              </p>
            </div>
          </div>
        </div>

        {/* Líneas del cálculo — cada una click-expandible con la fórmula y ley. */}
        <ul className="divide-y divide-[color:var(--color-papel-2)]">
          {LINEAS.map((l, i) => {
            const abierta = expandida === i;
            const dif = l.legal - l.pagado;
            return (
              <li key={i}>
                <button
                  onClick={() => setExpandida(abierta ? null : i)}
                  className="w-full px-5 py-3 text-left hover:bg-[color:var(--color-papel-2)]/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${DOTS[l.estado]}`}
                      aria-label={ETIQUETAS[l.estado]}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[color:var(--color-ink)] leading-tight truncate">
                        {l.concepto}
                      </p>
                      <p className="text-[11px] text-[color:var(--color-ink)]/60 mt-0.5">
                        {l.ley}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-[family-name:var(--font-mono)] text-sm text-[color:var(--color-ink)] tabular-nums">
                        {fmt(l.pagado)}
                      </p>
                      {dif > 0 && (
                        <p className="font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--color-coral-fuerte)] tabular-nums mt-0.5">
                          debía ser {fmt(l.legal)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                {abierta && (
                  <div className="px-5 pb-4 pt-1">
                    <div className="rounded-sm bg-white/70 border border-[color:var(--color-papel-2)] px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-wider text-[color:var(--color-ink)]/50 font-[family-name:var(--font-display)]">
                        Cómo se calcula
                      </p>
                      <p className="font-[family-name:var(--font-mono)] text-[13px] text-[color:var(--color-ink)] mt-1">
                        {l.formula}
                      </p>
                      {dif > 0 && (
                        <p className="text-xs text-[color:var(--color-ink)]/70 mt-2 leading-relaxed">
                          Según <span className="font-medium">{l.ley}</span>, la ley
                          exige{" "}
                          <span className="font-[family-name:var(--font-mono)] text-[color:var(--color-coral-fuerte)]">
                            {fmt(l.legal)}
                          </span>
                          . Faltan{" "}
                          <span className="font-[family-name:var(--font-mono)] text-[color:var(--color-coral-fuerte)] font-semibold">
                            {fmt(dif)}
                          </span>{" "}
                          en esta línea.
                        </p>
                      )}
                      {dif === 0 && l.estado === "correcto" && (
                        <p className="text-xs text-[color:var(--color-ink)]/70 mt-2">
                          Este cálculo coincide con lo que exige la ley.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Totales */}
        <div className="px-5 py-4 border-t border-[color:var(--color-papel-2)] bg-white/50">
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-[color:var(--color-ink)]/70">Recibió</span>
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[color:var(--color-ink)]">
              {fmt(totalPagado)}
            </span>
          </div>
          <div className="flex justify-between items-baseline text-sm mt-1">
            <span className="text-[color:var(--color-ink)]/70">Debía recibir</span>
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[color:var(--color-ink)]">
              {fmt(totalLegal)}
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-3 mt-3 border-t border-dashed border-[color:var(--color-papel-2)]">
            <span className="text-[color:var(--color-coral-fuerte)] font-[family-name:var(--font-display)] font-semibold text-sm uppercase tracking-wide">
              Falta pagarle
            </span>
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-2xl text-[color:var(--color-coral-fuerte)] font-semibold">
              {fmt(diferencia)}
            </span>
          </div>
        </div>
      </div>

      {/* Nota fuera de la tarjeta — evita confusión con datos reales */}
      <p className="text-center text-[11px] text-[color:var(--color-ink)]/50 mt-3 max-w-xs mx-auto lg:max-w-none">
        Ejemplo con datos ficticios sobre CST vigente. Toca cada línea para ver la fórmula.
      </p>
    </div>
  );
}
