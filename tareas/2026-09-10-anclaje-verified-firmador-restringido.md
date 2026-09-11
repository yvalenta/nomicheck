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
