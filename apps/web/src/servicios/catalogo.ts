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
  info?: { contact?: { email?: string | null } };
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

/** La dirección de contacto que el servidor publica en su propio OpenAPI.
 *
 *  Se DERIVA en vez de escribirse por un error que estuvo servido en
 *  producción: el botón "programa para contadores" de `/lanzamiento` mandaba a
 *  `hola@nomicheck.co`, un dominio que **no existe** — sin registro NS, sin A y
 *  sin MX. Nada fallaba a la vista: el navegador abría el cliente de correo, la
 *  persona escribía, y el mensaje rebotaba lejos de acá. Un contador que quiso
 *  hablar con nosotros no tenía forma de saber que nadie lo iba a leer.
 *
 *  Una constante escrita a mano en la web puede quedar apuntando a un dominio
 *  que se dejó ir. Esta no: sale del mismo documento que el API sirve, y si
 *  algún día deja de estar, devuelve `null` — y quien la use debe **no ofrecer
 *  el enlace** en vez de ofrecer uno muerto. Ver `Servicios.tsx`. */
export function contactoDe(doc: DocOpenApi): string | null {
  const email = doc.info?.contact?.email;
  if (typeof email !== "string") return null;

  // Sin validar de más: lo único que descalifica es que no pueda ser una
  // dirección. Un `""` o un `"pendiente"` servido por error no debe convertirse
  // en un `mailto:` roto.
  const limpio = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
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
