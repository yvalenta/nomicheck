import { supabase } from "./lib/supabase";

export interface Empleado {
  id: number;
  nombre: string;
  documento: string;
  salarioBase: number;
  tipoNomina: "turnos" | "fijo";
  auxilioTransporte: boolean;
  fechaIngreso: string;
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

export interface Periodo {
  id: number;
  fechaInicio: string;
  fechaFin: string;
  estado: "borrador" | "liquidado" | "pagado";
}

export interface Turno {
  id?: number;
  empleadoId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

export interface LineaRecibo {
  concepto: string;
  horas?: number;
  base?: number;
  recargoPct?: number;
  valorCalculado: number;
  tipo: "devengo" | "deduccion" | "provision";
  ley?: string;
}

export interface Recibo {
  id: number;
  empleadoId: number;
  periodoId: number;
  empleado: Empleado;
  lineas: LineaRecibo[];
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
}

export function listarPeriodos(): Promise<Periodo[]> {
  return autenticado("/empresa/periodos");
}

export function crearPeriodo(datos: { fechaInicio: string; fechaFin: string }): Promise<Periodo> {
  return autenticado("/empresa/periodos", { method: "POST", body: JSON.stringify(datos) });
}

export function obtenerTurnos(periodoId: number): Promise<Turno[]> {
  return autenticado(`/empresa/periodos/${periodoId}/turnos`);
}

export function guardarTurnos(periodoId: number, turnos: Turno[]) {
  return autenticado(`/empresa/periodos/${periodoId}/turnos`, {
    method: "PUT",
    body: JSON.stringify(turnos),
  });
}

export function liquidarPeriodo(periodoId: number): Promise<Recibo[]> {
  return autenticado(`/empresa/periodos/${periodoId}/liquidar`, { method: "POST" });
}

export function listarRecibos(periodoId?: number): Promise<Recibo[]> {
  return autenticado(`/empresa/recibos${periodoId ? `?periodoId=${periodoId}` : ""}`);
}
