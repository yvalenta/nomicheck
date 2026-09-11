---
estado: en-curso
dueño: ambos
fecha: 2026-09-10
tema: anclaje DX402 que cuente como `verified` sin que la llave del payTo entre al proceso de la API — firmador restringido por dominio en `opts.sign` del SDK + `proofOfPayment` del `/settle`; reabre la decisión 7 como pregunta a Yonatan, con evidencia
criterio_cierre: fase A (solo lectura): una nota medida, con la fuente exacta de cada afirmación (openapi vivo, fuente de x402-rs por sha, o un settle real), que diga (1) qué exige el facilitador de Ultravioleta para marcar `verified` y (2) si su `/settle` devuelve `proofOfPayment` o cómo se arma por RPC de lectura; más 2–3 variantes del firmador restringido refutadas por el refutador. Con eso la decisión 7 vuelve a Yonatan como pregunta. Fase B (solo con GO explícito de Yonatan, identidad = lista 2): un anclaje de nomicheck cuyo `GET /dx402/evidence/{paymentId}` diga `verified: true` con la llave fuera del proceso. Si `proofOfPayment` no existe ni se arma, la tarea cierra `hecha` con ese dato y la ruta queda declarada provisional.
---

Viene de `tareas/2026-09-10-x402-que-se-disena-informe.md` §3a y §4: de las nueve
ideas del workflow ninguna sobrevivió; lo que quedó con apalancamiento real es
que **nomicheck sea el primer vendedor tercero con anclajes que cuenten**. Hoy
la ruta `/verificar/durable` (código listo, `DX402_ACTIVO=false` en producción)
ancla **provisional**: sin `sellerSignature` (decisión 7 del brief, fija: «llave
EVM del payTo en el proceso: no») y sin `proofOfPayment`. Provisional =
«anyone could have written it»; un tercero que ancle primero gana
(`apps/api/src/lib/anclajeDiferido.ts`, comentario del 409), y provisional no
entra a ningún corpus certificado.

La Línea Roja §3 prescribe exactamente la forma que el SDK ya admite: **firma,
no secreto**. `AnchorOptions.sign?: (digest) => string` es un callable «para que
un custodio firme: recibe el digest y devuelve la firma sin que la semilla salga
de él» (`uvd-x402-sdk` 2.88.0, `dist/index.d.ts`). Un firmador restringido por
dominio recibiría los campos de la autorización (`paymentId`, `contentHash`,
`pointer`, `payee`, `chainId`), recompondría `anchorDigest` por su cuenta y se
negaría a firmar cualquier otra cosa.

## Lo que ya está medido (2026-09-10, solo lectura)

- **Contrato del facilitador (openapi vivo de `facilitator.ultravioletadao.xyz`,
  `POST /dx402/anchor`):** «Every anchor is judged against the chain. Send
  `proofOfPayment` (from `/settle`) and `sellerSignature` (EIP-712 `DX402
  Anchor` by the payee; raw ed25519 for Solana/Stellar payees). The record
  carries `verified` (the chain confirmed the payee and the payer) and `signed`
  (the signature matched the payee you declared — a diagnostic, not proof).
  Authority is a ladder: provisional < signed < verified; a weaker claim never
  locks out a stronger one, and only `verified` is final. `DX402_REQUIRE_PROOF=false`
  (phase 1, default) records failing anchors as provisional with
  `notVerifiedReason`; phase 2 rejects them with 402.»
- **Contrato del SDK (`AnchorOptions.proofOfPayment`, 2.88.0):** «The settlement
  proof, in the facilitator's `ProofOfPayment` shape (`transactionHash`,
  `blockNumber`, `network`, `payer`, `payee`, `amount`, `token`, `timestamp`,
  `paymentHash`). **The only thing that reaches `verified: true`.** Without it
  the facilitator has checked no chain, so it records the anchor as provisional
  and answers `notVerifiedReason: "dx402_proof_missing"`: the signature is
  accepted (`signed: true`) but authorship is not certified.» El SDK lo manda
  tal cual en el payload del anchor (`src/dx402.ts:1091-1092`) y la firma sale de
  `opts.sign(digest)` (`:1099-1108`).
