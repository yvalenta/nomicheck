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
