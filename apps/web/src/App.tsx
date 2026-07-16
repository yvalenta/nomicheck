import { Scale } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <Scale size={40} strokeWidth={1.5} className="text-blue-600" />
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Validador de Nómina
        </h1>
      </div>
      <p className="text-gray-500 text-sm max-w-sm text-center">
        Verifica si tu pago fue calculado correctamente según la ley laboral
        colombiana vigente.
      </p>
      <div className="flex gap-4 mt-4">
        <button className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm">
          Nómina por turnos
        </button>
        <button className="px-6 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors shadow-sm">
          Nómina de salario fijo
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-8">
        Estimado informativo — no reemplaza la liquidación oficial ni asesoría
        legal certificada.
      </p>
    </div>
  );
}
