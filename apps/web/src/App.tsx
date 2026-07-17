import { useEffect, useState } from "react";
import {
  HORARIO_BASE_DEFAULT,
  type ConceptoNomina,
  type Festivo,
  type HorarioDia,
  type NovedadDia,
  type ResultadoNomina,
} from "@pv/reglas";
import {
  calcularNomina,
  listarFestivos,
  obtenerParametros,
  type ComprobanteExtraido,
  type ParametrosPublicos,
} from "./api";
import HeaderProfile from "./components/HeaderProfile.tsx";
import PasoSalario, { type DatosPaso1 } from "./components/PasoSalario.tsx";
import PasoSemana from "./components/PasoSemana.tsx";
import SubirComprobante from "./components/SubirComprobante.tsx";
import PasoRevision from "./components/PasoRevision.tsx";
import Resultado from "./components/Resultado.tsx";
import SkeletonResultado from "./components/SkeletonResultado.tsx";

type Paso = "salario" | "semana" | "subir" | "revision" | "calculando" | "resultado";

const PASO_LABEL: Record<Paso, string> = {
  salario: "Paso 1 de 3 · Salario y fechas",
  semana: "Paso 2 de 3 · Tu semana",
  subir: "Sube tu comprobante",
  revision: "Revisa los datos",
  calculando: "Calculando…",
  resultado: "Resultado",
};

export default function App() {
  const [paso, setPaso] = useState<Paso>("salario");
  const [datos1, setDatos1] = useState<DatosPaso1>({
    salario: "",
    periodicidad: "quincenal",
    desde: "",
    hasta: "",
    auxilio: true,
    tipoContrato: "indefinido",
    netoRecibido: "",
    aporteAfc: "",
    prestamo: "",
    ahorro: "",
    reproceso: "",
    embargoTipo: "",
    embargoValor: "",
  });
  const [horarioBase, setHorarioBase] = useState<(HorarioDia | null)[]>(HORARIO_BASE_DEFAULT);
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [parametros, setParametros] = useState<ParametrosPublicos | null>(null);
  const [extraido, setExtraido] = useState<ComprobanteExtraido | null>(null);
  const [resultado, setResultado] = useState<ResultadoNomina | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarFestivos().then(setFestivos);
    obtenerParametros().then(setParametros);
  }, []);

  async function calcularPorTurnos(novedades: NovedadDia[]) {
    setPaso("calculando");
    setError(null);
    try {
      const r = await calcularNomina({
        modo: "turnos",
        salarioBasicoMensual: Number(datos1.salario),
        recibeAuxilioTransporte: datos1.auxilio,
        periodoDesde: datos1.desde,
        periodoHasta: datos1.hasta,
        horarioBase,
        novedades,
        tipoContrato: datos1.tipoContrato,
        aporteAfcMensual: datos1.aporteAfc ? Number(datos1.aporteAfc) : undefined,
        prestamoMensual: datos1.prestamo ? Number(datos1.prestamo) : undefined,
        ahorroMensual: datos1.ahorro ? Number(datos1.ahorro) : undefined,
        reprocesoMensual: datos1.reproceso ? Number(datos1.reproceso) : undefined,
        descuentoJudicial:
          datos1.embargoTipo && datos1.embargoValor
            ? { tipo: datos1.embargoTipo, valorMensual: Number(datos1.embargoValor) }
            : undefined,
      });
      setResultado(r);
      setPaso("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setPaso("semana");
    }
  }

  async function calcularDesdeComprobante(datos: {
    salario: string;
    desde: string;
    hasta: string;
    auxilio: boolean;
    conceptos: ConceptoNomina[];
  }) {
    setPaso("calculando");
    setError(null);
    try {
      const r = await calcularNomina({
        modo: "salario-fijo",
        salarioBasicoMensual: Number(datos.salario),
        recibeAuxilioTransporte: datos.auxilio,
        periodoDesde: datos.desde,
        periodoHasta: datos.hasta,
        conceptos: datos.conceptos,
        tipoContrato: datos1.tipoContrato,
      });
      setDatos1((d) => ({ ...d, desde: datos.desde, hasta: datos.hasta }));
      setResultado(r);
      setPaso("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setPaso("revision");
    }
  }

  function reiniciar() {
    setResultado(null);
    setExtraido(null);
    setError(null);
    setPaso("salario");
  }

  const periodo =
    (paso === "semana" || paso === "resultado") && datos1.desde && datos1.hasta
      ? { desde: datos1.desde, hasta: datos1.hasta }
      : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile periodo={periodo} paso={PASO_LABEL[paso]} />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {paso === "salario" && (
          <div className="flex flex-col gap-5">
            <div className="text-center px-4">
              <h2 className="text-xl font-bold text-ink">¿Te pagaron bien?</h2>
              <p className="text-sm text-muted mt-1">
                Dinos tu salario y tus horarios — nosotros hacemos las cuentas con la ley
                colombiana vigente.
              </p>
            </div>
            <PasoSalario
              datos={datos1}
              onCambio={setDatos1}
              onSiguiente={() => setPaso("semana")}
              parametros={parametros}
            />
            <button
              onClick={() => setPaso("subir")}
              className="text-sm text-mint-dark hover:underline self-center"
            >
              O sube tu comprobante y lo leemos por ti
            </button>
          </div>
        )}

        {paso === "semana" && (
          <div className="flex flex-col gap-4">
            {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}
            <PasoSemana
              desde={datos1.desde}
              hasta={datos1.hasta}
              horarioBase={horarioBase}
              onCambioHorarioBase={setHorarioBase}
              festivos={festivos}
              onAtras={() => setPaso("salario")}
              onCalcular={calcularPorTurnos}
            />
          </div>
        )}

        {paso === "subir" && (
          <SubirComprobante
            onAtras={() => setPaso("salario")}
            onExtraido={(datos) => {
              setExtraido(datos);
              setPaso("revision");
            }}
          />
        )}

        {paso === "revision" && extraido && (
          <div className="flex flex-col gap-4">
            {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}
            <PasoRevision extraido={extraido} onAtras={() => setPaso("subir")} onConfirmar={calcularDesdeComprobante} />
          </div>
        )}

        {paso === "calculando" && <SkeletonResultado />}

        {paso === "resultado" && resultado && (
          <Resultado
            resultado={resultado}
            netoRecibido={datos1.netoRecibido ? Number(datos1.netoRecibido) : undefined}
            onVolver={reiniciar}
          />
        )}
      </main>

      <footer className="text-center text-xs text-muted py-4 px-6 flex flex-col gap-1.5">
        <span>
          NomiCheck — estimado informativo, no reemplaza la liquidación oficial ni asesoría legal
          certificada.
        </span>
        <a href="/empresa" className="text-mint-dark hover:underline">
          ¿Eres empresa? Liquida y administra tu nómina
        </a>
      </footer>
    </div>
  );
}
