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
    "La firma Ed25519 verifica contra la llave, el publicKeyId declarado corresponde a esa " +
    "llave, y el sobre trae su procedencia completa (reglasHash, reglasVerificadasAl, habeasData).",
  firmado_sin_procedencia:
    "La firma verifica, pero al sobre le falta procedencia: se sabe QUIÉN lo firmó, no contra " +
    "QUÉ catálogo se comprueba. Es una opinión firmada, no un resultado verificable.",
  invalido:
    "Falló un check crítico: la firma no verifica contra esta llave, o el publicKeyId declarado " +
    "no corresponde a ella. No hay que confiar en ningún campo del documento.",
};

export async function verificarSobre(
  documento: Record<string, unknown>,
  llavePublicaPem?: string,
): Promise<ResultadoSobre> {
  let pem = llavePublicaPem;
  let fuenteLlave = "llave provista por el caller (pinneada — el caso fuerte)";

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
      throw new Error(`${url} no trajo \`publicKeyPem\`; no hay contra qué verificar.`);
    }
    pem = publicada;
    fuenteLlave =
      `${url} (bajada ahora — mismo origen que el sobre, así que esto prueba consistencia, ` +
      "no identidad; pinneá la llave para el caso fuerte)";
  }

  const checks = analizar(documento, pem) as CheckSobre[];
  const v = veredicto(checks) as Veredicto;

  return { veredicto: v, explicacion: EXPLICACIONES[v], checks, fuenteLlave };
}
