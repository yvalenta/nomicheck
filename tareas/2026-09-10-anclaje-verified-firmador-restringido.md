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

### Relanzamiento de la fase 1c (2026-09-10)

Workflow `firmador-restringido-verified-v2`, run **`wf_7bde712c-eae`**, 22
agentes: 5 diseñadores de variantes, 15 refutadores (3 lentes por variante),
1 crítico de completitud (sonnet) y 1 síntesis. Todo solo lectura por prompt.

Qué cambió respecto del run caído `wf_3873f00a-1d1`:

- **La fase de verificación no se repite.** Sus 8 agentes volvieron completos la
  primera vez; sus resultados están incorporados al bloque `HECHOS` del script
  nuevo, ya corregidos (H2 y H3 en su versión refutada, H4 con la cita
  arreglada) más `H8`, el hallazgo del `timestamp` medido hoy. Los diseñadores
  arrancan de los hechos verdaderos, que es lo que hundió al run anterior.
- **Modelo por verbo** (Línea Roja §6): diseñar, refutar y sintetizar heredan el
  modelo de la sesión, que ahora tiene cupo; criticar va en `sonnet`.
- **Las fuentes viven en el scratchpad de esta sesión** y el script apunta ahí:
  `openapi.json` más `gate.rs`, `service.rs`, `dx402_types.rs`, `proof.rs`,
  `erc8004_types.rs`, `erc8004_mod.rs`, `evm.rs` y `src_types.rs` de x402-rs en
  `b5f345652a7e`.
- **Copia durable del script** (el scratchpad muere con la sesión):
  `~/.claude/projects/-Users-yonatan-Developer-nomicheck/271d5d3d-3b49-41b0-adf4-dbb9a8056af1/workflows/scripts/firmador-restringido-verified-v2-wf_7bde712c-eae.js`.
  El journal del run cae en el `subagents/workflows/wf_7bde712c-eae/` de la misma
  sesión. Una sesión fría **lee el journal**, no lo reanuda.

Lo que hace la sesión que reciba la salida: pegar `informe_md` de
`sintetizar:final` bajo «## Fase 1c — variantes y refutaciones (workflow)»,
contrastar contra los hechos de arriba lo que la síntesis afirme, y recién
entonces llevarle a Yonatan la pregunta de la decisión 7.

---

## Resultado del run `wf_7bde712c-eae` (2026-09-10)

22 de 22 agentes terminaron, sin errores: 4,4 M tokens, 1 h 50 min. **Las quince
refutaciones dieron `refutada: true`**: las cinco variantes cayeron por las tres
lentes. Lo que sigue es el `informe_md` que devolvió `sintetizar:final`, pegado
sin editar, y después la pasada de contraste de la sesión.

## Fase 1c — variantes y refutaciones (workflow)

Cinco diseñadores produjeron cinco variantes de firmador restringido; quince refutadores (tres lentes por variante: custodia y compromiso, protocolo, operación y Línea Roja) las atacaron por separado. **Las quince devolvieron `refutada: true`.** No es un problema de elegir bien la variante: hay siete hallazgos que valen para las cinco a la vez.

### Lo que vale para las cinco

**1. La forja de `verified` no tiene techo, y es permanente.** Lo encontraron tres lentes de custodia por separado, en tres variantes distintas. La puerta exige un `Transfer` real del token permitido, de `payer` a `payee`, por el monto declarado en el propio proof (`proof.rs`, paso 6: «The transfer the proof describes is actually in that transaction», compara `decoded.from == payer && decoded.to == payee && decoded.value == amount`). No hay piso de monto en ninguna parte. Y el registro es terminal: `registry.rs` `authority()` («2 = the chain says this is the payee») más `ladder_condition(2) = "attribute_not_exists(payment_id) OR (attribute_not_exists(verified) OR verified = :f)"`, o sea que un `verified` sólo puede tomar el slot de algo NO verificado y nada puede tomárselo a él. Consecuencia: cualquier proceso que pueda pedirle una firma al firmador se manda polvo de USDC a nuestra propia dirección de cobro, pide la firma (todos los chequeos de política pasan, porque el pago es real y es nuestro) y acuña un `verified` falso, con el `contentHash` que quiera, para siempre. Las cinco variantes lo dejan como riesgo residual y tres de ellas lo describen como «acotado a nuestros propios pagos», que es falso. Ninguna mitigación propuesta es preventiva: todas son detectivas.

