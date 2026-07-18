import { supabase } from "./lib/supabase";

export interface Empleado {
  id: number;
  nombre: string;
  documento: string;
  salarioBase: number;
  tipoNomina: "turnos" | "fijo";
  auxilioTransporte: boolean;
  fechaIngreso: string;
  fechaRetiro: string | null;
  tipoContrato: "indefinido" | "aprendizaje_sena_lectiva" | "aprendizaje_sena_practica";
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

export function crearEmpleado(datos: Omit<Empleado, "id" | "activo" | "fechaRetiro">): Promise<Empleado> {
  return autenticado("/empresa/empleados", { method: "POST", body: JSON.stringify(datos) });
}

export function actualizarEmpleado(id: number, datos: Partial<Empleado>): Promise<Empleado> {
  return autenticado(`/empresa/empleados/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

// Borrado físico SOLO si no hay historial de nómina (409 en caso contrario
// — el camino legal es retirar y conservar los registros).
export function eliminarEmpleado(id: number): Promise<{ ok: true }> {
  return autenticado(`/empresa/empleados/${id}`, { method: "DELETE" });
}

export function invitarEmpleado(id: number, email: string) {
  return autenticado(`/empresa/empleados/${id}/invitar`, { method: "POST", body: JSON.stringify({ email }) });
}

export function retirarEmpleado(id: number, fechaRetiro: string): Promise<Empleado> {
  return autenticado(`/empresa/empleados/${id}/retirar`, { method: "POST", body: JSON.stringify({ fechaRetiro }) });
}

export function liquidarFinalEmpleado(id: number): Promise<Recibo> {
  return autenticado(`/empresa/empleados/${id}/liquidacion-final`, { method: "POST" });
}

// Contratista de prestación de servicios (Ley 1819 de 2016, art. 244) — NO
// es Empleado: sin contrato laboral, sin fechaIngreso/tipoNomina/auxilio.
export interface Contratista {
  id: number;
  nombre: string;
  documento: string;
  honorariosMensuales: number;
  activo: boolean;
}

export function listarContratistas(): Promise<Contratista[]> {
  return autenticado("/empresa/contratistas");
}

export function crearContratista(datos: Omit<Contratista, "id" | "activo">): Promise<Contratista> {
  return autenticado("/empresa/contratistas", { method: "POST", body: JSON.stringify(datos) });
}

export function actualizarContratista(id: number, datos: Partial<Contratista>): Promise<Contratista> {
  return autenticado(`/empresa/contratistas/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function eliminarContratista(id: number): Promise<{ ok: true }> {
  return autenticado(`/empresa/contratistas/${id}`, { method: "DELETE" });
}

// --- Panel de costo total empleador (SDD §13) ---

export interface LineaCosto {
  concepto: string;
  pct?: number;
  valor: number;
  ley: string;
}

export interface CostoEmpleado {
  empleadoId: number;
  nombre: string;
  tipoContrato: string;
  salarioBase: number;
  costo: {
    salarioMensual: number;
    lineas: LineaCosto[];
    costoTotalMensual: number;
    factorSobreSalario: number;
    advertencias: string[];
  } | null;
}

export interface CostosEmpresa {
  exonerado: boolean;
  empleados: CostoEmpleado[];
  contratistas: { contratistaId: number; nombre: string; honorariosMensuales: number }[];
  totales: {
    nominaBaseMensual: number;
    costoTotalMensual: number;
    honorariosMensuales: number;
    factorPromedio: number;
  };
}

export function obtenerCostos(exonerado: boolean): Promise<CostosEmpresa> {
  return autenticado(`/empresa/costos?exonerado=${exonerado}`);
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
  empleadoId: number | null;
  contratistaId: number | null;
  periodoId: number;
  empleado: Empleado | null;
  contratista: Contratista | null;
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

export type TipoDiscrepancia = "pago_de_mas" | "pago_de_menos" | "concepto_faltante";

export interface DiscrepanciaEmpresa {
  id: number;
  reciboId: number;
  tipo: TipoDiscrepancia;
  detalle: string;
  estado: "abierto" | "en_revision" | "resuelto";
  respuestaEmpresa: string | null;
  recibo: Recibo;
}

export function listarDiscrepancias(): Promise<DiscrepanciaEmpresa[]> {
  return autenticado("/empresa/discrepancias");
}

export function responderDiscrepancia(
  id: number,
  datos: { estado: "en_revision" | "resuelto"; respuestaEmpresa: string }
): Promise<DiscrepanciaEmpresa> {
  return autenticado(`/empresa/discrepancias/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}
