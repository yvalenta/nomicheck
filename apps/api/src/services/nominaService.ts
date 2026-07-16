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

// El motor de reglas lee TODAS las reglas/festivos y filtra internamente por
// fecha (reglaEn) — la tabla es pequeña (decenas de filas), así que no vale
// la pena filtrar en la query (SDD.md §05: sin lógica de negocio en la capa
// de datos). Se expone por separado para que la liquidación de un periodo
// (muchos empleados) haga una sola consulta en vez de una por empleado.
export async function obtenerReglasYFestivos(): Promise<{ reglas: ReglaLegal[]; festivos: Festivo[] }> {
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
  return { reglas, festivos };
}

export async function calcularNomina(
  datos: DatosNominaTurnos | DatosNominaFija
): Promise<ResultadoNomina> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const calculadora = datos.modo === "turnos" ? CalculadoraPorTurnos : CalculadoraSalarioFijo;
  return calculadora.calcular(datos, reglas, festivos);
}
