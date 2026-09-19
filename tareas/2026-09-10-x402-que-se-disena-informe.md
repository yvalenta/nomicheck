---
estado: hecha
dueño: sesión
fecha: 2026-09-10
tema: qué se está diseñando en x402 alrededor de durable-evidence (#3377), RFC-008 (#3447), stark-receipt (#3389) y conformance profiles (#3396); qué podría aportar la casa
criterio_cierre: el informe del workflow `x402-dx402-que-se-disena` (run `wf_d219dd7c-0f0`) queda escrito en este archivo, con sus citas y sus `sin_dato`; es un informe, no trabajo pendiente — nació `hecha`
---

Salida del workflow `x402-dx402-que-se-disena` (run `wf_d219dd7c-0f0`, 2026-09-10; 42 agentes): 5 lectores + 5 cierres de huecos (sonnet, con citas), crítico de completitud, panel de 3 ángulos × 2–3 ideas, refutación de cada idea por 3 lentes (el grande), síntesis. **Las 9 ideas fueron refutadas 3/3**; lo que sigue es la síntesis con las mejoras que dejaron las refutaciones. Sin editar.

**1. Qué se está diseñando**

durable-evidence (#3377, PR spec-only de 0xultravioleta, OPEN, `reviews: []`, ningún mantenedor en el hilo): el vendedor sella el body a la llave del pagador, ancla el cifrado y el facilitador firma un recibo EIP-712 verificable offline; "a failure to produce evidence MUST NOT fail the payment" (§SettlementResponse). f97f6cd hizo normativo el paymentId `0x`+64 hex minúsculas por un 404 real ("Found in the field: a reader recomputed the id with a library that upper-cases hex"); 48c01ee, a pedido de goun7, separó contentHash (plaintext) del commitment del pointer y volvió observable el vencimiento (410 `dx402_evidence_expired` vs 404). Los 119 anclajes de producción son un solo operador ("There is no third-party seller yet", 10-EVIDENCE §4). RFC-008 (#3447, goun7/Tamga, 0 comentarios): bloque aditivo `external_receipt` que ata un paymentId a un ledger de recibos; content_hash y delivery_hash son "DIFFERENT byte populations", igualdad solo `DERIVED-EQUAL` tras entrega consentida; DRAFT "PILOT-PENDING" con tres bloqueantes (P8-1 tercer hash, P8-2 retención real, P8-3 receipt_uri), piloto previsto con 113 B de Ultravioleta (RFC-008:47); el issue omite R8-3 y el anclaje inverso §6 (diseño en `private/`, fuera de git). stark-receipt (#3389, Vauban): recibo ligado a prueba STARK y hecho on-chain, triple `{alg,enc,hex}`, hoja ajena → "indeterminate, never absent"; hecho en Starknet Sepolia replicado por goun7 ("Green"); sin PR. Conformance profiles (#3396, smartflowproai-lang): auditoría pasiva de endpoints 402; goun7 y él convergen en fixtures con veredicto esperado, `ran_at` y un "shared conformance corpus v0" (source∈{simulated,observed,derived}); sin decisión del proyecto.

**2. Dónde está parada la casa**

Tenemos: nomicheck vende /verificar/durable (código listo, DX402_ACTIVO=false): sobre Ed25519 → sellado a la llave del pagador → capture → anchor provisional (sin sellerSignature, decisión 7; direct/s3/90d; 0,02 USD = precio plano, x402Config.ts:160-164); cola en memoria 30/120/300 s. testigo verifica offline cuatro eslabones, reproduce los 6 vectores de x402-rs y el registro Monad byte a byte, suite ≥40 % negativos, pin del receiptSigner fuera de banda. No tenemos: compra real propia ni testigo corrido sobre una; anclaje que cuente como `verified` (provisional = "anyone could have written it"; las 5 filas Solana fueron degradadas por eso). Dos correcciones: la cita "tres implementaciones… byte a byte" es del cuerpo de #3304 (OPEN, CHANGES_REQUESTED de un no-mantenedor), no de #3377; y el comentario x402MuroDurable.ts:812-826 es inexacto: el sobre firma plazo/alVencer/borradoAPedido, no el backend.

**3. Qué podríamos aportar**

Ninguna de las nueve ideas sobrevivió (3/3 refutaciones cada una). Queda lo que las refutaciones dejaron como mejora, por apalancamiento:

a) Anclaje `verified` sin llave en el proceso. Necesidad: "un tercero que ancle primero gana" (anclajeDiferido.ts:391-396) y solo `verified` es final. Propuesta: firmador restringido por dominio (recibe los 4 campos de `Dx402AnchorAuthorization`, recompone `anchorDigest`, no firma otra cosa) en `opts.sign` del SDK (dx402.ts:850-858) + `proofOfPayment`. Semana: medir si el /settle de Ultravioleta devuelve `proofOfPayment`; presentar a Yonatan la reapertura de la decisión 7 como pregunta. Refutación: "apuntar a `verified`, no a `signed`"; Línea Roja §3 prescribe firma, no secreto.

b) Dos campos en `info` del 402: autoridad de anclaje (facilitador/receiptSigner) y `anchorWithin`. Necesidad: `info` no dice dónde ni cuándo preguntar; el pin "no tiene fuente pública fuera del propio facilitador". Semana: borrador de comentario en #3377 con el ciclo medido (capture → 2×3 s → 30/120/300 s → proceso muere → 404); aparca. Refutación: "sin estados nuevos del facilitador"; queda `derived`, no `observed`.

