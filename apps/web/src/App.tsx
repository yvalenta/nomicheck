import { useState } from "react";
import { Scale } from "lucide-react";
import type { DatosNominaFija, DatosNominaTurnos, ResultadoNomina } from "@pv/reglas";
import { calcularNomina } from "./api";
import FormularioTurnos from "./components/FormularioTurnos";
import FormularioSalarioFijo from "./components/FormularioSalarioFijo";
import Resultado from "./components/Resultado";

type Vista = "inicio" | "turnos" | "salario-fijo" | "resultado";

export default function App() {
  const [vista, setVista] = useState<Vista>("inicio");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoNomina | null>(null);
  const [netoRecibido, setNetoRecibido] = useState<number | undefined>();

  async function calcular(datos: DatosNominaTurnos | DatosNominaFija, neto?: number) {
    setCargando(true);
    setError(null);
    try {
      const r = await calcularNomina(datos);
      setResultado(r);
      setNetoRecibido(neto);
      setVista("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  function volver() {
    setResultado(null);
    setError(null);
    setVista("inicio");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center gap-8 p-8">
      <button onClick={volver} className="flex items-center gap-3">
        <Scale size={36} strokeWidth={1.5} className="text-brand" />
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Validador de Nómina
        </h1>
      </button>

      {vista === "inicio" && (
        <>
          <p className="text-gray-500 text-sm max-w-sm text-center">
            Verifica si tu pago fue calculado correctamente según la ley laboral
            colombiana vigente.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => setVista("turnos")}
              className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-dark transition-colors shadow-sm"
            >
              Nómina por turnos
            </button>
            <button
              onClick={() => setVista("salario-fijo")}
              className="px-6 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              Nómina de salario fijo
            </button>
          </div>
        </>
      )}

      {vista === "turnos" && (
        <FormularioTurnos onCalcular={calcular} cargando={cargando} error={error} />
      )}

      {vista === "salario-fijo" && (
        <FormularioSalarioFijo onCalcular={calcular} cargando={cargando} error={error} />
      )}

      {vista === "resultado" && resultado && (
        <Resultado resultado={resultado} netoRecibido={netoRecibido} onVolver={volver} />
      )}

      <p className="text-xs text-gray-400 mt-auto">
        Estimado informativo — no reemplaza la liquidación oficial ni asesoría
        legal certificada.
      </p>
    </div>
  );
}
