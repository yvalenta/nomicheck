---
estado: en-curso
dueño: ambos
fecha: 2026-09-08
tema: nomicheck como primer vendedor externo con durable-evidence (DX402) y un sobre adentro — la cadena completa sin creerle a nadie
criterio_cierre: un pago real a nomicheck en el facilitador de Ultravioleta con `acceptIndexes` opt-in produce un registro DX402 cuyo cuerpo es un sobre firmado por nomicheck; `testigo verify --secp-key <llave del pagador> --sobre-key <pública de nomicheck> --expected-signer <receiptSigner pinneado>` da `verified` en los cuatro eslabones (exit 0) y el sobre del veredicto firmado por el testigo verifica
---

Viene de `testigo/tareas/2026-09-07-dx402-verificador-testigo.md` («Lo que
falta», punto 2). El verificador ya existe y está probado adversarialmente
(cuatro pasadas, 146 pruebas); lo que falta es un vendedor real que ancle.

## Qué hay que hacer acá (solo lectura primero, GO de Yonatan para lo demás)

1. **Solo lectura:** ver si el `/settle` traducido a v1 trae los campos de
   ProofOfPayment que `/dx402/anchor` exige (referencia: x402-rs
   `src/dx402/receipt.rs`, commit 31b5e9f4919b, copiado en
   `testigo/reference/x402-rs/`).
2. Opt-in durable-evidence en `apps/api/src/lib/x402Muro.ts` (`acceptIndexes`
   en las `extensions` del 402). Tres GO de Yonatan detrás: llave, gasto,
   despliegue.
3. Que el cuerpo vendido sea un sobre (`~/Developer/sobre`, Ruby o JS): firma
   Ed25519 de nomicheck + `reglasHash` + `reglasVerificadasAl` + `habeasData`.
   Servir la pública en una URL https (testigo la lee con `--sobre-key`).
   Cuidado con lo que testigo rechaza como sobre: claves duplicadas, campos
   extra en `signature`, `signature` anidado, nulos (los descarta la
   canonicalización y quedan sin firmar).
4. La compra real es de Yonatan (línea roja, lista 2). Después:
   `testigo fetch <paymentId> --dir x && testigo verify --dir x --secp-key … --sobre-key … --expected-signer …`.

Precedente que pesó en x402 #3304: «tres implementaciones independientes
reproducen los vectores byte a byte». Un vendedor real anclado con un sobre
adentro es la evidencia que ningún otro tiene en el hilo de #3377.

## Bitácora
- 2026-09-08: arranca el punto 1 (solo lectura) en el worktree `tarea/dx402-vendedor-sobre`. El archivo nació sin commit en `main` (lo dejó la sesión 4 de testigo, bf55698); se movió acá y se commitea con la declaración. Referencia viva que manda sobre este punto: `testigo/tareas/2026-09-08-compra-real.md` (el 402 debe declarar `accepts[i].extra.extensions["durable-evidence"]` + `extensions["durable-evidence"].info.acceptIndexes`, si no el header sale `skipped: not_selected`).
- 2026-09-09: **punto 1 hecho.** Workflow `dx402-vendedor-cruce` (11 agentes, modelo por verbo, 1,73 M tokens, 42 min, 0 errores): seis lectores, matriz, tres refutadores, síntesis. El dossier va abajo tal cual salió; encima, lo que la sesión verificó a mano sobre él. Los puntos 2–4 siguen aparcados: cada uno pide una decisión de Yonatan (lista al final del dossier).

- 2026-09-09 (Yonatan, decisiones para el punto 2): **ruta propia `/verificar/durable`**, **red Avalanche** (la liquida Ultravioleta; C-Chain `eip155:43114`), **llave Ed25519 nueva para el sobre** (la crea Yonatan: es identidad, lista 2). Quedan abiertas: precio de la variante, vender con backends 90d revocables, cobro sin entrega, GO de despliegue y de compra. La sesión cortó acá por la regla de 200k (270k medidos); no se tocó código.

## Lo que sigue (para una sesión fría: `cd ~/Developer/nomicheck && claude` → `/casa nomicheck`)

Punto 2, en worktree propio (`git worktree add ~/Developer/worktrees/nomicheck--dx402-punto-2 -b tarea/dx402-punto-2`). El dossier de abajo trae las citas; el orden:

