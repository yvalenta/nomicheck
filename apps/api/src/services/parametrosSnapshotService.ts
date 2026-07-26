// Snapshot firmado de los parámetros legales vigentes (listing de Fase 1 del
// marketplace: "Parámetros Nómina Colombia").
//
// A diferencia de los otros wrappers, este NO recibe input: la salida es la
// misma para todos los compradores durante toda la vigencia de las reglas. Eso
// lo hace cacheable y —lo importante— **publicable como archivo estático**: se
// genera una vez, se pinea en IPFS y se sirve desde el borde, sin que el
// comprador tenga que llegar a este servidor.
//
// El valor no está en los números (son públicos: DIAN, decretos). Está en que
// vienen firmados, fechados y con el hash del catálogo que los produjo — un
// agente puede citarlos ante un tercero sin tener que confiar en nosotros.
import { crearResolutorReglas } from "@pv/reglas";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { hashCatalogo, REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";
import { firmarPayload, type FirmaBatch } from "./batchSignatureService.js";

export interface ParametroPublicado {
  clave: string;
  valor: number;
  unidad: "pesos" | "porcentaje" | "smlmv" | "uvt" | "horas" | "factor";
  descripcion: string;
  referenciaLegal: string;
}

export interface ParametrosSnapshotOutput {
  version: "1";
  generadoEn: string;
  vigenteDesde: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  parametros: ParametroPublicado[];
  derivados: {
    auxilioTransporteTopePesos: number;
    ibcTopePesos: number;
    fondoSolidaridadUmbralPesos: number;
    retencionUmbralAproxPesos: number;
  };
  signature: FirmaBatch;
}

const DISCLAIMER =
  "Parámetros legales de nómina y retención en la fuente de Colombia, tomados del " +
  "catálogo normativo verificado al " +
  REGLAS_VERIFICADAS_AL +
  ". Informativo: no constituye asesoría tributaria ni dictamen contable (Ley 43/1990). " +
  "Los valores cambian por decreto; verificar la vigencia contra reglasVerificadasAl antes " +
  "de usarlos en un cálculo con efectos legales.";

// Metadatos de publicación: qué es cada clave y de dónde sale. Sin esto el
// snapshot es una lista de números sin contexto — y el contexto legal es
// justamente lo que se está vendiendo.
const CATALOGO_PUBLICO: Array<Omit<ParametroPublicado, "valor">> = [
  {
    clave: "smlmv",
    unidad: "pesos",
    descripcion: "Salario mínimo legal mensual vigente",
    referenciaLegal: "Decreto de salario mínimo vigente",
  },
  {
    clave: "uvt",
    unidad: "pesos",
    descripcion: "Unidad de Valor Tributario — base de todo cálculo de retención",
    referenciaLegal: "E.T. art. 868, resolución DIAN anual",
  },
  {
    clave: "auxilio_transporte",
    unidad: "pesos",
    descripcion: "Auxilio de transporte mensual",
    referenciaLegal: "Ley 15 de 1959, decreto anual",
  },
  {
    clave: "auxilio_transporte_tope_smlmv",
    unidad: "smlmv",
    descripcion: "Tope salarial para tener derecho al auxilio de transporte",
    referenciaLegal: "Decreto de salario mínimo vigente",
  },
  {
    clave: "aporte_salud_empleado",
    unidad: "porcentaje",
    descripcion: "Aporte del empleado al sistema de salud sobre el IBC",
    referenciaLegal: "Ley 100 de 1993, art. 204",
  },
  {
    clave: "aporte_pension_empleado",
    unidad: "porcentaje",
    descripcion: "Aporte del empleado al sistema de pensiones sobre el IBC",
    referenciaLegal: "Ley 100 de 1993, art. 20",
  },
  {
    clave: "fondo_solidaridad_umbral_smlmv",
    unidad: "smlmv",
    descripcion: "IBC a partir del cual se cotiza al fondo de solidaridad pensional",
    referenciaLegal: "Ley 100 de 1993, art. 27",
  },
  {
    clave: "ibc_tope_smlmv",
    unidad: "smlmv",
    descripcion: "Tope del ingreso base de cotización",
    referenciaLegal: "Ley 100 de 1993",
  },
  {
    clave: "recargo_nocturno",
    unidad: "porcentaje",
    descripcion: "Recargo por trabajo nocturno",
    referenciaLegal: "CST art. 168",
  },
  {
    clave: "recargo_dominical",
    unidad: "porcentaje",
    descripcion: "Recargo por trabajo dominical o festivo",
    referenciaLegal: "CST art. 179 (Ley 2466 de 2025)",
  },
  {
    clave: "hora_extra_diurna",
    unidad: "porcentaje",
    descripcion: "Recargo de hora extra diurna",
    referenciaLegal: "CST art. 168",
  },
  {
    clave: "hora_extra_nocturna",
    unidad: "porcentaje",
    descripcion: "Recargo de hora extra nocturna",
    referenciaLegal: "CST art. 168",
  },
  {
    clave: "divisor_hora_ordinaria",
    unidad: "horas",
    descripcion: "Horas mensuales para derivar el valor de la hora ordinaria",
    referenciaLegal: "CST art. 161 (Ley 2101 de 2021)",
  },
  {
    clave: "max_horas_extra_dia",
    unidad: "horas",
    descripcion: "Máximo legal de horas extra por día",
    referenciaLegal: "CST art. 167",
  },
  {
    clave: "max_horas_extra_semana",
    unidad: "horas",
    descripcion: "Máximo legal de horas extra por semana",
    referenciaLegal: "CST art. 167",
  },
  {
    clave: "limite_deduccion_dependientes_uvt_mes",
    unidad: "uvt",
    descripcion: "Tope mensual de la deducción por dependientes",
    referenciaLegal: "E.T. art. 387",
  },
  {
    clave: "limite_deduccion_salud_uvt_mes",
    unidad: "uvt",
    descripcion: "Tope mensual de la deducción por medicina prepagada",
    referenciaLegal: "E.T. art. 387",
  },
  {
    clave: "limite_renta_exenta_laboral_uvt_mes",
    unidad: "uvt",
    descripcion: "Tope mensual de la renta exenta laboral del 25%",
    referenciaLegal: "E.T. art. 206 num. 10",
  },
  {
    clave: "limite_rentas_exentas_porcentaje",
    unidad: "porcentaje",
    descripcion: "Tope porcentual conjunto de rentas exentas y deducciones",
    referenciaLegal: "E.T. art. 336 (Ley 2277 de 2022)",
  },
  {
    clave: "limite_rentas_exentas_uvt_anual",
    unidad: "uvt",
    descripcion: "Tope anual conjunto de rentas exentas y deducciones",
    referenciaLegal: "E.T. art. 336 (Ley 2277 de 2022)",
  },
  {
    clave: "limite_porcentaje_afc",
    unidad: "porcentaje",
    descripcion: "Tope porcentual de aportes voluntarios AFC y pensión",
    referenciaLegal: "E.T. art. 126-1 y 126-4",
  },
  {
    clave: "limite_anual_uvt_afc",
    unidad: "uvt",
    descripcion: "Tope anual de aportes voluntarios AFC y pensión",
    referenciaLegal: "E.T. art. 126-1 y 126-4",
  },
  {
    clave: "limite_deducciones_salario",
    unidad: "porcentaje",
    descripcion: "Límite de deducciones sobre el salario sin autorización escrita",
    referenciaLegal: "CST art. 149",
  },
  {
    clave: "embargo_alimentos_pct_max",
    unidad: "porcentaje",
    descripcion: "Porcentaje máximo embargable por deuda de alimentos",
    referenciaLegal: "CST art. 156",
  },
  {
    clave: "embargo_ordinario_fraccion_excedente",
    unidad: "factor",
    descripcion: "Fracción embargable del excedente sobre el SMLMV",
    referenciaLegal: "CST art. 155",
  },
];

export async function generarParametrosSnapshot(): Promise<ParametrosSnapshotOutput> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);
  const reglasHash = hashCatalogo(reglas, festivos);
  const hoy = new Date().toISOString().slice(0, 10);

  const parametros: ParametroPublicado[] = [];
  for (const meta of CATALOGO_PUBLICO) {
    // Una regla del catálogo puede no estar vigente hoy (entra en vigor a
    // futuro, o fue derogada). Se omite en vez de publicar un valor inventado.
    try {
      parametros.push({ ...meta, valor: resolutor.en(meta.clave, hoy) });
    } catch {
      continue;
    }
  }

  const valor = (clave: string): number =>
    parametros.find((p) => p.clave === clave)?.valor ?? 0;

  const smlmv = valor("smlmv");
  const uvt = valor("uvt");

  return firmarSnapshot({
    version: "1" as const,
    generadoEn: new Date().toISOString(),
    vigenteDesde: hoy,
    reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
    reglasHash,
    disclaimer: DISCLAIMER,
    parametros,
    // Valores que el comprador calcularía igual, precomputados para ahorrarle
    // el paso y —más importante— para fijar la interpretación correcta de cada
    // tope (en SMLMV vs en pesos es una fuente clásica de error).
    derivados: {
      auxilioTransporteTopePesos: Math.round(smlmv * valor("auxilio_transporte_tope_smlmv")),
      ibcTopePesos: Math.round(smlmv * valor("ibc_tope_smlmv")),
      fondoSolidaridadUmbralPesos: Math.round(smlmv * valor("fondo_solidaridad_umbral_smlmv")),
      retencionUmbralAproxPesos: Math.round(uvt * 95),
    },
  });
}

function firmarSnapshot(
  sinFirma: Omit<ParametrosSnapshotOutput, "signature">
): ParametrosSnapshotOutput {
  return { ...sinFirma, signature: firmarPayload(sinFirma) };
}

export { DISCLAIMER as DISCLAIMER_PARAMETROS };
