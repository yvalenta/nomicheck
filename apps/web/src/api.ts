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
