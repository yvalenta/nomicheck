import { formatCOP } from "@pv/reglas";
import type { CostoEmpleado } from "../../apiEmpresa";
import Modal, { ModalClose } from "../ui/modal.tsx";
import LegalRef from "../ui/LegalRef.tsx";

// Explicaciones cortas por norma citada — alimentan la ayuda contextual de cada
// línea. Coincidencia por substring: basta con que la `ley` de la línea contenga
// la clave. Fallback genérico para normas aún sin glosa.
const GLOSARIO: { clave: string; texto: string }[] = [
  { clave: "Ley 100", texto: "Sistema de seguridad social integral: salud, pensión y riesgos laborales. Fija los aportes de empleador y trabajador." },
  { clave: "1607", texto: "Exoneración de aportes (SENA, ICBF y salud empleador) para trabajadores que ganan menos de 10 SMMLV. Reduce la carga patronal." },
  { clave: "art. 127", texto: "Define qué constituye salario: todo pago que retribuye directamente el servicio, incluyendo comisiones y sobresueldos." },
  { clave: "art. 128", texto: "Pagos que NO son salario: propinas, viáticos ocasionales y beneficios pactados como no salariales." },
  { clave: "art. 392", texto: "Retención en la fuente sobre honorarios y servicios de contratistas independientes." },
  { clave: "ARL", texto: "Aporte a Riesgos Laborales. La tarifa depende de la clase de riesgo (I a V) según la actividad del cargo." },
  { clave: "SENA", texto: "Aporte parafiscal del 2% destinado a formación para el trabajo. Puede estar exonerado (Ley 1607)." },
  { clave: "ICBF", texto: "Aporte parafiscal del 3% al Instituto Colombiano de Bienestar Familiar. Puede estar exonerado (Ley 1607)." },
  { clave: "Caja", texto: "Aporte del 4% a la Caja de Compensación Familiar. No es exonerable." },
  { clave: "cesantía", texto: "Provisión del 8.33% mensual: un mes de salario por año trabajado, como ahorro para el desempleo." },
  { clave: "prima", texto: "Provisión del 8.33%: prima de servicios, equivalente a un mes de salario al año, pagada en dos cuotas." },
  { clave: "vacacion", texto: "Provisión del 4.17%: 15 días hábiles de descanso remunerado por año trabajado." },
  { clave: "intereses", texto: "Intereses del 12% anual sobre las cesantías, pagados al trabajador cada enero." },
];

function glosa(ley: string): string {
  const hit = GLOSARIO.find((g) => ley.toLowerCase().includes(g.clave.toLowerCase()));
  return hit?.texto ?? "Concepto liquidado por el motor NomiCheck según la normativa colombiana vigente.";
}

const TIPO_LABEL: Record<string, string> = {
  indefinido: "Término indefinido",
  fijo: "Término fijo",
  obra_labor: "Por obra o labor",
  tiempo_parcial: "Tiempo parcial",
  aprendizaje_sena_lectiva: "Aprendiz SENA — lectiva",
  aprendizaje_sena_practica: "Aprendiz SENA — práctica",
};

interface Props {
  empleado: CostoEmpleado | null;
  onClose: () => void;
}

export default function DetalleColaboradorModal({ empleado, onClose }: Props) {
  const c = empleado?.costo;
  const iniciales = empleado
    ? empleado.nombre
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "";

  return (
    <Modal open={!!empleado} onClose={onClose} labelledBy="detalle-nombre">
      {empleado && c && (
        <>
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 rounded-t-2xl">
            <div className="flex gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-soft text-indigo font-bold">
                {iniciales}
              </div>
              <div>
                <h3 id="detalle-nombre" className="text-base font-bold text-ink">
                  {empleado.nombre}
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  {TIPO_LABEL[empleado.tipoContrato] ?? empleado.tipoContrato}
                </p>
                <span className="mt-1.5 inline-block rounded bg-indigo-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo">
                  Salario base {formatCOP(empleado.salarioBase)}
                </span>
              </div>
            </div>
            <ModalClose onClose={onClose} />
          </div>

          {/* Hero: costo total */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-indigo-soft/50 px-5 py-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
                Costo total mensual para la empresa
              </p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-indigo">
                {formatCOP(c.costoTotalMensual)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">Factor sobre salario</p>
              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-ink">
                ×{c.factorSobreSalario.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Desglose de líneas */}
          <div className="max-h-[46vh] overflow-y-auto px-5 py-4">
            <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.09em] text-muted">
              Desglose del costo
              <span className="h-px flex-1 bg-slate-100" />
            </h4>
            <div className="flex flex-col">
              {c.lineas.map((l, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-ink">
                      {l.concepto}
                      {l.pct != null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {(l.pct * 100).toFixed(2).replace(/\.?0+$/, "")}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <LegalRef ley={l.ley}>{glosa(l.ley)}</LegalRef>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-ink">
                    {formatCOP(l.valor)}
                  </span>
                </div>
              ))}
            </div>

            {/* Advertencias */}
            {c.advertencias.length > 0 && (
              <div className="mt-3 rounded-lg border-l-[3px] border-ambar bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                {c.advertencias.map((a, i) => (
                  <div key={i}>⚠ {a}</div>
                ))}
              </div>
            )}
          </div>

          {/* Pie */}
          <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-relaxed text-muted">
            Estimación informativa · cada línea cita su fuente legal · no reemplaza la
            liquidación oficial ni la revisión de un Contador Público (JCC).
          </div>
        </>
      )}
    </Modal>
  );
}