1. **Primero, solo lectura, la incógnita que Avalanche abre:** el dossier dejó sin_dato si el facilitador ancla en Avalanche (tabla de tokens del gate en `src/erc8004/proof.rs`, RPC). Comprobar con GET (`/supported`, `/dx402/stats`) y en el fuente de x402-rs `31b5e9f4919b` (bajarlo de nuevo: el scratchpad de la sesión anterior no sobrevive). Si Avalanche no ancla, volver a Yonatan antes de escribir una línea.
2. **La ruta:** `/verificar/durable` en `PRECIOS_USD` + `DESCRIPCIONES` + `ESQUEMA_POR_RUTA` (mismo esquema que `/verificar`); decidir si su `/csv` automático (`rutasPublicasConMuro`) se vende o se excluye; tests `x402Config.test.ts:248,279,292` y `x402Muro.test.ts:340-346` cambian a propósito.
3. **La oferta:** en `requisitoDePago`, para esa ruta y solo Avalanche, `extra.extensions["durable-evidence"]` con `info` (`acceptIndexes`, `retention: "90d"`, `mode: "direct"`) y `schema` (forma real: leer `DurableEvidenceInfo::declare` en `crates/x402-axum/src/durable.rs`); `desafioDeDescubrimiento` con el `extensions` de nivel superior. `x402Muro.ts:332` deja de condicionar `extensiones` a `autenticaCdp`.
4. **El sobre:** módulo nuevo junto a `batchSignatureService.ts`: salida de `/verificar` + `reglasHash`/`REGLAS_VERIFICADAS_AL` (`reglasVerificadasService.ts`) + `construirHabeasData()` → canonicalizar y firmar con `sobre.mjs` (`~/Developer/sobre`, decidir vendorizar o dependencia) con la llave nueva en env (`NOMICHECK_SOBRE_SIGNING_KEY_PEM`, patrón de `batchSignatureService.ts:16`); servir la pública en `GET /api/batch/verificar/durable/sobre-publickey` (o la URL que Yonatan fije). Los bytes servidos son exactamente los firmados y sellados.
5. **El sellado y el ancla:** dependencia `uvd-x402-sdk` 2.88.0: `payerKeyFromEvmSignature` (del header de pago + `extra.name/version` + chainId + asset), `paymentId(caip2, tx)` con `transaction` de `PAYMENT-RESPONSE`, `sealEvidence`, `anchorEvidence` con `sealed` inline, `backend: "s3"`, `mode: "direct"`, `retention: "90d"`, sin `sellerSignature` (provisional a propósito; recibo firmado igual); `X-Durable-Evidence` con `evidenceHeader`. Nunca `res.json()` sobre la respuesta cruda del settle: `res.clone()` o la cabecera.
6. **Prueba negativa y refutador** antes de dar por verde: comprador que paga la oferta plana de `/verificar` no recibe evidencia; cuerpo > tope → `skipped: too_large` con la respuesta entregada; anchor caído → 200 igual con `skipped`; tests de `x402Muro.test.ts` verdes.
7. **Aparca:** desplegar (GO), la compra real (`testigo/tareas/2026-09-08-compra-real.md`; avisar a esa tarea que la red es Avalanche, no Base/Monad: la hot wallet se fondea con USDC de Avalanche C-Chain).

## Punto 1 — resultado (2026-09-09)

**Veredicto.** No hay «settle traducido a v1» del lado de la respuesta: `aFormatoV1` traduce el *request* y copia `extra` entero (`x402Muro.ts:135`); la respuesta del `/settle` la parsea faremeter y la deja ENTERA en la cabecera `PAYMENT-RESPONSE` antes de llamar al handler (comprador v2), o recortada a `success/transaction/network/payer` en `X-PAYMENT-RESPONSE` (comprador v1). Con eso, más la config (`payTo`, red) y el header de pago del request (firma + `authorization` → llave del pagador), nomicheck tiene todo lo que `POST /dx402/anchor` exige como obligatorio. `proofOfPayment` es opcional en el wire (`src/dx402/types.rs:594`) y `sellerSignature` también (`:601`): sin ellos el anchor queda *provisional* (`verified:false`), pero el recibo lo firma igual el facilitador y eso es lo único que testigo verifica.