- **Lo que el openapi NO dice:** el 200 de `POST /settle` está tipado como
  `{"type":"object"}` y el registro de `GET /dx402/evidence/{paymentId}` también;
  `proofOfPayment` aparece una sola vez en todo el documento (la prosa del
  anchor). Si `/settle` lo devuelve o hay que armarlo, se lee del fuente de
  x402-rs o de un settle real — ver bitácora.
- **Consecuencia para el diseño:** `verified` no es solo la firma. Son dos
  piezas: `sellerSignature` (identidad del payee: el firmador restringido) y
  `proofOfPayment` (la prueba de la liquidación, que viene del `/settle` que la
  API ya hace). Sin la segunda, el firmador solo llega a `signed`, «a
  diagnostic, not proof» — la refutación del informe («apuntar a `verified`, no
  a `signed`») es esta.

## Plan

1. **Fase A, solo lectura (esta sesión y las que sigan sin GO):**
   a. Leer en x402-rs (sha exacto anotado) qué serializa `/settle` en su 200 y
      qué valida `/dx402/anchor` para poner `verified` (¿compara `payee`/`payer`
      del `proofOfPayment` contra el recibo on-chain? ¿exige `sellerSignature`
      además, o `proofOfPayment` solo alcanza?). Anotar sha y líneas.
   b. Si `/settle` no devuelve `proofOfPayment`: ver si los nueve campos se arman
      con lo que la API ya tiene (`transaction` del `PAYMENT-RESPONSE`, la red,
      el payTo) más un `eth_getTransactionReceipt` de solo lectura, y qué es
      `paymentHash`.
   c. Diseñar 2–3 variantes del firmador restringido (proceso aparte en el mismo
      host con socket Unix; el Llavero/OWS de la casa; función pura con la llave
      en un secreto de Compose que la API nunca lee) y pasarlas por el
      refutador: superficie de firma, qué pasa si la API está comprometida,
      cómo se rota, cómo se mide que la llave no entró al proceso.
   d. Presentar a Yonatan la reapertura de la decisión 7 como pregunta con
      (a)–(c) en la mano. **Nada de esto toca el sobre, la llave ni producción.**
2. **Fase B, con GO explícito:** crear la llave EVM del payTo fuera de la API,
   conectar `opts.sign` al firmador, pasar `proofOfPayment`, anclar UNA vez
   (compra real de Yonatan) y leer `GET /dx402/evidence/{paymentId}`.

## Bitácora
- 2026-09-10 (sesión fría Fable vía `/casa nomicheck`, «ambas» de Yonatan: esta
  tarea y el cierre del paso -1 de DX402). Declarada. Medido lo de arriba con el
  openapi vivo y el SDK 2.88.0 instalado en `node_modules`. Lo que sigue en
  esta misma sesión: 1a con el fuente de x402-rs.
