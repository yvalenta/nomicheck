import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import HeaderProfile from "./components/HeaderProfile.tsx";
import SegmentedControl from "./components/SegmentedControl.tsx";
import AuthEmpresa from "./components/empresa/AuthEmpresa.tsx";
import DashboardEmpresa from "./components/empresa/DashboardEmpresa.tsx";
import PeriodosEmpresa from "./components/empresa/PeriodosEmpresa.tsx";
import ContratistasEmpresa from "./components/empresa/ContratistasEmpresa.tsx";
import DiscrepanciasEmpresa from "./components/empresa/DiscrepanciasEmpresa.tsx";

type Seccion = "colaboradores" | "contratistas" | "periodos" | "discrepancias";

export default function EmpresaApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [seccion, setSeccion] = useState<Seccion>("colaboradores");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Panel de empresa" : "Acceso empresa"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {session === null && <AuthEmpresa />}
        {session && (
          <div className="flex flex-col gap-5">
            <div className="flex justify-center">
              <SegmentedControl<Seccion>
                opciones={[
                  { valor: "colaboradores", etiqueta: "Colaboradores" },
                  { valor: "contratistas", etiqueta: "Contratistas" },
                  { valor: "periodos", etiqueta: "Periodos" },
                  { valor: "discrepancias", etiqueta: "Discrepancias" },
                ]}
                activo={seccion}
                onCambio={setSeccion}
              />
            </div>
            {seccion === "colaboradores" && <DashboardEmpresa />}
            {seccion === "contratistas" && <ContratistasEmpresa />}
            {seccion === "periodos" && <PeriodosEmpresa />}
            {seccion === "discrepancias" && <DiscrepanciasEmpresa />}
          </div>
        )}
      </main>
      <footer className="text-center text-xs text-muted py-4 px-6">
        NomiCheck — estimado informativo, no reemplaza la liquidación oficial ni asesoría legal
        certificada.
      </footer>
    </div>
  );
}
