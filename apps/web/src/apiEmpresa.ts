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
  tipoContrato:
    | "indefinido"
    | "fijo"
    | "obra_labor"
    | "tiempo_parcial"
    | "aprendizaje_sena_lectiva"
    | "aprendizaje_sena_practica";
  // Clase de riesgo laboral ARL (I a V, Decreto 1772 de 1994) — 1 = riesgo
  // mínimo (default). Usada en costos y liquidación PILA.
  claseRiesgoArl: 1 | 2 | 3 | 4 | 5;
  /** Sede/sucursal a la que pertenece — null = sin asignar (SDD §15, pilar 1). */
  sedeId: number | null;
  activo: boolean;
  // Estado de la cuenta del colaborador: usuarioId null = sin cuenta;
  // con usuarioId y invitacionAceptadaEn null = invitación pendiente;
  // con ambos = cuenta activa vinculada.
  usuarioId: string | null;
  invitacionAceptadaEn: string | null;
}

export type ResultadoInvitacion = { estado: "correo_enviado" | "pendiente_en_app" };

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
  if (!res.ok) {
    const err = new Error(body.error ?? "Error de red") as Error & { body?: unknown };
    err.body = body;
    throw err;
  }
  return body;
}

// Motor de QA (SDD §15, pilar 2) — el backend rechaza la liquidación cuando
// algún recibo tiene issues de severidad "error"; el frontend usa este tipo
// para mostrarlos con código+ley (más útil que un mensaje suelto).
export interface IssueQA {
  codigo:
    | "HORAS_EXTRA_EXCEDIDAS_DIA"
    | "HORAS_EXTRA_EXCEDIDAS_SEMANA"
    | "TOPE_DEDUCCIONES_SUPERADO"
    | "NETO_BAJO_MINIMO"
    | "IBC_FUERA_DE_RANGO";
  severidad: "error" | "advertencia";
  mensaje: string;
  referenciaLegal: string;
  detalles: { valorCalculado: number; valorLimite: number; contexto?: string };
}

