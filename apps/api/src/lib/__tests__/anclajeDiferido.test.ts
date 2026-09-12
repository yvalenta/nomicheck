// La cola de reintentos de anclaje diferido (DX402 punto 2, Parte 3).
//
// El pago YA liquidó cuando esta cola entra en juego (`programarAnclaje` se
// llama después de `capture()` en `x402MuroDurable.ts`): lo que se prueba
// acá es que reintenta con el reloj y el fetch INYECTADOS —nunca esperando
// tiempo real ni tocando la red— y que un 409 `already_anchored` cuenta como
// éxito, no como fallo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hexToBytes } from "viem";
import { payerKeyFromEvmSignature, contentHash, type AnchorOptions } from "uvd-x402-sdk";
import {
  programarAnclaje,
  tareasEnColaParaTest,
  limpiarColaParaTest,
  esExitoOYaAnclado,
  registrarResultadoAnchor,
  anclajeDisponible,
  resetContadorFallosParaTest,
  normalizarResultadoAnchor,
  envejecerUltimoFalloParaTest,
  type RelojDeReintentos,
  reservarMedioAbierto,
  liberarIntentoMedioAbierto,
  envejecerReservaParaTest,
  sondearFacilitador,
  recuperarEvidenciaAnclada,
  leerVeredicto,
  registrarVeredicto,
  contadorVeredictos,
  resetContadorVeredictosParaTest,
} from "../anclajeDiferido.js";
import { usarEmisor, type LineaDeRegistro } from "../registro.js";

/** Una clave de pagador VÁLIDA (33 bytes comprimidos, punto real de la
 * curva) — recuperada de una firma real en vez de bytes al azar, porque
 * `sealEvidenceTo` hace ECDH de verdad y un punto inválido lo revienta. */
async function claveDePagadorValida(): Promise<Uint8Array> {
  const cuenta = privateKeyToAccount(generatePrivateKey());
  const digest = `0x${"11".repeat(32)}` as const;
  const firma = await cuenta.sign({ hash: digest });
  return payerKeyFromEvmSignature(firma, hexToBytes(digest));
}

/** Reloj de test: no agenda con `setTimeout` real — guarda los callbacks
 * para que el test los dispare a mano, sin esperar los 30s/120s/300s reales. */