**Verificado por la sesión, sobre el dossier:**
- El recibo EIP-712 se firma para TODO anchor, provisional o no: `src/dx402/service.rs:647` (`receipt::sign(&receipt_body, &self.signer, chain_id)`) antes de `registry.put` (`:680`). `signed` = «la firma del payee coincidió» (`service.rs:665`, `types.rs:500`); `verified` = «el gate concluyó» (`types.rs:482`). El `signed: false` de `docs/DX402.md:90` es el del vendedor, no el del recibo. Consecuencia: la llave EVM del payTo **no hace falta** para el criterio de cierre (testigo exige recibo firmado por el `receiptSigner`, no `verified`), y no entra al proceso (Línea Roja §3). Queda como mejora opcional con firmador externo (`anchorDigest` del SDK).
- `AnchorRequest` en el wire (`src/dx402/types.rs:551-606`, re-bajado: el workflow leyó una página de rate-limit): `payment_id`, `network` (nombre v1 o CAIP-2), `tx_hash`, `payer`, `payee`, `pointer?` o `sealed?` (base64; el facilitador aloja y emite el pointer), `backend`, `content_hash`, `key_alg`, `mode`, `retention`, `wrapped_cek?` (solo escrowed), `proof_of_payment?`, `seller_signature?`.
- faremeter 0.22.0 empareja el pago con la PRIMERA oferta que coincide en scheme+network(+asset) y avisa por log si hay más de una (`common.js:36-49`, «XXX … really should be an error»): dos ofertas por red es inviable, confirmado a ojo.
- Versiones: x402-rs commit `31b5e9f4919b` (2.16.0, el pinneado en `testigo/reference/x402-rs/COMMIT`); SDK `uvd-x402-sdk` 2.88.0, main `48519e0f` (2026-09-08). El dossier los marca sin_dato porque los lectores no vieron el COMMIT.
- Registro real de monad (`testigo/monad/evidence.json`): `verified:true, signed:true` — un vendedor que sí firmó; no es evidencia de que un provisional no sirva.

### Dossier del cruce (salida del workflow, sin editar)

#### Dossier — nomicheck como vendedor DX402 con sobre (cruce matriz × refutaciones, 9-sep-2026)

Convención de rutas: `N/` = /Users/yonatan/Developer/nomicheck/apps/api/src/lib; `F/` = node_modules/.pnpm/@faremeter+middleware@0.22.0/…/dist/src; `FT/` = @faremeter/types@0.22.0/…/dist/src; `$X/` = facilitador x402-rs (copia remota, commit sin_dato); `T/` = /Users/yonatan/Developer/testigo. Lo que ningún lector vio va como sin_dato.

#### Punto 1 — veredicto

No existe «el /settle traducido a v1» como respuesta procesada: `aFormatoV1` transforma el REQUEST que el muro manda al facilitador (paymentPayload/paymentRequirements), aplana `resource` a `resource: recurso.url` (`N/x402Muro.ts:119,129`), copia `extra` verbatim (`N/x402Muro.ts:135`) y solo descarta `accepted` (`N/__tests__/x402Muro.test.ts:105-106`). La respuesta del /settle no la parsea nomicheck sino faremeter: `F/http-handler.js:81` (`safeJSON`), validada con `x402SettleResponse` (`FT/x402v2.js:56-63`, arktype conserva claves no declaradas) y escrita ENTERA en la cabecera `PAYMENT-RESPONSE` antes de `next()` (`F/common.js:569-573`, `F/express.js:34,47-53`); dentro de la ruta con muro, `res.getHeader("PAYMENT-RESPONSE")` ya trae `transaction/payer/network` y `proofOfPayment` si el facilitador lo mandó. Eso vale solo para comprador v2 con /settle v2 estricto: para comprador v1, `adaptSettleResponseV2ToV1` reconstruye 5 campos (`FT/x402-adapters.js:170-181`, `F/common.js:508`) y si el facilitador contesta v1, la rama lenient poda todo lo demás (`FT/x402-adapters.js:206-228`). Si Ultravioleta llena `proofOfPayment` en /settle es sin_dato: el único texto que lo afirma es un comentario que lo ata a la extensión `8004-reputation`, no a `durable-evidence` (`$X/src/types.rs:1596-1598`), y `ProofOfPayment` no se construye fuera de `mod tests` en el árbol leído (`$X/src/erc8004/proof.rs:864,994,1269,1295`; `$X/src/dx402/gate.rs:1058,1126`). Y el objeto exigido tiene NUEVE campos no-Option, no siete: la matriz omitió `network` y `token` (`$X/src/erc8004/types.rs:656-675`), y `network` se verifica (`$X/src/erc8004/proof.rs:400-402`).

