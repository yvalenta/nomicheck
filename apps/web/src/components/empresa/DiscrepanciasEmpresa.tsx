import { useEffect, useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import {
  listarDiscrepancias,
  responderDiscrepancia,
  type DiscrepanciaEmpresa,
} from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

const TIPO_LABEL: Record<DiscrepanciaEmpresa["tipo"], string> = {
  pago_de_mas: "Pago de más",
  pago_de_menos: "Pago de menos",
  concepto_faltante: "Concepto faltante",
};

const ESTADO_CLASE: Record<DiscrepanciaEmpresa["estado"], string> = {
  abierto: "bg-red-50 text-coral",
  en_revision: "bg-amber-50 text-amber-600",
  resuelto: "bg-emerald-50 text-mint-dark",
};

export default function DiscrepanciasEmpresa() {
  const [reportes, setReportes] = useState<DiscrepanciaEmpresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function recargar() {
    listarDiscrepancias()
      .then(setReportes)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(recargar, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink px-1">Discrepancias reportadas</h2>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Cargando…</p>}
      {!cargando && reportes.length === 0 && (
        <p className="text-sm text-muted px-3 py-6 text-center">No hay discrepancias reportadas.</p>
      )}

      {reportes.map((r) => (
        <PaycheckCard key={r.id} titulo={r.recibo.empleado?.nombre ?? r.recibo.contratista?.nombre ?? "—"}>
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <Flag size={14} className="text-coral" /> {TIPO_LABEL[r.tipo]}
              </span>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${ESTADO_CLASE[r.estado]}`}>
                {r.estado}
              </span>
            </div>
            <p className="text-sm text-ink">{r.detalle}</p>
            {r.respuestaEmpresa && (
              <p className="text-xs text-muted rounded-lg bg-slate-50 p-2">Tu respuesta: {r.respuestaEmpresa}</p>
            )}
            {r.estado !== "resuelto" && (
              <FormRespuesta
                onEnviado={() => recargar()}
                onResponder={(respuestaEmpresa) =>
                  responderDiscrepancia(r.id, { estado: "resuelto", respuestaEmpresa })
                }
              />
            )}
          </div>
        </PaycheckCard>
      ))}
    </div>
  );
}

function FormRespuesta({
  onResponder,
  onEnviado,
}: {
  onResponder: (respuesta: string) => Promise<unknown>;
  onEnviado: () => void;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await onResponder(respuesta);
      onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo responder");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <textarea
        required
        placeholder="Explica cómo se resolvió"
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        rows={2}
      />
      {error && <p className="text-xs text-coral">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-mint text-white text-sm py-1.5 disabled:opacity-40"
      >
        <CheckCircle2 size={14} /> {enviando ? "Enviando…" : "Marcar resuelta"}
      </button>
    </form>
  );
}
