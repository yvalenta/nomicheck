import { Suspense, useEffect, useState } from "react";
import { lazyConReintento as lazy } from "./lib/lazyConReintento.ts";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import HeaderProfile from "./components/HeaderProfile.tsx";
import SidebarEmpresa, { type Seccion } from "./components/empresa/SidebarEmpresa.tsx";
import AuthEmpresa from "./components/empresa/AuthEmpresa.tsx";
import Skeleton from "./components/Skeleton.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";
import { obtenerMiRol } from "./api.ts";
import { irAPortalSegunRol } from "./lib/irAPortal.ts";

// Una sección = un chunk (rendimiento SPA). Nadie usa las 10 pestañas en una
// sesión, y varias arrastran librerías pesadas: Resumen trae recharts (~347 KB)
// y las que filtran por fecha traen react-day-picker + date-fns. Con lazy() esas
// dependencias bajan cuando el usuario abre esa pestaña, no al entrar al panel.
const ResumenEmpresa = lazy(() => import("./components/empresa/ResumenEmpresa.tsx"));
const DashboardEmpresa = lazy(() => import("./components/empresa/DashboardEmpresa.tsx"));
const PeriodosEmpresa = lazy(() => import("./components/empresa/PeriodosEmpresa.tsx"));
const ContratistasEmpresa = lazy(() => import("./components/empresa/ContratistasEmpresa.tsx"));
const DiscrepanciasEmpresa = lazy(() => import("./components/empresa/DiscrepanciasEmpresa.tsx"));
const CostosEmpresa = lazy(() => import("./components/empresa/CostosEmpresa.tsx"));
const PilaEmpresa = lazy(() => import("./components/empresa/PilaEmpresa.tsx"));
const CumplimientoEmpresa = lazy(() => import("./components/empresa/CumplimientoEmpresa.tsx"));
const SedesEmpresa = lazy(() => import("./components/empresa/SedesEmpresa.tsx"));
const AuditoriaEmpresa = lazy(() => import("./components/empresa/AuditoriaEmpresa.tsx"));
const CuentaEmpresa = lazy(() => import("./components/empresa/CuentaEmpresa.tsx"));


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
      {/* El panel con sidebar necesita más ancho que las pantallas de acceso;
          login y recuperación siguen centrados y angostos. */}
      <main
        className={`flex-1 w-full mx-auto px-4 py-6 ${
          !recuperando && session && rolOk ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
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

// SPA: la sección activa vive en la URL (SDD §15). El sidebar navega
// con react-router y NavLink resalta la activa automáticamente. Deep-link a
// una sección o incluso a /periodos/:id (via PeriodosEmpresa interno)
// funciona porque BrowserRouter usa /empresa como basename (ver main.tsx).
// Precarga del chunk de cada sección. Se dispara al pasar el mouse por la
// pestaña: para cuando el usuario hace clic, el JS ya está descargado. Los
// import() son los mismos que usa lazy(), así que el bundler reutiliza el
// módulo — precargar no duplica descarga.
const PRECARGA: Record<Seccion, () => Promise<unknown>> = {
  resumen: () => import("./components/empresa/ResumenEmpresa.tsx"),
  colaboradores: () => import("./components/empresa/DashboardEmpresa.tsx"),
  contratistas: () => import("./components/empresa/ContratistasEmpresa.tsx"),
  periodos: () => import("./components/empresa/PeriodosEmpresa.tsx"),
  discrepancias: () => import("./components/empresa/DiscrepanciasEmpresa.tsx"),
  costos: () => import("./components/empresa/CostosEmpresa.tsx"),
  pila: () => import("./components/empresa/PilaEmpresa.tsx"),
  cumplimiento: () => import("./components/empresa/CumplimientoEmpresa.tsx"),
  sedes: () => import("./components/empresa/SedesEmpresa.tsx"),
  auditoria: () => import("./components/empresa/AuditoriaEmpresa.tsx"),
  cuenta: () => import("./components/empresa/CuentaEmpresa.tsx"),
};

function PanelConRutas() {
  const location = useLocation();
  const navigate = useNavigate();
  const seccionActiva = (location.pathname.split("/")[1] || "resumen") as Seccion;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 lg:items-start">
      <SidebarEmpresa
        activo={seccionActiva}
        onCambio={(v) => navigate(`/${v}`)}
        onPreparar={(v) => void PRECARGA[v]?.()}
      />
      <div className="min-w-0 flex-1">
        <Suspense fallback={<Skeleton />}>
      <Routes>
        <Route path="/" element={<Navigate to="/resumen" replace />} />
        <Route path="/resumen" element={<ResumenEmpresa />} />
        <Route path="/colaboradores" element={<DashboardEmpresa />} />
        <Route path="/contratistas" element={<ContratistasEmpresa />} />
        <Route path="/periodos/*" element={<PeriodosEmpresa />} />
        <Route path="/discrepancias" element={<DiscrepanciasEmpresa />} />
        <Route path="/costos" element={<CostosEmpresa />} />
        <Route path="/pila" element={<PilaEmpresa />} />
        <Route path="/cumplimiento" element={<CumplimientoEmpresa />} />
        <Route path="/sedes" element={<SedesEmpresa />} />
        <Route path="/auditoria" element={<AuditoriaEmpresa />} />
        <Route path="/cuenta" element={<CuentaEmpresa />} />
      </Routes>
        </Suspense>
      </div>
    </div>
  );
}
