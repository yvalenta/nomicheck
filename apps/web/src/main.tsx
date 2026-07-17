import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import EmpresaApp from './EmpresaApp.tsx'
import PortalColaborador from './PortalColaborador.tsx'
import AdminPlataforma from './AdminPlataforma.tsx'

function Raiz() {
  if (window.location.pathname.startsWith('/empresa')) return <EmpresaApp />
  if (window.location.pathname.startsWith('/colaborador')) return <PortalColaborador />
  if (window.location.pathname.startsWith('/admin')) return <AdminPlataforma />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
