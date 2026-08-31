import { cambiarEmpresaActiva } from "../apiEmpresa";

// Cambiar de empresa activa desde el selector del header (SDD §15 — paso 5).
//
// Por qué recarga el portal entero en vez de invalidar caché fina:
//
// Los datos del panel no viven en un store global — cada sección los carga con
// `useDatos`, cuya caché es un Map por componente montado. No hay un solo lugar
// que vaciar. Y lo que queda en pantalla tras el cambio no es "datos viejos":
// son datos DE OTRA EMPRESA con el mismo layout y las mismas columnas. En un
// panel multi-tenant ese es el peor error posible, porque se ve perfecto.
//
// Una recarga bota todo: caché, estado de cada sección y cualquier respuesta en
// vuelo pedida con el puntero anterior. Cuesta un viaje más; comprarlo es
// barato al lado de mostrar la nómina de la empresa equivocada.

/** A dónde vuelve el portal después del cambio. La RAÍZ y no la sección actual:
 *  hay rutas con id (`/periodos/123`, `/colaboradores?sede=4`) que pertenecen a
 *  la empresa que se acaba de dejar y en la nueva son un 403 o, peor, otro
 *  registro con el mismo id. */
export const DESTINO_TRAS_CAMBIO = "/empresa";

/**
 * Mueve el puntero de empresa activa y recarga el portal.
 *
 * Si el servidor rechaza (sin membresía, empresa suspendida), el error sube y
 * NO se navega: el selector muestra el mensaje y la persona sigue en la empresa
 * donde estaba. Navegar primero y preguntar después dejaría el portal pintando
 * un nombre de empresa que el servidor nunca aceptó.
 */
export async function cambiarEmpresaYRecargar(empresaId: number): Promise<void> {
  await cambiarEmpresaActiva(empresaId);
  window.location.assign(DESTINO_TRAS_CAMBIO);
}