function relojManual(): RelojDeReintentos & { dispararProximo: () => Promise<void> } {
  const pendientes: (() => void)[] = [];
  return {
    setTimeout: (fn) => {
      pendientes.push(fn);
      return {};
    },
    dispararProximo: async () => {
      const fn = pendientes.shift();
      if (!fn) throw new Error("no hay ningún reintento agendado para disparar");
      fn();
      // `agendar` dispara `intentarAhora` en fire-and-forget (`void`), así
      // que un `setTimeout` real y corto —no el reloj inyectado— es lo que
      // deja terminar su cadena de `await` (fetch + `.json()` + la
      // mutación de la cola) antes de que el test siga afirmando.
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
}

function opciones(fetchDoble: typeof fetch, payerKey: Uint8Array): AnchorOptions {
  return {
    paymentId: "0x" + "aa".repeat(32),
    network: "eip155:43114",
    txHash: "0x" + "bb".repeat(32),
    payer: "0x1111111111111111111111111111111111111111",
    payee: "0x2222222222222222222222222222222222222222",
    payerKey,
    backend: "s3",
    retention: "90d",
    facilitator: "https://facilitator.ultravioletadao.xyz",
    fetch: fetchDoble,
  };
}

let lineas: LineaDeRegistro[];

beforeEach(() => {
  limpiarColaParaTest();
  resetContadorFallosParaTest();
  lineas = [];
  usarEmisor((l) => lineas.push(l));
});

describe("esExitoOYaAnclado", () => {
  it("un resultado sin `skipped` PERO con `pointer` es éxito", () => {
    expect(esExitoOYaAnclado({ v: 1, paymentId: "p", pointer: "s3+https://x/y" })).toBe(true);
  });

  it("un `skipped` con already_anchored en el error es éxito, no fallo", () => {
    expect(esExitoOYaAnclado({ v: 1, skipped: "anchor_failed", status: 409, error: "dx402_already_anchored" })).toBe(
      true
    );
  });

  it("un `skipped` por cualquier otro motivo es fallo real", () => {
    expect(esExitoOYaAnclado({ v: 1, skipped: "anchor_failed", status: 503 })).toBe(false);
    expect(esExitoOYaAnclado({ v: 1, skipped: "too_large" })).toBe(false);
  });

  // Reparación DX402 punto 2 ronda 2 (hallazgo del refutador): antes, un
  // resultado sin `skipped` era éxito por la mera AUSENCIA de esa clave, sin
  // exigir la forma que el SDK del comprador (`parseEvidenceHeader`) en
  // verdad necesita para leer el header. Un 2xx sin forma de
  // `AnchoredEvidence` (`{}`, un array, un `123`/`"ok"` ya normalizado por
  // `normalizarResultadoAnchor`) contaba como anclaje logrado sin haber
  // anclado nada.
  it("un objeto SIN `skipped` pero TAMPOCO con `pointer` no es éxito", () => {
    expect(esExitoOYaAnclado({ v: 1 })).toBe(false);
    expect(esExitoOYaAnclado({})).toBe(false);
  });

  it("un `pointer` vacío no cuenta como éxito", () => {
    expect(esExitoOYaAnclado({ v: 1, pointer: "" })).toBe(false);
  });
});

describe("normalizarResultadoAnchor", () => {
  it("deja pasar un objeto tal cual", () => {
    const objeto = { v: 1, pointer: "s3+https://x/y" };
    expect(normalizarResultadoAnchor(objeto)).toBe(objeto);
  });

  // `anchorEvidence` (uvd-x402-sdk) hace `(await res.json()) as Record<...>`
  // sin comprobar la forma -- un facilitador que responda 2xx con `null`
  // pasa TAL CUAL, y sin normalizar antes de la primera lectura eso revienta
  // con un TypeError DESPUÉS de `capture()` (reparación DX402 punto 2 ronda
  // 2, hallazgo del refutador).
  it("un `null` se normaliza a un fallo legible, sin lanzar", () => {
    const normalizado = normalizarResultadoAnchor(null);
    expect(normalizado.skipped).toBe("anchor_failed");
    expect(esExitoOYaAnclado(normalizado)).toBe(false);
  });

  it("un número, un array o un string se normalizan al mismo fallo -- JSON válido, forma inesperada", () => {
    for (const r of [123, [], "ok", "", 0, false]) {
      const normalizado = normalizarResultadoAnchor(r);
      expect(normalizado.skipped).toBe("anchor_failed");
      expect(esExitoOYaAnclado(normalizado)).toBe(false);
    }
  });

  // Caso DISTINTO del anterior: un `{}` SÍ es un objeto (la comprobación de
  // "no es objeto" no lo agarra), pero no tiene NI `skipped` NI `pointer` --
  // ninguno de los dos caminos que el resto del código conoce. Sin
  // normalizar esto también, `esExitoOYaAnclado({})` da `false` (correcto),
  // pero el header sale como `evidenceHeader({})` -- sin `skipped` -- que el
  // SDK del comprador rechaza como malformado en vez de leerlo como "no
  // ancló" (reparación DX402 punto 2 ronda 2, hallazgo del refutador).
  it("un objeto SIN skipped y SIN pointer también se normaliza a un fallo legible", () => {
    const normalizado = normalizarResultadoAnchor({});
    expect(normalizado.skipped).toBe("anchor_failed");
    expect(esExitoOYaAnclado(normalizado)).toBe(false);
  });

  it("un objeto que YA declara `skipped` se deja tal cual, sea cual sea el motivo", () => {
    const objeto = { v: 1, skipped: "too_large" };
    expect(normalizarResultadoAnchor(objeto)).toBe(objeto);
  });
});

describe("cortacircuitos de fallos consecutivos (anclajeDisponible)", () => {
  it("disponible por defecto y tras un reset", () => {
    expect(anclajeDisponible()).toBe(true);
  });

  it("un éxito reinicia el contador a cero", () => {
    for (let i = 0; i < 4; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    registrarResultadoAnchor({ v: 1, paymentId: "p", pointer: "s3+https://x/y" });
    expect(anclajeDisponible()).toBe(true);
  });

  it("se apaga tras 5 fallos consecutivos y no antes", () => {
    for (let i = 0; i < 4; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      expect(anclajeDisponible()).toBe(true);
    }
    registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    expect(anclajeDisponible()).toBe(false);
  });

  it("un already_anchored NO cuenta como fallo para el cortacircuitos", () => {
    for (let i = 0; i < 10; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 409, error: "dx402_already_anchored" });
    }
    expect(anclajeDisponible()).toBe(true);
  });

  // Reparación DX402 punto 2 ronda 2 (hallazgo de DOS refutadores
  // independientes): sin medio-abierto, `anclajeDisponible()` corta ANTES de
  // `capture()` en `x402MuroDurable.ts`, así que nunca se vuelve a llamar
  // `anchorEvidence` de una venta nueva y el único reset
  // (`registrarResultadoAnchor`) queda inalcanzable -- el corte, una vez
  // abierto, no tenía camino de vuelta.
  describe("medio-abierto", () => {
    it("sigue cerrado (indisponible) recién abierto el corte", () => {
      for (let i = 0; i < 5; i++) {
        registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      }
      expect(anclajeDisponible()).toBe(false);
    });

    it("sigue cerrado si todavía no pasó la ventana de gracia", () => {
      for (let i = 0; i < 5; i++) {
        registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      }
      envejecerUltimoFalloParaTest(299_000); // 1s antes de los 300s de gracia
      expect(anclajeDisponible()).toBe(false);
    });

    it("deja pasar UN intento pasada la ventana de gracia", () => {
      for (let i = 0; i < 5; i++) {
        registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      }
      envejecerUltimoFalloParaTest(300_000);
      expect(anclajeDisponible()).toBe(true);
    });

    it("si ese intento falla, el corte se reabre por otra ventana completa", () => {
      for (let i = 0; i < 5; i++) {
        registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      }
      envejecerUltimoFalloParaTest(300_000);
      expect(anclajeDisponible()).toBe(true);
      // El intento de sonda falla -- el corte se reabre, no queda medio-abierto.
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      expect(anclajeDisponible()).toBe(false);
    });

    it("si ese intento ancla, el corte se cierra del todo -- no solo para esa venta", () => {
      for (let i = 0; i < 5; i++) {
        registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
      }
      envejecerUltimoFalloParaTest(300_000);
      registrarResultadoAnchor({ v: 1, paymentId: "p", pointer: "s3+https://x/y" });
      expect(anclajeDisponible()).toBe(true);
      // Sin envejecer de nuevo: si el reset no fuera real, `anclajeDisponible`
      // volvería a leer el contador viejo.
      expect(anclajeDisponible()).toBe(true);
    });
  });
});

describe("programarAnclaje", () => {
  it("no duplica la tarea si se llama dos veces con el mismo paymentId mientras sigue en cola", async () => {
    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(async () => new Response(null, { status: 503 }));
    const reloj = relojManual();

    programarAnclaje("pago-1", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    programarAnclaje("pago-1", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);

    expect(tareasEnColaParaTest()).toBe(1);
  });

  it("reintenta con el fetch inyectado cuando el reloj dispara, sin tocar la red real", async () => {
    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(
      async () => new Response(JSON.stringify({ v: 1, paymentId: "p", pointer: "s3+https://x/y" }), { status: 200 })
    );
    const reloj = relojManual();

    programarAnclaje("pago-2", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    // `programarAnclaje` solo AGENDA: el intento en sí corre cuando el reloj
    // dispara, nunca al encolar — el reintento INMEDIATO es responsabilidad
    // del llamador (`x402MuroDurable.ts`), no de esta cola.
    expect(fetchDoble).not.toHaveBeenCalled();

    await reloj.dispararProximo();

    expect(fetchDoble).toHaveBeenCalledTimes(1);
    expect(tareasEnColaParaTest()).toBe(0); // 200 sin `skipped` = éxito, sale de la cola
  });

  // Refutador de cierre, ronda 3: la cola aceptaba cualquier 409 como "el
  // facilitador volvió" sin cruzar el contentHash, y el comprador (que tiene
  // el texto plano desde t=0) podía anclar bajo nuestro paymentId en la
  // ventana de 30/120/300 s. Ahora el 409 se cruza con GET /dx402/evidence.
  it("un 409 con `already_anchored` se cruza con GET /dx402/evidence: registro PROPIO = éxito", async () => {
    const payerKey = await claveDePagadorValida();
    const body = new TextEncoder().encode("{}");
    const fetchDoble = vi.fn(async (input: unknown) => {
      if (String(input).includes("/dx402/evidence/")) {
        return new Response(JSON.stringify({ pointer: "s3+https://f/e/propio", contentHash: contentHash(body) }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: "dx402_already_anchored" }), { status: 409 });
    });
    const reloj = relojManual();

    programarAnclaje("pago-3", body, opciones(fetchDoble as unknown as typeof fetch, payerKey), reloj);
    await reloj.dispararProximo();

    expect(tareasEnColaParaTest()).toBe(0);
    expect(lineas.some((l) => l.mensaje === "anclaje diferido logrado")).toBe(true);
  });

  it("un 409 cuyo registro es AJENO (otro contentHash) no es éxito: sale de la cola con error y NO cierra el corte", async () => {
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    expect(anclajeDisponible()).toBe(false);
    const payerKey = await claveDePagadorValida();
    const body = new TextEncoder().encode("{}");
    const fetchDoble = vi.fn(async (input: unknown) => {
      if (String(input).includes("/dx402/evidence/")) {
        return new Response(JSON.stringify({ pointer: "s3+https://f/e/ajeno", contentHash: "0x" + "ff".repeat(32) }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: "dx402_already_anchored" }), { status: 409 });
    });
    const reloj = relojManual();

    programarAnclaje("pago-4", body, opciones(fetchDoble as unknown as typeof fetch, payerKey), reloj);
    await reloj.dispararProximo();

    expect(tareasEnColaParaTest()).toBe(0);
    expect(lineas.some((l) => l.mensaje === "anclaje diferido logrado")).toBe(false);
    expect(lineas.some((l) => l.nivel === "error" && l.mensaje.includes("sin registro propio"))).toBe(true);
    expect(anclajeDisponible()).toBe(false);
  });

  it("agota sus tres reintentos y sale de la cola logueando el error, sin loguear éxito", async () => {
    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 503 }));
    const reloj = relojManual();

    programarAnclaje("pago-4", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    await reloj.dispararProximo(); // intento 1 -> falla, agenda intento 2
    await reloj.dispararProximo(); // intento 2 -> falla, agenda intento 3
    await reloj.dispararProximo(); // intento 3 -> falla, agota

    expect(tareasEnColaParaTest()).toBe(0);
    expect(fetchDoble).toHaveBeenCalledTimes(3);
    expect(lineas.some((l) => l.mensaje === "anclaje diferido agotó sus reintentos")).toBe(true);
    expect(lineas.some((l) => l.mensaje === "anclaje diferido logrado")).toBe(false);
  });

  // Reparación DX402 punto 2 ronda 2 (hallazgo del refutador): los hasta 3
  // fallos de ESTA cola (`ESPERAS_MS`) son el 60% de `UMBRAL_FALLOS_CONSECUTIVOS`
  // (5) -- si contaran contra el cortacircuitos, una sola venta con su anchor
  // caído amplificaría su propia falla contra ventas NUEVAS que no tienen
  // nada que ver. Los tres reintentos de acá NO deben mover el contador.
  it("sus fallos NO cuentan contra el cortacircuitos -- solo los anclajes de venta lo hacen", async () => {
    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 503 }));
    const reloj = relojManual();

    programarAnclaje("pago-5", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    await reloj.dispararProximo(); // intento 1 -> falla
    await reloj.dispararProximo(); // intento 2 -> falla
    await reloj.dispararProximo(); // intento 3 -> falla, agota

    expect(fetchDoble).toHaveBeenCalledTimes(3);
    // Si estos 3 fallos contaran, con UMBRAL=5 alcanzarían para casi apagar
    // el cortacircuitos solos -- sigue disponible porque no cuentan.
    expect(anclajeDisponible()).toBe(true);
  });

  it("un éxito de ESTA cola SÍ cierra el cortacircuitos -- es la señal de que el facilitador volvió", async () => {
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    }
    expect(anclajeDisponible()).toBe(false);

    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(
      async () => new Response(JSON.stringify({ v: 1, paymentId: "p", pointer: "s3+https://x/y" }), { status: 200 })
    );
    const reloj = relojManual();
    programarAnclaje("pago-6", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    await reloj.dispararProximo();

    expect(anclajeDisponible()).toBe(true);
  });

  // Refutador acotado (sesión fría 2026-09-10): la cola reseteaba solo el
  // contador y dejaba `hayPoliticaEnRacha` pegada; la racha siguiente,
  // aunque fuera de puras caídas, heredaba la ventana de una hora.
  it("un éxito de la cola limpia también la racha de política: la siguiente racha de caídas vuelve a la ventana de 300 s", async () => {
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 402, error: "dx402_proof_rejected" });
    }
    expect(anclajeDisponible()).toBe(false);

    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(
      async () => new Response(JSON.stringify({ v: 1, paymentId: "p", pointer: "s3+https://x/y" }), { status: 200 })
    );
    const reloj = relojManual();
    programarAnclaje("pago-politica", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    await reloj.dispararProximo();
    expect(anclajeDisponible()).toBe(true);

    // Racha nueva de puras caídas: ventana corta, no la de política.
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    }
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
  });

  // Segunda pasada del refutador: la otra rama de éxito de la cola — el 409
  // recuperado por GET con NUESTRO contentHash — quedaba sin test que la
  // clavara (revertirla a `fallosConsecutivos = 0` dejaba la suite verde).
  it("un 409 propio recuperado por GET en la cola también limpia la racha de política", async () => {
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 402, error: "dx402_proof_rejected" });
    }
    expect(anclajeDisponible()).toBe(false);

    const payerKey = await claveDePagadorValida();
    const body = new TextEncoder().encode("{}");
    const fetchDoble = vi.fn(async (input: unknown) => {
      if (String(input).includes("/dx402/evidence/")) {
        return new Response(JSON.stringify({ pointer: "s3+https://f/e/propio", contentHash: contentHash(body) }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: "dx402_already_anchored" }), { status: 409 });
    });
    const reloj = relojManual();
    programarAnclaje("pago-politica-409", body, opciones(fetchDoble as unknown as typeof fetch, payerKey), reloj);
    await reloj.dispararProximo();
    expect(lineas.some((l) => l.mensaje === "anclaje diferido logrado")).toBe(true);
    expect(anclajeDisponible()).toBe(true);

    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    }
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
  });

  it("no encola una tarea nueva cuando la cola ya está en el tope", async () => {
    const payerKey = await claveDePagadorValida();
    const fetchDoble = vi.fn(async () => new Response(null, { status: 503 }));
    // Un reloj que nunca dispara: las 50 tareas quedan "colgadas" en cola,
    // que es justo la situación que el tope existe para acotar.
    const reloj: RelojDeReintentos = { setTimeout: () => ({}) };

    for (let i = 0; i < 50; i++) {
      programarAnclaje(`tope-${i}`, new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);
    }
    expect(tareasEnColaParaTest()).toBe(50);

    programarAnclaje("tope-51-de-mas", new TextEncoder().encode("{}"), opciones(fetchDoble, payerKey), reloj);

    expect(tareasEnColaParaTest()).toBe(50);
    expect(lineas.some((l) => l.mensaje.includes("cola de anclaje diferido llena"))).toBe(true);
  });
});

