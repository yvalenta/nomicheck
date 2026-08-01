// Lectura del catálogo OpenAPI que sirve el API.
//
// Vive aparte del componente por dos motivos: fast refresh solo funciona si un
// archivo exporta componentes y nada más, y —el que importa— esto se puede
// probar sin montar React. Es la única lógica de la landing que puede
// equivocarse en silencio: si deja de reconocer el precio, la página pinta
// "Gratis" sobre algo que cobra.

export interface OperacionOpenApi {
  operationId?: string;
  summary?: string;
  "x-x402"?: { cobra?: boolean; precioUsd?: number | null; red?: string | null };
}

export interface DocOpenApi {
  paths?: Record<string, Record<string, OperacionOpenApi>>;
}

export interface Servicio {
  ruta: string;
  id: string;
  titulo: string;
  cobra: boolean;
  precioUsd: number | null;
}

/** Las gemelas `/csv` no son servicios distintos: es el mismo cálculo en otro
 *  formato, con el mismo precio. Listarlas duplicaría el catálogo a la vista
 *  sin agregar una capacidad. */
export function esGemelaCsv(ruta: string): boolean {
  return ruta.endsWith("/csv");
}

export function serviciosDe(doc: DocOpenApi): Servicio[] {
  return Object.entries(doc.paths ?? {})
    .filter(([ruta, metodos]) => metodos.post && !esGemelaCsv(ruta))
    .map(([ruta, metodos]) => {
      const op = metodos.post;
      const x = op["x-x402"];
      return {
        ruta,
        id: op.operationId ?? ruta,
        titulo: op.summary ?? ruta,
        // Ante la duda, GRATIS es la respuesta segura: pintar "US$0,02" sobre
        // algo que no cobra ahuyenta a quien iba a probarlo, y el 402 real
        // aparecería igual si cobrara. Al revés sería peor, pero el precio solo
        // se muestra cuando el servidor dice `cobra: true` con un número.
        cobra: x?.cobra === true && typeof x.precioUsd === "number",
        precioUsd: typeof x?.precioUsd === "number" ? x.precioUsd : null,
      };
    });
}
