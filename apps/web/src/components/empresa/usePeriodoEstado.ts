import { useEffect, useRef, useState } from "react";
import { obtenerEstadoLiquidacion, type EstadoLiquidacion, type EstadoPeriodo } from "../../apiEmpresa";

import { TERMINALES } from "./estadosPeriodo";

/**
 * Polling controlado: solo consulta el estado mientras `activo=true`
 * (el consumidor lo habilita cuando el periodo está expandido). Se detiene
 * en cuanto el estado es terminal. Intervalo por defecto 3s (SDD §04 —
 * push en vivo está fuera de scope; polling corto es la elección correcta,
 * no un fallback).
 */
export function usePeriodoEstado(
  periodoId: number,
  activo: boolean,
  intervaloMs = 3000
): { estado: EstadoLiquidacion | null; error: string | null } {
  const [estado, setEstado] = useState<EstadoLiquidacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref al último estado para leer el valor terminal sin reencadenar el efecto.
  const ultimoEstado = useRef<EstadoPeriodo | null>(null);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    let timeoutId: number | null = null;

    async function tick() {
      try {
        const nuevo = await obtenerEstadoLiquidacion(periodoId);
        if (cancelado) return;
        setEstado(nuevo);
        ultimoEstado.current = nuevo.estado;
        setError(null);
        if (!TERMINALES.includes(nuevo.estado)) {
          timeoutId = window.setTimeout(tick, intervaloMs);
        }
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : "Error al consultar estado");
        // Reintenta con backoff simple: mismo intervalo, no acumulamos delay.
        timeoutId = window.setTimeout(tick, intervaloMs);
      }
    }

    tick();
    return () => {
      cancelado = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [periodoId, activo, intervaloMs]);

  return { estado, error };
}
