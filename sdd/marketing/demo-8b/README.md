# Batch demo real — listing 8b (pago on-chain USDC/Base)

Ancla de credibilidad del listing 8b (RUMBO §3.5): un batch real firmado y
verificado en Base mainnet, con el JSON completo pinneado en IPFS. Cuando
alguien mire el listing y dude, el CID de IPFS es la respuesta objetiva.

## Datos del demo

- Empresa demo: "NomiCheck Demo (fase 1)", NIT ficticio.
- 2 contratistas ficticios con wallets de destino que TÚ controlas para
  poder recuperar los fondos:
  - `Demo-01`: 0.01 USDC.
  - `Demo-02`: 0.01 USDC.
- Tasa TRM real del día del demo, con snapshot y hash.
- Total: ~0.02 USDC + gas Base (~$0.02).

## Prerrequisitos

1. **Recomendación 1 del roadmap cumplida**: MetaMask en Base, wallet
   dedicada a Execution Market, executor registrado y ERC-8004 confirmado.
2. **Recomendación 2 cumplida**: `AI_USAGE.md` pinneado en IPFS (para
   poder citar su CID en el JSON del demo).
3. Balance en la wallet pagadora: al menos 0.05 USDC nativo Circle
   (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) y ~0.001 ETH para gas.
4. Wallets de destino (Demo-01 y Demo-02): pueden ser dos direcciones que
   ya controles (por ejemplo dos cuentas más de tu MetaMask). Ediar
   `input.json` con esas direcciones antes de correr.

## Flujo (2 h aprox.)

1. **Sembrar el batch en dev** contra el contenedor local para verificar
   que el JSON se procesa limpio antes de gastar gas real:

   ```bash
   # Contenedor dev debe estar arriba (docker compose up).
   docker exec nomicheck-api-1 sh -c 'node -e "
     const body = require(\"/app/sdd/marketing/demo-8b/input.json\");
     fetch(\"http://localhost:3001/api/batch/liquidar\", {
       method: \"POST\",
       headers: { \"content-type\": \"application/json\" },
       body: JSON.stringify(body)
     }).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)));
   "'
   ```

2. **Generar el `BatchPago` on-chain real** con la empresa demo persistida
   (usa el endpoint `POST /empresa/periodos/:id/batch-pago` — SDD §17).
   Guarda la respuesta completa (`safeBatch` + `items[].linkEip681` +
   `tasaSnapshot.hash`) — es el payload del IPFS.

3. **Firmar el Safe batch** desde MetaMask apuntando al Safe multifirma
   que administres (o firmar los EIP-681 uno por uno si prefieres MetaMask
   directo). Copiar `txHash`.

4. **Verificar con NomiCheck**:

   ```bash
   POST /empresa/batches/:batchId/verificar { "txHash": "0x…" }
   ```

   Estado esperado: `verificado`. Guardar el bloque + `verificadoEn`.

5. **Pinnear el JSON completo** en `web3.storage`:
   - `input.json` (esta carpeta)
   - `output.json` (respuesta completa de `generarBatchPago`)
   - `verify.json` (respuesta de `verificarBatchPago` con `txHash` + `bloqueVerificado`)
   - `README.md` (este archivo con el CID de AI_USAGE ya citado)

   El CID resultante es el ancla. Ejemplo de URL:
   `https://<CID>.ipfs.w3s.link/output.json`.

6. **Actualizar el listing 8b** (dashboard `execution.market`) con la
   URL del CID como "public batch demo" en el `description`.

## Reversión

Los fondos quedan en las wallets de destino (que TÚ controlas). Al
terminar el demo puedes transferirlos de vuelta a la wallet pagadora
(otro gas de ~$0.02).

## Nota de seguridad

- El `input.json` NO contiene wallets reales de contratistas ni PII —
  solo direcciones tuyas y datos ficticios.
- El demo debe correrse contra Base mainnet, no testnet: el punto es la
  credibilidad de un tx real verificable en `basescan.org`.
