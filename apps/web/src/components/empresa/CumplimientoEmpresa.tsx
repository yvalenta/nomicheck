import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, GraduationCap, ShieldAlert } from "lucide-react";
import { obtenerCumplimiento, type SemaforoCumplimiento } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

const NIVEL: Record<SemaforoCumplimiento["nivel"], { label: string; clases: string; Icono: typeof CheckCircle2 }> = {
  verde: { label: "Sin alertas", clases: "bg-emerald-50 text-mint-dark border-emerald-100", Icono: CheckCircle2 },
  amarillo: { label: "Revisar", clases: "bg-amber-50 text-amber-700 border-amber-100", Icono: AlertTriangle },
  rojo: { label: "Atención", clases: "bg-red-50 text-coral border-red-100", Icono: ShieldAlert },
};

// Semáforo de cumplimiento (SDD §14): NO recalcula nada nuevo — reusa las
// mismas advertencias que ya generan las calculadoras del motor, solo las
// agrega en un panel para tener una foto de "cómo va la empresa" sin tener
// que abrir empleado por empleado o periodo por periodo.
export default function CumplimientoEmpresa() {
  const [datos, setDatos] = useState<SemaforoCumplimiento | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerCumplimiento()
      .then(setDatos)
      .catch((e) => setError(e.message));
  }, []);

  const nivel = datos ? NIVEL[datos.nivel] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-ink">Semáforo de cumplimiento</h2>
        <p className="text-sm text-muted mt-0.5">
          Alertas automáticas sobre tus colaboradores activos y tus últimos periodos liquidados.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {!datos && !error && <p className="text-sm text-muted text-center py-6">Revisando…</p>}

      {datos && nivel && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${nivel.clases}`}>
          <nivel.Icono size={22} className="shrink-0" />
          <div>
            <p className="text-sm font-bold">{nivel.label}</p>
            <p className="text-xs opacity-80">
              {datos.aprendicesMalClasificados.length + datos.salariosBajoMinimo.length + datos.horasExtraExcedidas.length}{" "}
              alerta(s) encontradas
            </p>
          </div>
        </div>
      )}

      {datos && (
        <>
          <Seccion
            titulo="Posibles aprendices mal clasificados"
            Icono={GraduationCap}
            alertas={datos.aprendicesMalClasificados}
            vacio="Ningún colaborador activo tiene un salario en el rango del auxilio de sostenimiento de aprendiz."
          />
          <Seccion
            titulo="Salarios bajo el mínimo"
            Icono={AlertTriangle}
            alertas={datos.salariosBajoMinimo}
            vacio="Ningún colaborador activo de tiempo completo está por debajo del SMLMV."
          />
          <Seccion
            titulo="Horas extra excedidas (últimos periodos)"
            Icono={Clock}
            alertas={datos.horasExtraExcedidas.map((a) => ({
              ...a,
              mensaje: `${a.fechaInicio.slice(0, 10)} — ${a.fechaFin.slice(0, 10)}: ${a.mensaje}`,
            }))}
            vacio="Sin excesos de horas extra en los últimos periodos liquidados."
          />
        </>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  Icono,
  alertas,
  vacio,
}: {
  titulo: string;
  Icono: typeof GraduationCap;
  alertas: { empleadoId: number; nombre: string; mensaje: string }[];
  vacio: string;
}) {
  return (
    <PaycheckCard titulo={titulo}>
      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
        {alertas.length === 0 && <p className="text-sm text-muted py-2">{vacio}</p>}
        {alertas.map((a, i) => (
          <div key={`${a.empleadoId}-${i}`} className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3">
            <Icono size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ink">{a.nombre}</p>
              <p className="text-xs text-amber-800 mt-0.5">{a.mensaje}</p>
            </div>
          </div>
        ))}
      </div>
    </PaycheckCard>
  );
}