- 2026-09-10, **fase 1a hecha** (solo lectura). Fuentes: openapi vivo del
  facilitador (`facilitator.ultravioletadao.xyz/openapi.json`, 128 KB) y x402-rs
  `main` en `b5f345652a7e` (2026-09-11T00:40Z): `src/dx402/service.rs`,
  `src/dx402/gate.rs`, `src/erc8004/proof.rs`, `src/erc8004/types.rs`,
  `src/handlers.rs`. Lo medido:
  1. **`verified` exige las dos piezas, y la firma se coteja contra la cadena,
     no contra lo declarado.** `service.rs:553` `verified = gate_verdict.is_none()`;
     `gate.rs:649-772` (`verify_anchor`): sin `proofOfPayment` →
     `dx402_proof_missing`; sin `sellerSignature` →
     `dx402_seller_signature_missing`; el `paymentId` debe ser
     `keccak(caip2‖proof.transactionHash)` (`PaymentIdNotBound`); `txHash` y
     `payee` declarados deben coincidir con el proof; `verify_payment_facts` lee
     el recibo; el `funder` real debe ser el `payer` al que se selló
     (`PayerIsNotRecipient`); y al final `verify_authorization(signature, …,
     facts.payee, chainId)` con el payee **leído del recibo**. `signed`
     (`service.rs:520-545`) es solo el diagnóstico contra el payee declarado.
     Fase 1 (`DX402_REQUIRE_PROOF=false`, default): registra provisional con
     `notVerifiedReason`; fase 2 rechaza con 402. Ventana: el anchor debe caer
     dentro de `DX402_ANCHOR_MAX_AGE_SECS` = **900 s** del timestamp del bloque
     (`gate.rs:70-86`, `:711`; `proof.rs:538`): la cola diferida de nomicheck
     (30/120/300 s) entra, pero un reintento pasados 15 min ya no puede ser
     `verified` aunque todo lo demás esté bien.
  2. **`/settle` NO devuelve `proofOfPayment`.** Su 200 (prosa del openapi; el
     schema es `{"type":"object"}`) trae `success`,
     `transaction`/`transactionHash`/`transaction_hash`, `paymentId`, `network`,
     `payer`. El proof es un struct que arma el vendedor
     (`erc8004/types.rs:667-700`, `ProofOfPayment::new`): `transactionHash`,
     `blockNumber`, `network`, `payer`, `payee`, `amount`, `token`, `timestamp`
     (del bloque) y `paymentHash = keccak256(txHash[32] ‖ blockNumber u64 BE ‖
     bytes(Display(payer)) ‖ bytes(Display(payee)) ‖ amount U256 BE[32])`
     (`types.rs:734-760`). Todo es dato público: `transaction`, `network` y
     `payer` salen del settle; `payee` (payTo), `amount` y `token` los conoce
     nomicheck por su propia oferta; `blockNumber` y `timestamp` salen de
     `eth_getTransactionReceipt` + `eth_getBlockByNumber` de solo lectura — y la
     API ya tiene cliente viem (`services/pagosService.ts`,
     `comprobanteService.ts`, `seguimientoPagoService.ts`). El facilitador lo
     recomputa y lo coteja con la cadena (`proof.rs:392-560`): misma red, token
     permitido, recibo existente y exitoso, `blockNumber` y `timestamp` del
     bloque iguales, frescura, `Transfer(payer→payee, amount)` en los logs.
     **Pendiente de pinnear antes de implementar:** el formato exacto de
     `Display` de `MixedAddress` (EIP-55 o minúsculas) — con un vector del
     facilitador o un test cruzado, no adivinando.
  3. **El SDK no construye el proof** (`opts.proofOfPayment` pasa tal cual,
     `src/dx402.ts:1091`); sí trae `anchorDigest(paymentId, contentHash,
     pointer, payee, chainId)` y `signAnchorEvm` para el firmador, y
     `sign?: (digest) => string` para no tener la llave en el proceso.
  4. **Consecuencia para la decisión 7:** la única forma de `verified` es que
     la llave EVM del payTo firme el digest del anchor; `proofOfPayment` es la
     otra mitad y no requiere ningún secreto. La pregunta a Yonatan queda así:
     «¿un firmador restringido — recibe `{paymentId, contentHash, pointer: "",
     payee, chainId}`, recompone `anchorDigest` y firma solo eso — fuera del
     proceso de la API, con la llave del payTo que hoy no está en ninguno
     (decisión 7)?». Sin ese sí, la ruta sigue provisional y así se dice.
  **No arrancado:** 1b ya no hace falta (el proof se arma, punto 2); 1c
  (variantes del firmador + refutador) y 1d (la pregunta con todo en la mano)
  quedan para la sesión que siga. Estado: `en-curso`.
