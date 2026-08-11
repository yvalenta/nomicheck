// Lo compartido por las cinco herramientas: de dónde se lee la API y cómo.
//
// La base sale de `NOMICHECK_BASE_URL` y se LEE EN CADA LLAMADA, no una vez al
// importar el módulo: un servidor MCP vive horas, y congelar la config al
// arranque es lo que hace que "cambié la variable y no pasa nada" se vuelva un
// bug imposible de ver — el proceso viejo sigue apuntando a donde apuntaba.
// De paso, los tests pueden cambiar la variable sin reimportar nada.

/** Origen de la API, sin barra final — `.../api/batch` se arma siempre igual. */
export function baseUrl(): string {
  return (process.env.NOMICHECK_BASE_URL ?? "https://nomicheck.ynt.codes").replace(/\/+$/, "");
}

/**
 * El agent card vive en el APEX (`ynt.codes`), no bajo la base de la API, y
 * eso es deliberado: es el ancla de identidad CONTRA la que se cruza lo que la
 * API anuncia. Si su URL derivara de `NOMICHECK_BASE_URL`, un atacante que
 * controle la base controlaría también el ancla — y el cruce del `payTo`
 * compararía la mentira contra sí misma.
 */
export const AGENT_CARD_URL = "https://ynt.codes/.well-known/agent-card.json";

/** Las rutas que sirven `GET /{ruta}/ejemplo`. Medido contra el router real. */
export const RUTAS_EJEMPLO = ["retencion", "verificar", "liquidacion-final"] as const;
export type RutaEjemplo = (typeof RUTAS_EJEMPLO)[number];

/**
 * Las rutas POST del wrapper stateless, copiadas de `batchPublico.ts` del
 * workspace `@pv/api`. Es una lista escrita a mano sobre otro workspace, y se
 * acepta el costo: importar `@pv/api` desde acá arrastraría Express y Prisma a
 * un proceso que solo hace `fetch`, y el modo de falla de la lista vieja es
 * visible — la ruta nueva responde 404 y el error nombra la URL exacta.
 */
export const RUTAS_CALCULO = [
  "liquidar",
  "retencion",
  "verificar",
  "liquidacion-final",
  "pago-onchain",
  "comprobante",
] as const;
export type RutaCalculo = (typeof RUTAS_CALCULO)[number];

/** Un HTTP que no fue 2xx, con lo necesario para reportarlo sin adivinar. */
export class ErrorHttp extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly cuerpo: string,
  ) {
    super(`HTTP ${status} en ${url}: ${cuerpo.slice(0, 300)}`);
    this.name = "ErrorHttp";
  }
}

/**
 * GET que espera JSON. Falla con `ErrorHttp` en vez de devolver `undefined`:
 * un `undefined` silencioso acá se convierte tres capas más arriba en un
 * resumen que dice "no hay productos" cuando lo cierto es "no hubo respuesta",
 * y esas dos frases piden acciones opuestas.
 */
export async function pedirJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) {
    throw new ErrorHttp(url, r.status, await r.text());
  }
  return r.json();
}

/** Acceso con nombre a un campo de un JSON desconocido, sin castear a `any`. */
export function campo(v: unknown, clave: string): unknown {
  if (typeof v !== "object" || v === null) return undefined;
  return (v as Record<string, unknown>)[clave];
}

/**
 * Compara dos direcciones EVM sin distinguir mayúsculas. No es cosmética:
 * EIP-55 escribe la MISMA dirección con checksums de mayúsculas distintos, así
 * que un `===` crudo declara "no coinciden" sobre dos formas de la misma
 * wallet — la falsa alarma que entrena a ignorar la alarma real.
 */
export function mismaDireccion(a: string | null, b: string | null): boolean | null {
  if (!a || !b) return null;
  return a.toLowerCase() === b.toLowerCase();
}
