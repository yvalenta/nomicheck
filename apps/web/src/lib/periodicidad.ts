import { finDePeriodoMensual } from "@pv/reglas";

// La periodicidad de pago y su regla de rango — compartida entre el
// verificador de personas (PasoSalario) y el panel de empresa (nuevo
// periodo): elegir "desde" sugiere "hasta" según la cadencia, y editar
// "hasta" a mano te pasa a "personalizado". Vivía privada en PasoSalario;
// salió aquí el 2026-08-20 cuando la empresa ganó el mismo comportamiento.

export type Periodicidad = "semanal" | "quincenal" | "mensual" | "personalizado";

export const PERIODICIDAD_LABEL: Record<Periodicidad, string> = {
  semanal: "Semanal (7 días)",
  quincenal: "Quincenal (15 días)",
  mensual: "Mensual",
  personalizado: "Personalizado",
};

// Fecha fin sugerida a partir de la fecha de inicio y la periodicidad — el
// usuario puede editarla libremente después (eso la pasa a "personalizado").
export function calcularHasta(desde: string, periodicidad: Periodicidad): string {
  if (!desde || periodicidad === "personalizado") return "";
  if (periodicidad === "mensual") return finDePeriodoMensual(desde);
  const d = new Date(`${desde}T00:00:00Z`);
  if (periodicidad === "semanal") d.setUTCDate(d.getUTCDate() + 6);
  else d.setUTCDate(d.getUTCDate() + 14); // quincenal
  return d.toISOString().slice(0, 10);
}