**2. Nadie lee el veredicto, así que ninguna variante se puede confirmar después de desplegada.** Medido en este repo: `grep -rn 'notVerifiedReason' apps/api/src` da **0**, y `verified` aparece una sola vez en el muro y en la cola, en un comentario (`anclajeDiferido.ts:441`). Peor: `esExitoOYaAnclado` (`anclajeDiferido.ts:120-123`) devuelve true con un `pointer` no vacío, así que un anclaje provisional cuenta como éxito, resetea el cortacircuitos y se loguea igual que uno perfecto (`x402MuroDurable.ts:850-856` imprime `resultado.skipped ?? resultado.pointer`, nunca `verified`). El facilitador emite el dato justo para evitar esto: `dx402_types.rs:472-476`, «Emitted so a seller learns on the FIRST anchor that its signature was rejected ... a 201 that looks entirely successful while the anchor stays provisional forever», y el 201 de `/dx402/anchor` lo declara en el openapi vivo («body carries the signed receipt plus `verified`/`signed`/`notVerifiedReason`»).

**3. El presupuesto post-cobro ya está recortado a propósito y las cinco le suman.** `x402MuroDurable.ts:766-772`: «3s x 2 intentos = 6s de presupuesto TOTAL post-cobro», bajado de 16 s porque un cliente con timeout de 10 s cortaba antes de recibir el sobre, y el sobre no se persiste. Las cinco variantes meten ahí lecturas RPC más una ida y vuelta al firmador, y ninguna midió la latencia: es `sin_dato` en los cinco diseños.

**4. El deploy no toca ningún proceso hermano.** `deploy.sh:28` `SERVICES=(nomicheck-db nomicheck-api)`, `:169` `pull nomicheck-api`, `:178` `up -d "${SERVICES[@]}"`; y el CI publica una sola imagen (`ci.yml:161-162`). Un firmador agregado a mano al stack raíz nunca se vuelve a bajar ni a recrear: la API avanza de sha y el firmador queda congelado, y una deriva de versión del digest no tira error, deja anclajes provisionales en silencio.

**5. No hay peldaño seco.** La escalera de la Línea Roja §4 pide que ninguna salga a producción de una y que cada peldaño se mida. En las cinco, el primer ejercicio de punta a punta es una venta real en producción, y en tres de ellas además con una identidad nueva ya creada antes de la primera medición.

**6. «La venta nunca depende del firmador» vale en fase 1 y se cae en fase 2.** `anclajeDiferido.ts:150` `UMBRAL_FALLOS_CONSECUTIVOS = 5`, `:199` `VENTANA_MEDIO_ABIERTO_POLITICA_MS = 3_600_000`, y `x402MuroDurable.ts:687` `if (!anclajeDisponible()) return noDisponible();` está **antes** de `:717` `const cap = await context.capture();`. Con `DX402_REQUIRE_PROOF=true`, cinco anclajes incompletos seguidos apagan la ruta una hora, sin cobrar.

**7. Dos formatos que matan en silencio.** `proof.network` es el nombre v1 `"avalanche"` (`network.rs:33-35`, serde derivado, sin el deserializador tolerante que sí tiene el `network` del anchor), no el caip2 que hay a mano; y el preimage del `paymentHash` usa `format!("{}", payer)`, o sea el `Display` de alloy, que en la versión pinneada (verificado: `alloy-primitives 1.5.7` en el `Cargo.lock` de x402-rs) es EIP-55 con checksum, mientras todo el resto del archivo normaliza a minúsculas. Un error en el primero es 422 del body entero; en el segundo, `PaymentHashMismatch`. Dos de las quince refutaciones los fijaron; los otros trece los dejaron abiertos o los tratan como `sin_dato` a cerrar con una compra real.