// ── Ronda 3 de refutación (2026-09-10) ──────────────────────────────────

describe("esExitoOYaAnclado exige el 409 real", () => {
  // Refutador `dinero`, ronda 3: `error.includes("already_anchored")` sobre
  // un string ajeno, sin mirar `status`, hacía que un 5xx con esa subcadena
  // sirviera header de éxito, no encolara reintento y reseteara el corte.
  it("un 5xx cuyo mensaje contiene 'already_anchored' NO es éxito", () => {
    expect(
      esExitoOYaAnclado({ v: 1, skipped: "anchor_failed", status: 503, error: "index rebuild: already_anchored set" })
    ).toBe(false);
    expect(esExitoOYaAnclado({ v: 1, skipped: "anchor_failed", error: "dx402_already_anchored" })).toBe(false);
  });
});

describe("programarAnclaje dice si quedó en cola", () => {
  it("true al encolar, true si ya estaba, false cuando la cola está llena", async () => {
    const payerKey = await claveDePagadorValida();
    const reloj = relojManual();
    const fetchDoble = vi.fn(async () => new Response("{}", { status: 503 }));
    const body = new TextEncoder().encode("{}");
    const opts = opciones(fetchDoble as unknown as typeof fetch, payerKey);

    expect(programarAnclaje("p-1", body, opts, reloj)).toBe(true);
    expect(programarAnclaje("p-1", body, opts, reloj)).toBe(true);
    for (let i = 2; i <= 50; i++) programarAnclaje(`p-${i}`, body, opts, reloj);
    expect(tareasEnColaParaTest()).toBe(50);
    expect(programarAnclaje("p-51", body, opts, reloj)).toBe(false);
    expect(lineas.some((l) => l.mensaje.includes("cola de anclaje diferido llena"))).toBe(true);
  });
});

