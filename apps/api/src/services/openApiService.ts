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
import { PRECIOS_USD, leerConfigX402 } from "../lib/x402Config.js";
import { CONTACTO } from "../lib/contacto.js";

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
    resumen: "Settle a full payroll period",
    schema: batchLiquidarSchema,
    nombre: "BatchLiquidarInput",
    descripcion:
      "Settles a period for N employees and contractors: accruals, surcharges, overtime, " +
      "statutory deductions and provisions. Every line cites its norm. Surcharges and the " +
      "ordinary-hour divisor resolve BY THE PERIOD'S DATE, not today's, so a retroactive " +
      "period is settled with the values that were in force back then.",
  },
  {
    ruta: "/retencion",
    id: "withholding-tax",
    resumen: "Compute withholding tax on salaries (retención en la fuente)",
    schema: batchRetencionSchema,
    nombre: "BatchRetencionInput",
    descripcion:
      "The art. 383/388 (Estatuto Tributario) base adjustment from numeric parameters only. The " +
      "input is anonymous by design: no name, no national ID. Floor at 2023 — before that " +
      "date it throws instead of returning a plausible, wrong number, because Law 2277 of " +
      "2022 changed the caps and unified the bracket table.",
  },
  {
    ruta: "/verificar",
    id: "payslip-verification",
    resumen: "Verify whether a payslip is correctly settled",
    schema: batchVerificacionSchema,
    nombre: "BatchVerificacionInput",
    descripcion:
      "Independently recomputes the statutory lines of a transcribed payslip and compares " +
      "them against what it declares, flagging missing lines and discrepancies with their norm.",
  },
  {
    ruta: "/liquidacion-final",
    id: "final-settlement",
    resumen: "Settle a terminated contract (final settlement)",
    schema: batchLiquidacionFinalSchema,
    nombre: "BatchLiquidacionFinalInput",
    descripcion:
      "Severance (cesantías), its interest, prima and pending vacation at termination, plus " +
      "the indemnity if requested. Each concept settles from ITS own cutoff, because they are " +
      "not paid on the same cycle: settling them all from the hire date pays again what was " +
      "already paid. The caller declares the history; whatever it omits is assumed as the " +
      "simple case and the assumption comes back explicit in `supuestos`. Mind two absences " +
      "that are NOT zeros: omitting `indemnizacion` means it was not requested (and the " +
      "response says so in `noSolicitado`), and `auxilioTransporte` is a boolean — the amount " +
      "is resolved by the server against the signed catalog at the termination date.",
  },
  {
    ruta: "/pago-onchain",
    id: "usdc-contractor-payout",
    resumen: "Build a USDC payout batch on Base",
    schema: batchPagoOnchainSchema,
    nombre: "BatchPagoOnchainInput",
    descripcion:
      "Converts COP amounts to USDC with a frozen rate and builds the payment links. It does " +
      "NOT custody or sign: the server never moves funds — it only produces the batch the " +
      "payer signs with their own wallet.",
  },
] as const;

const SOBRE_DESC =
  "Every response travels in the same verifiable envelope: `reglasHash` (sha256 of the " +
  "legal catalog that produced the result), `reglasVerificadasAl`, `disclaimer`, a habeas " +
  "data notice and an Ed25519 signature over the payload. The public key is at " +
  "`/publickey`, so a third party can verify the result without calling the server again " +
  "and without trusting it.";

