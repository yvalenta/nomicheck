import { Suspense, useEffect, useState } from "react";
import { lazyConReintento as lazy } from "./lib/lazyConReintento.ts";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import BotonCerrarSesion from "./components/BotonCerrarSesion.tsx";
import HeaderProfile from "./components/HeaderProfile.tsx";
import SidebarEmpresa, { destinoDeSeccion, type Seccion } from "./components/empresa/SidebarEmpresa.tsx";
import AuthEmpresa from "./components/empresa/AuthEmpresa.tsx";
import SelectorEmpresa from "./components/empresa/SelectorEmpresa.tsx";
import Skeleton from "./components/Skeleton.tsx";
import ResetPasswordForm from "./components/ResetPasswordForm.tsx";
import { obtenerMiRol, type MiRol } from "./api.ts";
import { irAPortalSegunRol, portalDeRol } from "./lib/irAPortal.ts";
import { cambiarEmpresaYRecargar } from "./lib/cambiarEmpresa.ts";

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
const RolesEmpresa = lazy(() => import("./components/empresa/RolesEmpresa.tsx"));
const CuentaEmpresa = lazy(() => import("./components/empresa/CuentaEmpresa.tsx"));


export default function EmpresaApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  // undefined = sin verificar, true = es admin_empresa, false = rebotando a
  // su portal real (ver irAPortalSegunRol) — evita mostrar este dashboard a
  // una cuenta que entró aquí por error (ej. con Google) siendo otro rol.
  const [rolOk, setRolOk] = useState<boolean | undefined>(undefined);
  // La respuesta completa de whoami: el rol decide si se entra, y `empresas`
  // es lo que dibuja el selector del header. Se guarda entera para no pedir el
  // mismo endpoint dos veces en la misma carga.
  const [yo, setYo] = useState<MiRol | null>(null);
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);

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
    // Cada sesión nueva re-verifica desde cero: sin esto, un logout+login con
    // otra cuenta mostraba el panel un instante con el rolOk viejo.
    setRolOk(undefined);
    setYo(null);
    obtenerMiRol()
      .then((quien) => {
        setYo(quien);
        if (quien.rol === "admin_empresa") setRolOk(true);
        else irAPortalSegunRol();
      })
      .catch(() => setRolOk(true)); // si falla la verificación, no bloquea el acceso normal
  }, [session, recuperando]);

  // Cambio de empresa activa: el servidor decide (valida la membresía) y recién
  // entonces se recarga el portal. Si rechaza, el error se muestra en el propio
  // menú y la persona sigue donde estaba.
  function elegirEmpresa(empresaId: number) {
    if (cambiandoEmpresa) return; // dos clics encimados = dos POST y una carrera por cuál recarga
    setCambiandoEmpresa(true);
    setErrorCambio(null);
    cambiarEmpresaYRecargar(empresaId).catch((e) => {
      setErrorCambio(e instanceof Error ? e.message : "No se pudo cambiar de empresa");
      setCambiandoEmpresa(false);
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile
        paso={session ? "Panel de empresa" : "Acceso empresa"}
        accion={
          !recuperando && session && rolOk ? (
            <div className="flex items-center gap-3">
              <SelectorEmpresa
                empresas={yo?.empresas ?? []}
                activaId={yo?.empresaId ?? null}
                onElegir={elegirEmpresa}
                cambiando={cambiandoEmpresa}
                error={errorCambio}
                rolAdmitido={(rol) => portalDeRol(rol) === "/empresa"}
              />
              <BotonCerrarSesion />
            </div>
          ) : undefined
        }
      />
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
  roles: () => import("./components/empresa/RolesEmpresa.tsx"),
  cuenta: () => import("./components/empresa/CuentaEmpresa.tsx"),
};

function PanelConRutas() {
  const location = useLocation();
  const navigate = useNavigate();
  const seccionActiva = (location.pathname.split("/")[1] || "resumen") as Seccion;
  // Las pestañas del destino activo las pinta el shell, no cada página: así la
  // sección no repite título y el menú lateral se queda en cinco destinos.
  const destino = destinoDeSeccion(seccionActiva);

  return (
    <div className="flex flex-col gap-4 pb-20 lg:pb-0 lg:flex-row lg:gap-6 lg:items-start">
      <SidebarEmpresa
        activo={seccionActiva}
        onCambio={(v) => navigate(`/${v}`)}
        onPreparar={(v) => void PRECARGA[v]?.()}
      />
      <div className="min-w-0 flex-1">
        {destino.pestanas.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label={destino.etiqueta}>
            {destino.pestanas.map((p) => {
              const on = p.valor === seccionActiva;
              return (
                <button
                  key={p.valor}
                  role="tab"
                  aria-selected={on}
                  onClick={() => navigate(`/${p.valor}`)}
                  onMouseEnter={() => !on && void PRECARGA[p.valor]?.()}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${
                    on
                      ? "border-mint bg-mint text-white"
                      : "border-slate-200 bg-white text-muted hover:text-ink"
                  }`}
                >
                  {p.etiqueta}
                </button>
              );
            })}
          </div>
        )}
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
        <Route path="/roles" element={<RolesEmpresa />} />
        <Route path="/cuenta" element={<CuentaEmpresa />} />
      </Routes>
        </Suspense>
      </div>
    </div>
  );
}