describe("reservarMedioAbierto (single-flight) y la ventana por política", () => {
  // Refutador de cierre, ronda 3: entre `anclajeDisponible()` y `capture()`
  // hay varios await, y N ventas concurrentes pasada la ventana veían todas
  // el corte disponible y cobraban todas. Ahora la ventana la usa UNA.
  it("cerrado → 'cerrado'; abierto y pasada la ventana → una sola reserva, las demás 'ocupado'; registrar o liberar la sueltan", () => {
    expect(reservarMedioAbierto().admision).toBe("cerrado");
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
    expect(reservarMedioAbierto().admision).toBe("ocupado");
    expect(reservarMedioAbierto().admision).toBe("ocupado");
    // La venta/sonda que la usaba falló: libera y rearma la ventana.
    registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(300_000);
    const reserva = reservarMedioAbierto();
    expect(reserva.admision).toBe("medio-abierto");
    if (reserva.admision !== "medio-abierto") throw new Error("inalcanzable");
    // La request murió sin informar: el `finally` del adaptador libera.
    liberarIntentoMedioAbierto(reserva.reserva);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
    // Un anclaje que prende cierra el corte del todo.
    registrarResultadoAnchor({ v: 1, paymentId: "p", pointer: "s3+https://x/y" });
    expect(reservarMedioAbierto().admision).toBe("cerrado");
  });

  // Refutador de cierre, ronda 3: la sonda gratis mira /dx402/stats, que
  // sigue en 200 cuando /dx402/anchor rechaza por POLÍTICA (402
  // dx402_proof_rejected en fase 2, 422 backend). Para eso no hay sonda
  // gratis: lo que acota el costo es una ventana de una hora, no de 300 s.
  it("un rechazo por política del anchor (402) abre una ventana de una hora, no de cinco minutos", () => {
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 402, error: "dx402_proof_rejected" });
    }
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(3_300_000);
    expect(anclajeDisponible()).toBe(true);
    // Un 422 de backend NO es política (stats lo expone y la sonda lo ve):
    // ventana corta, igual que una caída (503).
    resetContadorFallosParaTest();
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 422, error: "dx402_backend_unavailable" });
    }
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
    resetContadorFallosParaTest();
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
  });

  // Segundo refutador de cierre, ronda 3: clasificar por el ÚLTIMO fallo
  // degradaba la ventana — `4×402 + 1×503`, o un timeout sin status, o la
  // propia sonda fallida, devolvían los 300 s en pleno régimen de política.
  it("la política se decide por la racha: un 503, un timeout o la sonda fallida después de un 402 no acortan la hora", () => {
    for (let i = 0; i < 4; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 402, error: "dx402_proof_rejected" });
    }
    registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(false);
    registrarResultadoAnchor({ v: 1, skipped: "anchor_failed" }); // timeout: el catch del SDK no trae status
    registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", error: "sonda_medio_abierto" });
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(3_300_000);
    expect(anclajeDisponible()).toBe(true);
    // Solo un éxito limpia la racha.
    registrarResultadoAnchor({ v: 1, paymentId: "p", pointer: "s3+https://x/y" });
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
  });

  // Segundo refutador de cierre, ronda 3: contar el 409 resuelto-sin-registro-
  // propio como fallo dejaba que un tercero (paymentId público, anchor sin
  // identidad) o una caída de GET /dx402/evidence abrieran el corte con
  // cinco compras y apagaran la ruta para todos.
  it("un 409 resuelto sin registro propio es NEUTRO: no abre el corte, y con el corte abierto solo rearma la ventana", () => {
    const ajeno = { v: 1, skipped: "already_anchored", paymentId: "p", contentHash: "0xcc", error: "registro_ajeno" };
    const irrecuperable = { v: 1, skipped: "already_anchored", paymentId: "p", contentHash: "0xcc" };
    for (let i = 0; i < 10; i++) registrarResultadoAnchor(i % 2 ? ajeno : irrecuperable);
    expect(anclajeDisponible()).toBe(true);
    expect(reservarMedioAbierto().admision).toBe("cerrado");
    // Con el corte abierto y la ventana pasada, la venta que probó y salió
    // con un 409 ajeno no demostró nada: se rearma sin sumar.
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
    registrarResultadoAnchor(ajeno);
    expect(anclajeDisponible()).toBe(false);
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDisponible()).toBe(true);
  });

  // Segundo refutador de cierre, ronda 3: `capture()` no tiene timeout y un
  // /settle colgado dejaba la reserva tomada hasta que cortara undici, con
  // toda venta en 424 mientras tanto.
  it("una reserva del medio-abierto vence a los 60 s: otra venta puede tomarla", () => {
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
    expect(reservarMedioAbierto().admision).toBe("ocupado");
    envejecerReservaParaTest(59_000);
    expect(reservarMedioAbierto().admision).toBe("ocupado");
    envejecerReservaParaTest(1_000);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
  });

  // Sesión fría 2026-09-10, leyendo quién libera la reserva:
  // `liberarIntentoMedioAbierto()` soltaba la reserva vigente sin saber de
  // quién era. Una request cuya reserva VENCIÓ (settle colgado > 60 s) y fue
  // reemplazada por otra venta termina después (undici corta a ~300 s) y su
  // `finally` soltaba la reserva de la venta nueva, todavía en vuelo: una
  // tercera entraba y había dos ventas en la ventana. Cada reserva lleva
  // identidad y solo la suya la libera.
  it("el finally tardío de una reserva vencida y reemplazada NO libera la nueva", () => {
    for (let i = 0; i < 5; i++) registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    envejecerUltimoFalloParaTest(300_000);
    const vieja = reservarMedioAbierto();
    expect(vieja.admision).toBe("medio-abierto");
    envejecerReservaParaTest(60_000);
    const nueva = reservarMedioAbierto();
    expect(nueva.admision).toBe("medio-abierto");
    if (vieja.admision !== "medio-abierto" || nueva.admision !== "medio-abierto") throw new Error("inalcanzable");
    expect(nueva.reserva).not.toBe(vieja.reserva);
    // La request vieja termina tarde: su finally no suelta lo que no es suyo.
    liberarIntentoMedioAbierto(vieja.reserva);
    expect(reservarMedioAbierto().admision).toBe("ocupado");
    // La nueva sí.
    liberarIntentoMedioAbierto(nueva.reserva);
    expect(reservarMedioAbierto().admision).toBe("medio-abierto");
  });
});