#### Lo que DX402 exige al vendedor (cadena por petición)

1. Liquidar: lo hace faremeter antes del handler (`F/express.js:47-53`). Leer el settle de `PAYMENT-RESPONSE` (`F/common.js:569-573`). Si se quiere el body crudo desde `fetchDelFacilitador` (`N/x402Muro.ts:249,266`), usar `res.clone().json()`: un Response se lee una vez y `safeJSON` lanza en la segunda (`F/http-handler.js:101-107`; medido: `Body is unusable`).
2. Saber qué oferta se pagó: el adaptador Express descarta `context.paymentRequirements/paymentPayload` (`F/express.js:47-53`); nomicheck debe decodificar el header de pago del request por su cuenta.
3. Sobre: salida de la ruta + `reglasHash`/`REGLAS_VERIFICADAS_AL` (`N/reglasVerificadasService.ts:32,79-108`) + `construirHabeasData()` (`N/batchPublicoService.ts:92-99`), canonicalizar (`sobre/SPEC.md:87-96`), firmar Ed25519 con el patrón de `N/batchSignatureService.ts:16,114-133`. El JSON firmado es el plaintext servido y sellado; mismos bytes (`$X/crates/x402-axum/src/durable.rs:730-733`).
4. `content_hash = keccak256(plaintext)`, nunca del ciphertext (`$X/src/dx402/mod.rs:65-73`); testigo exige además que no coincida con el hash del blob servido (`T/lib/testigo/anchor.rb:22-36`).
5. `payerKey`: de `paymentPayload.payload.signature` + `authorization` con el dominio EIP-712 del token (`$X/src/dx402/payer.rs:51-130`); nomicheck ya tiene (name, version) por red (`N/x402Config.ts:410-411`); en el SDK TS, `payerKeyFromEvmSignature` (`uvd-x402-sdk dx402.ts:462-465`).
6. Sellar: `sealEvidence(body, payerKey, paymentId)` (`dx402.ts:493-497`); `paymentId = keccak256(caip2||txHash)` (`dx402.ts:150-157`).
7. `seller_signature` con la llave EVM del payTo (`dx402.ts:851-858,1104-1109`): OPCIONAL para el criterio de cierre — testigo no lee firma del vendedor en ninguna línea (`grep` en `T/lib` y `T/bin`: solo el comentario `T/lib/testigo.rb:25`); sin ella el anchor es provisional. Si un anchor provisional emite recibo firmado y fetchable: sin_dato (las líneas `service.rs:495-512` que la matriz cita no están en `T/reference/x402-rs`).
8. `anchorEvidence(body, opts)` (`dx402.ts:811-897`) nunca lanza: todo fallo es `result.skipped` (`dx402.ts:902-904`); adjuntar `X-Durable-Evidence` con `evidenceHeader(result)` (`dx402.ts:1203-1211`) y servir exactamente los bytes hasheados.

#### Lo que el muro tiene hoy

