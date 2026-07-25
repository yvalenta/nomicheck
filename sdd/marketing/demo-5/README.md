# Batch demo — listing 5 (verificación de comprobante)

Ancla de credibilidad del listing 5: un ejemplo real del contrato v1,
firmado, mostrando un caso CON discrepancia (no solo el camino feliz) —
para que un buyer vea exactamente qué tipo de veredicto recibe.

## Contenido

- `ejemplo.json` — respuesta completa de `GET /api/batch/verificar/ejemplo`:
  el `input` (lo que un comprobante DECLARA como líneas `{nombre, valor}`,
  sin nombre/documento del empleado) y el `output` firmado con el veredicto
  línea por línea.
- `../publickey.json` — misma llave Ed25519 de los otros wrappers.

## Qué muestra el ejemplo

El comprobante de ejemplo declara auxilio de transporte y salud por debajo
de lo que exige la ley, y omite la pensión por completo — el output trae:

- `auxilio_transporte` → `pagado_de_menos` (pagaron $200.000, correspondían $249.095)
- `salud` → `pagado_de_menos` (dedujeron $100.000, correspondían $80.000 — de más)
- `pension` → `faltante_en_comprobante` (no aparece, correspondían $80.000)
- `salario_basico` → `correcto`

Deliberado: un demo que solo muestre "todo correcto" no prueba que el
motor realmente detecta discrepancias.

## Verificación offline (sin tocar el servidor)

Mismo procedimiento que `../demo-6/README.md` — la firma cubre el output
completo (`todos_menos_signature`, JSON canónico con claves ordenadas).

## Pendiente antes de pinnear en IPFS

Mismos 4 pasos que `../demo-6/README.md` — regenerar contra prod con la
llave de firma congelada y la BD migrada antes de citar el CID en el
listing.

## Nota de privacidad

El contrato v1 nunca pide nombre ni documento del empleado — solo líneas
`{nombre, valor}` de lo que el comprobante declara. Ver
`apps/api/src/validation/batchVerificacion.ts`.