describe("sondearFacilitador", () => {
  it("con backend: true solo si figura enabled en backends[]; un stats sin backends[] no bloquea", async () => {
    const stats = (backends: unknown) => vi.fn(async () => new Response(JSON.stringify({ backends }), { status: 200 }));
    expect(
      await sondearFacilitador("https://f.example", stats([{ id: "s3", enabled: false }, { id: "ipfs-private", enabled: true }]) as unknown as typeof fetch, "s3")
    ).toBe(false);
    expect(await sondearFacilitador("https://f.example", stats([{ id: "s3", enabled: true }]) as unknown as typeof fetch, "s3")).toBe(true);
    expect(await sondearFacilitador("https://f.example", stats([{ id: "ipfs-private", enabled: true }]) as unknown as typeof fetch, "s3")).toBe(false);
    expect(await sondearFacilitador("https://f.example", stats(undefined) as unknown as typeof fetch, "s3")).toBe(true);
  });

  it("true con 2xx, false con 5xx, false si fetch lanza -- nunca lanza", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sondearFacilitador("https://f.example/", ok as unknown as typeof fetch)).toBe(true);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe("https://f.example/dx402/stats");
    const caido = vi.fn(async () => new Response("error code: 503", { status: 503 }));
    expect(await sondearFacilitador("https://f.example", caido as unknown as typeof fetch)).toBe(false);
    const lanza = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sondearFacilitador("https://f.example", lanza as unknown as typeof fetch)).toBe(false);
  });
});

