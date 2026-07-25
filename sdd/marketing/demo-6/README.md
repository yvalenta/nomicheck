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

## Estado

`ejemplo.json` fue regenerado 2026-07-25 contra **prod real** (Supabase,
BD migrada, llave de firma congelada `publicKeyId=9958654482741c98f4b6caaffcdf8acc`)
— no es un borrador de dev. Firma verificada offline con la llave pública
de este mismo directorio.

## Pendiente antes de pinnear en IPFS

1. Pinnear `ejemplo.json` + `../publickey.json` en IPFS (web3.storage,
   pinata, o el proveedor que se use para el resto del catálogo) —
   requiere una cuenta propia, no algo que se resuelva desde acá.
2. Citar el CID resultante en el `description` del listing 6 en el
   dashboard `execution.market`.
3. (Opcional) Configurar el túnel Cloudflare de `nomicheck.ynt.codes` para
   que el `ejemplo.json` pueda regenerarse por URL pública en vez de SSH.

## Nota de privacidad

`ejemplo.json` usa datos 100% ficticios — ningún dato real de una persona.
El contrato v1 en sí NUNCA pide nombre ni documento (solo `externalId` +
parámetros numéricos), así que ni siquiera el uso real del wrapper expone
PII — ver `apps/api/src/validation/batchRetencion.ts`.