| Campo | Fuente en nomicheck | Hueco |
|---|---|---|
| `payment_id` | derivable: red (config) + `transaction` de `PAYMENT-RESPONSE` (`FT/x402v2.js:56-63`) | sin función `payment_id()`; fórmula `dx402.ts:150-157` |
| `network` | `cfg.redes`/`facilitadorDe` (`N/x402Config.ts:290-293,311-313`) | cablear; y decidir la red (ver Decisiones) |
| `tx_hash` | `PAYMENT-RESPONSE.transaction` (`F/common.js:569-573`) | leerlo en el handler; hoy nadie lo lee |
| `payer` | `PAYMENT-RESPONSE.payer` o `authorization.from` del header de pago | sin extracción hoy en `N/x402Muro.ts` |
| `payee` | `X402_PAY_TO` (`N/x402Config.ts:266-308`) | pasarlo al anchor |
| `pointer`/`sealed` | el facilitador almacena: `T/monad/evidence.json` pointer `ipfs+https://facilitator…/dx402/blob/…`, blob 2.375 B (`T/monad/observed.json`) | sin sellado integrado; `sealed` inline cabe (~48 KB útiles, `docs/DX402.md:344-347`) |
| `backend` | enum `Ipfs/Arweave/S3` (`$X/src/dx402/service.rs:73-77`); habilitados en vivo `s3`, `ipfs-private` (`T/monad/stats.json`) | fijar constante |
| `content_hash` | ninguna | keccak256 del JSON de salida en las 5 rutas |
| `key_alg` | de `sealed.recipients[0]` (`durable.rs:733-748`) | depende del sellado |
| `mode` | ninguna | `direct` (`Escrowed` conserva `wrapped_cek`, `Direct` lo descarta: `$X/src/dx402/service.rs:672-673`) |
| `retention` | propiedad del BACKEND: habilitados dan `90d`, `revocable:true`; `permanent` está `enabled:false` (`T/monad/stats.json`) | no hay decisión 90d/1y: solo 90d |
| `proof_of_payment` | `PAYMENT-RESPONSE.proofOfPayment` si el facilitador lo llena (sin_dato) | 9 campos (`$X/src/erc8004/types.rs:656-675`); `payment_hash` concatena payer/payee como ASCII, no bytes (`types.rs:740-743`); mismatch → `proof.rs:407-409` |
| `seller_signature` | ninguna; llave del payTo, distinta de la Ed25519 del sobre | Línea Roja §3; no necesaria para `verified` en testigo |

#### La declaración del 402

- `extensions` de nivel superior por la vía de hoy está MUERTA: nomicheck lo inyecta en el /accepts sintetizado (`N/x402Muro.ts:216-223`) y faremeter devuelve solo `parsed.accepts` (`F/http-handler.js:58-65`); medido: cero referencias a `extensions` en lo devuelto. El cuerpo del 402 es v1 (`supportedVersions x402v1:true`, `N/x402Muro.ts:342`; `F/common.js:421-423`) y el esquema v1 no tiene lugar para `extensions` (`FT/x402-adapters.js:124-130`). La mitad Bazaar que sí viaja es la del /settle (`N/x402Muro.ts:238-240`); el comentario de `N/x402Muro.ts:197-201` está vencido.
- Parche mínimo, dos superficies: (a) `desafioDeDescubrimiento` (`N/x402Muro.ts:79-91`, servido en `:406` al GET que sondea el catálogo) es un objeto entero de nomicheck: agregar `extensions['durable-evidence'].info.acceptIndexes` es una línea. (b) Para el 402 del POST, adaptador Express propio llamando `common.handleMiddlewareRequest` (export público, `F/common.js:353`; `sendJSONResponse`/`setResponseHeader` son args, `F/common.d.ts:299,303`; `F/express.js:12-58` son 45 líneas de ejemplo) — no parchear `res.json`, que llega tarde (`F/common.js:417-420`).
- Fallback por oferta `extra.extensions['durable-evidence']` (`docs/DX402.md:461-465`) SÍ sobrevive: `F/common.js:89-90`, `FT/x402-adapters.js:49-51`, `N/x402Muro.ts:135`; solo gracias a `acceptsOverride` (`N/x402Muro.ts:323`, `F/http-handler.js:36`). Forma real: `N/x402Config.ts:451` (`extensionBazaar`) ya arma info+schema; validar contra el facilitador (el único JSON leído es el inválido de `durable.rs:1061-1063`).
- Dos ofertas por red (plana + durable) es INVIABLE en faremeter 0.22.0: `findMatching` filtra por scheme+network(+asset) y devuelve `possible[0]` (`F/common.js:36-49`); en v1 ni compara asset (`:58-60`). Medido con dos ofertas y comprador que firma la durable: se liquida contra la plana, `extra.extensions: null`. Consecuencia de dinero: sobreprecio cobrado, evidencia `not_selected`. Debe diferir en ruta, scheme, network o asset.
- Precio: una clave nueva en `PRECIOS_USD` es una RUTA nueva (`RUTAS_CON_MURO = Object.keys(PRECIOS_USD)`, `N/x402Config.ts:494`) y sin entrada en `ESQUEMA_POR_RUTA` el arranque lanza (`N/validacionPrevia.ts:97-99`, `N/x402Muro.ts:355-367`); además genera su `/csv` (`N/x402Muro.ts:45-54`).

#### Cambios por archivo