- 2026-09-10 (cierre de la sesión por la regla de 200k). **Fase 1c lanzada como workflow, sin esperar su resultado.** `firmador-restringido-verified`, run `wf_3873f00a-1d1`, 30 agentes con el modelo elegido por verbo (Línea Roja §6): 4 verificadores de los hallazgos 1a + 4 lectores de huecos (sonnet), 5 diseñadores de variantes del firmador (hermano-en-compose, adapter EIP-712 restringido, firmador remoto en otra máquina, payTo dedicado para la ruta durable, llave no exportable en hardware/KMS), 15 refutadores (3 lentes por variante: custodia y compromiso, protocolo, operación y línea roja), 1 crítico de completitud y 1 síntesis. Todos en SOLO LECTURA por prompt: no tocan repo, llave, sobre ni producción.
  - **Dónde cae la salida:** journal y transcripciones en
    `~/.claude/projects/-Users-yonatan-Developer-nomicheck/bcb00e6e-ab2d-46e9-8d19-e408342edc87/subagents/workflows/wf_3873f00a-1d1/` (`journal.jsonl` trae el valor de retorno de cada agente); el script en
    `~/.claude/projects/-Users-yonatan-Developer-nomicheck/bcb00e6e-ab2d-46e9-8d19-e408342edc87/workflows/scripts/firmador-restringido-verified-wf_3873f00a-1d1.js`.
    `resumeFromRunId` es de la misma sesión: una sesión fría **lee el journal**, no lo reanuda.
  - **Lo que hace la sesión fría:** leer del journal el retorno del agente `sintetizar:final` (campos `ranking`, `recomendacion`, `sin_dato`, `pregunta_a_yonatan`, `informe_md`), pegar `informe_md` en este archivo bajo «## Fase 1c — variantes y refutaciones (workflow)», **contrastar** contra los verificadores del propio journal lo que la síntesis afirme (regla #1 del vault: se escribe lo que el run dijo, no lo que iba a decir), y recién entonces llevarle a Yonatan la pregunta de la decisión 7. Si el journal muestra que la síntesis no corrió o volvió vacía, se relanza el workflow desde el script guardado.
  - **Fuentes de la fase 1a copiadas** en el scratchpad de esta sesión (se pierden al cerrar): se rebajan con `gh api -H 'Accept: application/vnd.github.raw' repos/UltravioletaDAO/x402-rs/contents/<ruta>` — `src/dx402/service.rs`, `src/dx402/gate.rs`, `src/erc8004/proof.rs`, `src/erc8004/types.rs`, `src/types.rs` — pinneando el sha **`b5f345652a7e`** (2026-09-11T00:40Z), más `curl -s https://facilitator.ultravioletadao.xyz/openapi.json`.
  - Estado: `en-curso`. Sin GO pedido ni dado; nada de producción tocado por esta tarea.

## Fase 1c — resultado parcial del workflow (2026-09-10)

El run `wf_3873f00a-1d1` terminó **a mitad de camino**: los 8 agentes de
verificación y lectura (sonnet) volvieron completos; **los 5 diseñadores de
variantes y la síntesis final murieron con «You've reached your Fable limit»**
y los 15 refutadores nunca llegaron a correr (sin diseños que refutar). 9 de 15
agentes terminaron, 1,79 M tokens, 20 min. Journal con el retorno de cada
agente: `…/subagents/workflows/wf_3873f00a-1d1/journal.jsonl`.

**Dos de los cuatro hallazgos de la fase 1a quedaron refutados**, y eso cambia
el diseño. Lo que la verificación midió:

- **H1 se sostiene entero.** `verified = gate_verdict.is_none()`
  (`service.rs:553`); sin proof → `ProofMissing` (`gate.rs:653`), sin firma →
  `SellerSignatureMissing` (`gate.rs:663`); la firma se coteja contra
  `facts.payee` leído del recibo (`gate.rs:761-770`); `signed` es diagnóstico
  (`service.rs:512-518`, `:665`); ventana `DEFAULT_ANCHOR_MAX_AGE_SECS = 900`
  (`gate.rs:70`, aplicada en `:711` → `proof.rs:529-535`). Los verdicts
  `RpcUnavailable`, `UnverifiableChain` y `EscrowNotDeployed` nunca bloquean ni
  en fase 2 (`gate.rs:196-203`).
- **H2 REFUTADO: `/settle` SÍ puede devolver `proofOfPayment`.** El struct
  `SettleResponse` que usa el handler tiene el campo opcional
  `proof_of_payment`, y su `Serialize` a mano lo emite como `proofOfPayment`
  cuando está presente (`src/types.rs:1601-1622`, `:1644-1685`); el
  doc-comment (`:1592-1598`) dice que se incluye **«when the `8004-reputation`
  extension is active in `PaymentRequirements.extra`»**. El openapi vivo no lo
  documenta: la cadena `8004-reputation` tiene **0 apariciones** en sus 128 KB y
  el schema del 200 es un `{"type":"object"}` genérico. Leer solo el openapi fue
  lo que produjo el error de la fase 1a.
