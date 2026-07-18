import { useState } from "react";
import type { ResultadoNomina } from "@pv/reglas";
import { supabase } from "../lib/supabase";
import { guardarLiquidacion } from "../api";
import { openAuthModal, setPendingAction } from "../stores/authFlow";

// Manejador del botón "Guardar liquidación" con delayed auth:
//  - Con sesión activa → guarda directo.
//  - Sin sesión → guarda el payload en pendingAction (localStorage) y abre el
//    AuthModal. El guardado real lo dispara el interceptor de AuthFlowManager
//    apenas la sesión exista (login, signup o retorno de un redirect OAuth).
export function useGuardarLiquidacion() {
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar(resultado: ResultadoNomina, netoRecibido?: number) {
    setMensaje(null);
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      // No autenticado: interceptamos. Persistimos lo que está viendo y pedimos login.
      setPendingAction({
        tipo: "guardar_liquidacion",
        resultado,
        netoRecibido,
        capturadoEn: new Date().toISOString(),
      });
      openAuthModal();
      return;
    }

    // Ya autenticado: guardado directo.
    setGuardando(true);
    try {
      await guardarLiquidacion({ resultado, netoRecibido });
      setMensaje("Liquidación guardada en tu historial.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la liquidación");
    } finally {
      setGuardando(false);
    }
  }

  return { guardar, guardando, mensaje };
}
