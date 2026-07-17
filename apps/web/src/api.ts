import type { ConceptoNomina, DatosNominaFija, DatosNominaTurnos, Festivo, ResultadoNomina } from "@pv/reglas";

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
  datos: DatosNominaTurnos | DatosNominaFija
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