- **H3 REFUTADO en su titular («el proof lo arma el vendedor»).** Hay una vía
  server-side donde lo arma **el facilitador**: `create_proof_of_payment` en
  `src/chain/evm.rs:1676-1727` llama a `ProofOfPayment::new` con el recibo real
  y el resultado va a `SettleResponse.proof_of_payment` (`:1595-1611`). El
  encoding de `paymentHash` y el resto de la mecánica de H3 siguen valiendo para
  el caso en que haya que armarlo a mano.
- **H4 se sostiene con una cita corregida:** la interfaz `SigningWalletAdapter`
  vive en `dist/wallet-w7BnImDG.d.ts:93-133`, no en `dist/ows-*.d.ts` (ahí están
  `EnvKeyAdapter` y `OWSWalletAdapter`, que la implementan).

Lo que agregaron las lecturas:

- **El dominio EIP-712 exacto:** `struct Dx402AnchorAuthorization {bytes32
  paymentId; bytes32 contentHash; string pointer; address payee}`
  (`gate.rs:88-100`), domain `{name: "DX402 Anchor", version: "1", chainId}`
  **sin `verifyingContract`** (`gate.rs:256-260`); la firma es secp256k1 **cruda
  sobre el digest, sin prefijo** (`gate.rs:287-289`), y el lado JS es idéntico
  (`dx402.ts:568-572`, `:629-653`). Eso decide qué firmadores sirven: uno que
  solo exponga `personal_sign` no sirve.
- **La cola diferida guarda `body` y `opts` verbatim** y los reenvía en los tres
  reintentos sin recalcular (`anclajeDiferido.ts:31-35`, `:383-410`,
  `:531-577`); `sign` es un callable, así que **sí podría re-invocarse**.
  `ESPERAS_MS = [30000, 120000, 300000]` suma 450 s: entra en la ventana de 900 s.
- **Dónde engancharía:** `x402MuroDurable.ts:609-625` y `:762-773` arman las
  opciones sin `sign` ni `proofOfPayment`; en mano ya hay `tx` (`:741-742`),
  `network` (`:611`), `payer` (`:608`), `amount` (`llaveDelPagador.ts:29`),
  `token` (`x402Config.ts:98`) y `payee` (`:613`).
- **Ultravioleta ya eligió que firme el vendedor:** `docs/DX402.md:224-227`
  («solo la firma del anchor necesita la clave de payTo, porque esa firma es el
  reclamo») y `05-DISENO-v0.2.md:47-58` («A. El vendedor firma el anchor
  (recomendada)… Va la A»), sobre la alternativa de comparar el payee declarado,
  que «convierte el anti-replay en un arma». El PR #3377 **no discute custodia
  ni KMS** del vendedor en ninguno de sus 4 comentarios.
- **La casa no tiene firmador declarado:** `LINEA_ROJA.md:63-65` es la ÚNICA
  mención de OWS y del Llavero en todo `sigilo` (no están en su README ni en
  AUTONOMIA.md ni en timon). `OWSWalletAdapter` del SDK **no es browser-only**
  («works with browser wallets, agent vaults, and hardware-backed signers»), pero
  su código no importa `@open-wallet-standard/core` pese al docstring.

**Lo que sigue (sesión fría).** Relanzar la fase 1c con los hechos corregidos y
en un modelo con cupo: el script está en
`…/workflows/scripts/firmador-restringido-verified-wf_3873f00a-1d1.js` y se
edita en su bloque `HECHOS` (H2 y H3 como quedaron acá) antes de correrlo.
**Antes de diseñar nada**, cerrar la pregunta que H2 abrió y que ahora es la más
barata de todas: **¿alcanza con declarar la extensión `8004-reputation` en
`PaymentRequirements.extra` para que el `/settle` de Ultravioleta devuelva el
`proofOfPayment` ya armado?** Si la respuesta es sí, la mitad del trabajo
desaparece: no hacen falta lecturas RPC ni recomputar `paymentHash`, y queda
solo la firma del anchor, que es exactamente la decisión 7. Se mide leyendo
`Erc8004Extension::from_extra` (`erc8004/types.rs:769-784`, `EXTENSION_ID =
"8004-reputation"` en `erc8004/mod.rs:72`) y el camino del settle en
`src/chain/evm.rs:1595-1727`, y se confirma con un settle real (que es de
Yonatan, porque paga).

