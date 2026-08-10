import {
  CalculadoraPorTurnos,
  CalculadoraSalarioFijo,
  CalculadoraServicios,
  type DatosNominaFija,
  type DatosNominaServicios,
  type DatosNominaTurnos,
  type Festivo,
  type ReglaLegal,
  type ResultadoNomina,
} from "@pv/reglas";
import { prisma } from "../lib/prisma.js";
import { registro } from "../lib/registro.js";

// Cache en memoria de reglas/festivos: son datos casi estáticos (cambian
// ~1 vez al año por decreto) pero cada request de /nomina/calcular —
// endpoint anónimo — disparaba 2 queries a Supabase. TTL de 5 minutos
// como respaldo para ediciones por fuera de la API (seed, SQL directo);
// el CRUD admin de reglas (Fase 8) deberá llamar invalidarCacheReglas().
const CACHE_TTL_MS = 5 * 60 * 1000;

// Cuánto se sigue sirviendo el catálogo vencido cuando la base NO responde.
//
// POR QUÉ EXISTE. Al vencer el TTL, la siguiente petición iba a Supabase y, si
// esa consulta fallaba, el endpoint devolvía 500. Se vio en producción el
// 2026-08-03: `/api/batch/verificar/ejemplo` —público, auditado y de solo
// lectura— dio un 500 y a los segundos veinte 200 seguidos. No era el ejemplo:
// era el refresco del caché cayendo justo en esa petición.
//
// Servir el catálogo anterior es correcto, no un parche: cada respuesta declara
// el `reglasHash` con el que se calculó y viaja firmada, así que un consumidor
// puede ver EXACTAMENTE qué catálogo se usó. Un dato viejo y declarado es
// verificable; un 500 no le sirve a nadie.
//
// El tope existe para que una caída larga siga siendo visible: media hora
// cubre de sobra un hipo del pooler, y más allá de eso la base está caída de
// verdad y eso tiene que doler.
const GRACIA_SIN_BASE_MS = 30 * 60 * 1000;

let cacheReglas: { datos: { reglas: ReglaLegal[]; festivos: Festivo[] }; expira: number } | null =
  null;

export function invalidarCacheReglas(): void {
  cacheReglas = null;
}

// El motor de reglas lee TODAS las reglas/festivos y filtra internamente por
// fecha (reglaEn) — la tabla es pequeña (decenas de filas), así que no vale
// la pena filtrar en la query (SDD.md §05: sin lógica de negocio en la capa
// de datos). Se expone por separado para que la liquidación de un periodo
// (muchos empleados) haga una sola consulta en vez de una por empleado.
export async function obtenerReglasYFestivos(): Promise<{ reglas: ReglaLegal[]; festivos: Festivo[] }> {
  if (cacheReglas && Date.now() < cacheReglas.expira) return cacheReglas.datos;

  let reglasDb;
  let festivos;
  try {
    [reglasDb, festivos] = await Promise.all([
      prisma.reglaLegal.findMany(),
      prisma.festivo.findMany(),
    ]);
  } catch (e) {
    // Sin catálogo previo no hay nada que servir: el error sube tal cual y el
    // llamador devuelve 500, que acá SÍ es la respuesta honesta.
    if (!cacheReglas) throw e;

    const vencido = Date.now() - cacheReglas.expira;
    if (vencido > GRACIA_SIN_BASE_MS) throw e;

    // Se avisa en cada refresco fallido, no una sola vez: un catálogo que se
    // sirve vencido en silencio es indistinguible de uno fresco, y ese es
    // justamente el modo de falla que no se quiere.
    registro.warn(
      "reglas",
      "la base no respondió; sirviendo el catálogo vencido en gracia",
      {
        antiguedadSegundos: Math.round((vencido + CACHE_TTL_MS) / 1000),
        motivo: e instanceof Error ? e.message : String(e),
      }
    );
    return cacheReglas.datos;
  }
  // Prisma modela los campos opcionales como `string | null`; el motor de
  // reglas (TS puro, sin Prisma) espera `string | undefined`.
  const reglas = reglasDb.map((r) => ({
    clave: r.clave,
    valor: r.valor,
    vigenteDesde: r.vigenteDesde,
    vigenteHasta: r.vigenteHasta ?? undefined,
    fuente: r.fuente ?? undefined,
  }));
  const datos = { reglas, festivos };
  cacheReglas = { datos, expira: Date.now() + CACHE_TTL_MS };
  return datos;
}

export async function calcularNomina(
  datos: DatosNominaTurnos | DatosNominaFija | DatosNominaServicios
): Promise<ResultadoNomina> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const calculadora =
    datos.modo === "turnos" ? CalculadoraPorTurnos : datos.modo === "salario-fijo" ? CalculadoraSalarioFijo : CalculadoraServicios;
  return calculadora.calcular(datos, reglas, festivos);
}
