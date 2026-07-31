// Documento OpenAPI 3.0 único sobre el wrapper stateless.
//
// Por qué hace falta si ya hay un `/schema/v1.json` por listing: esos cuatro
// archivos describen la FORMA del input de cada uno, por separado, y nada dice
// que existen ni en qué ruta viven. Un cliente que llega por descubrimiento
// federado (el catálogo ARD del apex) o por MCP espera UN documento que liste
// las operaciones — no cuatro esquemas sueltos que hay que saber buscar.
//
// Se genera de los mismos zod que validan en runtime, no a mano. Un doc escrito
// aparte es un doc que miente en cuanto alguien toca el validador: sería el
// mismo modo de falla que el baúl tuvo con el catálogo legal, y ya se pagó una
// vez.
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { batchLiquidarSchema } from "../validation/batchPublico.js";
import { batchRetencionSchema } from "../validation/batchRetencion.js";
import { batchVerificacionSchema } from "../validation/batchVerificacion.js";
import { batchPagoOnchainSchema } from "../validation/batchPagoOnchain.js";
import { batchLiquidacionFinalSchema } from "../validation/batchLiquidacionFinal.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

const BASE_URL = "https://nomicheck.ynt.codes/api/batch";

/**
 * El cuerpo del schema, listo para colgar de `components.schemas`.
 *
 * `zodToJsonSchema` con `name` devuelve `{$ref: "#/definitions/X", definitions:{...}}`,
 * y ese `#/definitions/...` NO resuelve dentro de un documento OpenAPI, que usa
 * `#/components/schemas/...`. Pegarlo tal cual daba diez `$ref` rotos — lo dijo
 * el linter, no se noto a ojo. Acá se extrae el cuerpo y se cuelga donde
 * corresponde, y las rutas lo referencian por su nombre.
 */
function cuerpoDeSchema(z: ZodTypeAny, nombre: string): Record<string, unknown> {
  const doc = zodToJsonSchema(z, { name: nombre, target: "openApi3", $refStrategy: "none" }) as {
    definitions?: Record<string, unknown>;
  };
  const cuerpo = doc.definitions?.[nombre];
  if (!cuerpo) throw new Error(`zodToJsonSchema no produjo definitions.${nombre}`);
  return cuerpo as Record<string, unknown>;
}

const refA = (nombre: string) => ({ $ref: `#/components/schemas/${nombre}` });

/** Los cinco listings, con lo que cada uno tiene de no obvio. */
const OPERACIONES = [
  {
    ruta: "/liquidar",
    id: "payroll-settlement",
    resumen: "Liquidar una nómina completa de un periodo",
    schema: batchLiquidarSchema,
    nombre: "BatchLiquidarInput",
    descripcion:
      "Liquida un periodo para N empleados y contratistas: devengos, recargos, horas extra, " +
      "deducciones de ley y provisiones. Cada línea cita su norma. Los recargos y el divisor " +
      "de la hora ordinaria se resuelven POR LA FECHA DEL PERIODO, no por la de hoy, así que " +
      "un periodo retroactivo se liquida con los valores que estaban vigentes entonces.",
  },
  {
    ruta: "/retencion",
    id: "withholding-tax",
    resumen: "Calcular retención en la fuente por salarios",
    schema: batchRetencionSchema,
    nombre: "BatchRetencionInput",
    descripcion:
      "Depuración del art. 383/388 del Estatuto Tributario a partir de parámetros numéricos. " +
      "El input es anónimo por diseño: no pide nombre ni documento. Piso de 2023 — antes de " +
      "esa fecha lanza en vez de devolver un número plausible y falso, porque la Ley 2277 de " +
      "2022 cambió los topes y unificó la tabla de tarifas.",
  },
  {
    ruta: "/verificar",
    id: "payslip-verification",
    resumen: "Verificar si un comprobante de nómina está bien liquidado",
    schema: batchVerificacionSchema,
    nombre: "BatchVerificacionInput",
    descripcion:
      "Recalcula de forma independiente las líneas de ley de un comprobante transcrito y las " +
      "compara contra lo declarado, marcando faltantes y discrepancias con su norma.",
  },
  {
    ruta: "/liquidacion-final",
    id: "final-settlement",
    resumen: "Liquidar un contrato terminado",
    schema: batchLiquidacionFinalSchema,
    nombre: "BatchLiquidacionFinalInput",
    descripcion:
      "Cesantías, sus intereses, prima y vacaciones pendientes al retiro, más la indemnización " +
      "si se pide. Cada concepto se liquida desde SU propio corte, porque no se pagan en el " +
      "mismo ciclo: liquidarlos todos desde la fecha de ingreso paga otra vez lo ya pagado. El " +
      "historial lo declara quien llama; lo que no declare se asume en el caso simple y el " +
      "supuesto vuelve explícito en `supuestos`. Ojo con dos ausencias que NO son ceros: omitir " +
      "`indemnizacion` significa que no se pidió (y la respuesta lo dice en `noSolicitado`), y " +
      "`auxilioTransporte` es un booleano — el monto lo resuelve el servidor contra el catálogo " +
      "firmado a la fecha de retiro.",
  },
  {
    ruta: "/pago-onchain",
    id: "usdc-contractor-payout",
    resumen: "Armar un lote de pago en USDC sobre Base",
    schema: batchPagoOnchainSchema,
    nombre: "BatchPagoOnchainInput",
    descripcion:
      "Convierte montos en COP a USDC con una tasa congelada y arma los links de pago. NO " +
      "custodia ni firma: el servidor nunca mueve fondos, solo produce el lote que el pagador " +
      "firma con su propia wallet.",
  },
] as const;

