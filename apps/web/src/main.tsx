import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { lazyConReintento as lazy } from './lib/lazyConReintento.ts'

// Cada portal es un chunk aparte (rendimiento SPA). `Raiz` ya elegía UNO solo
// por pathname, pero con imports estáticos el navegador descargaba los SEIS:
// quien abría la landing se bajaba el panel de empresa, el de admin, recharts
// y supabase sin usarlos nunca. Con lazy() cada visitante paga solo el portal
// que abre.
const App = lazy(() => import('./App.tsx'))
const EmpresaApp = lazy(() => import('./EmpresaApp.tsx'))
const PortalColaborador = lazy(() => import('./PortalColaborador.tsx'))
const AdminPlataforma = lazy(() => import('./AdminPlataforma.tsx'))
const Login = lazy(() => import('./Login.tsx'))
const Lanzamiento = lazy(() => import('./lanzamiento/Lanzamiento.tsx'))

// Fallback mientras baja el chunk del portal. Deliberadamente mínimo y sin
// layout propio: aparece por milisegundos en red normal y no debe provocar
// salto visual cuando entra el contenido real.
function CargandoPortal() {
  return (
    <div className="min-h-screen grid place-items-center bg-surface">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-4 w-4 rounded-full border-2 border-mint border-t-transparent animate-spin" />
        <span className="text-xs text-muted">Cargando…</span>
      </div>
    </div>
  )
}

// El router SPA solo se activa en /empresa/* — los otros portales siguen
// con su navegación state-local hasta que sea necesario abrirlos también
// (SDD §15, iteración de filtros/paginación). BrowserRouter basename fija
// el prefijo, así el resto de rutas dentro de EmpresaApp se declaran
// relativas ("colaboradores", "periodos/:id", …).
function Raiz() {
  // Landings de marca — SDD §16 + sdd/marketing/. Ruta base `/lanzamiento`;
  // en el futuro se abren variantes `/lanzamientos/{campana}` cuando el
  // volumen justifique A/B por audiencia.
  if (window.location.pathname.startsWith('/lanzamiento')) return <Lanzamiento />
  if (window.location.pathname.startsWith('/login')) return <Login />
  if (window.location.pathname.startsWith('/empresa')) {
    return (
      <BrowserRouter basename="/empresa">
        <EmpresaApp />
      </BrowserRouter>
    )
  }
  if (window.location.pathname.startsWith('/colaborador')) return <PortalColaborador />
  if (window.location.pathname.startsWith('/admin')) return <AdminPlataforma />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<CargandoPortal />}>
      <Raiz />
    </Suspense>
  </StrictMode>,
)
