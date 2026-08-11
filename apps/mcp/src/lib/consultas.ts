// Las dos consultas gratis de integración: el ejemplo canónico y el schema.
//
// Son GETs planos a propósito — el valor no está acá sino en el contrato que
// exponen: `/{ruta}/ejemplo` devuelve un par input+output REAL (el output va
// firmado, así que sirve también para probar `nomicheck_verificar_sobre` sin
// pagar nada), y `/schema/v1.json` es el JSON Schema del contrato de
// liquidación, generado del MISMO zod que valida en runtime. No se copia ni se
// resume nada en el camino: un resumen escrito acá sería una segunda fuente
// que miente en cuanto el servidor cambie.
import { baseUrl, pedirJson, type RutaEjemplo } from "./base.js";

export async function pedirEjemplo(ruta: RutaEjemplo): Promise<unknown> {
  return pedirJson(`${baseUrl()}/api/batch/${ruta}/ejemplo`);
}

export async function pedirSchema(): Promise<unknown> {
  return pedirJson(`${baseUrl()}/api/batch/schema/v1.json`);
}