- `N/x402Muro.ts`: leer `PAYMENT-RESPONSE` en el handler (o `res.clone()` en `fetchDelFacilitador :249-266`, nunca `res.json()` a secas); `:332` dejar de condicionar `extensiones` a `autenticaCdp` (Ultravioleta es `autenticaCdp:false`, `N/x402Config.ts:373-374`: hoy le llega `undefined`); `desafioDeDescubrimiento :79-91` con `extensions`; decodificar el header de pago para saber la oferta. NO tocar `aFormatoV1`: ya copia `extra` (`:135`).
- `N/x402Config.ts`: `requisitosDePago :424-426` con `extra.extensions['durable-evidence']` en la oferta durable; si la durable es ruta propia, entrada en `ESQUEMA_POR_RUTA` + `PRECIOS_USD` + `DESCRIPCIONES`.
- Adaptador Express propio (nuevo, junto al montaje `N/x402Muro.ts:310-345`) sobre `common.handleMiddlewareRequest`, solo si se quiere `extensions` de nivel superior en el 402 del POST.
- Módulo nuevo sobre+DX402 (junto a `N/batchSignatureService.ts`): pasos 3-8; dependencia nueva `uvd-x402-sdk` (no importado hoy).
- Tests: `N/__tests__/x402Muro.test.ts:340-346` fija ORDEN de redes de `desafioDeDescubrimiento`; `N/__tests__/x402Config.test.ts:248` (`RUTAS_CON_MURO == keys(PRECIOS_USD)`) y `:292` (1:1 con `DESCRIPCIONES`); `:279` (`toHaveLength(9)`) solo si hay rutas nuevas.

#### Decisiones de Yonatan

- Red de la oferta durable: Base | Monad | Avalanche. Medido solo Monad (`T/monad/receipt.json` chainId 143; `/supported` USDC Base y Monad, `T/tareas/2026-09-08-compra-real.md §2`); Avalanche: 0 observaciones en testigo; Monad no está en `REDES_X402` (`N/x402Config.ts:120-123`). El chainId entra al dominio EIP-712 del recibo (`T/reference/x402-rs/receipt.rs:97-103`).
- Modelado de la oferta: ruta propia (p. ej. `/verificar/durable`) | única oferta durable por ruta | asset distinto. Dos ofertas misma red/asset queda descartado.
- Qué rutas de las 5 (liquidar/retencion/verificar/pago-onchain/comprobante) van primero.
- Llave EVM del payTo en el proceso: no | custodio callable | sí. Sin ella: anchor provisional, testigo igual da verified (Línea Roja §3).
- Llave Ed25519 del sobre: reusar `NOMICHECK_BATCH_SIGNING_KEY_PEM` | nueva; y URL pública de la clave para `--sobre-key`.
- Precio de la variante durable (cifra sin dato técnico que la derive).
- Vender «durable» sabiendo que los backends habilitados son 90d y revocables (`T/monad/stats.json`): sí | esperar `ipfs-public`.
- `sealed` inline (default; blob real 2,4 KB) | `pointer` (el facilitador almacena; no hace falta sink propio).
- Cobro sin entrega: el settle es previo al anchor; si `skipped` (too_large/busy/anchor_failed/not_selected) el comprador ya pagó (`N/x402Muro.ts:391-402` enuncia la ley contraria). Opciones: precio plano + anchor best-effort | medir tamaño y rechazar antes | asumir.
- GO de desplegar los parches; GO de cualquier prueba E2E con firma/pago.

#### Riesgos y refutaciones que cambiaron algo

