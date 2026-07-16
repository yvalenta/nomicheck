import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import EmpresaApp from './EmpresaApp.tsx'

const esModoEmpresa = window.location.pathname.startsWith('/empresa')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {esModoEmpresa ? <EmpresaApp /> : <App />}
  </StrictMode>,
)
