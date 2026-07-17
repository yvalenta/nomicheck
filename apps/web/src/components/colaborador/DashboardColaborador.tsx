import { useEffect, useState } from "react";
import { AlertCircle, Flag } from "lucide-react";
import { formatCOP } from "@pv/reglas";
import {
  listarMisRecibos,
  reportarDiscrepancia,
  type ReciboPropio,
  type TipoDiscrepancia,
} from "../../apiColaborador";
import PaycheckCard from "../PaycheckCard.tsx";
import ValidationRow from "../ValidationRow.tsx";

const TIPO_LABEL: Record<TipoDiscrepancia, string> = {
  pago_de_mas: "Me pagaron de más",
  pago_de_menos: "Me pagaron de menos",
  concepto_faltante: "Falta un concepto",
};

export default function DashboardColaborador() {
  const [recibos, setRecibos] = useState<ReciboPropio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState<number | null>(null);

  function recargar() {
    listarMisRecibos()
      .then(setRecibos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }

  useEffect(recargar, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink px-1">Tus recibos de pago</h2>
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}
      {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Cargando…</p>}
      {!cargando && recibos.length === 0 && (
        <p className="text-sm text-muted px-3 py-6 text-center">Aún no tienes recibos liquidados.</p>
      )}

      {recibos.map((r) => (
        <PaycheckCard key={r.id} titulo={`${r.periodo.fechaInicio} — ${r.periodo.fechaFin}`}>
          <div className="flex flex-col">
            {r.lineas.map((l, i) => (
              <ValidationRow key={i} linea={l} />
            ))}
          </div>
          <div className="border-t border-slate-100 mx-3 py-2.5 px-3 flex justify-between text-sm font-semibold text-ink">
            <span>Neto</span>
            <span className="tabular-nums">{formatCOP(r.neto)}</span>
          </div>

          {r.reportes.length > 0 && (
            <div className="mx-3 mb-3 flex flex-col gap-2">
              {r.reportes.map((rep) => (
                <div key={rep.id} className="rounded-xl bg-slate-50 p-3 text-xs text-muted">
                  <p className="font-medium text-ink">{TIPO_LABEL[rep.tipo]}: {rep.detalle}</p>
                  <p className="mt-1">
                    Estado: <span className="font-medium">{rep.estado}</span>
                    {rep.respuestaEmpresa && ` — ${rep.respuestaEmpresa}`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {reportando === r.id ? (
            <FormReporte
              onCancelar={() => setReportando(null)}
              onEnviado={() => {
                setReportando(null);
                recargar();
              }}
              reciboId={r.id}
            />
          ) : (
            <button
              onClick={() => setReportando(r.id)}
              className="flex items-center gap-1.5 text-xs text-coral hover:underline mx-3 mb-3"
            >
              <Flag size={14} /> Reportar discrepancia
            </button>
          )}
        </PaycheckCard>
      ))}
    </div>
  );
}

function FormReporte({
  reciboId,
  onCancelar,
  onEnviado,
}: {
  reciboId: number;
  onCancelar: () => void;
  onEnviado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDiscrepancia>("pago_de_menos");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await reportarDiscrepancia(reciboId, { tipo, detalle });
      onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reportar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mx-3 mb-3 flex flex-col gap-2 rounded-xl bg-red-50 p-3">
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoDiscrepancia)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
      >
        {(Object.keys(TIPO_LABEL) as TipoDiscrepancia[]).map((t) => (
          <option key={t} value={t}>
            {TIPO_LABEL[t]}
          </option>
        ))}
      </select>
      <textarea
        required
        placeholder="Cuéntanos qué encontraste distinto"
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        rows={2}
      />
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-coral">
          <AlertCircle size={14} /> {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 rounded-lg border border-slate-200 bg-white text-ink text-sm py-1.5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 rounded-lg bg-coral text-white text-sm py-1.5 disabled:opacity-40"
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
