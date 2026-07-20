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

// Reasignar/suspender quedan para otra ronda (§13 del SDD).
export interface EmpresaAdmin {
  id: number;
  nombre: string;
  nit: string;
  sector: string;
  creadoEn: string;
  colaboradores: number;
  contratistas: number;
  admins: { nombre: string; email: string | null }[];
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
