import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import EmpresaApp from './EmpresaApp.tsx'
import PortalColaborador from './PortalColaborador.tsx'
import AdminPlataforma from './AdminPlataforma.tsx'
import Login from './Login.tsx'

// El router SPA solo se activa en /empresa/* — los otros portales siguen
// con su navegación state-local hasta que sea necesario abrirlos también
// (SDD §15, iteración de filtros/paginación). BrowserRouter basename fija
// el prefijo, así el resto de rutas dentro de EmpresaApp se declaran
// relativas ("colaboradores", "periodos/:id", …).
function Raiz() {
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
    <Raiz />
  </StrictMode>,
)
