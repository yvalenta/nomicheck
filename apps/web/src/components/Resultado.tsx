import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { formatCOP, type ResultadoNomina } from "@pv/reglas";

interface Props {
  resultado: ResultadoNomina;
  netoRecibido?: number;
  onVolver: () => void;
}

const TOLERANCIA_PESOS = 1;

export default function Resultado({ resultado, netoRecibido, onVolver }: Props) {
  const diferencia = netoRecibido !== undefined ? netoRecibido - resultado.netoEsperado : undefined;
  const coincide = diferencia !== undefined && Math.abs(diferencia) <= TOLERANCIA_PESOS;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      {diferencia !== undefined ? (
        <div
          className={`rounded-xl p-4 flex items-center gap-3 ${
            coincide ? "bg-green-50 text-ok" : "bg-red-50 text-warn"
          }`}
        >
          {coincide ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
          <div className="text-sm">
            <p className="font-medium">
              {coincide
                ? "El pago coincide con lo esperado."
                : diferencia > 0
                  ? `Te pagaron ${formatCOP(diferencia)} de más frente a lo esperado.`
                  : `Te pagaron ${formatCOP(Math.abs(diferencia))} de menos frente a lo esperado.`}
            </p>
            <p className="text-xs opacity-75">
              Esperado {formatCOP(resultado.netoEsperado)} · Recibido {formatCOP(netoRecibido!)}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex items-center gap-3 bg-gray-100 text-gray-500">
          <HelpCircle size={22} />
          <p className="text-sm">
            No indicaste cuánto te pagaron, así que no podemos compararlo. Este es el estimado
            calculado según la ley vigente.
          </p>
        </div>
      )}

      {resultado.advertencias.length > 0 && (
        <div className="rounded-xl p-4 bg-amber-50 text-amber-700 flex flex-col gap-2">
          {resultado.advertencias.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium text-right">Horas / base</th>
              <th className="px-4 py-2 font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {resultado.lineas.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-2">
                  <p className="text-gray-900">{l.concepto}</p>
                  {l.ley && <p className="text-xs text-gray-400">{l.ley}</p>}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  {l.horas !== undefined ? `${l.horas} h` : l.recargoPct !== undefined ? `${(l.recargoPct * 100).toFixed(0)}%` : "—"}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${l.tipo === "deduccion" ? "text-warn" : "text-gray-900"}`}>
                  {l.tipo === "deduccion" ? "-" : ""}
                  {formatCOP(l.valorCalculado)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50">
            <tr>
              <td className="px-4 py-2 font-medium" colSpan={2}>
                Total devengado
              </td>
              <td className="px-4 py-2 text-right font-medium">{formatCOP(resultado.totalDevengos)}</td>
            </tr>
            {resultado.totalDeducciones > 0 && (
              <tr>
                <td className="px-4 py-2 font-medium" colSpan={2}>
                  Total deducciones
                </td>
                <td className="px-4 py-2 text-right font-medium text-warn">
                  -{formatCOP(resultado.totalDeducciones)}
                </td>
              </tr>
            )}
            <tr>
              <td className="px-4 py-2 font-semibold text-gray-900" colSpan={2}>
                Neto esperado
              </td>
              <td className="px-4 py-2 text-right font-semibold text-gray-900">
                {formatCOP(resultado.netoEsperado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Estimado informativo — no reemplaza la liquidación oficial ni asesoría legal certificada.
      </p>

      <button
        onClick={onVolver}
        className="self-center text-sm text-brand hover:underline"
      >
        Calcular otro comprobante
      </button>
    </div>
  );
}
