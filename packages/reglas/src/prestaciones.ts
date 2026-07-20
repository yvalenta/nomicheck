import type { DatosPrestaciones, ResultadoPrestaciones } from "./types.js";
import { redondearPeso } from "./numero.js";
import { rangoFechas, validarPeriodo } from "./utils.js";
import { DIAS_ANO_COMERCIAL, DIAS_MAX_SEMESTRE_PRIMA, DIVISOR_VACACIONES, PCT_INTERES_CESANTIAS } from "./constantes.js";

// Cesantías (CST art. 249), intereses sobre cesantías (Ley 52 de 1975, art.
// 1), prima de servicios (CST art. 306, mod. Ley 1788 de 2016) y vacaciones
// (CST art. 186). A diferencia de las dos calculadoras Strategy (por
// periodo de pago), esto se calcula sobre el TIEMPO SERVIDO — se invoca una
// vez por corte de provisión o liquidación, no por nómina quincenal/mensual.

function diasEnRango(desde: string, hasta: string, excluir: Set<string>): number {
  return rangoFechas(desde, hasta).filter((f) => !excluir.has(f)).length;
}

// Promedio del salario para efectos prestacionales (CST art. 253): si el
// salario es fijo, es él mismo; si varía, el promedio de lo devengado en
// los últimos 12 meses, o del tiempo servido si es menor a un año — el
// llamador decide cuántos meses incluir en `devengosVariables` según cuál
// aplique.
function salarioBasePrestacional(datos: DatosPrestaciones): number {
  if (!datos.devengosVariables || datos.devengosVariables.length === 0) {
    return datos.salarioBase;
  }
  const total = datos.devengosVariables.reduce((s, d) => s + d.valor, 0);
  return total / datos.devengosVariables.length;
}

// Días trabajados de un semestre calendario (ene-jun / jul-dic) que caen
// dentro de [fechaIngreso, fechaCorte], topados a DIAS_MAX_SEMESTRE_PRIMA
// aunque el semestre real tenga más (ej. 181 días en un semestre bisiesto).
function diasSemestrePrima(
  semestreDesde: string,
  semestreHasta: string,
  fechaIngreso: string,
  fechaCorte: string,
  excluir: Set<string>
): number {
  const desde = semestreDesde > fechaIngreso ? semestreDesde : fechaIngreso;
  const hasta = semestreHasta < fechaCorte ? semestreHasta : fechaCorte;
  if (desde > hasta) return 0;
  return Math.min(diasEnRango(desde, hasta, excluir), DIAS_MAX_SEMESTRE_PRIMA);
}

export function calcularPrestacionesSociales(datos: DatosPrestaciones): ResultadoPrestaciones {
  validarPeriodo(datos.fechaIngreso, datos.fechaCorte);

  const excluir = new Set(datos.diasSuspension ?? []);
  const diasTrabajadosAcumulado = diasEnRango(datos.fechaIngreso, datos.fechaCorte, excluir);

  const salarioOrdinario = salarioBasePrestacional(datos);
  // Ley 1ª de 1963, art. 7: el auxilio de transporte "se entiende incorporado
  // al salario para todos los efectos" — en la práctica esto se aplica a
  // cesantías (CST art. 249) y prima (CST art. 306), NO a vacaciones: la
  // doctrina y jurisprudencia (CSJ) excluyen el auxilio de la base de
  // vacaciones porque compensa un gasto de transporte que no se causa
  // mientras el trabajador está de vacaciones.
  const salarioConAuxilio = salarioOrdinario + (datos.auxilioTransporte ?? 0);

  const cesantias = redondearPeso((salarioConAuxilio * diasTrabajadosAcumulado) / DIAS_ANO_COMERCIAL);
  const interesesCesantias = redondearPeso((cesantias * diasTrabajadosAcumulado * PCT_INTERES_CESANTIAS) / DIAS_ANO_COMERCIAL);
  const vacaciones = redondearPeso((salarioOrdinario * diasTrabajadosAcumulado) / DIVISOR_VACACIONES);

  // Prima: suma por cada semestre calendario (ene-jun, jul-dic) traslapado
  // con el tiempo servido, cada uno topado a 180 días.
  let diasPrima = 0;
  const anioIngreso = Number(datos.fechaIngreso.slice(0, 4));
  const anioCorte = Number(datos.fechaCorte.slice(0, 4));
  for (let anio = anioIngreso; anio <= anioCorte; anio++) {
    diasPrima += diasSemestrePrima(`${anio}-01-01`, `${anio}-06-30`, datos.fechaIngreso, datos.fechaCorte, excluir);
    diasPrima += diasSemestrePrima(`${anio}-07-01`, `${anio}-12-31`, datos.fechaIngreso, datos.fechaCorte, excluir);
  }
  const prima = redondearPeso((salarioConAuxilio * diasPrima) / DIAS_ANO_COMERCIAL);

  return {
    diasTrabajadosAcumulado,
    cesantias,
    interesesCesantias,
    prima,
    vacaciones,
    advertencias: [],
  };
}