## Fase 1c — la pregunta que abrió H2, medida (2026-09-10, solo lectura)

Fuentes: x402-rs pinneado en **`b5f345652a7e`**, bajado con `gh api` —
`src/erc8004/mod.rs`, `src/erc8004/types.rs`, `src/erc8004/proof.rs`,
`src/chain/evm.rs`. Nada tocado: ni repo de terceros, ni llave, ni producción.

**La respuesta es sí y no: declarar la extensión alcanza para que el `/settle`
devuelva el `proofOfPayment` ya armado, y ese proof NO se puede anclar tal cual.**

1. **Dónde va la declaración.** `Erc8004Extension::from_extra` busca la clave en
   el **primer nivel de `extra`** (`erc8004/types.rs:781-786`; `EXTENSION_ID =
   "8004-reputation"`, `erc8004/mod.rs:72`), no dentro de `extra.extensions`,
   que es donde nomicheck pone hoy `durable-evidence`
   (`apps/api/src/lib/x402Config.ts:537`). El único campo es `includeProof`, con
   `default = true` (`types.rs:769-779`): `extra["8004-reputation"] = {}` basta.
2. **Qué hace el settle.** Con la extensión presente, red soportada y
   `includeProof`, el facilitador arma el proof con el recibo real y lo emite en
   `SettleResponse.proofOfPayment` (`chain/evm.rs:1595-1611`, `:1676-1727`).
   Avalanche está en la lista de ERC-8004 (`erc8004/mod.rs:263`, `:296`) y es la
   única red de la ruta durable (`x402Config.ts:206`).
3. **El proof que arma el facilitador no pasa su propia puerta de anclaje.**
   `create_proof_of_payment` pone en `timestamp` la **hora de pared del
   proceso**, con el comentario de que leer el timestamp del bloque costaría
   otra llamada RPC (`chain/evm.rs:1704-1709`). La verificación del anchor exige
   **igualdad estricta** contra el timestamp del bloque —
   `if block_ts != proof.timestamp { TimestampMismatch }` (`proof.rs:531-533`;
   verdicto `proof_timestamp_mismatch`, `:193`) — y hay un test que lo fija
   (`proof.rs:1206-1218`). Que coincidan sería casualidad: el settle responde
   segundos después del bloque. Anclar el proof del settle verbatim no da
   `verified`, da `provisional` con `notVerifiedReason:
   "proof_timestamp_mismatch"`.
4. **Lo que igual desaparece, que es bastante.** El `paymentHash` viene hecho y
   la puerta lo **recomputa de los campos del propio proof**
   (`proof.rs:404-407`) sin comprometer `timestamp` (`:511-513`): pisar ese
   campo no invalida el hash. Con eso se cae el pin pendiente del `Display` de
   `MixedAddress` (las direcciones llegan serializadas por el facilitador, y el
   hash se recomputa sobre ellas) y se cae el `eth_getTransactionReceipt` (el
   `blockNumber` viene en el proof). **Queda una sola lectura:**
   `eth_getBlockByNumber(proof.blockNumber)` para corregir `timestamp` — cliente
   viem ya hay (`services/pagosService.ts`). Y queda la firma del anchor, que es
   la decisión 7 y no se movió.

**Riesgo a medir con un settle real (de Yonatan, porque paga):** `extra` hoy
lleva el dominio EIP-712 del token (`name`, `version`) que el comprador usa para
firmar; agregarle una clave de primer nivel es invisible para un cliente que lea
solo esas dos, pero eso se confirma mirando el eco del facilitador, que la API
ya compara (`x402MuroDurable.ts:560-568`).

**Candidato a reporte río arriba, aparcado (lista 2 — publicar es de Yonatan):**
el `proofOfPayment` que emite el propio facilitador es rechazado por su propia
puerta de anclaje por el `timestamp`. Es un hallazgo de una línea con test que
lo respalda; si se reporta, se reporta con el sha y las dos líneas.

**Lo que sigue.** 1c sigue sin sus variantes: relanzar el workflow desde el
script guardado con `HECHOS` corregido (H2, H3 y esto), o diseñarlas en sesión.
1d, la pregunta de la decisión 7 a Yonatan, no cambia de forma: sigue siendo la
firma del anchor y nada más. Estado: `en-curso`.
