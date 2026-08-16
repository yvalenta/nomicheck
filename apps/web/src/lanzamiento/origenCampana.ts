// De dónde vino una empresa que se registró — atribución de campaña SIN pixel.
//
// ── Por qué esto y no el Meta Pixel ────────────────────────────────────────
//
// La campaña 3 necesita saber qué anuncio trajo cada empresa. El camino obvio
// es el Pixel de Meta, y **rompe dos promesas que el producto ya sirve**:
//
//   1. `ynt.codes/verificar` dice, en las dos lenguas: *«no hay scripts
//      externos, ni analítica, ni peticiones»*. Un pixel la vuelve falsa de
//      forma literal. Esa misma frase ya obligó a apagar el beacon de
//      Cloudflare el 2026-08-06.
//   2. El FAQ de `/lanzamiento`, contestando *«¿Mi jefe puede saber que usé
//      esto?»*, promete: *«El uso es anónimo — sin login, sin registro, sin
//      correo. Nadie más que tú ve el resultado.»* Mandarle a Meta que alguien
//      completó una verificación —peor, `discrepancia_detectada`, que señala a
//      un trabajador que cree que le pagaron de menos— contradice esa
//      respuesta, y es el dato más sensible que este producto toca.
//
// Este módulo da lo que hacía falta sin nada de eso: la campaña queda anotada
// **en nuestra propia base**, en la fila de la empresa que se registró. Primera
// persona, sin terceros, y solo del lado B2B — un dueño que se registra da su
// NIT y su correo, no está en el flujo anónimo.
//
// Lo que NO da, y conviene saberlo: no mide visitas ni abandono, solo
// conversiones consumadas. Para optimizar dentro de Meta, la campaña 3 ya eligió
// **formulario de leads nativo**, que se mide del lado de ellos sin tocar
// nuestro sitio.

const CLAVE = "nomicheck:origen";

/** Las únicas claves que se leen de la URL. Todo lo demás se ignora: un `utm_*`
 *  abierto es un campo de texto libre que viaja del anuncio a nuestra base. */
const CLAVES = ["utm_source", "utm_campaign", "utm_medium"] as const;

/** Techo por valor. Corto a propósito: acá solo caben nombres de campaña. */
const MAX = 40;

/** Deja pasar lo que parece un nombre de campaña y nada más.
 *
 *  No es paranoia de inyección —esto se guarda como texto y se muestra en un
 *  panel interno—: es que un `utm_campaign` lo escribe quien arma el anuncio, y
 *  a veces quien arma el anuncio pega un correo o un id de usuario ahí. Un
 *  campo libre que viaja a la base es un lugar donde termina apareciendo un
 *  dato personal que nadie pidió. */
function limpiar(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  // Se RECHAZA por largo, no se trunca. Truncar dejaría entrar los primeros 40
  // caracteres de un dato que justamente no debía llegar —el principio de un
  // correo sigue siendo parte de un correo—, y encima con aspecto de nombre de
  // campaña válido.
  if (s.length > MAX) return null;

  return /^[a-z0-9][a-z0-9._-]*$/.test(s) ? s : null;
}

/**
 * `?utm_source=meta&utm_campaign=empresas` → `"meta/empresas"`.
 *
 * Devuelve `null` si no hay nada útil, y **`null` no es «directo»**: una empresa
 * que llegó por su cuenta y una cuyo origen se perdió se ven igual, y decir
 * "directo" sobre la segunda sería inventar atribución.
 */
export function normalizarOrigen(search: string): string | null {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(search);
  } catch {
    return null;
  }
  const partes = CLAVES.map((k) => limpiar(p.get(k))).filter((v): v is string => v !== null);
  return partes.length > 0 ? partes.join("/") : null;
}

/** Anota el origen si la URL actual lo trae. Se llama al cargar el landing.
 *
 *  Va en `sessionStorage` y no en una cookie: no se comparte entre pestañas ni
 *  sobrevive al cierre del navegador, que es todo lo que hace falta para
 *  atravesar landing → login → registro, y nada más. */
export function capturarOrigen(search: string, almacen: Storage | null = seguro()): void {
  const origen = normalizarOrigen(search);
  if (!origen || !almacen) return;

  try {
    almacen.setItem(CLAVE, origen);
  } catch {
    // Modo privado, cuota llena, o el usuario bloqueó el almacenamiento. La
    // atribución es un lujo; el registro tiene que funcionar igual.
  }
}

/** El origen anotado, si lo hay. */
export function leerOrigen(almacen: Storage | null = seguro()): string | null {
  try {
    return almacen?.getItem(CLAVE) || null;
  } catch {
    return null;
  }
}

function seguro(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
