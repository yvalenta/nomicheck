# nomicheck en la constelación

Declaración de este repo para el grafo de proyectos de la casa (lo lee
el observatorio interno de la casa, que documenta el formato). Repo público:
solo superficies públicas, nada de topología interna.

| campo | valor |
|---|---|
| id | nomicheck |
| clase | producto |
| qué | el producto: verificación de nómina Colombia — monorepo pnpm (API + web + MCP), pagos x402 |
| dónde | producción en la nube (`nomicheck.ynt.codes`); la operación mantiene un standby frío en paridad |
| servicio | `—` (lo opera `nomicheck_ops`) |
| atiende | sesiones de Claude a demanda; la operación vive en `nomicheck_ops` |
| contexto | `SDD.md` |
| visibilidad | público: `github:yvalenta/nomicheck` |

## Aristas

| a | b | tipo | por | medición |
|---|---|---|---|---|
| nomicheck | internet | publica | `https://nomicheck.ynt.codes/` (API, web, MCP) | `http https://nomicheck.ynt.codes/ 200` |
| nomicheck | facilitador-uv | consume | facilitador x402 de Ultravioleta para cobrar | `http https://facilitator.ultravioletadao.xyz/` |
| nomicheck | supabase | consume | base de datos y auth | `—` |
| nomicheck | base | consume | liquidación on-chain (`mainnet.base.org`) | `—` |
| nomicheck | coinbase-cdp | consume | `api.cdp.coinbase.com` | `—` |
| nomicheck | gemini | consume | `generativelanguage.googleapis.com` (extracción de comprobantes) | `—` |
| nomicheck | datos.gov.co | consume | datos abiertos de referencia | `—` |
| nomicheck | sobre | consume | el formato del comprobante verificable | `—` |
| nomicheck_ops | nomicheck | gobierna | despliegue, identidad, runbooks, auditores | `—` |