Nota de precisión entre refutaciones que se contradijeron: una firma que no verifica **no** produce 422 con el slot vacío. En fase 1 el veredicto se reporta y el anclaje queda provisional (`service.rs:492-510`); el 422 `dx402_signature_not_verified` aparece sólo cuando además había un registro que no se pudo desplazar (`service.rs:676-691`).

### Ranking

| # | Variante | Lentes que refutaron | La razón, en una línea |
|---|---|---|---|
| 1 | `firmador-712-restringido` | 3 de 3 | Su defecto central (recibe el sobre typed data armado por el llamante, y viem deja pisar `types.EIP712Domain`) se arregla pasando cinco escalares, y no pide identidad nueva ni cuenta de nube. |
| 2 | `Firmador en otra caja` | 3 de 3 | Su lente de operación produjo el mejor arreglo del corpus (invertir el flujo: el firmador tira de una cola y sale del camino post-cobro), pero la caja candidata es el standby y el transporte cuesta tres ítems de lista 2 en un dashboard de un tercero. |
| 3 | `Hermano-en-compose` | 3 de 3 | Se contradice sola: la llave nace dentro del contenedor y el paso 6 de su propia rotación exige sacarla para vaciar la dirección; sin respaldo, perder el disco es perder el saldo. |
| 4 | `KMS ECC_SECG_P256K1` | 3 de 3 | Única con no-exportabilidad real, pero pone el cambio de `X402_PAY_TO` como peldaño 0, el hardware no aporta la restricción de dominio que se le atribuye, y el barrido exige construir el firmador de transacciones que la variante declara imposible. |
| 5 | `payTo dedicado` | 3 de 3 | Dominada: con firmador hermano no agrega custodia (es la 1 o la 2 con una identidad más) y hace que la defensa que la casa publica en tres lugares propios dispare sobre una venta legítima de la casa. |

### Lo que sobrevive

Un esqueleto y un orden, no una variante.

**Esqueleto.** Proceso aparte que recibe cinco escalares `{paymentId, txHash, contentHash, payee, chainId}`, nunca un digest opaco ni un sobre typed data ajeno; recompone el digest él mismo; usa la llave del payTo que ya existe, sin identidad nueva; vive fuera del camino post-cobro (el ascenso a verified va por la cola diferida); y entra a `deploy.sh` y al CI como servicio versionado. Del lado de la API, el digest se calcula con `sellerDigestFor` del propio SDK (es export público) y el callable `sign` **nunca lanza**: `anchorEvidence` envuelve todo en un try/catch que convierte cualquier excepción en `skipped: 'anchor_failed'`, o sea sin anclar, que es peor que provisional. Y la medición seca previa al cobro tiene que medir el payload real: dos refutaciones midieron por separado el delta que hoy no se mide (432 y 433 B de `proofOfPayment`, 152 y 153 B de `sellerSignature`), y con el tope de 64 KiB eso significa lotes que pasan el 413, se cobran y después no anclan.

**Orden.** Esto es lo que ninguna de las cinco propuso:

