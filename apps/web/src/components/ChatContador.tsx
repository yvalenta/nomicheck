import { useState } from "react";
import { AlertTriangle, MessageCircleQuestion, Send } from "lucide-react";
import type { ResultadoNomina } from "@pv/reglas";
import { explicarChat, type MensajeChat } from "../api.ts";
import PaycheckCard from "./PaycheckCard.tsx";

interface Props {
  resultado: ResultadoNomina;
}

// Fase 4 (SDD §03 Módulo E, spec "chat-contador"): explica el resultado ya
// calculado — nunca lo recalcula ni lo contradice. Disclaimer siempre
// visible, tal como pide la spec.
export default function ChatContador({ resultado }: Props) {
  const [historial, setHistorial] = useState<MensajeChat[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = pregunta.trim();
    if (!texto || enviando) return;

    const historialPrevio = historial;
    setHistorial((h) => [...h, { rol: "usuario", texto }]);
    setPregunta("");
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await explicarChat(resultado, texto, historialPrevio);
      setHistorial((h) => [...h, { rol: "asistente", texto: respuesta }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la respuesta");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaycheckCard titulo="Pregúntale al chat contador">
      <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
        <p className="flex items-start gap-2 text-xs text-muted">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Asistente informativo sobre este resultado — no recalcula cifras ni reemplaza asesoría
          legal certificada.
        </p>

        {historial.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted py-2">
            <MessageCircleQuestion size={16} className="shrink-0" />
            Pregunta lo que quieras sobre tu resultado — ej. "¿por qué el recargo dominical es de
            90%?"
          </p>
        )}

        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {historial.map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-xl px-3 py-2 max-w-[85%] ${
                m.rol === "usuario"
                  ? "bg-mint/10 text-ink self-end ml-auto"
                  : "bg-slate-50 text-ink self-start"
              }`}
            >
              {m.texto}
            </div>
          ))}
          {enviando && <div className="text-sm text-muted px-3 py-2">Pensando…</div>}
        </div>

        {error && <p className="text-xs text-coral">{error}</p>}

        <form onSubmit={enviar} className="flex items-center gap-2">
          <input
            type="text"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="Escribe tu pregunta…"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200"
          />
          <button
            type="submit"
            disabled={enviando || !pregunta.trim()}
            className="rounded-xl bg-mint text-white p-2.5 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </PaycheckCard>
  );
}