describe("recuperarEvidenciaAnclada (qué hay detrás de un 409)", () => {
  const paymentId = "0x" + "aa".repeat(32);
  const nuestro = "0x" + "cc".repeat(32);

  it("registro NUESTRO (mismo contentHash): devuelve el registro con pointer, sin skipped", async () => {
    const doFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ paymentId, pointer: "s3+https://f/e/1", contentHash: nuestro.toUpperCase(), receipt: {} }), {
          status: 200,
        })
    );
    const r = await recuperarEvidenciaAnclada("https://f.example", paymentId, nuestro, doFetch as unknown as typeof fetch);
    expect(String((doFetch.mock.calls[0] as unknown[])[0])).toBe(`https://f.example/dx402/evidence/${paymentId}`);
    expect(r.skipped).toBeUndefined();
    expect(r.pointer).toBe("s3+https://f/e/1");
    expect(r.paymentId).toBe(paymentId);
    expect(esExitoOYaAnclado(r)).toBe(true);
  });

  it("registro AJENO (otro contentHash): skipped already_anchored + registro_ajeno, sin pointer, y un error en el registro", async () => {
    const doFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ paymentId, pointer: "s3+https://f/e/otro", contentHash: "0x" + "ff".repeat(32) }), {
          status: 200,
        })
    );
    const r = await recuperarEvidenciaAnclada("https://f.example", paymentId, nuestro, doFetch as unknown as typeof fetch);
    expect(r).toEqual({ v: 1, skipped: "already_anchored", paymentId, contentHash: nuestro, error: "registro_ajeno" });
    expect(lineas.some((l) => l.nivel === "error" && l.mensaje.includes("AJENO"))).toBe(true);
  });

  it("GET que falla (503, sin pointer, o lanza): skipped already_anchored con paymentId + contentHash, sin error", async () => {
    const esperado = { v: 1, skipped: "already_anchored", paymentId, contentHash: nuestro };
    const r503 = vi.fn(async () => new Response("index unavailable", { status: 503 }));
    expect(await recuperarEvidenciaAnclada("https://f.example", paymentId, nuestro, r503 as unknown as typeof fetch)).toEqual(esperado);
    const sinPointer = vi.fn(async () => new Response(JSON.stringify({ paymentId, contentHash: nuestro }), { status: 200 }));
    expect(await recuperarEvidenciaAnclada("https://f.example", paymentId, nuestro, sinPointer as unknown as typeof fetch)).toEqual(esperado);
    const lanza = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await recuperarEvidenciaAnclada("https://f.example", paymentId, nuestro, lanza as unknown as typeof fetch)).toEqual(esperado);
    expect(lineas.filter((l) => l.nivel === "warn").length).toBeGreaterThanOrEqual(3);
  });
});