- Cayó (CRÍTICO): «parchar `fetchDelFacilitador` con `res.json()`» — rompe toda liquidación con el dinero ya movido; `res.clone()` o `PAYMENT-RESPONSE`.
- Cayó (CRÍTICO): «dos ofertas por red, incógnita» — determinista e inviable (`F/common.js:36-49`); la matriz la recomendaba igual.
- Cayó (CRÍTICO): «clave nueva en `PRECIOS_USD`» — bloquea el arranque (`N/x402Config.ts:494`, `N/validacionPrevia.ts:97-99`).
- Cayó (ALTO): «el body de /settle nunca se parsea / ningún tx_hash llega» — faremeter lo deja en `PAYMENT-RESPONSE` antes del handler.
- Cayó (ALTO): `ProofOfPayment` de 7 campos y `payment_hash` con direcciones binarias — son 9 campos y payer/payee van como ASCII.
- Cayó (ALTO): paso 1 prometía `payee/amount/blockNumber/timestamp` en `SettleResponse` — el tipo no los tiene (`$X/src/types.rs:1599-1624`).
- Cayó (ALTO): «solo Avalanche/Ultravioleta» — confunde facilitador con red; Avalanche es la única sin observación.
- Cayó (ALTO): «retención 90d vs 1y afecta precio» y «backend sin_dato» — en vivo: 90d revocable, `s3`/`ipfs-private`; `permanent` deshabilitado.
- Cayó (ALTO): la llave EVM del payTo como paso necesario — testigo no la lee; era un GO de lista 2 disfrazado.
- Cayó (ALTO): `anchorEvidence` «nunca lanza» tratado como cierre — deja cobro sin entrega sin mitigar.
- Cayó (MEDIO): «`aFormatoV1` descarta `resource` y pierde `extensions`» — `resource` se aplana (`:129`), `extra` se copia (`:135`), y `extensiones` nunca existe para Ultravioleta (`:332`).
- Cayó (MEDIO): «no hay hook para inyectar `extensions`» — `handleMiddlewareRequest` es público; y `desafioDeDescubrimiento` ni se mencionaba.
- Cayó (MEDIO): citas de tests (`x402Muro.test.ts:340-346` fija orden de redes; `x402Config.test.ts:279` cuenta rutas); faltaba `:248`.
- Sostenido con prueba negativa: `extensions` de nivel superior vía /accepts se pierde hoy (`F/http-handler.js:65`); `extra` sobrevive solo por `acceptsOverride`.
- Sin_dato que queda: si Ultravioleta llena `proofOfPayment` en /settle y en qué formato (v1/v2) contesta — no se llamó (lista 2); si un anchor provisional emite recibo fetchable; si el facilitador ancla en Avalanche; la definición serde real de `AnchorRequest` (`$X/src/dx402/types.rs` corrupto: HTML de rate-limit); latente: comprador v2 sin `resource` produce cuerpo v1 sin `resource` → posible 424 (`FT/x402v2.js:35-41`, `N/x402Muro.ts:119,249`; @x402/fetch no instalado, no ejercitado).
- Del facilitador, no de nomicheck: `POST /dx402/anchor` sin autenticación, solo rate-limit (`$X/src/main.rs:716-727`): `seller_signature` es la única atribución real.

#### Fuentes

- nomicheck: `N/x402Muro.ts`, `N/x402Config.ts`, `N/validacionPrevia.ts`, `N/batchSignatureService.ts`, `N/batchPublicoService.ts`, `N/reglasVerificadasService.ts`, `N/__tests__/x402Muro.test.ts`, `N/__tests__/x402Config.test.ts` (main, HEAD del 9-sep).
- faremeter 0.22.0: `@faremeter/middleware` (`common.js`, `common.d.ts`, `express.js`, `http-handler.js`, `index.js`), `@faremeter/types` (`x402.js`, `x402v2.js`, `x402-adapters.js`, `x402-handlers.js`); corridas locales con node 22.18.0 (scratchpad `prueba-refutador.mjs`, `prueba2.mjs`, `ark.mjs`).
- x402-rs designado por la tarea: commit 31b5e9f4919b en `T/reference/x402-rs/` (`receipt.rs`, `envelope.rs`, `dx402_cross_seal.rs`). Copia remota `$X/` (`docs/DX402.md`, `src/dx402/{gate,service,handlers,payer,mod}.rs`, `src/erc8004/{types,proof}.rs`, `src/types.rs`, `src/main.rs`, `crates/x402-axum/src/{durable,layer}.rs`): commit sin_dato, `src/dx402/types.rs` corrupto.
- SDK TS `uvd-x402-sdk` (`dx402.ts`, `README.md`): versión sin_dato.
- testigo: `T/lib/testigo/{anchor,dx402}.rb`, `T/lib/testigo.rb`, `T/monad/{receipt,evidence,stats,observed}.json` (fetch 2026-09-08T04:18:44Z contra facilitator.ultravioletadao.xyz), `T/tareas/2026-09-08-compra-real.md`.
- Tarea: `nomicheck/tareas/2026-09-08-nomicheck-vendedor-dx402-con-sobre.md`; Línea Roja `sigilo/LINEA_ROJA.md` §3.
