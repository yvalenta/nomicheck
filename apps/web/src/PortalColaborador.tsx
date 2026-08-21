import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import BotonCerrarSesion from "./components/BotonCerrarSesion.tsx";
import HeaderProfile from "./components/HeaderProfile.tsx";
import AuthColaborador from "./components/colaborador/AuthColaborador.tsx";
import DashboardColaborador from "./components/colaborador/DashboardColaborador.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";
import { obtenerMiRol } from "./api.ts";
import { irAPortalSegunRol } from "./lib/irAPortal.ts";

export default function PortalColaborador() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const [rolOk, setRolOk] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || recuperando) return;
    // Cada sesión nueva re-verifica desde cero (mismo arreglo que EmpresaApp).
    setRolOk(undefined);
    obtenerMiRol()
      .then(({ rol }) => {
        if (rol === "colaborador") setRolOk(true);
        else irAPortalSegunRol();
      })
      .catch(() => setRolOk(true));
  }, [session, recuperando]);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile
        paso={session ? "Portal del colaborador" : "Acceso colaborador"}
        accion={!recuperando && session && rolOk ? <BotonCerrarSesion /> : undefined}
      />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {recuperando && <ResetPasswordForm onListo={() => setRecuperando(false)} />}
        {!recuperando && session === null && <AuthColaborador />}
        {!recuperando && session && rolOk === undefined && (
          <p className="text-sm text-muted text-center">Cargando…</p>
        )}
        {!recuperando && session && rolOk && <DashboardColaborador />}
      </main>
      <footer className="text-center text-xs text-muted py-4 px-6 flex flex-col gap-1.5">
        <span>
          NomiCheck — estimado informativo, no reemplaza la liquidación oficial ni asesoría legal
          certificada.
        </span>
        <span className="font-display text-[9px] font-medium uppercase tracking-[0.2em] text-base-content/25">© {new Date().getFullYear()} Ynt-labs</span>
      </footer>
    </div>
  );
}
