# Batch demo — listing 6 (retención en la fuente)

Ancla de credibilidad del listing 6: un ejemplo real del contrato v1,
firmado, para que un buyer del marketplace verifique el formato y la firma
ANTES de pagar el primer order.

## Contenido

- `ejemplo.json` — respuesta completa de `GET /api/batch/retencion/ejemplo`:
  el `input` de dos personas (parámetros numéricos anónimos, sin
  nombre/documento) y el `output` firmado que produce el motor.
- `../publickey.json` — llave pública Ed25519 compartida con el resto de los
  wrappers (retención, verificación, pago on-chain usan la misma llave de
  firma del servidor).

## Verificación offline (sin tocar el servidor)

```js
const { verify, createPublicKey } = require("crypto");
const canonicalJson = (v) => JSON.stringify(canonicalizar(v)); // ver batchSignatureService.ts
const pk = createPublicKey({ key: publickey.publicKeyPem, format: "pem" });
verify(null, Buffer.from(canonicalJson(output), "utf8"), pk, Buffer.from(output.signature.valor, "base64"));
// → true
```

## Pendiente antes de pinnear en IPFS

⚠️ Este `ejemplo.json` fue generado contra el stack de **desarrollo**
(`publicKeyId` distinto al de prod — ver `sdd/marketing/publickey.json` de
cada entorno). Antes de citarlo en el listing público:

1. Confirmar que prod está corriendo con `NOMICHECK_BATCH_SIGNING_KEY_PEM`
   fija (congelada 2026-07-25 — ver commits `ecd8d5f`/`7b38d23` en
   `feat/batch-stateless`) y que la BD de prod tiene las migraciones
   aplicadas (bloqueante activo — ver nota de la migración RLS/`auth`
   schema en el chat de la sesión que generó este demo).
2. Regenerar `ejemplo.json` con `curl https://nomicheck.ynt.codes/api/batch/retencion/ejemplo`
   (o el dominio que corresponda) para que quede firmado con la llave real
   de prod.
3. Pinnear `ejemplo.json` + `publickey.json` (de prod) en IPFS (web3.storage,
   pinata, o el proveedor que se use para el resto del catálogo).
4. Citar el CID en el `description` del listing 6 en el dashboard
   `execution.market`.

## Nota de privacidad

`ejemplo.json` usa datos 100% ficticios — ningún dato real de una persona.
El contrato v1 en sí NUNCA pide nombre ni documento (solo `externalId` +
parámetros numéricos), así que ni siquiera el uso real del wrapper expone
PII — ver `apps/api/src/validation/batchRetencion.ts`.