- **Peldaño 0**, sólo código, sin llave ni contenedor ni identidad: leer `verified` y `notVerifiedReason` del 201 y del GET que `recuperarEvidenciaAnclada` ya hace, loguearlos en la línea de «sobre durable servido» y contarlos en un contador propio, separado del cortacircuitos (que debe seguir midiendo «ancló o no ancló», no «verificó o no»).
- **Peldaño 1**, sin ninguna llave: armar el `proofOfPayment` nosotros y anclarlo sin firma. No llega a verified (`gate.rs:663` corta por `SellerSignatureMissing`), pero la señal es una transición observable: `notVerifiedReason` pasa de `dx402_proof_missing` a `dx402_seller_signature_missing`. Con esa sola transición se miden de golpe el formato del proof, el `paymentHash`, la corrección del timestamp, la allowlist del token y si el comprador paga v1 o v2. Cuesta una venta real, que es de Yonatan.
- **Peldaño 2**, el firmador: recién con el peldaño 1 en verde.

**Y una cosa que hay que escribir como propiedad aceptada, no como riesgo menor:** mientras el firmador no tenga una vía independiente de saber qué `contentHash` corresponde a una venta real, un compromiso de la API compra atestaciones `verified` falsas, permanentes e insuperables bajo la identidad de nomicheck. Para un producto que vende verificación, eso pesa más que el saldo del payTo.

### Un instrumento que nadie usó

El facilitador expone `GET /events`, un SSE con una línea por operación (`verify` o `settle`), cuyo payload incluye `payTo`. Ninguno de los cinco diseños ni de las quince refutaciones lo menciona. Importa porque es el único testigo de nuestras propias ventas **que no escribe nuestro proceso**: varias refutaciones descartaron el tripwire «firmas del firmador contra ventas de la API» porque el atacante escribe los dos lados, y un pago de polvo fabricado on-chain no pasa por el `/settle` del facilitador, así que no aparece ahí. Caveats del propio openapi, que hay que decir junto con la idea: el stream es «lossy on purpose», devuelve 404 si el operador lo apagó y 503 al llegar al tope de suscriptores, y las variables que lo filtran (`X402_EVENTS_SCOPE`, `X402_EVENTS_ALLOWLIST`) son del operador del facilitador, no nuestras, así que el filtrado por `payTo` lo haríamos del lado cliente. Es un testigo de mejor esfuerzo, no una auditoría. `GET /dx402/stats` da un contador agregado de anchors que el propio openapi llama «a floor, not a ledger».

### Sin dato, con cómo se cierra

| Qué falta | Cómo se cierra |
|---|---|
| Si el facilitador en producción corre algo compatible con `b5f345652a7e` | `curl -s https://facilitator.ultravioletadao.xyz/version` (da semver, no sha) |
| Si el comprador real paga v1 o v2 | Loguear `Object.keys(cap.response)` en la próxima venta, o un test con `crearMiddlewareDurable` y handlers dobles |
| Si el facilitador ECHOA `extra["8004-reputation"]` | POST a `/accepts` con el accept real. No corrido: es un POST a un tercero. La cadena no aparece ni una vez en los 128 KB del openapi (verificado: 0 ocurrencias) |
| `~/docker-lab/docker-compose.yml` | `ssh ynt@18.191.129.33 'cat ~/docker-lab/docker-compose.yml'`. Sostiene el argumento de aislamiento de cuatro variantes y nadie lo leyó |
| Latencia RPC de Avalanche desde la Lightsail | 20 `eth_blockNumber` cronometrados desde la caja, ordenados |
| El valor esperado del `paymentHash` | El peldaño 1, o un settle real. El encoding está leído y la versión de alloy confirmada; el valor esperado no está en el fuente |
| Dónde vive la llave de `X402_PAY_TO` | Pregunta a Yonatan, no medición |
| Volumen real de `/verificar/durable` | Cero medido: la ruta está apagada y el precio es 0,02 USD (`x402Config.ts:164`) |
| Si `/events` está encendido y aparece nuestro payTo | `curl -N -s https://facilitator.ultravioletadao.xyz/events \| head -40` |
| Si la bitácora del firmador choca con `habeasData.retencionExterna` | Leer `x402MuroDurable.ts:495-501` contra el diseño de la bitácora. Ese ángulo se auditó en una sola de las cinco variantes |

### Lo que decide Yonatan

