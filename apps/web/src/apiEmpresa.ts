import { supabase } from "./lib/supabase";

export interface Empleado {
  id: number;
  nombre: string;
  documento: string;
  salarioBase: number;
  tipoNomina: "turnos" | "fijo";
  auxilioTransporte: boolean;
  activo: boolean;
}

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
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Error de red");
  return body;
}

export interface DatosRegistro {
  email: string;
  password: string;
  nombre: string;
  empresa: { nombre: string; nit: string; sector: string };
}

export function registrarEmpresa(datos: DatosRegistro) {
  return autenticado("/auth/registro", { method: "POST", body: JSON.stringify(datos) });
}

export function listarEmpleados(): Promise<Empleado[]> {
  return autenticado("/empresa/empleados");
}

export function crearEmpleado(datos: Omit<Empleado, "id" | "activo">): Promise<Empleado> {
  return autenticado("/empresa/empleados", { method: "POST", body: JSON.stringify(datos) });
}

export function actualizarEmpleado(id: number, datos: Partial<Empleado>): Promise<Empleado> {
  return autenticado(`/empresa/empleados/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function invitarEmpleado(id: number, email: string) {
  return autenticado(`/empresa/empleados/${id}/invitar`, { method: "POST", body: JSON.stringify({ email }) });
}
