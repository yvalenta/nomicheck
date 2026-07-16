import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { DatosNominaTurnos, ExcepcionTurno } from "@pv/reglas";

interface Props {
  onCalcular: (datos: DatosNominaTurnos, netoRecibido?: number) => void;
  cargando: boolean;
  error: string | null;
}

export default function FormularioTurnos({ onCalcular, cargando, error }: Props) {
  const [salarioBasicoMensual, setSalarioBasicoMensual] = useState("");
  const [recibeAuxilioTransporte, setRecibeAuxilioTransporte] = useState(true);
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [dominicosTrabajaos, setDominicosTrabajaos] = useState("0");
  const [excepciones, setExcepciones] = useState<ExcepcionTurno[]>([]);
  const [netoRecibido, setNetoRecibido] = useState("");

  function agregarExcepcion() {
    setExcepciones((prev) => [...prev, { fecha: periodoDesde || "", horaInicio: "10:00", horaFin: "17:00" }]);
  }

  function actualizarExcepcion(i: number, cambios: Partial<ExcepcionTurno>) {
    setExcepciones((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...cambios } : e)));
  }

  function quitarExcepcion(i: number) {
    setExcepciones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onCalcular(
      {
        modo: "turnos",
        salarioBasicoMensual: Number(salarioBasicoMensual),
        recibeAuxilioTransporte,
        periodoDesde,
        periodoHasta,
        dominicosTrabajaos: Number(dominicosTrabajaos),
        excepciones,
      },
      netoRecibido ? Number(netoRecibido) : undefined
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl flex flex-col gap-5">
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
            placeholder="1.750.905"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Domingos trabajados
          <input
            required
            type="number"
            min={0}
            value={dominicosTrabajaos}
            onChange={(e) => setDominicosTrabajaos(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
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

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={recibeAuxilioTransporte}
          onChange={(e) => setRecibeAuxilioTransporte(e.target.checked)}
        />
        Recibo auxilio de transporte
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Excepciones (días con horario distinto al base, o adicionales en lunes/festivo)
          </span>
          <button
            type="button"
            onClick={agregarExcepcion}
            className="flex items-center gap-1 text-sm text-brand hover:underline"
          >
            <Plus size={16} /> Agregar
          </button>
        </div>
        {excepciones.length === 0 && (
          <p className="text-xs text-gray-400">Ninguna — se usa el horario base todo el periodo.</p>
        )}
        {excepciones.map((exc, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="date"
              value={exc.fecha}
              onChange={(e) => actualizarExcepcion(i, { fecha: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex-1"
            />
            <input
              type="time"
              value={exc.horaInicio}
              onChange={(e) => actualizarExcepcion(i, { horaInicio: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              type="time"
              value={exc.horaFin}
              onChange={(e) => actualizarExcepcion(i, { horaFin: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button type="button" onClick={() => quitarExcepcion(i)} className="text-warn">
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