La decisión 7 vuelve a la mesa con cuatro opciones (A: sigue NO; B: peldaño 1 sin llave; C: custodio callable con la llave del payTo actual; D: custodio callable con llave nueva, en el firmador o en KMS) y una pregunta previa que decide si C existe siquiera: si hoy hay una llave para `X402_PAY_TO` y si es accesible. El detalle de costo y beneficio de cada opción va en el mensaje que acompaña a este informe. Aparte queda si el hallazgo H8 se le reporta a Ultravioleta: publicar es lista 2.
### Contraste de la sesión (lo que verifiqué yo, no el workflow)

Regla #1 del vault: se escribe lo que el run dijo, no lo que iba a decir. Comprobé
a mano las afirmaciones que sostienen la decisión, y una corrección que el informe
no hace.

**Se sostienen, verificadas contra la fuente:**

- **La forja de `verified` es real y permanente.** `authority()` devuelve 2 para
  `verified`, 1 para `signed`, 0 si no (`registry.rs:43-52`), y
  `ladder_condition(2)` sólo permite tomar el slot de filas NO verificadas
  (`registry.rs:302-316`): nada desplaza a un `verified`, ni otro `verified`. En
  `proof.rs` el paso 6 compara el log `Transfer` contra el monto que declara el
  propio proof, sin piso.
- **Nadie lee el veredicto.** `grep -rn "notVerifiedReason" apps/api/src` da 0
  fuera de tests, y `esExitoOYaAnclado` (`anclajeDiferido.ts:120-123`) devuelve
  true con un `pointer` no vacío sin mirar `verified`: un provisional cuenta como
  éxito y resetea el cortacircuitos.
- **`network` del proof es el nombre v1.** `#[serde(rename = "avalanche")]`
  (`network.rs:33-35`); un CAIP-2 no deserializa.

**Corrección que el informe no hace, y que cambia el tamaño del peldaño 1:** el
`proofOfPayment` del `/settle` **nunca llega a nuestro código**, aunque el
facilitador lo emita. Los dos lugares que arman el objeto que vemos son listas
blancas que lo descartan: `adaptSettleResponseV2ToV1` deja `{success,
transaction, network, payer, errorReason?}` (`@faremeter/types`
`dist/src/x402-adapters.js:170-181`, llamado en `@faremeter/middleware`
`dist/src/common.js:508`) y `normalizeSettleResponse` hace lo mismo
(`dist/src/x402.js`, llamado en `dist/src/http-handler.js:117`). Sumado a H8 —el
proof que arma el facilitador trae la hora de pared y su propia puerta exige el
timestamp del bloque— la conclusión práctica es que **el proof se arma acá
siempre**, y declarar la extensión `8004-reputation` no ahorra nada del lado del
vendedor. La fila «si el facilitador echoa la extensión» del informe queda como
curiosidad, no como camino.

**Estado: `en-curso`, no bloqueada.** El peldaño 0 del informe —leer `verified` y
`notVerifiedReason` del 201 y del GET, loguearlos y contarlos aparte del
cortacircuitos— es sólo código, sin llave, sin identidad y sin gasto: cualquier
sesión lo puede hacer sin Yonatan, y sin eso ninguna variante se puede confirmar
después de desplegada. Lo que sí espera a Yonatan es la decisión 7, con las
cuatro opciones del informe y la pregunta previa de si hoy existe una llave para
`X402_PAY_TO` y si es accesible.

## Peldaño 0 — hecho (2026-09-12)

Lo único del orden de peldaños que una sesión puede hacer sola: sin llave, sin
identidad, sin gasto y sin tocar producción. Antes de esto, `grep -rn
"notVerifiedReason" apps/api/src` daba cero fuera de tests: el facilitador
contesta qué vale cada anclaje y nadie lo leía.

