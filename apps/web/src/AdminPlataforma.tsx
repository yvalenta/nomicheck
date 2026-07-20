import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import HeaderProfile from "./components/HeaderProfile.tsx";
import AuthAdmin from "./components/admin/AuthAdmin.tsx";
import DashboardAdmin from "./components/admin/DashboardAdmin.tsx";
import { obtenerMiRol } from "./api.ts";
import { irAPortalSegunRol } from "./lib/irAPortal.ts";

export default function AdminPlataforma() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [rolOk, setRolOk] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    obtenerMiRol()
      .then(({ rol }) => {
        if (rol === "admin_plataforma") setRolOk(true);
        else irAPortalSegunRol();
      })
      .catch(() => setRolOk(true));
  }, [session]);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Panel administrativo" : "Acceso admin"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {session === null && <AuthAdmin />}
        {session && rolOk === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {session && rolOk && <DashboardAdmin />}
      </main>
      <footer className="text-center text-xs text-muted py-4 px-6 flex flex-col gap-1.5">
        <span>NomiCheck — panel administrativo de reglas legales y festivos.</span>
        <span className="font-display text-[9px] font-medium uppercase tracking-[0.2em] text-base-content/25">© {new Date().getFullYear()} Ynt-labs</span>
      </footer>
    </div>
  );
}
