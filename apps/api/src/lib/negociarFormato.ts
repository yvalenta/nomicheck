// Negociación de contenido para las páginas que existen en DOS formas: HTML
// para un navegador y markdown para un agente (convención acceptmarkdown.com:
// `Accept: text/markdown` responde markdown con `Vary: Accept`).
//
// A mano y no con `req.accepts()` a propósito: la decisión tiene que poder
// probarse sin levantar Express —un mock de `accepts` probaría el mock— y el
// alcance es diminuto: dos tipos, q-values y comodines de RFC 9110 §12.5.1.

export type Formato = "html" | "markdown";

interface Rango {
  tipo: string;
  subtipo: string;
  q: number;
  /** 2 = tipo/subtipo exacto, 1 = tipo/*, 0 = *&#47;* — el más específico decide. */
  especificidad: number;
}

function parsearAccept(encabezado: string): Rango[] {
  const rangos: Rango[] = [];
  for (const parte of encabezado.split(",")) {
    const [media, ...params] = parte.trim().split(";");
    const [tipo, subtipo] = (media ?? "").trim().toLowerCase().split("/");
    if (!tipo || !subtipo) continue;
    let q = 1;
    for (const p of params) {
      const [clave, valor] = p.trim().split("=");
      if (clave?.trim() === "q") {
        const n = Number(valor);
        // Un q ilegible vale 0, no 1: "no sé cuánto lo querés" no es "lo querés".
        q = Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
      }
    }
    const especificidad = tipo === "*" ? 0 : subtipo === "*" ? 1 : 2;
    rangos.push({ tipo, subtipo, q, especificidad });
  }
  return rangos;
}

/** La q que el cliente le asigna a `tipo/subtipo`: manda el rango que matchea
 * con MAYOR especificidad (RFC 9110), no el primero ni el de mayor q. */
function calidadPara(tipo: string, subtipo: string, rangos: Rango[]): number {
  let mejor: Rango | null = null;
  for (const r of rangos) {
    const matchea =
      (r.tipo === "*" && r.subtipo === "*") ||
      (r.tipo === tipo && (r.subtipo === "*" || r.subtipo === subtipo));
    if (matchea && (mejor === null || r.especificidad > mejor.especificidad)) mejor = r;
  }
  return mejor?.q ?? 0;
}

/**
 * `null` significa 406: el cliente mandó un Accept que excluye a los dos
 * formatos. Sin encabezado (o ilegible) la respuesta es la página — un
 * navegador viejo no debe recibir un 406 por no saber pedir.
 *
 * En empate de q gana HTML: es el default más rico, y cubre el `*&#47;*` de
 * curl y de los navegadores. Markdown solo gana cuando el cliente lo pidió
 * con MÁS ganas que el HTML, que es exactamente lo que hace un agente con
 * `Accept: text/markdown`.
 */
export function negociarFormato(accept: string | undefined): Formato | null {
  if (accept === undefined || accept.trim() === "") return "html";
  const rangos = parsearAccept(accept);
  if (rangos.length === 0) return "html";
  const qHtml = calidadPara("text", "html", rangos);
  const qMarkdown = calidadPara("text", "markdown", rangos);
  if (qHtml === 0 && qMarkdown === 0) return null;
  return qMarkdown > qHtml ? "markdown" : "html";
}