- **Se lee el veredicto.** `leerVeredicto` (`apps/api/src/lib/anclajeDiferido.ts`)
  saca `verified` y `notVerifiedReason` del resultado del anchor —el 201 del
  camino inmediato, el registro que devuelve `recuperarEvidenciaAnclada` en el
  409, y el de la cola diferida, que son el mismo objeto normalizado—. Solo
  `boolean`: un `"true"` de string o un `1` no son veredicto.
- **Se logea.** La línea `sobre durable servido` (`x402MuroDurable.ts`) lleva
  ahora `verified` y `notVerifiedReason` cuando el registro los trae, más el
  acumulado. Las dos líneas de `anclaje diferido logrado` llevan el acumulado.
  El header del comprador NO cambia: el vocabulario DX402 no tiene el veredicto
  y el sobre ya está firmado cuando esto se lee.
- **Se cuenta aparte.** `registrarVeredicto` / `contadorVeredictos` mantienen
  `{verificados, provisionales, sinVeredicto}` en memoria, separados del
  cortacircuitos, que sigue midiendo «ancló o no ancló» — mezclarlos apagaría
  `/verificar/durable` entera hoy mismo, porque cada venta es un provisional.
  `sinVeredicto` es su propia fila: un registro sin el campo es falta de dato,
  no un provisional medido. Solo cuenta lo que tiene `pointer`: un fallo, un
  diferido o un `registro_ajeno` no son registros nuestros de los que leer nada.

**Verificación.** `pnpm test` en la raíz: 1.894 pruebas verdes (api 1.176, web
205, reglas 478, mcp 35), `tsc --noEmit` de `apps/api` en 0. Nueve pruebas
nuevas: siete de unidad en `anclajeDiferido.test.ts` —incluida una racha de
ocho provisionales que NO abre el cortacircuitos— y dos de integración en
`x402MuroDurable.test.ts`, que venden una vez contra un facilitador que ancla
con `verified: false`. Prueba negativa corrida: sacando `...veredicto` de la
línea de log, la integración se pone roja (`expected { …(10) } to match object
{ verified: false, …(2) }`); revertido.

**Lo que esto habilita y lo que no.** Habilita medir el peldaño 1 cuando se
haga: la transición de `dx402_proof_missing` a `dx402_seller_signature_missing`
ahora es legible en el log de la venta, que era la única señal que ese peldaño
produce. No cambia nada de lo que el comprador recibe, no acerca ningún anclaje
a `verified`, y no toca la decisión 7, que sigue siendo de Yonatan.

## La premisa se cayó: no seríamos los primeros (2026-09-12)

Workflow `wf_03be83d9-a2a`, 11 agentes (5 mediciones + 5 refutadores + síntesis),
1,55 M tokens, 28 min, 0 errores. Todo de sólo lectura: ningún POST a un tercero,
ningún gasto, ninguna llave. El informe completo del run está en la tarea del
harness; acá va lo que sobrevivió, separado por quién lo verificó.

### Verificado a mano en esta sesión

- **Ya hay anclajes ajenos `verified: true` en este facilitador.**
  `curl -s https://facilitator.ultravioletadao.xyz/dx402/evidence/0x950293081222e35b3dcd2cbf4bd98157caca76e394bc92f59ba4f36ecb612fff`
  devuelve 200 con `"verified": true, "signed": true`, `receiptSigner`
  `0x7bC4b9cc90a057A95A0F5a8F93C3e3996EE4e0DF`, anclado el 1789073367.
  **Esto tumba la premisa de la que venía toda la tarea** (informe §3a: «lo que
  quedó con apalancamiento real es que nomicheck sea el primer vendedor tercero
  con anclajes que cuenten»). No seríamos los primeros; seríamos uno más.
