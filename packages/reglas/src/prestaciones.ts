import type { DatosPrestaciones, ResultadoPrestaciones } from "./types.js";
import { redondearPeso } from "./numero.js";
import { rangoFechas, validarPeriodo } from "./utils.js";
import {
  DIAS_ANO_COMERCIAL,
  DIAS_MAX_SEMESTRE_PRIMA,
  DIAS_MES_COMERCIAL,
  DIVISOR_VACACIONES,
  PCT_INTERES_CESANTIAS,
} from "./constantes.js";

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

// Promedio mensual del trabajo suplementario. Se calcula aparte del ordinario
// porque las vacaciones no lo computan (art. 192 num. 1) aunque cesantías y
// prima sí: son dos bases distintas, no una base con un descuento.
function promedioSuplementario(datos: DatosPrestaciones): number {
  const d = datos.devengosSuplementarios;
  if (!d || d.length === 0) return 0;
  return d.reduce((s, x) => s + x.valor, 0) / d.length;
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
  //
  // Y el trabajo suplementario corre al revés: CST art. 192 num. 1 lo excluye
  // EXPRESAMENTE de la remuneración de vacaciones ("el valor del trabajo en
  // días de descanso obligatorio y el valor del trabajo suplementario en horas
  // extras"), pero es salario para cesantías (art. 253) y prima (art. 306).
  // Por eso hay dos bases y no una con un descuento encima.
  const salarioConAuxilio = salarioOrdinario + promedioSuplementario(datos) + (datos.auxilioTransporte ?? 0);

  const cesantias = redondearPeso((salarioConAuxilio * diasTrabajadosAcumulado) / DIAS_ANO_COMERCIAL);
  const interesesCesantias = redondearPeso((cesantias * diasTrabajadosAcumulado * PCT_INTERES_CESANTIAS) / DIAS_ANO_COMERCIAL);

  // Vacaciones: 15 días hábiles por año servido (CST art. 186). El divisor de
  // 720 ya expresa esa proporción sobre el mes comercial, así que los días
  // causados salen de las constantes que ya existen — no hay un "15" suelto.
  const advertencias: string[] = [];
  const diasVacacionesCausados = (diasTrabajadosAcumulado * DIAS_MES_COMERCIAL) / DIVISOR_VACACIONES;
  const diasTomados = datos.diasVacacionesTomados ?? 0;
  if (diasTomados > diasVacacionesCausados) {
    // No se descuenta de otra prestación ni se devuelve un negativo: se paga
    // cero de vacaciones y se avisa, porque un disfrute mayor al causado suele
    // ser un anticipo o un dato mal capturado, y decidirlo no es del motor.
    advertencias.push(
      `Se reportaron ${diasTomados} días de vacaciones disfrutados pero solo se causaron ${
        Math.round(diasVacacionesCausados * 100) / 100
      } en el tiempo servido: las vacaciones pendientes se liquidan en cero, no en negativo.`
    );
  }
  const diasVacacionesPendientes = Math.max(0, diasVacacionesCausados - diasTomados);
  // Se conserva la fórmula original cuando no hay disfrute que restar: es la
  // misma cuenta, pero por otro camino de punto flotante, y los golden tests
  // comparan al peso.
  const vacaciones =
    diasTomados > 0
      ? redondearPeso((salarioOrdinario * diasVacacionesPendientes) / DIAS_MES_COMERCIAL)
      : redondearPeso((salarioOrdinario * diasTrabajadosAcumulado) / DIVISOR_VACACIONES);

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
    diasVacacionesCausados: Math.round(diasVacacionesCausados * 100) / 100,
    baseCesantiasYPrima: redondearPeso(salarioConAuxilio),
    advertencias,
  };
}