const SOBRE_DESC =
  "Todas las respuestas viajan en el mismo sobre verificable: `reglasHash` (sha256 del " +
  "catálogo legal que produjo el resultado), `reglasVerificadasAl`, `disclaimer`, constancia " +
  "de habeas data y una firma Ed25519 sobre el payload. La llave pública está en " +
  "`/publickey`, así que un tercero puede verificar el resultado sin volver a llamar al " +
  "servidor y sin confiar en él.";

export function construirOpenApi(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  for (const op of OPERACIONES) {
    // Una sola copia del schema, referenciada por la operación JSON y por su
    // gemela CSV: comparten input, así que duplicarlo seria invitar a que se
    // separen.
    schemas[op.nombre] = cuerpoDeSchema(op.schema, op.nombre);
    const cuerpo = {
      required: true,
      content: { "application/json": { schema: refA(op.nombre) } },
    };
    const respuestas = {
      "200": { description: "Resultado firmado." },
      "400": { description: "`invalid_input` — el body no cumple el contrato v1." },
      "402": {
        description:
          "Pago requerido (x402). Solo cuando el muro está encendido; hoy está apagado y estas " +
          "operaciones responden sin pagar. El cuerpo del 402 trae `accepts` con la red, el " +
          "token y el monto — ver `securitySchemes.x402`.",
      },
      "500": { description: "`internal_error`." },
    };

    paths[op.ruta] = {
      post: {
        operationId: op.id,
        summary: op.resumen,
        description: `${op.descripcion}\n\n${SOBRE_DESC}`,
        tags: ["listings"],
        requestBody: cuerpo,
        responses: respuestas,
      },
    };

    // El gemelo CSV de cada listing: mismo input, salida plana para pegar en
    // una hoja de cálculo con la trazabilidad en comentarios `#`.
    paths[`${op.ruta}/csv`] = {
      post: {
        operationId: `${op.id}-csv`,
        summary: `${op.resumen} (salida CSV)`,
        description:
          "Mismo input y mismo cálculo que la operación JSON; devuelve `text/csv` con el hash, " +
          "la firma y el disclaimer como comentarios `#` al inicio, para que la trazabilidad no " +
          "se pierda al pegarlo en un correo o adjuntarlo a una liquidación.",
        tags: ["listings"],
        requestBody: cuerpo,
        responses: { "200": { description: "CSV." }, "400": respuestas["400"] },
      },
    };
  }

  paths["/parametros"] = {
    get: {
      operationId: "legal-parameters",
      summary: "Snapshot firmado de los parámetros legales vigentes",
      description:
        "Los 25 parámetros que el motor resuelve, cada uno con su unidad, su descripción y su " +
        "referencia legal, firmados y con el hash del catálogo.\n\n" +
        "Con `?fecha=YYYY-MM-DD` resuelve contra la **historia de vigencias**, sembrada desde " +
        "2020: pedir `2024-03-15` devuelve el SMLMV y el auxilio que regían ese día, no los de " +
        "hoy. Es lo que necesita una liquidación retroactiva — y sobre todo quien AUDITA una " +
        "liquidación retroactiva que calculó otro. Sin el parámetro, hoy.\n\n" +
        "Las claves sin valor en la fecha pedida no se omiten en silencio: vuelven en " +
        "`noVigentes` con el motivo. Pedir 2021 devuelve 22 parámetros y no 25, porque los " +
        "topes de retención arrancan en 2023 (Ley 2277 de 2022), y una lista más corta no se " +
        "nota si nadie la nombra.\n\n" +
        SOBRE_DESC,
      tags: ["catálogo"],
      parameters: [
        {
          name: "fecha",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "Día al que resolver los valores (YYYY-MM-DD). Omitido = hoy. La fecha viaja " +
            "firmada en `vigenteDesde`, así que un snapshot de 2024 no se puede hacer pasar " +
            "por uno de hoy.",
        },
      ],
      responses: {
        "200": { description: "Snapshot firmado, resuelto a `vigenteDesde`." },
        "400": { description: "`invalid_input` — `fecha` no es YYYY-MM-DD." },
        "500": { description: "`parametros_no_disponibles`." },
      },
    },
  };

  paths["/publickey"] = {
    get: {
      operationId: "public-key",
      summary: "Llave pública Ed25519 con la que se verifican las respuestas",
      tags: ["catálogo"],
      responses: {
        "200": { description: "PEM y `publicKeyId`." },
        "404": { description: "Ruta inexistente." },
      },
    },
  };

  paths["/health"] = {
    get: {
      operationId: "health",
      summary: "Estado del wrapper, ledger de reglas y guards activos",
      tags: ["catálogo"],
      responses: {
        "200": { description: "Estado." },
        "503": { description: "`unavailable` — el catálogo legal no se pudo leer." },
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "NomiCheck — motor de nómina colombiana verificable",
      version: "1.0.0",
      description:
        "Cálculos de nómina y retención colombianos, determinísticos y con procedencia: cada " +
        "línea cita su norma, cada respuesta lleva el hash del catálogo legal que la produjo y " +
        "va firmada con Ed25519.\n\n" +
        "**Sin estado.** Entra JSON, sale JSON: el input se procesa en memoria y se descarta, " +
        "nunca se escribe en una base (Ley 1581 de 2012, habeas data).\n\n" +
        `Catálogo legal verificado al ${REGLAS_VERIFICADAS_AL}. El spec humano de cada regla ` +
        "vive en `sdd/vault/` del repositorio, y el mapa de qué archivo respalda cada línea " +
        "está en `07_Trazabilidad_Codigo.md`.",
      contact: { name: "Ynt-labs", url: "https://ynt.codes", email: "ynt.val@gmail.com" },
      license: { name: "Propietario — uso permitido bajo los términos del listing" },
    },
    servers: [{ url: BASE_URL }],
    components: {
      schemas,
      securitySchemes: {
        // x402 no es un `type` estándar de OpenAPI, así que se declara como el
        // esquema HTTP que realmente es —un 402 con instrucciones de pago— y se
        // explica en la descripción. Declararlo como apiKey sería mentir sobre
        // dónde va el secreto: en x402 no hay secreto, hay un pago firmado.
        x402: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "x402-payment",
          description:
            "Pago por llamada sobre HTTP 402 (x402). El servidor responde 402 con `accepts` " +
            "—red, token y monto—, el cliente paga y reintenta adjuntando el comprobante. " +
            "**Hoy el muro está apagado**, así que estas operaciones responden sin pago; el " +
            "esquema queda declarado para que un cliente sepa qué esperar cuando se encienda.",
        },
      },
    },
    // Vacío = sin autenticación requerida. Es el estado real de hoy, y el
    // linter lo exige explícito en vez de por omisión — con razón: "no dice
    // nada" y "dice que es abierto" no son lo mismo para quien integra.
    security: [],
    tags: [
      { name: "listings", description: "Los cinco cálculos que el wrapper vende." },
      { name: "catálogo", description: "Metadatos para verificar lo que los listings devuelven." },
    ],
    paths,
  };
}
