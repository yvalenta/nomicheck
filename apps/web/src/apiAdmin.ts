import { supabase } from "./lib/supabase";

async function autenticado(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Error de red");
  return body;
}

export interface VigenciaRegla {
  id: number;
  valor: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
  fuente: string | null;
}

export interface ReglaAgrupada {
  clave: string;
  etiqueta: string;
  unidad: string;
  fuenteTipica: string;
  usadaEnCalculo: boolean;
  descripcion: string;
  vigencias: VigenciaRegla[];
}

export function listarReglas(): Promise<ReglaAgrupada[]> {
  return autenticado("/admin/reglas");
}

export function crearVigencia(datos: {
  clave: string;
  valor: number;
  vigenteDesde: string;
  fuente?: string;
}): Promise<VigenciaRegla> {
  return autenticado("/admin/reglas", { method: "POST", body: JSON.stringify(datos) });
}

export interface Festivo {
  id: number;
  fecha: string;
  nombre: string;
}

export function listarFestivosAdmin(): Promise<Festivo[]> {
  return autenticado("/admin/festivos");
}

export function crearFestivo(datos: { fecha: string; nombre: string }): Promise<Festivo> {
  return autenticado("/admin/festivos", { method: "POST", body: JSON.stringify(datos) });
}

export function eliminarFestivo(id: number): Promise<null> {
  return autenticado(`/admin/festivos/${id}`, { method: "DELETE" });
}

export interface EmpresaAdmin {
  id: number;
  nombre: string;
  nit: string;
  sector: string;
  creadoEn: string;
  activa: boolean;
  colaboradores: number;
  contratistas: number;
  admins: { id: string; nombre: string; email: string | null }[];
}

export function listarEmpresas(): Promise<EmpresaAdmin[]> {
  return autenticado("/admin/empresas");
}

export function crearEmpresa(datos: {
  nombreAdmin: string;
  emailAdmin: string;
  empresa: { nombre: string; nit: string; sector: string };
}): Promise<{ empresa: EmpresaAdmin; usuario: { nombre: string; email: string | null } }> {
  return autenticado("/admin/empresas", { method: "POST", body: JSON.stringify(datos) });
}

// Reemplaza al admin_empresa actual (si lo hay) por uno nuevo invitado.
export function reasignarAdmin(
  empresaId: number,
  datos: { nombreAdmin: string; emailAdmin: string }
): Promise<{ usuario: { id: string; nombre: string; email: string | null } }> {
  return autenticado(`/admin/empresas/${empresaId}/admin`, { method: "PUT", body: JSON.stringify(datos) });
}

// Desvincula al admin sin borrar su cuenta — queda como "individual".
export function quitarAdmin(empresaId: number, usuarioId: string): Promise<null> {
  return autenticado(`/admin/empresas/${empresaId}/admin/${usuarioId}`, { method: "DELETE" });
}

export function cambiarEstadoEmpresa(empresaId: number, activa: boolean): Promise<{ empresa: EmpresaAdmin }> {
  return autenticado(`/admin/empresas/${empresaId}/estado`, { method: "PUT", body: JSON.stringify({ activa }) });
}

// «Ver como» solo lectura (tareas/2026-08-31-ver-como-solo-lectura-plataforma.md):
// el server crea la membresía auditor y mueve la empresa activa; tras el ok se
// recarga en /empresa. La vuelta es salirVistaPlataforma() en apiEmpresa.ts —
// con la vista puesta el rol efectivo es auditor y /admin responde 403.
export function entrarEmpresa(empresaId: number): Promise<{ empresaId: number }> {
  return autenticado(`/admin/empresas/${empresaId}/entrar`, { method: "POST" });
}
