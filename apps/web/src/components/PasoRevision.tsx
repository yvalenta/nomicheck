import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { formatCOP, type ConceptoNomina } from "@pv/reglas";
import type { ComprobanteExtraido, ParametrosPublicos } from "../api";
import PaycheckCard from "./PaycheckCard.tsx";
import DateRangeField from "./DateRangeField.tsx";

interface Props {
  extraido: ComprobanteExtraido;
  parametros: ParametrosPublicos | null;
  onAtras: () => void;
  onConfirmar: (datos: {
    salario: string;
    desde: string;
    hasta: string;
    auxilio: boolean;
    conceptos: ConceptoNomina[];
  }) => void;
}

const TIPOS: { valor: ConceptoNomina["tipo"]; etiqueta: string }[] = [
  { valor: "devengo-legal", etiqueta: "Se suma" },
  { valor: "devengo-extralegal", etiqueta: "Se suma" },
  { valor: "deduccion-legal", etiqueta: "Se resta" },
  { valor: "deduccion-convenio", etiqueta: "Se resta" },
];

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function PasoRevision({ extraido, parametros, onAtras, onConfirmar }: Props) {
  const [salario, setSalario] = useState(String(extraido.salarioBasicoMensual ?? ""));
  const [desde, setDesde] = useState(extraido.periodoDesde ?? "");
  const [hasta, setHasta] = useState(extraido.periodoHasta ?? "");
  const [auxilio, setAuxilio] = useState(extraido.recibeAuxilioTransporte ?? false);
  const [conceptos, setConceptos] = useState<ConceptoNomina[]>(extraido.conceptos);

  function actualizar(i: number, cambios: Partial<ConceptoNomina>) {
    setConceptos((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...cambios } : c)));
  }

  function quitar(i: number) {
    setConceptos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function agregar() {
    setConceptos((prev) => [...prev, { nombre: "", tipo: "devengo-extralegal", valor: 0 }]);
  }

  const listo = Number(salario) > 0 && desde && hasta;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink">Revisa lo que leímos</h2>
        <p className="text-sm text-muted mt-1">Corrige cualquier dato antes de calcular.</p>
      </div>

      {extraido.advertenciaExtraccion && (
        <div className="rounded-2xl p-3.5 bg-amber-50 text-amber-700 flex items-start gap-2.5 text-sm">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>{extraido.advertenciaExtraccion}</span>
        </div>
      )}

      <PaycheckCard titulo="Datos generales">
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Salario básico mensual
            <input
              type="number"
              value={salario}
              onChange={(e) => setSalario(e.target.value)}
              className={inputCls}
            />
          </label>
          {parametros && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer self-start -mt-1.5">
              <input
                type="checkbox"
                checked={Number(salario) === parametros.smlmv}
                onChange={(e) => { if (e.target.checked) setSalario(String(parametros.smlmv)); }}
                className="w-3.5 h-3.5 accent-mint"
              />
              Autocompletar salario mínimo vigente ({formatCOP(parametros.smlmv)})
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Período
            <DateRangeField
              desde={desde}
              hasta={hasta}
              onCambio={(d, h) => {
                setDesde(d);
                setHasta(h);
              }}
              placeholder="Selecciona el período"
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={auxilio}
              onChange={(e) => setAuxilio(e.target.checked)}
              className="w-4 h-4 accent-emerald-500"
            />
            Recibo auxilio de transporte
          </label>
        </div>
      </PaycheckCard>

      <PaycheckCard titulo="Conceptos del comprobante">
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
          {conceptos.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={c.nombre}
                onChange={(e) => actualizar(i, { nombre: e.target.value })}
                className={`${inputCls} flex-1 py-1.5`}
                placeholder="Nombre del concepto"
              />
              <select
                value={c.tipo}
                onChange={(e) => actualizar(i, { tipo: e.target.value as ConceptoNomina["tipo"] })}
                className={`${inputCls} py-1.5`}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={c.valor || ""}
                onChange={(e) => actualizar(i, { valor: Number(e.target.value) })}
                className={`${inputCls} w-28 py-1.5`}
              />
              <button type="button" onClick={() => quitar(i)} className="text-coral shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={agregar}
            className="flex items-center gap-1 text-sm text-mint-dark hover:underline self-start mt-1"
          >
            <Plus size={16} /> Agregar concepto
          </button>
        </div>
      </PaycheckCard>

      <div className="flex gap-3">
        <button
          onClick={onAtras}
          className="flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white text-ink font-medium px-5 py-3.5 hover:bg-slate-50 transition-colors duration-200"
        >
          <ArrowLeft size={18} /> Atrás
        </button>
        <button
          disabled={!listo}
          onClick={() => onConfirmar({ salario, desde, hasta, auxilio, conceptos })}
          className="flex-1 flex items-center justify-center gap-2 rounded-full bg-mint text-white font-medium py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Calcular <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
