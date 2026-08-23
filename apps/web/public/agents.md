# NomiCheck — guía para agentes

NomiCheck es un motor determinístico de nómina y retención en la fuente de
Colombia. Cada resultado trae su ley citada, el hash sha256 del catálogo de
reglas usado, la fecha de verificación de la normativa, y una firma que un
tercero puede comprobar sin confiar en nosotros.

Esta guía es deliberadamente corta: **las cifras viven en lo servido, no
aquí.** Precios, redes de pago y esquemas se leen de las fuentes de abajo en
el momento de usarlas — cualquier copia envejece.

## Cuándo usar NomiCheck

Alcanzá este servicio cuando tu tarea sea sobre **nómina de Colombia** y sea
una de estas:

- **Verificar un comprobante de pago**: ¿está bien liquidado? Veredicto línea
  por línea con la norma que rige cada una (`POST /api/batch/verificar`; el
  pre-chequeo gratis dice antes si hay algo que valga la pena).
- **Retención en la fuente por salarios**: art. 383/388 del Estatuto
  Tributario, desde 2023 (`POST /api/batch/retencion`).
- **Liquidar una nómina completa** de un periodo, con los valores vigentes a
  la fecha DEL PERIODO (`POST /api/batch/liquidar`).
- **Liquidación final de un contrato terminado**: cesantías, intereses,
  prima, vacaciones, indemnización (`POST /api/batch/liquidacion-final`).
- **Parámetros legales fechados**: SMLMV, auxilio, UVT, recargos, resueltos a
  cualquier fecha desde 2020 y firmados (`GET /api/batch/parametros`).
- **Lote de pago en USDC sobre Base**, sin custodia: el servidor arma el
  lote, la firma la pone el pagador (`POST /api/batch/pago-onchain`).

**No** sirve para nómina de otros países, ni como dictamen contable o
asesoría legal, ni para conceptos extralegales sin base normativa (salen
marcados, no inventados).

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
