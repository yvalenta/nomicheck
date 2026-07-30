import type {
  ConceptoNomina,
  DatosNominaFija,
  DatosNominaServicios,
  DatosNominaTurnos,
  Festivo,
  ResultadoNomina,
} from "@pv/reglas";

export interface ComprobanteExtraido {
  salarioBasicoMensual?: number;
  periodoDesde?: string;
  periodoHasta?: string;
  recibeAuxilioTransporte?: boolean;
  conceptos: ConceptoNomina[];
  advertenciaExtraccion?: string;
}

export async function extraerComprobante(archivo: File): Promise<ComprobanteExtraido> {
  const form = new FormData();
  form.append("archivo", archivo);
  const res = await fetch("/api/comprobantes/extraer", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo extraer el comprobante");
  }
  return body as ComprobanteExtraido;
}

export async function listarFestivos(): Promise<Festivo[]> {
  const res = await fetch("/api/festivos");
  if (!res.ok) return []; // sin festivos la UI sigue funcionando; el motor los aplica igual
  return res.json();
}

export interface ParametrosPublicos {
  smlmv: number;
  auxilioTransporteTopeSmlmv: number;
}

// Espejo de lectura de reglas legales que la UI necesita para dar feedback
// inmediato (ej. ocultar el auxilio de transporte si el salario supera el
// tope) sin duplicar la cifra como constante — el motor server-side sigue
// siendo quien decide en el cálculo real.
export async function obtenerParametros(): Promise<ParametrosPublicos | null> {
  const res = await fetch("/api/reglas/parametros");
  if (!res.ok) return null;
  return res.json();
}

export async function calcularNomina(
  datos: DatosNominaTurnos | DatosNominaFija | DatosNominaServicios
): Promise<ResultadoNomina> {
  const res = await fetch("/api/nomina/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo calcular la nómina");
  }
  return body as ResultadoNomina;
}

export type DatosIndemnizacion =
  | {
      tipoContrato: "fijo" | "obra_labor";
      salarioMensual: number;
      fechaTerminacion: string;
      fechaVencimientoPactada: string;
      conJustaCausa: boolean;
      enPeriodoPrueba?: boolean;
    }
  | {
      tipoContrato: "indefinido" | "tiempo_parcial";
      salarioMensual: number;
      fechaIngreso: string;
      fechaTerminacion: string;
      conJustaCausa: boolean;
      enPeriodoPrueba?: boolean;
    };

export interface ResultadoIndemnizacion {
  diasIndemnizacion: number;
  valor: number;
  explicacion: string;
  ley: string;
}

// Calculadora aparte de indemnización por terminación (SDD §14) — no es
// parte del recibo de nómina periódico, es informativa/aproximada.
export async function calcularIndemnizacion(datos: DatosIndemnizacion): Promise<ResultadoIndemnizacion> {
  const res = await fetch("/api/indemnizacion/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo calcular la indemnización");
  }
  return body as ResultadoIndemnizacion;
}

// --- Calculadoras anónimas por concepto (SDD §14) ---
// Hermanas de la de indemnización: informativas, sin recibo ni deducciones.

async function postCalculadora<T>(path: string, datos: unknown, errorDefault: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? errorDefault);
  }
  return body as T;
}

export interface ResultadoPrima {
  prima: number;
  diasTrabajadosAcumulado: number;
  auxilioIncluido: number;
  advertencias: string[];
  explicacion: string;
  ley: string;
}

export function calcularPrima(datos: {
  salarioMensual: number;
  recibeAuxilioTransporte: boolean;
  fechaIngreso: string;
  fechaCorte: string;
}): Promise<ResultadoPrima> {
  return postCalculadora("/api/prima/calcular", datos, "No se pudo calcular la prima");
}

export interface ResultadoCesantias {
  cesantias: number;
  interesesCesantias: number;
  diasTrabajadosAcumulado: number;
  auxilioIncluido: number;
  advertencias: string[];
  explicacion: string;
  ley: string;
}

export function calcularCesantias(datos: {
  salarioMensual: number;
  recibeAuxilioTransporte: boolean;
  fechaIngreso: string;
  fechaCorte: string;
}): Promise<ResultadoCesantias> {
  return postCalculadora("/api/cesantias/calcular", datos, "No se pudieron calcular las cesantías");
}

export interface HorasRecargo {
  nocturnas?: number;
  dominicalesDiurnas?: number;
  dominicalesNocturnas?: number;
  extrasDiurnas?: number;
  extrasNocturnas?: number;
  extrasDominicalesDiurnas?: number;
  extrasDominicalesNocturnas?: number;
}