// ── Veredicto del facilitador (peldaño 0) ─────────────────────────────────
//
// `verified` / `notVerifiedReason` son lo que dice QUÉ VALE un anclaje que
// prendió. Hasta acá nadie los leía: un provisional —lo único que hoy
// produce esta ruta— cuenta como éxito, cierra el cortacircuitos y se sirve
// sin dejar rastro. Lo que se prueba es que ahora se leen, que se cuentan
// aparte, y que ese contador NO puede apagar la ruta.
describe("veredicto del facilitador", () => {
  beforeEach(() => {
    resetContadorVeredictosParaTest();
  });

  it("lee los dos campos de un registro anclado", () => {
    expect(
      leerVeredicto({ pointer: "s3+https://x/y", verified: false, notVerifiedReason: "dx402_proof_missing" })
    ).toEqual({ verified: false, notVerifiedReason: "dx402_proof_missing" });
  });

  it("un `verified` que no es boolean no es un veredicto", () => {
    expect(leerVeredicto({ pointer: "s3+https://x/y", verified: "true" })).toEqual({});
    expect(leerVeredicto({ pointer: "s3+https://x/y", verified: 1 })).toEqual({});
    expect(leerVeredicto({ pointer: "s3+https://x/y", notVerifiedReason: "" })).toEqual({});
  });

  it("sin `pointer` no hay registro del que leer veredicto, y no se cuenta", () => {
    expect(registrarVeredicto({ v: 1, skipped: "anchor_failed", error: "facilitator_unreachable" })).toEqual({});
    expect(registrarVeredicto({ v: 1, skipped: "already_anchored", error: "registro_ajeno" })).toEqual({});
    expect(contadorVeredictos()).toEqual({ verificados: 0, provisionales: 0, sinVeredicto: 0 });
  });

  it("un anclado sin el campo `verified` cuenta como sinVeredicto, no como provisional", () => {
    registrarVeredicto({ pointer: "s3+https://x/y" });
    expect(contadorVeredictos()).toEqual({ verificados: 0, provisionales: 0, sinVeredicto: 1 });
  });

  it("cada fila cuenta en la suya", () => {
    registrarVeredicto({ pointer: "p1", verified: false, notVerifiedReason: "dx402_proof_missing" });
    registrarVeredicto({ pointer: "p2", verified: false, notVerifiedReason: "dx402_seller_signature_missing" });
    registrarVeredicto({ pointer: "p3", verified: true });
    expect(contadorVeredictos()).toEqual({ verificados: 1, provisionales: 2, sinVeredicto: 0 });
  });

  it("una racha de provisionales NO abre el cortacircuitos: mide otra cosa", () => {
    // 8 > 5, el umbral del cortacircuitos.
    for (let i = 0; i < 8; i += 1) {
      const provisional = { v: 1, pointer: `s3+https://x/${i}`, verified: false, notVerifiedReason: "dx402_proof_missing" };
      registrarResultadoAnchor(provisional);
      registrarVeredicto(provisional);
    }
    expect(anclajeDisponible()).toBe(true);
    expect(contadorVeredictos().provisionales).toBe(8);
  });

  it("el contador que se devuelve es una copia: nadie de afuera lo mueve", () => {
    registrarVeredicto({ pointer: "p1", verified: true });
    const copia = contadorVeredictos();
    copia.verificados = 99;
    expect(contadorVeredictos().verificados).toBe(1);
  });
});
