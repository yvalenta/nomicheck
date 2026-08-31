// `nomicheck_verificar_sobre` — la verificación es LOCAL a propósito.
//
// Todo el valor del sobre firmado es que un tercero lo comprueba SIN volver a
// llamar al servidor y sin confiar en él. Una herramienta que verificara
// "preguntándole a la API si su propia firma vale" destruiría esa propiedad:
// el emisor sería juez de su propia salida. Por eso acá corre la copia
// vendorizada del verificador (`vendor/sobre.mjs`) y la única red opcional es
// bajar la llave pública — y solo si el caller no la trae pinneada.
import { baseUrl, campo, pedirJson } from "./base.js";
// El .mjs vendorizado se importa tal cual: es JavaScript plano sin build, que
// es la promesa del formato (verificable sin instalar nada). `allowJs` en el
// tsconfig existe para esta línea.
import { analizar, veredicto } from "../vendor/sobre.mjs";

export interface CheckSobre {
  id: string;
  critico: boolean;
  ok: boolean;
  detalle: string;
}

export type Veredicto = "verificable" | "firmado_sin_procedencia" | "invalido";

export interface ResultadoSobre {
  veredicto: Veredicto;
  /**
   * Los tres veredictos NO son dos: `firmado_sin_procedencia` existe porque
   * una firma válida no alcanza — un documento firmado sin `reglasHash` dice
   * quién lo dijo, no contra qué se comprueba. Tratarlo como "verificable"
   * es el error que hace inútil a la firma; tratarlo como "inválido" acusa
   * de falsa a una firma que sí verifica.
   */
  explicacion: string;
  checks: CheckSobre[];
  fuenteLlave: string;
}

const EXPLICACIONES: Record<Veredicto, string> = {
  verificable:
    "The Ed25519 signature verifies against the key, the declared publicKeyId corresponds to " +
    "that key, and the envelope carries its full provenance (reglasHash, reglasVerificadasAl, habeasData).",
  firmado_sin_procedencia:
    "The signature verifies, but the envelope lacks provenance: you know WHO signed it, not " +
    "against WHICH catalog it is checked. It is a signed opinion, not a verifiable result.",
  invalido:
    "A critical check failed: the signature does not verify against this key, or the declared " +
    "publicKeyId does not correspond to it. Do not trust any field of the document.",
};

export async function verificarSobre(
  documento: Record<string, unknown>,
  llavePublicaPem?: string,
): Promise<ResultadoSobre> {
  let pem = llavePublicaPem;
  let fuenteLlave = "key provided by the caller (pinned — the strong case)";

  if (pem === undefined) {
    // Bajar la llave del MISMO origen que emitió el sobre es el caso débil:
    // sirve para el primer contacto, pero un servidor comprometido firma con
    // una llave y la publica junto al sobre, y todo "verifica". Se hace
    // igual — es mejor que nada — y se DICE, para que el caller sepa qué
    // grado de confianza acaba de comprar.
    const url = `${baseUrl()}/api/batch/publickey`;
    const respuesta = await pedirJson(url);
    const publicada = campo(respuesta, "publicKeyPem");
    if (typeof publicada !== "string" || publicada.length === 0) {
      throw new Error(`${url} did not carry \`publicKeyPem\`; there is nothing to verify against.`);
    }
    pem = publicada;
    fuenteLlave =
      `${url} (fetched just now — same origin as the envelope, so this proves consistency, ` +
      "not identity; pin the key for the strong case)";
  }

  const checks = analizar(documento, pem) as CheckSobre[];
  const v = veredicto(checks) as Veredicto;

  return { veredicto: v, explicacion: EXPLICACIONES[v], checks, fuenteLlave };
}