- **El SDK no tiene campo `sellerSignature` en `AnchorOptions`**: tiene
  `sign?: (digest: Uint8Array) => string | Promise<string>`
  (`uvd-x402-sdk@2.88.0` `dist/index.d.ts:305`) y arma la firma con él
  (`dist/index.js:2493`, `payload.sellerSignature = await opts.sign(digest)`).
  Hoy `opcionesBase` (`x402MuroDurable.ts:611-625`) no pasa **ninguna** de las
  dos entradas: ni `sign` ni `proofOfPayment`. Faltan las dos, no una.
- **El 200 del `GET /dx402/evidence/{paymentId}` no declara
  `notVerifiedReason` en ninguna parte del openapi; sólo el 201 del anchor lo
  declara** (verificado sobre el openapi vivo 2.26.0). El GET sí devuelve
  `verified` y `signed` (visto en la respuesta real de arriba, aunque el
  esquema del 200 esté tipado como objeto libre). Consecuencia para el peldaño
  0 que se acaba de implementar: por el camino del 409 el veredicto se lee
  igual, pero el MOTIVO nunca llega, y esas filas caen —correctamente— en
  `sinVeredicto`.

### Del workflow, con su fuente, no re-verificado a escala

- **81 anclajes `verified: true` + `signed: true`**, de 20 payees distintos, en
  7 redes (arbitrum 38, avalanche 16, base 13, monad 5, optimism 4, polygon 3,
  ethereum 2), entre el 2026-09-03 y el 2026-09-10. Método: derivar 807
  `paymentId` de los `txHash` que devuelve `GET /transactions?network=<slug>`
  sobre los 17 slugs de `/api/stats`; 232 tenían evidencia. Yo verifiqué uno de
  esos 81.
- **En esos 232 registros no hay ni uno con `verified: true` y `signed: false`.**
  Empíricamente, verified no llega sin la firma del vendedor — o sea que el
  peldaño 1 (proof sin firma) nunca puede ser el destino, sólo el instrumento.
- **`GET /transactions` NO sirve como testigo de ausencia:** su filtro
  `network` no es prefijo y omite filas (`limit=20&network=avalanche` devolvió
  13 y se comió 101 filas probadas por otra vía). Sirve para encontrar, no para
  demostrar que algo no pasó. Con eso se cae también «nadie llega a verified»
  como afirmación negativa.
- Defecto en nuestro código, distinto del de hoy: `anclajeDiferido.ts:573`
  colapsa 404, 410 y 503 del GET de evidencia en un solo `if (!res.ok)` y los
  degrada todos a `skipped: "already_anchored"`. El openapi es explícito en que
  no son intercambiables («In a dispute those are not interchangeable») y el 503
  es reintentable. Queda anotado, no arreglado en este bloque.

### Corrección al propio informe del workflow

La síntesis afirma que la puerta del proof es una **ventana** y no una igualdad
estricta, y con eso da por refutado H8. **No se sostiene tal como está escrita:**
`ERC8004_PROOF_MAX_AGE_SECS` aparece **una sola vez** en los 128 KB del openapi,
y es en la prosa de `POST /feedback` — el riel ERC-8004 de calificaciones, no el
anchor. La prosa de `POST /dx402/anchor` no menciona ninguna puerta de timestamp.
Así que H8 (leído del fuente de x402-rs, `gate.rs`) **no queda ni confirmado ni
refutado**: sigue sin dato, con la diferencia de que ahora se sabe que el otro
riel del mismo facilitador publica una ventana. Cerrarlo sigue pidiendo el
fuente pinneado o un anclaje de prueba.

### Qué cambia para la decisión 7

- **A (sigue no) queda peor parada.** Provisional no es un estado estable: el
  `paymentId` lo deriva cualquiera desde la cadena —probado a escala, 807
  derivados y 232 aciertos—, `/dx402/anchor` no exige identidad, y un claim más
  fuerte de un tercero ocupa el slot sin que lo podamos desplazar
  (`/dx402/repair` es admin-only y no escala autoridad).
- **B (peldaño 1 sin llave) queda mejor como instrumento y peor como destino:**
  no hay un solo verified sin signed.