c) P8-2 con datos en #3447: el 404 de goun7 fue casing, no retención; `retentionUntil` va firmado; 410/404 normativo desde 48c01ee; backends medidos (s3, ipfs-private 90d revocable); primer vencimiento observable 2026-12-02 (0x7e7c…). Semana: borrador + recordatorio único 2026-12-03 para `testigo fetch`; aparca. Refutación: "datos, no diseño".

d) Al corpus v0 de goun7, no uno paralelo: exportar los negativos de testigo como fixtures (solo cláusulas normativas) y PR de una línea a tamga (`_CHAINS` → CAIP-2 con el vector Monad que hoy falla). Semana: `rake vectors:export` + rama. Refutación: "es aporte, no idea".

e) Casa: corregir 812-826; testigo guarda `sobre-key.pem` y `legajo.json` (sha256, comando, etiqueta acreditada a Tamga); tx-receipt marcado asserted.

**4. La idea brillante**

(a): nomicheck como primer vendedor tercero con anclajes que cuentan. Todas las refutaciones volvieron al mismo hueco —"no third-party seller yet"— y al mismo límite: provisional no entra al corpus certificado. Nadie vende evidencia desde un servidor que no custodia la llave que cobra (conjetura de la idea 1, no refutada); el firmador restringido lo resuelve sin tocar spec, facilitador ni verificadores, y sobrevive la fase 2 (`DX402_REQUIRE_PROOF`, service.rs:492-510). Es la única pieza que convierte a la casa de observadora en dato del hilo. Riesgo: reabre la decisión 7 (identidad, lista 2) y depende de que `proofOfPayment` exista o se arme por RPC de lectura; si es no, la ruta sale provisional y así debe decirse.

**5. Descartadas y por qué**

1. Delegación de firmante: compra `signed` = "a diagnostic", rango 1 empata con un squatter; `signedBy` rompe el struct EIP-712 pinneado.
2. pending/missing/skipped notarizados: no hay sobreprecio; `expected` lo relaya el vendedor deshonesto; `missing` firmaría negativos sobre un índice "floor".
3. Atestación de store + revoke: el pointer firmado ya nombra el store; revoke por payee destruye la evidencia del comprador; el titular no es payer ni payee.
4. Legajo con dos pins: `testigo fetch --dir` ya es la carpeta; sin RPC un tx-receipt es asserted; los pins son el vendedor avalándose.
5. Corpus venenoso: testigo ya tiene los negativos; dos de tres corredores son de la casa; tamga solo cubre la mitad de pago.
6. Piloto RFC-008: P8-1/P8-3 ya respondidas; el "sha256 canónico" no existe (Ed25519 sin pre-hash); Tamga no tiene cliente x402.
7. Vectores junto a la spec: #3304 no pesó; el PR es "spec only"; familias 5/6 son comportamiento de endpoint.
8. Perfil pasivo del facilitador: 4 de 7 chequeos sin cláusula; `anchored` monótono es falso por diseño; cron público diario viola línea roja.
9. Piloto segundo vendedor: provisional no cuenta; el sobre se firma antes de capture con placeholder, no es sellerSignature; comprador = casa repite KarmaCadabra.

**6. sin_dato**

Si /settle de Ultravioleta devuelve `proofOfPayment`. #3371 y #3379 no leídos; RFC-005/006/007 sin documento en main; `private/F1` no público. Por qué `anchored` bajó 730→720 (sin AWS). Estado de los cuatro hilos después del 2026-09-10. Versiones uvd-x402-sdk vs x402-rs 31b5e9f no cruzadas. Si Tamga tiene cliente x402 o wallet EVM.

## sin_dato de los lectores

