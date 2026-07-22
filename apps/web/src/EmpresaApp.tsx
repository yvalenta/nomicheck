import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import PilaEmpresa from "./components/empresa/PilaEmpresa.tsx";
import CumplimientoEmpresa from "./components/empresa/CumplimientoEmpresa.tsx";
import SedesEmpresa from "./components/empresa/SedesEmpresa.tsx";
import AuditoriaEmpresa from "./components/empresa/AuditoriaEmpresa.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";
import { obtenerMiRol } from "./api.ts";
import { irAPortalSegunRol } from "./lib/irAPortal.ts";

type Seccion = "colaboradores" | "contratistas" | "periodos" | "discrepancias" | "costos" | "pila" | "cumplimiento" | "sedes" | "auditoria";

const OPCIONES: { valor: Seccion; etiqueta: string }[] = [
  { valor: "colaboradores", etiqueta: "Colaboradores" },
  { valor: "contratistas", etiqueta: "Contratistas" },
  { valor: "periodos", etiqueta: "Periodos" },
  { valor: "discrepancias", etiqueta: "Discrepancias" },
  { valor: "costos", etiqueta: "Costos" },
  { valor: "pila", etiqueta: "PILA" },
  { valor: "cumplimiento", etiqueta: "Cumplimiento" },
  { valor: "sedes", etiqueta: "Sedes" },
  { valor: "auditoria", etiqueta: "Auditoría" },
];

export default function EmpresaApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  // undefined = sin verificar, true = es admin_empresa, false = rebotando a
  // su portal real (ver irAPortalSegunRol) — evita mostrar este dashboard a
  // una cuenta que entró aquí por error (ej. con Google) siendo otro rol.
  const [rolOk, setRolOk] = useState<boolean | undefined>(undefined);

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

  useEffect(() => {
    if (!session || recuperando) return;
    obtenerMiRol()
      .then(({ rol }) => {
        if (rol === "admin_empresa") setRolOk(true);
        else irAPortalSegunRol();
      })
      .catch(() => setRolOk(true)); // si falla la verificación, no bloquea el acceso normal
  }, [session, recuperando]);

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso={session ? "Panel de empresa" : "Acceso empresa"} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {session === undefined && <p className="text-sm text-muted text-center">Cargando…</p>}
        {recuperando && <ResetPasswordForm onListo={() => setRecuperando(false)} />}
        {!recuperando && session === null && <AuthEmpresa />}
        {!recuperando && session && rolOk === undefined && (
          <p className="text-sm text-muted text-center">Cargando…</p>
        )}
        {!recuperando && session && rolOk && <PanelConRutas />}
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

// SPA: la sección activa vive en la URL (SDD §15). SegmentedControl navega
// con react-router y NavLink resalta la activa automáticamente. Deep-link a
// una sección o incluso a /periodos/:id (via PeriodosEmpresa interno)
// funciona porque BrowserRouter usa /empresa como basename (ver main.tsx).
function PanelConRutas() {
  const location = useLocation();
  const navigate = useNavigate();
  const seccionActiva = (location.pathname.split("/")[1] || "colaboradores") as Seccion;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center">
        <SegmentedControl<Seccion>
          opciones={OPCIONES}
          activo={seccionActiva}
          onCambio={(v) => navigate(`/${v}`)}
        />
      </div>
      <Routes>
        <Route path="/" element={<Navigate to="/colaboradores" replace />} />
        <Route path="/colaboradores" element={<DashboardEmpresa />} />
        <Route path="/contratistas" element={<ContratistasEmpresa />} />
        <Route path="/periodos/*" element={<PeriodosEmpresa />} />
        <Route path="/discrepancias" element={<DiscrepanciasEmpresa />} />
        <Route path="/costos" element={<CostosEmpresa />} />
        <Route path="/pila" element={<PilaEmpresa />} />
        <Route path="/cumplimiento" element={<CumplimientoEmpresa />} />
        <Route path="/sedes" element={<SedesEmpresa />} />
        <Route path="/auditoria" element={<AuditoriaEmpresa />} />
      </Routes>
    </div>
  );
}
