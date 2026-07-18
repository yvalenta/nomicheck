import { Printer } from "lucide-react";
import { formatCOP, type LineaResultado, type ResultadoNomina } from "@pv/reglas";

interface Props {
  resultado: ResultadoNomina;
  /** Número de comprobante (ej. "NC-000123"); ausente en el modo anónimo → "Borrador". */
  numero?: string;
  empresa?: string;
  empleado?: { nombre: string; documento: string };
  /** ISO date de liquidación (ReciboPago.liquidadoEn); ausente en anónimo. */
  fechaElaboracion?: string;
}

// Conceptos que constituyen salario (base de prestaciones e IBC): todo lo
// que el motor genera con nombre conocido. Cualquier otro devengo (ej.
// auxilio de rodamiento/alimentación extraído de un comprobante o declarado
// como concepto extralegal) se presenta como "ingreso no salarial".
function esIngresoSalarial(l: LineaResultado): boolean {
  return (
    l.concepto.startsWith("Salario") ||
    l.concepto.startsWith("Auxilio de transporte") ||
    l.concepto.startsWith("Auxilio de sostenimiento") ||
    l.concepto.startsWith("Recargo") ||
    l.concepto.startsWith("Hora extra") ||
    l.concepto.startsWith("Honorarios")
  );
}

function vacio(valor: number | string | undefined | null, formato?: (v: number) => string): string {
  if (valor === undefined || valor === null || valor === "") return "—";
  return typeof valor === "number" && formato ? formato(valor) : String(valor);
}

const th = "text-left text-xs font-semibold uppercase tracking-wide text-muted pb-2 border-b border-slate-200";
const td = "py-2 text-sm text-ink border-b border-slate-100";
const tdNum = `${td} text-right tabular-nums`;

export default function ComprobanteNomina({ resultado, numero, empresa, empleado, fechaElaboracion }: Props) {
  const devengos = resultado.lineas.filter((l) => l.tipo === "devengo");
  const salariales = devengos.filter(esIngresoSalarial);
  const noSalariales = devengos.filter((l) => !esIngresoSalarial(l));
  const deducciones = resultado.lineas.filter((l) => l.tipo === "deduccion");

  return (
    <div id="comprobante-nomina" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 print:shadow-none print:border-0 print:p-0">
      {/* Estilos de impresión: solo el comprobante, en tinta negra sobre blanco. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #comprobante-nomina, #comprobante-nomina * { visibility: visible; }
          #comprobante-nomina { position: absolute; inset: 0; width: 100%; }
          #comprobante-nomina .no-imprimir { display: none; }
        }
      `}</style>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-ink">Comprobante de nómina</h3>
          <p className="text-xs text-muted mt-0.5">
            N° {numero ?? "Borrador (estimado del verificador, sin valor contable)"}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-imprimir flex items-center gap-1.5 text-sm font-medium text-mint-dark hover:underline shrink-0"
        >
          <Printer size={15} /> Imprimir / PDF
        </button>
      </div>

      {/* Encabezado */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-4 text-sm">
        <Dato etiqueta="Empresa" valor={vacio(empresa)} />
        <Dato etiqueta="Fecha de elaboración" valor={vacio(fechaElaboracion?.slice(0, 10))} />
        <Dato etiqueta="Período" valor={`${resultado.periodoDesde} — ${resultado.periodoHasta}`} />
        <Dato etiqueta="Empleado" valor={vacio(empleado?.nombre)} />
        <Dato etiqueta="Identificación" valor={vacio(empleado?.documento)} />
        <Dato etiqueta="Salario básico mensual" valor={formatCOP(resultado.salarioBasicoMensual)} />
        <Dato etiqueta="Valor día" valor={vacio(resultado.valorDia, formatCOP)} />
        <Dato etiqueta="Valor hora ordinaria" valor={vacio(resultado.valorHoraOrdinaria, formatCOP)} />
        <Dato etiqueta="Días laborados" valor={vacio(resultado.diasLaborados)} />
      </dl>

      {/* Ingresos salariales */}
      <h4 className="text-sm font-bold text-ink mt-6 mb-2">Ingresos salariales</h4>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Concepto</th>
            <th className={`${th} text-right`}>Valor recargo</th>
            <th className={`${th} text-right`}>N° horas</th>
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {salariales.map((l, i) => (
            <tr key={i}>
              <td className={td}>
                {l.concepto}
                {l.ley && <span className="block text-[11px] text-muted">{l.ley}</span>}
              </td>
              <td className={tdNum}>
                {l.recargoPct !== undefined ? `${Math.round(l.recargoPct * 100)}%` : "—"}
              </td>
              <td className={tdNum}>{l.horas !== undefined ? l.horas.toFixed(2) : "—"}</td>
              <td className={tdNum}>{formatCOP(l.valorCalculado)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ingresos no salariales */}
      {noSalariales.length > 0 && (
        <>
          <h4 className="text-sm font-bold text-ink mt-6 mb-2">Ingresos no salariales</h4>
          <table className="w-full border-collapse">
            <tbody>
              {noSalariales.map((l, i) => (
                <tr key={i}>
                  <td className={td}>{l.concepto}</td>
                  <td className={tdNum}>{formatCOP(l.valorCalculado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="flex justify-between text-sm font-semibold text-ink mt-3 pt-2 border-t border-slate-200">
        <span>TOTAL INGRESOS</span>
        <span className="tabular-nums">{formatCOP(resultado.totalDevengos)}</span>
      </div>

      {/* Deducciones */}
      <h4 className="text-sm font-bold text-ink mt-6 mb-2">Deducciones</h4>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Concepto</th>
            <th className={`${th} text-right`}>Porcentaje / detalle</th>
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {deducciones.map((l, i) => (
            <tr key={i}>
              <td className={td}>
                {l.concepto}
                {l.ley && <span className="block text-[11px] text-muted">{l.ley}</span>}
              </td>
              <td className={tdNum}>
                {l.recargoPct !== undefined ? `${(l.recargoPct * 100).toFixed(1)}%` : "—"}
              </td>
              <td className={tdNum}>−{formatCOP(l.valorCalculado)}</td>
            </tr>
          ))}
          {deducciones.length === 0 && (
            <tr>
              <td className={`${td} text-muted`} colSpan={3}>
                Sin deducciones en este periodo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex justify-between text-sm font-semibold text-coral mt-3 pt-2 border-t border-slate-200">
        <span>TOTAL DEDUCCIONES</span>
        <span className="tabular-nums">−{formatCOP(resultado.totalDeducciones)}</span>
      </div>

      <div className="flex justify-between text-base font-bold text-ink mt-4 pt-3 border-t-2 border-ink">
        <span>NETO A PAGAR</span>
        <span className="tabular-nums">{formatCOP(resultado.netoEsperado)}</span>
      </div>

      <p className="text-[11px] text-muted mt-4">
        Generado por NomiCheck — estimado informativo según la ley colombiana vigente; no reemplaza
        la liquidación oficial ni asesoría legal certificada.
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{etiqueta}</dt>
      <dd className="font-medium text-ink tabular-nums">{valor}</dd>
    </div>
  );
}
