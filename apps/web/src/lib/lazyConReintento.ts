import { lazy, type ComponentType } from "react";

const CLAVE_REINTENTO = "nc-chunk-reintento";

/**
 * `lazy()` con recuperación ante chunks obsoletos.
 *
 * Al dividir la app en chunks apareció un modo de fallo que antes no existía:
 * cada build genera nombres con hash nuevo, así que una pestaña abierta desde
 * antes de un deploy pide archivos que ya no están en el servidor. El import
 * dinámico rechaza, React no tiene dónde capturarlo y el usuario se queda con
 * una pantalla en blanco — justo al navegar, sin explicación.
 *
 * Aquí ese fallo se trata como lo que es: el HTML en memoria quedó viejo. Se
 * recarga la página UNA vez para tomar el index.html nuevo (con los hashes
 * correctos) y la navegación continúa. La marca en sessionStorage evita un
 * bucle de recargas si el error no era por versión sino por red caída.
 */
/**
 * La decisión, separada de `lazy()` para poder probarla.
 *
 * No es una extracción cosmética: `lazy()` devuelve un componente, y llegar a
 * esta lógica a través de él exigiría montar un árbol con Suspense — o sea,
 * probar React. La primera versión de la prueba resolvió eso **copiando** el
 * cuerpo de la función en el archivo de test, y el resultado fue el esperable:
 * una mutación que rompía el módulo real dejaba la suite en verde, porque la
 * suite ejercitaba la copia. Un mock que contesta como el original termina
 * probando el mock.
 */
export async function cargarConReintento<T>(
  importar: () => Promise<{ default: T }>,
): Promise<{ default: T }> {
  try {
    const modulo = await importar();
    sessionStorage.removeItem(CLAVE_REINTENTO);
    return modulo;
  } catch (error) {
    if (!sessionStorage.getItem(CLAVE_REINTENTO)) {
      sessionStorage.setItem(CLAVE_REINTENTO, "1");
      window.location.reload();
      // La página se está recargando: esta promesa nunca debe resolver, o
      // React intentaría renderizar un módulo que no llegó.
      return new Promise<{ default: T }>(() => {});
    }
    // Ya recargamos y volvió a fallar: no es versión vieja. Que suba el
    // error para que se vea en consola en vez de recargar en bucle.
    throw error;
  }
}

// `any` deliberado: es la misma firma que expone React.lazy — el componente
// cargado puede tener cualquier forma de props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyConReintento<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(() => cargarConReintento(importar));
}
