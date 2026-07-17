import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import HeaderProfile from "./components/HeaderProfile.tsx";
import AuthColaborador from "./components/colaborador/AuthColaborador.tsx";
import DashboardColaborador from "./components/colaborador/DashboardColaborador.tsx";

export default function PortalColaborador() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Portal del colaborador" : "Acceso colaborador"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {session === null && <AuthColaborador />}
        {session && <DashboardColaborador />}
      </main>
      <footer className="text-center text-xs text-muted py-4 px-6">
        NomiCheck — estimado informativo, no reemplaza la liquidación oficial ni asesoría legal
        certificada.
      </footer>
    </div>
  );
}