export function construirOpenApi(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  // El estado del muro NO se escribe a mano acá. Este documento lo SIRVE un
  // endpoint público, así que una frase como "hoy está apagado" se vuelve una
  // mentira publicada el día que se encienda — y nadie relee el OpenAPI. Se lee
  // de la misma config que monta el muro, que es la única que sabe la verdad.
  const muro = leerConfigX402();
  const precioDe = (ruta: string): number | undefined => PRECIOS_USD[ruta];
  const cobra = (ruta: string): boolean => muro.activo && precioDe(ruta) !== undefined;

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
      "200": { description: "Signed result." },
      "400": { description: "`invalid_input` — the body does not meet the v1 contract." },
      "402": {
        description: cobra(op.ruta)
          ? `Payment required (x402): USD ${precioDe(op.ruta)?.toFixed(2)} per call on ` +
            `${muro.redes.map((r) => `\`${r.caip2}\``).join(" or ")}. The 402 carries \`accepts\` with ` +
            "one entry per network — the token, the amount and the EIP-712 domain to sign " +
            "with; the buyer picks one. See `securitySchemes.x402`."
          : "Payment required (x402). Only while the paywall is on; it is currently off and " +
            "these operations answer without payment. The 402 body carries `accepts` with the " +
            "network, token and amount — see `securitySchemes.x402`.",
      },
      "500": { description: "`internal_error`." },
    };

    // `security` va POR OPERACIÓN y no arriba: los GET de integración
    // (`/publickey`, `/parametros`, `/schema/v1.json`, `/ejemplo`) son gratis a
    // propósito, y un `security` global los marcaría como pagos.
    const seguridad = cobra(op.ruta) ? { security: [{ x402: [] }] } : {};

    // Extensión `x-` con el precio EN NÚMERO. La descripción del 402 ya lo dice
    // en prosa, y esa prosa es para humanos: un cliente que quiera pintar
    // "free" o "US$0,02" tendría que parsear una frase en prosa, que es la
    // clase de acoplamiento que se rompe al reescribir una palabra. Sale de
    // `PRECIOS_USD`, así que sigue habiendo un solo sitio donde vive el precio.
    const x402 = {
      "x-x402": {
        cobra: cobra(op.ruta),
        precioUsd: precioDe(op.ruta) ?? null,
        // `redes` en plural y en array: el muro puede anunciar varias y el
        // comprador elige. Se conserva `red`/`asset` en singular con la PRIMERA
        // porque son campos publicados que un cliente ya puede estar leyendo —
        // quitarlos sería romperle el contrato a alguien para ahorrar dos líneas.
        red: muro.activo ? muro.redes[0].caip2 : null,
        asset: muro.activo ? muro.redes[0].asset : null,
        redes: muro.activo
          ? muro.redes.map((r) => ({ red: r.caip2, asset: r.asset, nombre: r.nombre }))
          : null,
      },
    };

    paths[op.ruta] = {
      post: {
        operationId: op.id,
        summary: op.resumen,
        description: `${op.descripcion}\n\n${SOBRE_DESC}`,
        tags: ["listings"],
        requestBody: cuerpo,
        responses: respuestas,
        ...seguridad,
        ...x402,
      },
    };

    // El gemelo CSV de cada listing: mismo input, salida plana para pegar en
    // una hoja de cálculo con la trazabilidad en comentarios `#`.
    paths[`${op.ruta}/csv`] = {
      post: {
        operationId: `${op.id}-csv`,
        summary: `${op.resumen} (CSV output)`,
        description:
          "Same input and same calculation as the JSON operation; returns `text/csv` with the " +
          "hash, the signature and the disclaimer as leading `#` comments, so traceability is " +
          "not lost when pasted into an email or attached to a settlement.",
        tags: ["listings"],
        requestBody: cuerpo,
        // El `/csv` tiene el MISMO muro y el MISMO precio que su ruta base: si
        // no, pedir el CSV sería la forma gratis de saltárselo. Documentar acá
        // el 402 es lo que impide que un cliente lo descubra a los golpes.
        responses: { "200": { description: "CSV." }, "400": respuestas["400"], "402": respuestas["402"] },
        ...seguridad,
        ...x402,
      },
    };
  }

  paths["/parametros"] = {
    get: {
      operationId: "legal-parameters",
      summary: "Signed snapshot of the statutory parameters in force",
      description:
        "The 25 parameters the engine resolves, each with its unit, its description and its " +
        "legal reference, signed and carrying the catalog hash.\n\n" +
        "With `?fecha=YYYY-MM-DD` it resolves against the **validity history**, seeded from " +
        "2020: asking for `2024-03-15` returns the minimum wage and allowance that governed " +
        "that day, not today's. It is what a retroactive settlement needs — and above all " +
        "whoever AUDITS a retroactive settlement someone else computed. Without the " +
        "parameter, today.\n\n" +
        "Keys with no value on the requested date are not silently omitted: they come back " +
        "in `noVigentes` with the reason. Asking for 2021 returns 22 parameters and not 25, " +
        "because the withholding caps start in 2023 (Law 2277 of 2022), and a shorter list " +
        "goes unnoticed if nobody names it.\n\n" +
        SOBRE_DESC,
      tags: ["catalog"],
      parameters: [
        {
          name: "fecha",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "Day to resolve the values at (YYYY-MM-DD). Omitted = today. The date travels " +
            "signed in `vigenteDesde`, so a 2024 snapshot cannot pass itself off as " +
            "today's.",
        },
      ],
      responses: {
        "200": { description: "Signed snapshot, resolved to `vigenteDesde`." },
        "400": { description: "`invalid_input` — `fecha` is not YYYY-MM-DD." },
        "500": { description: "`parametros_no_disponibles`." },
      },
    },
  };

  paths["/publickey"] = {
    get: {
      operationId: "public-key",
      summary: "Ed25519 public key that verifies every response",
      description:
        "Returns the public key PEM and its `publicKeyId` (first 16 bytes of the DER's " +
        "sha256, hex). With it any third party verifies offline the signature of everything " +
        "this wrapper emits — without calling the server again and without trusting it. The " +
        "same key is declared in the agent card at " +
        "`https://ynt.codes/.well-known/agent-card.json`, which is the out-of-band cross-" +
        "check: if this route and the card do not match, verify nothing.",
      tags: ["catalog"],
      responses: {
        "200": { description: "PEM and `publicKeyId`." },
        "404": { description: "Nonexistent route." },
      },
    },
  };

  paths["/health"] = {
    get: {
      operationId: "health",
      summary: "Wrapper status, rules ledger and active guards",
      description:
        "Actually queries the rules ledger — not a ping: it answers the current " +
        "`reglasHash`, `reglasVerificadasAl` and which guards are active. It is the free GET " +
        "a buyer makes before paying, because it hands the hash the response will later be " +
        "audited against; if this route answers 503, the legal catalog could not be read and " +
        "paying for a call makes no sense.",
      tags: ["catalog"],
      responses: {
        "200": { description: "Status." },
        "503": { description: "`unavailable` — the legal catalog could not be read." },
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "NomiCheck — verifiable Colombian payroll engine",
      version: "1.0.0",
      description:
        "Colombian labor law as a dated, verifiable catalog — plus the engine that applies " +
        "it.\n\n" +
        "**The catalog is the substrate.** Any statutory parameter resolvable at any date " +
        "since 2020 — minimum wage, transport allowance, UVT, surcharges, workday divisor, " +
        "caps — each with the norm that set it and the window in which it applied. The " +
        "numbers are public; the dated, sourced, maintained and signed history is not.\n\n" +
        "On top of it, five deterministic calculations: every line cites its norm, every " +
        "response carries the hash of the catalog that produced it and ships Ed25519-" +
        "signed.\n\n" +
        "**Stateless.** JSON in, JSON out: the input is processed in memory and discarded, " +
        "never written to a database (Colombian Law 1581 of 2012, habeas data).\n\n" +
        `Legal catalog verified as of ${REGLAS_VERIFICADAS_AL}. The human spec of every rule ` +
        "lives in the repository's `sdd/vault/`, and the map of which file backs each line " +
        "is in `07_Trazabilidad_Codigo.md`.",
      // De lib/contacto.ts, que es la fuente única: /contact cita el mismo
      // correo, y dos copias a mano son dos lugares donde desincronizarse.
      contact: { name: CONTACTO.nombre, url: CONTACTO.url, email: CONTACTO.email },
      license: { name: "Proprietary — use permitted under the listing terms" },
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
            "Pay per call over HTTP 402 (x402). The server answers 402 with `accepts` — " +
            "network, token, amount and the token's EIP-712 domain in `extra` —, the client " +
            "signs an EIP-3009 authorization and retries attaching it. The payment is " +
            "immediate and final: no escrow, no dispute — which is why every output ships " +
            "signed.\n\n" +
            // La línea del payTo "anclado" existe porque el pago es final: un 402
            // interceptado que cambie el payTo se lleva la plata sin dejar rastro
            // del lado del comprador. El cruce contra el agent card —servido desde
            // otro dominio y anclado on-chain por el tokenURI del NFT— es la única
            // verificación out-of-band que un comprador puede hacer en un paso.
            "**Before signing, cross-check the `payTo` of every `accepts` entry against " +
            "the `walletAddress` in `https://ynt.codes/.well-known/agent-card.json`.** An " +
            "x402 payment is final; an intercepted 402 gives itself away exactly there.\n\n" +
            (muro.activo
              ? `Paywall **on** at ${muro.redes
                  .map((r) => `\`${r.caip2}\` (token \`${r.asset}\`)`)
                  .join(" and ")}. The ` +
                "operations marked with this scheme charge; everything else stays free."
              : "**The paywall is currently off**, so these operations answer without " +
                "payment; the scheme stays declared so a client knows what to expect when " +
                "it turns on."),
        },
      },
    },
    // Vacío = el DEFAULT del documento es sin autenticación, y el linter lo
    // exige explícito en vez de por omisión — con razón: "no dice nada" y "dice
    // que es abierto" no son lo mismo para quien integra. Lo que cobra lo dice
    // cada operación en su propio `security`, porque los GET de integración
    // siguen siendo gratis con el muro encendido.
    security: [],
    // El catálogo va primero: no es metadata de los cálculos, es de donde salen.
    tags: [
      {
        name: "catalog",
        description:
          "The dated, signed legal parameters, and everything needed to verify any response " +
          "without calling the server again.",
      },
      { name: "listings", description: "The five calculations built on that catalog." },
    ],
    paths,
  };
}
