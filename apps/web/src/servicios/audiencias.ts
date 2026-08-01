import type { Audiencia } from "./i18n";

// Configuración de las audiencias que NO depende del idioma.
//
// La copia vive en `i18n.ts`; aquí queda solo lo estructural, que es lo mismo
// en español y en inglés. Separarlo evita el error clásico de i18n: duplicar
// una lista de ids dentro de cada idioma y que un día difieran.

export const ORDEN_AUDIENCIAS: Audiencia[] = ["persona", "empresa", "bot"];

/** `operationId` del OpenAPI que más le sirven a cada quien, en orden.
 *
 *  Es un ORDEN DE LECTURA, no un permiso: los cinco endpoints son públicos
 *  para las tres audiencias. Prometer lo contrario sería vender una
 *  segmentación que el producto no tiene. */
export const RECOMENDADOS: Record<Audiencia, string[]> = {
  persona: ["payslip-verification", "final-settlement", "withholding-tax"],
  empresa: ["payroll-settlement", "final-settlement", "usdc-contractor-payout"],
  bot: [
    "payslip-verification",
    "payroll-settlement",
    "withholding-tax",
    "final-settlement",
    "usdc-contractor-payout",
  ],
};
