import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Sincroniza un objeto de filtros con la URL (?q=&estado=&page=). Cada key
 * del objeto es un search param independiente. Valor undefined/null/"" borra
 * el param (evita URLs sucias con `?q=&estado=`).
 *
 * Devuelve `[filtros, setFiltros]` con dos formas de actualización:
 *   - setFiltros({ q: "ana" })                  → patch parcial
 *   - setFiltros((prev) => ({ ...prev, page })) → función
 *
 * SPA (SDD §15): al cambiar filtros, el URL se actualiza con `replace` para
 * NO ensuciar el historial con cada tecla (así el back del navegador salta
 * a la pantalla anterior, no letra por letra). Cambios estructurales como
 * paginación se hacen con push explícito por el llamador si lo desea. */
export function useFiltrosUrl<T extends Record<string, string | number | boolean | undefined>>(
  defaults: T
): [T, (patch: Partial<T> | ((prev: T) => Partial<T>)) => void] {
  const [params, setParams] = useSearchParams();

  const filtros = Object.fromEntries(
    Object.entries(defaults).map(([k, def]) => {
      const raw = params.get(k);
      if (raw === null) return [k, def];
      // Coerción por el tipo del default: si el default es número, parseo;
      // si es boolean, comparo con "true". Nunca "true" para strings.
      if (typeof def === "number") return [k, Number(raw)];
      if (typeof def === "boolean") return [k, raw === "true"];
      return [k, raw];
    })
  ) as T;

  const setFiltros = useCallback(
    (patch: Partial<T> | ((prev: T) => Partial<T>)) => {
      const cambio = typeof patch === "function" ? patch(filtros) : patch;
      const next = { ...filtros, ...cambio };
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === null || v === "" || v === (defaults as Record<string, unknown>)[k]) continue;
        search.set(k, String(v));
      }
      setParams(search, { replace: true });
    },
    [filtros, setParams, defaults]
  );

  return [filtros, setFiltros];
}