export interface RechazoQA {
  empleadoId: number;
  nombre: string;
  issues: IssueQA[];
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

// Campos que captura el formulario — el resto (id, activo, fechaRetiro y el
// estado de cuenta usuarioId/invitacionAceptadaEn) lo gestiona el servidor.
export type DatosEmpleado = Omit<
  Empleado,
  "id" | "activo" | "fechaRetiro" | "usuarioId" | "invitacionAceptadaEn"
>;

export function crearEmpleado(datos: DatosEmpleado): Promise<Empleado> {
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

export function invitarEmpleado(id: number, email: string): Promise<ResultadoInvitacion> {
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

// --- Liquidación PILA exacta por periodo (SDD §14) ---

export interface PilaEmpleado {
  empleadoId: number;
  nombre: string;
  tipoContrato: string;
  claseRiesgoArl: number;
  pila: {
    ibcPeriodo: number;
    lineas: LineaCosto[];
    costoTotalPeriodo: number;
    advertencias: string[];
  } | null; // null = aprendiz SENA etapa lectiva, sin IBC
}

export interface PilaPeriodo {
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
  exonerado: boolean;
  empleados: PilaEmpleado[];
  totales: { ibcTotal: number; costoTotalPeriodo: number };
}

export function obtenerPilaPeriodo(periodoId: number, exonerado: boolean): Promise<PilaPeriodo> {
  return autenticado(`/empresa/periodos/${periodoId}/pila?exonerado=${exonerado}`);
}

// --- Semáforo de cumplimiento (SDD §14) ---

export interface AlertaEmpleado {
  empleadoId: number;
  nombre: string;
  mensaje: string;
}

export interface AlertaHorasExtra extends AlertaEmpleado {
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
}

export interface SemaforoCumplimiento {
  nivel: "verde" | "amarillo" | "rojo";
  aprendicesMalClasificados: AlertaEmpleado[];
  salariosBajoMinimo: AlertaEmpleado[];
  horasExtraExcedidas: AlertaHorasExtra[];
}

export function obtenerCumplimiento(): Promise<SemaforoCumplimiento> {
  return autenticado("/empresa/cumplimiento");
}

export interface Periodo {
  id: number;
  fechaInicio: string;
  fechaFin: string;
  estado: "borrador" | "liquidado" | "pagado";
  notaEdicion: string | null;
  editadoEn: string | null;
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
  advertencias: string[];
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
  /** Issues del motor de QA (SDD §15). null = QA aprobada. Solo tipo "advertencia"
   * puede llegar aquí — los "error" bloquean la liquidación antes de persistir. */
  qaIssues: IssueQA[] | null;
}

export function listarPeriodos(): Promise<Periodo[]> {
  return autenticado("/empresa/periodos");
}

export function crearPeriodo(datos: { fechaInicio: string; fechaFin: string }): Promise<Periodo> {
  return autenticado("/empresa/periodos", { method: "POST", body: JSON.stringify(datos) });
}

// Solo en borrador — un periodo liquidado se revierte primero (revertirPeriodo).
export function editarPeriodo(
  id: number,
  datos: { fechaInicio: string; fechaFin: string; nota: string }
): Promise<Periodo> {
  return autenticado(`/empresa/periodos/${id}`, { method: "PUT", body: JSON.stringify(datos) });
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

// Qué empleados quedan incluidos en el periodo — se autopuebla con los
// activos al crear (crearPeriodo del backend), ajustable solo en borrador.
export function obtenerEmpleadosIncluidos(periodoId: number): Promise<number[]> {
  return autenticado(`/empresa/periodos/${periodoId}/empleados`);
}

export function guardarEmpleadosIncluidos(periodoId: number, empleadoIds: number[]): Promise<number[]> {
  return autenticado(`/empresa/periodos/${periodoId}/empleados`, {
    method: "PUT",
    body: JSON.stringify(empleadoIds),
  });
}

export function liquidarPeriodo(periodoId: number): Promise<Recibo[]> {
  return autenticado(`/empresa/periodos/${periodoId}/liquidar`, { method: "POST" });
}

export function revertirPeriodo(periodoId: number): Promise<{ ok: true }> {
  return autenticado(`/empresa/periodos/${periodoId}/revertir`, { method: "POST" });
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

// Sedes + staff empresarial (SDD §15, pilar 1). Roles granulares dentro de
// una empresa; sin sedes creadas el modelo se comporta como antes (un solo
// admin_empresa ve toda su empresa).
export interface Sede {
  id: number;
  empresaId: number;
  nombre: string;
  _count: { empleados: number; analistas: number };
}

export interface StaffEmpresa {
  id: string;
  email: string | null;
  nombre: string;
  rol: "analista_rrhh" | "auditor";
  sedeIds: number[];
}

export function listarSedes(): Promise<Sede[]> {
  return autenticado("/empresa/sedes");
}
export function crearSede(nombre: string): Promise<Sede> {
  return autenticado("/empresa/sedes", { method: "POST", body: JSON.stringify({ nombre }) });
}
export function eliminarSede(id: number): Promise<{ ok: true }> {
  return autenticado(`/empresa/sedes/${id}`, { method: "DELETE" });
}
export function listarStaff(): Promise<StaffEmpresa[]> {
  return autenticado("/empresa/staff");
}
export function asignarStaff(datos: {
  email: string;
  rol: "analista_rrhh" | "auditor";
  sedeIds: number[];
}): Promise<{ id: string }> {
  return autenticado("/empresa/staff", { method: "POST", body: JSON.stringify(datos) });
}
export function quitarStaff(id: string): Promise<{ ok: true }> {
  return autenticado(`/empresa/staff/${id}`, { method: "DELETE" });
}

// --- Auditoría (SDD §15, pilar 1B) ---

export interface EntradaAuditoria {
  id: string;
  creadoEn: string;
  tabla: string;
  registroId: string;
  accion: "INSERT" | "UPDATE" | "DELETE";
  usuario: { id: string; nombre: string; email: string | null } | null;
  valoresAnteriores: Record<string, unknown> | null;
  valoresNuevos: Record<string, unknown> | null;
}

export function listarAuditoria(limit = 100): Promise<EntradaAuditoria[]> {
  return autenticado(`/empresa/auditoria?limit=${limit}`);
}
