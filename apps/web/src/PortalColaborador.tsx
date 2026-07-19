import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import HeaderProfile from "./components/HeaderProfile.tsx";
import AuthColaborador from "./components/colaborador/AuthColaborador.tsx";
import DashboardColaborador from "./components/colaborador/DashboardColaborador.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";

export default function PortalColaborador() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Portal del colaborador" : "Acceso colaborador"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {recuperando && <ResetPasswordForm onListo={() => setRecuperando(false)} />}
        {!recuperando && session === null && <AuthColaborador />}
        {!recuperando && session && <DashboardColaborador />}
      </main>
      <footer className="text-center text-xs text-muted py-4 px-6 flex flex-col gap-1.5">
        <span>
          NomiCheck — estimado informativo, no reemplaza la liquidación oficial ni asesoría legal
          certificada.
        </span>
        <span className="mt-2 font-medium text-slate-400">© {new Date().getFullYear()} Ynt-labs</span>
      </footer>
    </div>
  );
}
