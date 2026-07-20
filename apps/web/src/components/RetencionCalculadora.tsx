import { useState } from "react";
import { ArrowLeft, HeartPulse, Landmark, Users } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import { calcularRetencion, type ResultadoRetencion } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  onAtras: () => void;
}

export default function RetencionCalculadora({ onAtras }: Props) {
  const [ingresoLaboralMensual, setIngresoLaboralMensual] = useState("");
  const [declaraRenta, setDeclaraRenta] = useState(false);
  const [aportesVoluntariosAfc, setAportesVoluntariosAfc] = useState("");
  const [aportesVoluntariosPensionObligatoria, setAportesVoluntariosPensionObligatoria] = useState("");
  const [tieneDependientes, setTieneDependientes] = useState(false);
  const [medicinaPrepagadaMensual, setMedicinaPrepagadaMensual] = useState("");
  const [resultado, setResultado] = useState<ResultadoRetencion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  const listo = Number(ingresoLaboralMensual) > 0;

  async function calcular(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCalculando(true);
    setError(null);
    setResultado(null);
    try {
      setResultado(
        await calcularRetencion({
          ingresoLaboralMensual: Number(ingresoLaboralMensual),
          declaraRenta,
          aportesVoluntariosAfc: aportesVoluntariosAfc ? Number(aportesVoluntariosAfc) : undefined,
          aportesVoluntariosPensionObligatoria: aportesVoluntariosPensionObligatoria
            ? Number(aportesVoluntariosPensionObligatoria)
            : undefined,
          tieneDependientes,
          medicinaPrepagadaMensual: medicinaPrepagadaMensual ? Number(medicinaPrepagadaMensual) : undefined,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink flex items-center justify-center gap-2">
          <Landmark size={20} className="text-mint-dark" /> Retención en la fuente
        </h2>
        <p className="text-sm text-muted mt-1">
          Un estimado aproximado del sistema de depuración — no reemplaza a tu contador.
        </p>
      </div>

      <form onSubmit={calcular} className="flex flex-col gap-4">
        <PaycheckCard titulo="Tus datos">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span>Ingreso laboral mensual (sin auxilio de transporte)</span>
              <input
                required
                type="number"
                min={1}
                inputMode="numeric"
                value={ingresoLaboralMensual}
                onChange={(e) => setIngresoLaboralMensual(e.target.value)}
                className={inputCls}
                placeholder="Ej: 8.000.000"
              />
            </label>

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={declaraRenta}
                onChange={(e) => setDeclaraRenta(e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              ¿Declaras renta?
            </label>
            <p className="text-xs text-muted -mt-2.5">
              Marca esta casilla si tú decides que sí; el sistema no valida el umbral de ingresos o
              patrimonio del año — confirma con tu contador si no estás seguro.
            </p>

            {declaraRenta && (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  <span>Aporte voluntario mensual a AFC (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={aportesVoluntariosAfc}
                    onChange={(e) => setAportesVoluntariosAfc(e.target.value)}
                    className={inputCls}
                    placeholder="Ej: 500.000"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  <span>Aporte voluntario mensual a pensión obligatoria (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={aportesVoluntariosPensionObligatoria}
                    onChange={(e) => setAportesVoluntariosPensionObligatoria(e.target.value)}
                    className={inputCls}
                    placeholder="Ej: 500.000"
                  />
                </label>
                <p className="text-xs text-muted -mt-2.5">
                  AFC y pensión voluntaria comparten el mismo tope (E.T. art. 126-1) — se suman antes de
                  aplicarlo, no cada uno por separado.
                </p>
              </>
            )}

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={tieneDependientes}
                onChange={(e) => setTieneDependientes(e.target.checked)}
                className="w-4 h-4 accent-mint"
              />
              <Users size={16} className="text-muted" /> Tengo al menos un dependiente a cargo
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              <span className="flex items-center gap-2">
                <HeartPulse size={16} className="text-muted" /> Medicina prepagada / seguro de salud mensual
                (opcional)
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={medicinaPrepagadaMensual}
                onChange={(e) => setMedicinaPrepagadaMensual(e.target.value)}
                className={inputCls}
                placeholder="Ej: 300.000"
              />
            </label>
          </div>
        </PaycheckCard>

        <button
          type="submit"
          disabled={!listo || calculando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3.5 hover:bg-mint-dark transition-colors duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculando ? "Calculando…" : "Calcular retención"}
        </button>
      </form>

      {error && <p className="rounded-2xl bg-red-50 text-coral text-sm p-3.5">{error}</p>}

      {resultado && (
        <PaycheckCard titulo="Resultado aproximado">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted">Aportes obligatorios salud/pensión</span>
              <span className="text-sm font-medium text-ink tabular-nums">
                {formatCOP(resultado.ingresoNoConstitutivo)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted">Renta exenta laboral (25%)</span>
              <span className="text-sm font-medium text-ink tabular-nums">
                {formatCOP(resultado.rentaExentaLaboral)}
              </span>
            </div>
            {resultado.rentaExentaAfcYPension > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted">Renta exenta AFC/pensión voluntaria</span>
                <span className="text-sm font-medium text-ink tabular-nums">
                  {formatCOP(resultado.rentaExentaAfcYPension)}
                </span>
              </div>
            )}
            {resultado.deduccionDependientes > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted">Deducción por dependientes</span>
                <span className="text-sm font-medium text-ink tabular-nums">
                  {formatCOP(resultado.deduccionDependientes)}
                </span>
              </div>
            )}
            {resultado.deduccionMedicinaPrepagada > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted">Deducción por medicina prepagada/seguro de salud</span>
                <span className="text-sm font-medium text-ink tabular-nums">
                  {formatCOP(resultado.deduccionMedicinaPrepagada)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted">Base gravable</span>
              <span className="text-sm font-medium text-ink tabular-nums">
                {formatCOP(resultado.baseGravable)} ({resultado.baseGravableUvt.toFixed(1)} UVT)
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold text-ink">Retención mensual estimada</span>
              <span className="text-lg font-bold text-ink tabular-nums">
                {formatCOP(resultado.retencionMensual)}
              </span>
            </div>
            {resultado.advertencias.map((a) => (
              <p key={a} className="rounded-xl bg-amber-50 text-amber-800 text-xs p-2.5">
                {a}
              </p>
            ))}
            <p className="text-xs text-muted mt-1">{resultado.explicacion}</p>
            <p className="text-xs text-muted">{resultado.ley}</p>
          </div>
        </PaycheckCard>
      )}

      <button
        onClick={onAtras}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <ArrowLeft size={15} /> Volver
      </button>
    </div>
  );
}