- No se leyó apps/api/src/lib/x402Muro.ts (el muro plano, no-durable) en detalle; se citó solo lo que x402MuroDurable.ts y x402Config.ts referencian de él (gruposConPropios, fetchDelFacilitador, el manejo de 424 detrás de Cloudflare).
- No se leyó services/sobreSignatureService.ts, services/batchVerificacionService.ts, ni validation/batchVerificacion.ts — solo se citó lo que x402MuroDurable.ts dice sobre ellos.
- No se leyó lib/testigo/dx402.rb completo ni lib/testigo/chain.rb ni bin/testigo — se leyó solo la cabecera de dx402.rb (formato del sobre criptográfico DX402) y fragmentos de receipt.rb y anchor.rb suficientes para las citas anteriores.
- No se pudo confirmar contra qué versión exacta de uvd-x402-sdk (el paquete npm) corre nomicheck hoy, ni si coincide con la versión de x402-rs (31b5e9f4919b) que testigo usa como referencia — son dos repos distintos y no se cruzaron sus versiones en esta lectura.
- No se leyó ~/Developer/testigo/PATRONES.md (no existe ese archivo en ese repo; el grep confirmó 'No such file or directory') — la cita de PATRONES.md §s1 que aparece en testigo/README.md ('the anchored document IS a sobre') es una referencia del propio README a un documento del repo 'sobre', no verificada directamente.
- No pude leer el contenido de RFC-008 (no fue referenciado por URL/número en los tres hilos leídos, y la tarea no dio su ubicación) — cualquier afirmación sobre cómo estas dos propuestas encajan o chocan con RFC-008 específicamente quedaría inventada, así que no la hago.
- No abrí el documento externo completo vauban-org/x402-starknet/blob/main/docs/stark-receipt-profile-v0.1.md (solo los fragmentos citados dentro de los comentarios de GitHub) ni el repo goun7/tamga-protocol ni stillmarcus24/notary-x402-reference-kit — las citas de esos artefactos vienen de lo que sus propios autores transcribieron en los comentarios de #3389, no de lectura directa del repo.
- No verifiqué el estado actual (merged/closed) más allá de lo que devolvió el JSON de gh en el momento de la consulta (2026-09-10): las tres están como OPEN en ese instante; si cambiaron después, no lo sé.
- El cuerpo del issue no contiene ningún enlace real hacia goun7/tamga-protocol, tools/verify_dx402_vector.py ni el texto completo de RFC-008 — la única URL en el body es un placeholder de ejemplo ("https://.../receipt/0x7e7c..."), y `gh api repos/x402-foundation/x402/issues/3447/timeline` devolvió 0 eventos (ningún cross-reference registrado hacia otro repo). Como la tarea condicionaba leer tamga-protocol a que el issue 'enlace' allí, y no enlaza, no se leyó ese repo aparte.
- No se pudo leer el contenido completo de RFC-008 más allá de lo que resume el propio issue (los 5 puntos R8-1..R8-5 y el bloque de ejemplo) — no hay acceso al documento fuente porque no está enlazado.
- El issue no tiene comentarios (0) al momento de la lectura — no hay reacción de x402-foundation, de otros mantenedores, ni de 0xultravioleta que extraer; el hilo es unidireccional (solo el post inicial de goun7).
- Los issues #3377 y #3379, citados como contexto previo dentro de #3447, no fueron releídos en esta tarea (la instrucción pedía leer #3447 y, condicionalmente, tamga-protocol, no volver a #3377/#3379).
- No se pudo determinar si hay una discusión de maintainers de x402-foundation (más allá de goun7 y el autor) evaluando el PR — la llamada a `pulls/3377/reviews` devolvió una lista vacía, así que no hay reviews formales (approve/request-changes) registradas vía esa API a la fecha de esta lectura.
- No se leyó el diff completo de docs/extensions/overview.mdx (solo se supo que agrega 1 línea) — no se citó el texto exacto de esa fila.
- No se investigó en profundidad el contenido de los issues relacionados (#3186, #3140, #3304, #2666, #1932, #3208, #3230, #2833, #3389, #3379) más allá de sus títulos — quedan fuera del alcance de esta lectura puntual sobre durable-evidence.
- No leí el contenido del issue #3371 (el que este PR cierra) — no se solicitó y no lo abrí.
- No leí los issues/propuestas referenciadas en el cuerpo del PR (#3186, #3140, #3304, #2666, #1932, #3208, #3379): quedan citados por número pero no verificados en su propio contenido.
- No verifiqué el estado de los checks de CI (Vercel deployment, tests) más allá de ver el comentario automático de vercel[bot] pidiendo autorización del team Coinbase; no confirmé si ese despliegue se autorizó ni si hay otros checks fallando.
- gh api repos/x402-foundation/x402/pulls/3377/comments (comentarios de revisión en línea sobre el diff) devolvió un array vacío — no hay comentarios de ese tipo que citar, distinto de los 4 comentarios de nivel-issue que sí se leyeron completos.
- No confirmé si existen commits o comentarios posteriores al momento de la lectura (2026-09-10 en adelante); el snapshot corresponde al head 48c01eeea98116d5bcc9ec84e485cf120bc131cf.
- El repositorio de referencia externo citado en el PR (UltravioletaDAO/x402-rs, incluyendo el archivo docs/plans/dx402/10-EVIDENCE-FOR-THE-PR.md con el detalle de los 119 anclajes) no fue abierto ni verificado — solo se registra que el PR lo cita como fuente de la afirmación de producción.
- No pude re-ejecutar el 'scan' completo de la tabla DynamoDB facilitator_dx402_evidence (827 items) porque no tengo credenciales AWS con acceso de lectura a esa tabla — todo lo que verifiqué fue vía la API pública del facilitador (/dx402/evidence, /dx402/receipt, /dx402/stats, /version, /supported), no contra el dataset crudo.
- No repetí la verificación EIP-712 offline del script verify_receipt.py (requiere eth_account instalado); no era necesario para el hueco pedido pero queda sin re-probar en esta pasada.
- No confirmé on-chain (RPC directo) los txHash de monad, arbitrum(x2), optimism, ethereum ni avalanche(x2) ni polygon — solo crucé receipt->network/txHash contra la API, y el on-chain RPC directo solo para el caso base.
- No pude establecer en qué paso exacto (sesión, archivo o conversación no escrita) se introdujo la atribución errónea a #3377 en lugar de #3304 — no hay ningún archivo local intermedio que haga ese cambio de forma explícita entre los archivos de testigo/nomicheck (que citan bien #3304) y el contexto dado para esta tarea (que cita #3377).
- No pude verificar si 'fuente 3' (mencionada en el enunciado de la tarea) usó el mismo método de verificación en vivo que yo (fetch directo a la API de GitHub) o trabajó sobre una copia archivada de los comentarios de #3377; solo puedo reportar que mi propia verificación en vivo de hoy (2026-09-10) corrobora independientemente su conclusión de que la frase no aparece literalmente en los comentarios de ese PR.
- No ejecuté tests/at018_m6_manifest_schema.sh ni tests/cross_validate_schema.py, así que no verifiqué de forma independiente (solo por inspección estructural) la afirmación del issue de que todo manifiesto 0.1.0/0.2.0 sigue siendo válido contra manifest-0.3.0-draft.schema.json.
- No pude leer private/F1-EXTERNAL-ANCHOR-TASARIM.md ni .evidence/APODIX-EPOCH-10/2026-09-10/ — están excluidos por .gitignore y no aparecen en ninguna de las tres ramas del repo que revisé (main, rescue-20260906/main, rescue-20260906/private-full); si existen, no son públicos.
- No revisé forks del repo ni PRs/branches ajenas a las tres que lista `gh api .../branches`, así que no puedo descartar que RFC-005/006/007 completos vivan en algún otro fork no listado.
- No hay actividad de terceros (0xultravioleta, mantenedores de x402-rs) en el issue #3447 al momento de leer — no hay dato sobre si ya vieron o van a responder al RFC-008.
- No pude abrir el fixture privado real de goun7 (private/external-evidence/2026-09-07-dx402-canonical) porque private/ está en .gitignore y no existe en ningún branch remoto del repo público, incluida la rama 'rescue-20260906/private-full'. Lo que reporto en su lugar es una reproducción independiente equivalente (mismo paymentId, mismo tamaño de 4.510 bytes, mismo CID) obtenida en vivo contra el facilitador de Ultravioleta — coincide exactamente, pero no es literalmente 'abrir el archivo de goun7'.
- No confirmé si la palabra 'support' como veredicto existe en algún comentario de GitHub fuera de tamga-protocol (por ejemplo en x402-foundation/x402#3377): la tarea pedía abrir el repo tamga-protocol específicamente, y ahí esa palabra no aparece.
- El chequeo EIP-712 solo dio PASS después de instalar eth-account en un venv descartable de /tmp; de fábrica, sin esa dependencia, el propio README no la fuerza y el chequeo queda en SKIP explícito (no es un PASS por defecto).
- No corrí el CI de GitHub Actions del repo (el badge dice 'Tests 40/40 PASS'); solo ejecuté localmente los scripts sueltos que cito (verify_dx402_vector.py, verify_dx402_selftest.py) y los comandos de red que hice yo mismo contra el facilitador.
- No leí a fondo tamga_runner.py (59 KB) ni las RFC-001 a RFC-007 completas — me concentré en README + tools/verify_dx402_vector.py + la reproducibilidad del vector DX402, que era el encargo.
