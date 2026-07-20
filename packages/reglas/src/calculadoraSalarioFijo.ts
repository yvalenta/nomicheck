import type { CalculadoraNomina, ConceptoNomina, DatosNominaFija, LineaResultado } from "./types.js";
import { redondearPeso } from "./numero.js";
import { aplicarDeducciones } from "./deducciones.js";
import { ensamblarResultado } from "./ensamblarResultado.js";
import { calcularAuxilioTransporte } from "./auxilio.js";
import {
  advertenciaIbcTiempoParcial,
  advertenciaPatronAprendiz,
  advertenciaSalarioBajoMinimo,
  advertenciaTerminoNoIndefinido,
} from "./advertenciasContrato.js";
import { rangoFechas, reglaEn, validarPeriodo } from "./utils.js";
import { DIAS_MES_COMERCIAL } from "./constantes.js";

export const CalculadoraSalarioFijo: CalculadoraNomina = {
  calcular(datos, reglas, _festivos) {
    if (datos.modo !== "salario-fijo") {
      throw new Error("CalculadoraSalarioFijo solo acepta datos en modo 'salario-fijo'");
    }
    const d = datos as DatosNominaFija;
    validarPeriodo(d.periodoDesde, d.periodoHasta);
    if (!(d.salarioBasicoMensual > 0)) {
      throw new Error(`El salario básico mensual debe ser mayor que cero (recibido: ${d.salarioBasicoMensual})`);
    }
    const advertencias: string[] = [];
    const lineas: LineaResultado[] = [];

    const advertenciaAprendiz = advertenciaPatronAprendiz(
      d.salarioBasicoMensual,
      d.tipoContrato,
      reglas,
      d.periodoDesde
    );
    if (advertenciaAprendiz) advertencias.push(advertenciaAprendiz);
    const advertenciaTermino = advertenciaTerminoNoIndefinido(d.tipoContrato);
    if (advertenciaTermino) advertencias.push(advertenciaTermino);
    const advertenciaIbc = advertenciaIbcTiempoParcial(d.salarioBasicoMensual, d.tipoContrato, reglas, d.periodoDesde);
    if (advertenciaIbc) advertencias.push(advertenciaIbc);
    const advertenciaMinimo = advertenciaSalarioBajoMinimo(d.salarioBasicoMensual, d.tipoContrato, reglas, d.periodoDesde);
    if (advertenciaMinimo) advertencias.push(advertenciaMinimo);

    // Aprendizaje SENA (Ley 789 de 2002, art. 30): sigue siendo salario fijo
    // con horario, pero el devengo base no es "salario" sino auxilio de
    // sostenimiento, y las deducciones de ley cambian según la etapa.
    const esAprendiz = d.tipoContrato?.startsWith("aprendizaje_sena");
    const alcanceDeduccionesLey =
      d.tipoContrato === "aprendizaje_sena_lectiva"
        ? "ninguno"
        : d.tipoContrato === "aprendizaje_sena_practica"
          ? "solo_salud"
          : "completo";

    // IBC: salario básico. Los devengos extralegales declarados no afectan
    // el IBC salvo que el usuario los marque salariales — v1 no ofrece esa
    // marca todavía, así que se excluyen siempre.
    const ibc = d.salarioBasicoMensual;

    lineas.push({
      concepto: esAprendiz ? "Auxilio de sostenimiento" : "Salario básico",
      base: redondearPeso(d.salarioBasicoMensual),
      valorCalculado: redondearPeso(d.salarioBasicoMensual),
      tipo: "devengo",
      ley: esAprendiz ? "Ley 789 de 2002, art. 30" : "Contrato de trabajo",
    });

    // Auxilio de transporte: mismo helper que el modo turnos (antes este
    // modo ignoraba recibeAuxilioTransporte por completo — asimetría). Los
    // aprendices SENA no tienen derecho (su auxilio de sostenimiento no es
    // salario).
    if (d.recibeAuxilioTransporte && !esAprendiz) {
      const diasPeriodo = Math.min(rangoFechas(d.periodoDesde, d.periodoHasta).length, DIAS_MES_COMERCIAL);
      const auxilio = calcularAuxilioTransporte(
        d.salarioBasicoMensual,
        diasPeriodo,
        reglas,
        d.periodoHasta
      );
      if (auxilio.linea) lineas.push(auxilio.linea);
      if (auxilio.advertencia) advertencias.push(auxilio.advertencia);
    }

    // Solo se aplica el tope del 50% (CST art. 149) a salud/pensión/fondo:
    // los conceptos declarados abajo (incl. AFC si viene del comprobante)
    // llegan como valores ya extraídos, no como un monto ajustable aquí.
    const { lineas: lineasDeduccionLey, advertencias: advertenciasLey } = aplicarDeducciones(
      d.salarioBasicoMensual,
      ibc,
      reglas,
      d.periodoDesde,
      { alcanceDeduccionesLey }
    );
    lineas.push(...lineasDeduccionLey);
    advertencias.push(...advertenciasLey);

    // Conceptos declarados por el usuario o extraídos del comprobante:
    // devengos extralegales y deducciones por convenio se suman tal cual,
    // sin recalcularlos.
    // Mapa explícito en vez de startsWith("devengo"): si se agrega un tipo
    // de concepto nuevo, el compilador obliga a clasificarlo aquí.
    const clasificacion = {
      "devengo-legal": "devengo",
      "devengo-extralegal": "devengo",
      "deduccion-legal": "deduccion",
      "deduccion-convenio": "deduccion",
    } satisfies Record<ConceptoNomina["tipo"], LineaResultado["tipo"]>;

    for (const c of d.conceptos) {
      const tipo = clasificacion[c.tipo];
      lineas.push({
        concepto: c.nombre,
        base: c.base !== undefined ? redondearPeso(c.base) : undefined,
        valorCalculado: redondearPeso(c.valor),
        tipo,
        ley: c.tipo === "deduccion-legal" ? "Estatuto Tributario" : undefined,
      });

      if (c.tipo === "deduccion-legal" && /retenci[oó]n/i.test(c.nombre)) {
        advertencias.push(
          `"${c.nombre}" no se valida automáticamente en esta versión — la retención en la fuente depende de variables personales (aportes voluntarios, dependientes) que el sistema no conoce.`
        );
      }
    }

    return ensamblarResultado({
      modo: "salario-fijo",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      advertencias,
      valorDia: redondearPeso(d.salarioBasicoMensual / DIAS_MES_COMERCIAL),
      valorHoraOrdinaria: redondearPeso(
        d.salarioBasicoMensual / reglaEn(reglas, "divisor_hora_ordinaria", d.periodoHasta)
      ),
    });
  },
};
