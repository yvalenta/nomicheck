import { Fragment, useEffect, useState } from "react";
import { AlertCircle, Building2, Check, Flag, Mail, X } from "lucide-react";
import { formatCOP, type ResultadoNomina } from "@pv/reglas";
import {
  aceptarInvitacion,
  listarInvitaciones,
  listarMisEmpresas,
  listarMisRecibos,
  rechazarInvitacion,
  reportarDiscrepancia,
  type EmpresaHistorial,
  type Invitacion,
  type ReciboPropio,
  type TipoDiscrepancia,
} from "../../apiColaborador";
import PaycheckCard from "../PaycheckCard.tsx";
import ValidationRow from "../ValidationRow.tsx";
import ChatContador from "../ChatContador.tsx";

const TIPO_LABEL: Record<TipoDiscrepancia, string> = {
  pago_de_mas: "Me pagaron de más",
  pago_de_menos: "Me pagaron de menos",
  concepto_faltante: "Falta un concepto",
};

const ESTADO_EMPRESA: Record<EmpresaHistorial["estado"], { label: string; clase: string }> = {
  activa: { label: "Activa", clase: "bg-emerald-50 text-mint-dark" },
  pendiente: { label: "Invitación pendiente", clase: "bg-amber-50 text-amber-700" },
  retirada: { label: "Retirada", clase: "bg-slate-100 text-muted" },
};

// El chat contador (Fase 4) opera sobre la forma ResultadoNomina del motor —
// el recibo propio no la tiene exactamente (viene de Prisma/ReciboPago), así
// que se adapta aquí en vez de duplicar la lógica de contexto en el backend.
function comoResultadoNomina(r: ReciboPropio): ResultadoNomina {
  return {
    modo: "turnos",
    periodoDesde: r.periodo.fechaInicio,
    periodoHasta: r.periodo.fechaFin,
    salarioBasicoMensual: r.lineas.find((l) => l.base !== undefined)?.base ?? 0,
    lineas: r.lineas,
    totalDevengos: r.totalDevengado,
    totalDeducciones: r.totalDeducido,
    netoEsperado: r.neto,
    advertencias: [],
  };
}

export default function DashboardColaborador() {
  const [recibos, setRecibos] = useState<ReciboPropio[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState<number | null>(null);
  const [procesando, setProcesando] = useState<number | null>(null);

  function recargar() {
    listarMisRecibos()
      .then(setRecibos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
    listarInvitaciones().then(setInvitaciones).catch(() => {});
    listarMisEmpresas().then(setEmpresas).catch(() => {});
  }

  useEffect(recargar, []);

  async function responderInvitacion(empleadoId: number, aceptar: boolean) {
    setProcesando(empleadoId);
    setError(null);
    try {
      if (aceptar) await aceptarInvitacion(empleadoId);
      else await rechazarInvitacion(empleadoId);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la invitación");
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl bg-red-50 text-coral text-sm p-3">{error}</p>}

      {invitaciones.length > 0 && (
        <PaycheckCard titulo="Invitaciones">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5">
            {invitaciones.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Mail size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{inv.empresa.nombre}</p>
                  <p className="text-xs text-muted truncate">te invitó a unirte como colaborador</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => responderInvitacion(inv.id, true)}
                    disabled={procesando === inv.id}
                    className="flex items-center gap-1 rounded-lg bg-mint text-white text-xs font-semibold px-2.5 py-1.5 hover:bg-mint-dark transition-colors disabled:opacity-40"
                  >
                    <Check size={14} /> Aceptar
                  </button>
                  <button
                    onClick={() => responderInvitacion(inv.id, false)}
                    disabled={procesando === inv.id}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white text-muted text-xs font-medium px-2.5 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    <X size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </PaycheckCard>
      )}

      <h2 className="text-lg font-bold text-ink px-1">Tus recibos de pago</h2>
      {cargando && <p className="text-sm text-muted px-3 py-6 text-center">Cargando…</p>}
      {!cargando && recibos.length === 0 && (
        <p className="text-sm text-muted px-3 py-6 text-center">Aún no tienes recibos liquidados.</p>
      )}

      {recibos.map((r) => (
        <Fragment key={r.id}>
        <PaycheckCard titulo={`${r.periodo.fechaInicio} — ${r.periodo.fechaFin}`}>
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
        <ChatContador resultado={comoResultadoNomina(r)} />
        </Fragment>
      ))}

      {empresas.length > 0 && (
        <PaycheckCard titulo="Mis empresas">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            {empresas.map((e) => (
              <div key={e.empleadoId} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                <div className="w-8 h-8 rounded-lg bg-white text-muted flex items-center justify-center shrink-0">
                  <Building2 size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{e.empresa}</p>
                  <p className="text-xs text-muted">
                    Desde {e.fechaIngreso}
                    {e.fechaRetiro ? ` — hasta ${e.fechaRetiro}` : ""}
                  </p>
                </div>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${ESTADO_EMPRESA[e.estado].clase}`}>
                  {ESTADO_EMPRESA[e.estado].label}
                </span>
              </div>
            ))}
          </div>
        </PaycheckCard>
      )}
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
