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
import CostosEmpresa from "./components/empresa/CostosEmpresa.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";

type Seccion = "colaboradores" | "contratistas" | "periodos" | "discrepancias" | "costos";

export default function EmpresaApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [seccion, setSeccion] = useState<Seccion>("colaboradores");
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // El enlace de "olvidé mi contraseña" ya trae una sesión válida — hay
      // que interceptarla para pedir la contraseña nueva en vez de mostrar
      // el dashboard directo.
      if (event === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Panel de empresa" : "Acceso empresa"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {recuperando && <ResetPasswordForm onListo={() => setRecuperando(false)} />}
        {!recuperando && session === null && <AuthEmpresa />}
        {!recuperando && session && (
          <div className="flex flex-col gap-5">
            <div className="flex justify-center">
              <SegmentedControl<Seccion>
                opciones={[
                  { valor: "colaboradores", etiqueta: "Colaboradores" },
                  { valor: "contratistas", etiqueta: "Contratistas" },
                  { valor: "periodos", etiqueta: "Periodos" },
                  { valor: "discrepancias", etiqueta: "Discrepancias" },
                  { valor: "costos", etiqueta: "Costos" },
                ]}
                activo={seccion}
                onCambio={setSeccion}
              />
            </div>
            {seccion === "colaboradores" && <DashboardEmpresa />}
            {seccion === "contratistas" && <ContratistasEmpresa />}
            {seccion === "periodos" && <PeriodosEmpresa />}
            {seccion === "discrepancias" && <DiscrepanciasEmpresa />}
            {seccion === "costos" && <CostosEmpresa />}
          </div>
        )}
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
