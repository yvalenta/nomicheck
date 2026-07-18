import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { guardarLiquidacion } from "../api";
import { supabase } from "../lib/supabase";
import {
  clearPendingAction,
  closeAuthModal,
  getPendingAction,
  setPendingAction,
  useAuthFlow,
} from "../stores/authFlow";

// Orquestador del flujo de delayed auth. Se monta UNA vez a nivel App (siempre
// vivo, incluso en pasos donde Resultado no está montado) para poder reanudar
// la acción pendiente tras un login in-page O tras el reload de un redirect
// OAuth. Renderiza el AuthModal y el toast de resultado.
import AuthModal from "./AuthModal.tsx";

type Toast = { tipo: "ok" | "error"; texto: string } | null;

export default function AuthFlowManager() {
  const { isAuthModalOpen } = useAuthFlow();
  const [toast, setToast] = useState<Toast>(null);
  // Evita dobles disparos: onAuthStateChange y el chequeo al montar pueden
  // coincidir. Consumimos el pendingAction de forma idempotente.
  const enProgreso = useRef(false);

  async function reanudarPendiente() {
    const action = getPendingAction();
    if (!action || action.tipo !== "guardar_liquidacion" || enProgreso.current) return;

    enProgreso.current = true;
    // Lo quitamos de inmediato para que un segundo evento no lo re-dispare.
    clearPendingAction();
    try {
      await guardarLiquidacion({ resultado: action.resultado, netoRecibido: action.netoRecibido });
      closeAuthModal();
      setToast({ tipo: "ok", texto: "¡Cuenta lista y liquidación guardada en tu historial!" });
    } catch (e) {
      // Falló el guardado (p. ej. red o endpoint aún no disponible): re-encolamos
      // para no perder el trabajo del usuario y avisamos.
      setPendingAction(action);
      setToast({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar la liquidación" });
    } finally {
      enProgreso.current = false;
    }
  }

  useEffect(() => {
    // 1) Reanuda si al montar ya hay sesión + acción pendiente (retorno de OAuth).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) reanudarPendiente();
    });
    // 2) Reanuda cuando el usuario se autentica (login/signup dentro del modal).
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session) reanudarPendiente();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <>
      <AuthModal
        open={isAuthModalOpen}
        onClose={closeAuthModal}
        onAuthSuccess={reanudarPendiente}
      />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md">
          <div
            className={`rounded-2xl shadow-lg p-3.5 flex items-center gap-2.5 text-sm ${
              toast.tipo === "ok" ? "bg-mint-dark text-white" : "bg-coral text-white"
            }`}
          >
            {toast.tipo === "ok" ? (
              <CheckCircle2 size={18} className="shrink-0" />
            ) : (
              <XCircle size={18} className="shrink-0" />
            )}
            <span>{toast.texto}</span>
          </div>
        </div>
      )}
    </>
  );
}