- **C y D quedan mejor paradas**: el gancho `sign` ya existe en el SDK y no hay
  arquitectura que inventar. Lo que las separa sigue siendo tuyo.
- **Y una pregunta nueva que la premisa caída abre:** si ya hay 20 payees con
  anclajes verified, ¿qué vale llegar? Deja de ser «ser el primero» y pasa a ser
  «no ser el único que vende verificación con evidencia provisional». Eso puede
  cambiar de lado la respuesta a la decisión 7, y es tuya.

## Arreglado el colapso de 404/410/503 (2026-09-13)

El defecto que encontró el workflow, atacado. `recuperarEvidenciaAnclada`
colapsaba las tres respuestas de fallo del `GET /dx402/evidence/{paymentId}` en
un solo `if (!res.ok)` que servía el mismo `skipped: "already_anchored"` pelado.
El openapi vivo declara exactamente 200/404/410/503, dice que «404 and 410 are
different answers … In a dispute those are not interchangeable» y marca el 503
como «Index unavailable — RETRYABLE».

- **Tres motivos distintos, en `error`:** `evidencia_inexistente` (404),
  `evidencia_vencida` (410), `evidencia_ilegible` (503, timeout, red cortada).
  Van junto al `registro_ajeno` que ya existía; el `parseEvidenceHeader` del
  comprador (`uvd-x402-sdk` `dist/index.js:2047`) lanza
  `EvidenceSkipped(payload.skipped)` y no mira `error`, así que sumar valores no
  le rompe la lectura a nadie — verificado en el fuente del SDK.
- **El 404 se grita como `error`, no como `warn`:** que el anchor conteste 409 y
  el índice conteste «nunca hubo registro» es una contradicción entre dos
  endpoints del mismo facilitador. Es posible sin que nadie mienta —`/dx402/stats`
  avisa que «records whose index write failed are not counted»— pero para el
  vendedor significa que su evidencia no se puede recuperar por `paymentId`, que
  es la única forma que tiene el comprador de volver a pedirla.
- **Sólo lo reintentable se difiere.** `lecturaReintentable` es nueva y la
  consulta el muro. Antes, un 409 resuelto contra un GET ilegible cerraba la
  venta sin pointer y sin reintento: el pointer quedaba perdido para siempre del
  lado del vendedor aunque el registro existiera. Ahora se encola, y a los 30 s
  `intentarAhora` vuelve a anclar, recibe otro 409 y relee el registro. Un 404 o
  un 410 no entran: son finales del facilitador y reintentarlos es ruido.
- **No se reintenta INLINE.** El presupuesto post-cobro son 6 s (dos intentos de
  3 s) y este camino ya gastó un anchor y un GET; sumarle otro par arriesga el
  timeout de 10 s del comprador, que es lo que la reparación de ronda 1 vino a
  arreglar. Sólo se difiere.
- **El comprador ahora recibe `deferred: true` en ese caso**, que es lo cierto:
  vale la pena que vuelva a preguntar por `GET /dx402/evidence/{paymentId}`.
- La decisión de diferir quedó en un solo lugar, sobre el resultado FINAL: el
  409 puede caer en cualquiera de los dos intentos, y cuando caía en el segundo
  la rama que decidía ya se había cerrado. Ese fue el primer intento de arreglo
  y lo agarró el test de integración, no la lectura.

**Verificación.** `pnpm test` en la raíz: 1.899 verdes (api 1.181, web 205,
reglas 478, mcp 35), `tsc --noEmit` en 0. Cinco pruebas nuevas de unidad (404,
410, 503 y fetch que lanza, 200 sin pointer, registro ajeno) y dos de
integración (503 difiere con motivo; 410 no difiere y trae otro motivo); una
vieja se reescribió porque afirmaba el colapso. Prueba negativa corrida: sacando
el 410 de la tabla de motivos caen las dos pruebas del 410, una por el motivo y
otra por el diferido; revertido.
