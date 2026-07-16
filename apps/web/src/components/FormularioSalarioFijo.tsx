import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ConceptoNomina, DatosNominaFija } from "@pv/reglas";

interface Props {
  onCalcular: (datos: DatosNominaFija, netoRecibido?: number) => void;
  cargando: boolean;
  error: string | null;
}

const TIPOS: { valor: ConceptoNomina["tipo"]; etiqueta: string }[] = [
  { valor: "devengo-extralegal", etiqueta: "Devengo extralegal" },
  { valor: "devengo-legal", etiqueta: "Devengo legal" },
  { valor: "deduccion-convenio", etiqueta: "Deducción por convenio" },
  { valor: "deduccion-legal", etiqueta: "Deducción legal" },
];

export default function FormularioSalarioFijo({ onCalcular, cargando, error }: Props) {
  const [salarioBasicoMensual, setSalarioBasicoMensual] = useState("");
  const [recibeAuxilioTransporte, setRecibeAuxilioTransporte] = useState(false);
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [conceptos, setConceptos] = useState<ConceptoNomina[]>([]);
  const [netoRecibido, setNetoRecibido] = useState("");

  function agregarConcepto() {
    setConceptos((prev) => [...prev, { nombre: "", tipo: "devengo-extralegal", valor: 0 }]);
  }

  function actualizarConcepto(i: number, cambios: Partial<ConceptoNomina>) {
    setConceptos((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...cambios } : c)));
  }

  function quitarConcepto(i: number) {
    setConceptos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onCalcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: Number(salarioBasicoMensual),
        recibeAuxilioTransporte,
        periodoDesde,
        periodoHasta,
        conceptos,
      },
      netoRecibido ? Number(netoRecibido) : undefined
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Salario básico mensual
          <input
            required
            type="number"
            min={1}
            value={salarioBasicoMensual}
            onChange={(e) => setSalarioBasicoMensual(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
            placeholder="12.958.400"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
          <input
            type="checkbox"
            checked={recibeAuxilioTransporte}
            onChange={(e) => setRecibeAuxilioTransporte(e.target.checked)}
          />
          Recibo auxilio de transporte
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Periodo desde
          <input
            required
            type="date"
            value={periodoDesde}
            onChange={(e) => setPeriodoDesde(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Periodo hasta
          <input
            required
            type="date"
            value={periodoHasta}
            onChange={(e) => setPeriodoHasta(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Conceptos del comprobante (prima, auxilios, deducciones por convenio...)
          </span>
          <button
            type="button"
            onClick={agregarConcepto}
            className="flex items-center gap-1 text-sm text-brand hover:underline"
          >
            <Plus size={16} /> Agregar
          </button>
        </div>
        {conceptos.length === 0 && (
          <p className="text-xs text-gray-400">
            Ninguno — solo se calculará el básico y los aportes de ley.
          </p>
        )}
        {conceptos.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              placeholder="Nombre del concepto"
              value={c.nombre}
              onChange={(e) => actualizarConcepto(i, { nombre: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex-1"
            />
            <select
              value={c.tipo}
              onChange={(e) => actualizarConcepto(i, { tipo: e.target.value as ConceptoNomina["tipo"] })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Valor"
              value={c.valor || ""}
              onChange={(e) => actualizarConcepto(i, { valor: Number(e.target.value) })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-32"
            />
            <button type="button" onClick={() => quitarConcepto(i)} className="text-warn">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm text-gray-700">
        ¿Cuánto te pagaron en total? (opcional — para comparar)
        <input
          type="number"
          min={0}
          value={netoRecibido}
          onChange={(e) => setNetoRecibido(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2"
          placeholder="Neto de tu comprobante"
        />
      </label>

      {error && <p className="text-sm text-warn">{error}</p>}

      <button
        type="submit"
        disabled={cargando}
        className="rounded-xl bg-brand text-white font-medium py-3 hover:bg-brand-dark transition-colors disabled:opacity-50"
      >
        {cargando ? "Calculando..." : "Calcular"}
      </button>
    </form>
  );
}
