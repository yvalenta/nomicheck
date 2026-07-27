import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carga de datos con caché por clave y descarte de respuestas obsoletas.
 *
 * Resuelve dos problemas reales del panel:
 *
 * 1. **Respuestas fuera de orden.** El patrón anterior
 *    (`useEffect(() => { api().then(setDatos) }, [filtro])`) no cancelaba nada:
 *    si el usuario tecleaba "ana" y luego "ana maría", y la primera petición
 *    tardaba más, su respuesta llegaba DESPUÉS y pisaba la buena — la tabla
 *    mostraba resultados que no correspondían al filtro visible. Aquí cada
 *    petición lleva número de secuencia y solo la más reciente puede escribir
 *    en el estado.
 *
 * 2. **Recalcular sin recargar.** El resultado se cachea por `clave`, así
 *    alternar un parámetro ya visto (el toggle de exoneración, una pestaña,
 *    una página de la tabla) repinta al instante desde memoria en vez de
 *    esperar otro viaje al servidor. El valor sigue viniendo del motor —no se
 *    duplica lógica de nómina en el cliente—, solo se evita volver a pedirlo.
 *    Igual se revalida en segundo plano para no servir datos viejos.
 *
 * Uso:
 *   const { datos, cargando, error, refrescar } = useDatos(
 *     `costos:${exonerado}`,
 *     () => obtenerCostos(exonerado),
 *   );
 */
export function useDatos<T>(
  clave: string,
  cargar: () => Promise<T>,
  opciones: { cache?: Map<string, unknown> } = {},
) {
  // Caché viva mientras el componente esté montado (o compartida si el
  // llamador pasa la suya). No es un store global a propósito: al salir de la
  // sección los datos se sueltan y la próxima visita trae valores frescos.
  const cacheLocal = useRef<Map<string, unknown>>(new Map());
  const cache = opciones.cache ?? cacheLocal.current;

  const [datos, setDatos] = useState<T | null>(() => (cache.get(clave) as T) ?? null);
  const [error, setError] = useState<string | null>(null);
  // Solo mostramos el esqueleto cuando NO hay nada que pintar. Si ya había un
  // valor cacheado, la revalidación ocurre en silencio (sin parpadeo).
  const [cargando, setCargando] = useState(!cache.has(clave));

  const secuencia = useRef(0);
  // `cargar` suele ser una lambda nueva en cada render; guardarla en un ref
  // evita que el efecto se reencadene infinitamente sin obligar al llamador a
  // envolverla en useCallback.
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const ejecutar = useCallback(
    async (opts: { silencioso?: boolean } = {}) => {
      const mio = ++secuencia.current;
      if (!opts.silencioso) setCargando(true);
      try {
        const r = await cargarRef.current();
        if (mio !== secuencia.current) return; // llegó tarde: ya hay otra petición en curso
        cache.set(clave, r);
        setDatos(r);
        setError(null);
      } catch (e) {
        if (mio !== secuencia.current) return;
        setError(e instanceof Error ? e.message : "Error al cargar datos");
      } finally {
        if (mio === secuencia.current) setCargando(false);
      }
    },
    [clave, cache],
  );

  useEffect(() => {
    const enCache = cache.get(clave) as T | undefined;
    if (enCache !== undefined) {
      setDatos(enCache); // pintado inmediato
      setCargando(false);
      void ejecutar({ silencioso: true }); // y revalida por detrás
    } else {
      setDatos(null);
      void ejecutar();
    }
    // Al desmontar (o al cambiar de clave) invalida la secuencia para que una
    // respuesta en vuelo no escriba estado después. El linter avisa por leer
    // `.current` en el cleanup, pero esa regla apunta a refs de nodos del DOM:
    // aquí el contador vivo es justamente lo que queremos incrementar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      secuencia.current++;
    };
  }, [clave, ejecutar, cache]);

  return { datos, cargando, error, refrescar: () => ejecutar() };
}