export interface ResultadoRecargos {
  valorHoraOrdinaria: number;
  lineas: { concepto: string; horas?: number; recargoPct?: number; valorCalculado: number; ley?: string }[];
  total: number;
}

export function calcularRecargos(datos: {
  salarioMensual: number;
  fechaReferencia: string;
  horas: HorasRecargo;
}): Promise<ResultadoRecargos> {
  return postCalculadora("/api/recargos/calcular", datos, "No se pudieron calcular los recargos");
}

export interface ResultadoRetencion {
  ingresoLaboralMensual: number;
  ingresoNoConstitutivo: number;
  deduccionDependientes: number;
  deduccionMedicinaPrepagada: number;
  rentaExentaAfcYPension: number;
  rentaExentaLaboral: number;
  totalExentoYDeducible: number;
  baseGravable: number;
  baseGravableUvt: number;
  retencionMensual: number;
  advertencias: string[];
  explicacion: string;
  ley: string;
}

export function calcularRetencion(datos: {
  ingresoLaboralMensual: number;
  declaraRenta: boolean;
  aportesVoluntariosAfc?: number;
  aportesVoluntariosPensionObligatoria?: number;
  tieneDependientes: boolean;
  medicinaPrepagadaMensual?: number;
}): Promise<ResultadoRetencion> {
  return postCalculadora("/api/retencion/calcular", datos, "No se pudo calcular la retención en la fuente");
}

// --- Registro de cuenta individual (server-side) ---
// El usuario se crea con email_confirm=true en el backend, así el cliente
// puede iniciar sesión de inmediato (sin correo de confirmación) y el guardado
// diferido se dispara al toque.
export async function registrarIndividual(datos: {
  email: string;
  password: string;
  nombre: string;
}): Promise<void> {
  const res = await fetch("/api/auth/registro-individual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo crear la cuenta");
}

// Tras un login con OAuth (Google) Supabase Auth ya autenticó al usuario pero
// nunca pasó por registrarIndividual — no existe el perfil Usuario todavía.
// Idempotente: si ya existe (cualquier rol), el backend lo devuelve tal cual.
export async function asegurarPerfilIndividual(): Promise<void> {
  const { supabase } = await import("./lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  const res = await fetch("/api/auth/perfil-individual", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo preparar tu cuenta");
}

// --- Guardar liquidación en el historial del usuario (delayed auth) ---
// Requiere sesión de Supabase: manda el JWT en Authorization igual que los
// clientes autenticados (apiEmpresa/apiColaborador).
export interface LiquidacionGuardada {
  id: number;
  creadoEn: string;
}

export async function guardarLiquidacion(payload: {
  resultado: ResultadoNomina;
  netoRecibido?: number;
}): Promise<LiquidacionGuardada> {
  const { supabase } = await import("./lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Necesitas iniciar sesión para guardar tu liquidación");

  const res = await fetch("/api/liquidations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo guardar la liquidación");
  }
  return body as LiquidacionGuardada;
}

export interface LiquidacionListada {
  id: number;
  resultado: ResultadoNomina;
  netoEsperado: number;
  netoRecibido: number | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  creadoEn: string;
}

export async function listarMisLiquidaciones(): Promise<LiquidacionListada[]> {
  const { supabase } = await import("./lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Necesitas iniciar sesión para ver tu historial");

  const res = await fetch("/api/liquidations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo cargar tu historial de liquidaciones");
  }
  return body as LiquidacionListada[];
}

// --- "¿Quién soy?" — usado por el login unificado y por los 3 portales
// para redirigir a la cuenta a donde le corresponde según su rol real. ---
export interface MiRol {
  rol: string;
  empresaId: number | null;
  empleadoId: number | null;
}

export async function obtenerMiRol(): Promise<MiRol> {
  const { supabase } = await import("./lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No hay sesión activa");

  const res = await fetch("/api/auth/whoami", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo determinar tu rol");
  return body as MiRol;
}

export interface MensajeChat {
  rol: "usuario" | "asistente";
  texto: string;
}

// Chat contador (Fase 4, SDD §03 Módulo E): explica un ResultadoNomina ya
// calculado — nunca lo recalcula ni lo contradice, server-side (Claude).
export async function explicarChat(
  resultado: ResultadoNomina,
  pregunta: string,
  historial: MensajeChat[]
): Promise<string> {
  const res = await fetch("/api/chat/explicar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resultado, pregunta, historial }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "No se pudo generar la respuesta");
  }
  return body.respuesta as string;
}
