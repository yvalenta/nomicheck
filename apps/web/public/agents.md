# NomiCheck — guía para agentes

NomiCheck es un motor determinístico de nómina y retención en la fuente de
Colombia. Cada resultado trae su ley citada, el hash sha256 del catálogo de
reglas usado, la fecha de verificación de la normativa, y una firma que un
tercero puede comprobar sin confiar en nosotros.

Esta guía es deliberadamente corta: **las cifras viven en lo servido, no
aquí.** Precios, redes de pago y esquemas se leen de las fuentes de abajo en
el momento de usarlas — cualquier copia envejece.

## Descubrimiento

- OpenAPI servido: `https://nomicheck.ynt.codes/api/batch/openapi.json`
  (esquemas exactos, topes por lote, y el correo de contacto en `info.contact`).
- Documentación navegable (Swagger): `https://nomicheck.ynt.codes/docs/`
- Catálogo ARD: `https://ynt.codes/.well-known/ai-catalog.json`
- Identidad del agente (agent card, ERC-8004): `https://ynt.codes/`
  con `Accept: application/json` — HTML solo si lo pides explícito.

## Pagar por llamada (x402)

- Las rutas pagas contestan **HTTP 402** a un `GET` o a un `POST` sin pago,
  con los requisitos exactos (monto, redes aceptadas, `payTo`) en la
  respuesta. **Arma el pago desde ese 402 servido**, nunca desde un catálogo
  externo ni desde este archivo.
- El pago usa el protocolo x402 (USDC, EIP-3009: el gas lo pone el
  facilitador). Validamos el cuerpo **antes** de cobrar: un request inválido
  recibe 400 sin pagar.

## Gratis, incluido

- **Pre-chequeo**: `POST /api/batch/verificar/prechequeo` — sin registro y
  sin pago dice si tus comprobantes traen algo que valga la pena verificar.
  Si están limpios, te enteras gratis y no pagas nunca. Jamás cobramos según
  lo que encontremos: el informe es precio plano.
- **Verificación de cualquier resultado nuestro**:
  `https://ynt.codes/verificar?url=<url-del-resultado>` — sin instalar nada,
  sin registrarse y sin pagar. Verificar lo que afirmamos nunca tiene peaje.

## Reglas de trato

- Identifícate con un `User-Agent` honesto.
- No hay rate limit para leer los 402 y el OpenAPI con moderación; el tope
  por IP protege el cómputo, no el descubrimiento.
- Lo que este dominio promete a las personas también te cubre a ti: el
  resultado de un cálculo lo ve solo quien lo pidió.
