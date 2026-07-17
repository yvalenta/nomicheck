import {
  CalculadoraPorTurnos,
  CalculadoraSalarioFijo,
  type DatosNominaFija,
  type DatosNominaTurnos,
  type Festivo,
  type ReglaLegal,
  type ResultadoNomina,
} from "@pv/reglas";
import { prisma } from "../lib/prisma.js";

// Cache en memoria de reglas/festivos: son datos casi estáticos (cambian
// ~1 vez al año por decreto) pero cada request de /nomina/calcular —
// endpoint anónimo — disparaba 2 queries a Supabase. TTL de 5 minutos
// como respaldo para ediciones por fuera de la API (seed, SQL directo);
// el CRUD admin de reglas (Fase 8) deberá llamar invalidarCacheReglas().
const CACHE_TTL_MS = 5 * 60 * 1000;
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

  const [reglasDb, festivos] = await Promise.all([
    prisma.reglaLegal.findMany(),
    prisma.festivo.findMany(),
  ]);
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
  datos: DatosNominaTurnos | DatosNominaFija
): Promise<ResultadoNomina> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const calculadora = datos.modo === "turnos" ? CalculadoraPorTurnos : CalculadoraSalarioFijo;
  return calculadora.calcular(datos, reglas, festivos);
}
