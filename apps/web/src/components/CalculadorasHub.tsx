import { ArrowLeft, Calculator, Gift, MoonStar, PiggyBank, Scale } from "lucide-react";

export type PasoCalculadora = "indemnizacion" | "prima" | "cesantias" | "recargos";

const CALCULADORAS: {
  paso: PasoCalculadora;
  titulo: string;
  descripcion: string;
  Icono: typeof Scale;
}[] = [
  {
    paso: "prima",
    titulo: "Prima de servicios",
    descripcion: "Cuánto te corresponde por el semestre trabajado (junio y diciembre).",
    Icono: Gift,
  },
  {
    paso: "cesantias",
    titulo: "Cesantías e intereses",
    descripcion: "Lo acumulado por tu tiempo trabajado y el 12% anual de intereses.",
    Icono: PiggyBank,
  },
  {
    paso: "recargos",
    titulo: "Recargos y horas extra",
    descripcion: "Nocturnos, dominicales/festivos y extras con las tarifas vigentes.",
    Icono: MoonStar,
  },
  {
    paso: "indemnizacion",
    titulo: "Indemnización por terminación",
    descripcion: "Si te despidieron sin justa causa o terminaron tu contrato antes de tiempo.",
    Icono: Scale,
  },
];

interface Props {
  onIr: (paso: PasoCalculadora) => void;
  onAtras: () => void;
}

export default function CalculadorasHub({ onIr, onAtras }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink flex items-center justify-center gap-2">
          <Calculator size={20} className="text-mint-dark" /> Calculadoras
        </h2>
        <p className="text-sm text-muted mt-1">
          Estimados informativos por concepto — no reemplazan una liquidación oficial.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CALCULADORAS.map(({ paso, titulo, descripcion, Icono }) => (
          <button
            key={paso}
            onClick={() => onIr(paso)}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-mint hover:shadow-sm transition-all duration-200"
          >
            <Icono size={20} className="text-mint-dark shrink-0 mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{titulo}</span>
              <span className="text-xs text-muted">{descripcion}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={onAtras}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <ArrowLeft size={15} /> Volver al verificador
      </button>
    </div>
  );
}
