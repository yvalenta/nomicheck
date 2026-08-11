# @pv/mcp — servidor MCP de NomiCheck

Cinco herramientas sobre el wrapper stateless de `https://nomicheck.ynt.codes/api/batch`,
para que un agente descubra el catálogo, entienda el muro x402 y verifique las
salidas firmadas **sin leer documentación ni adivinar el contrato**.

## Conectarlo

Compilar una vez (`pnpm --filter @pv/mcp build`) y apuntar el cliente al `dist`:

```jsonc
// Claude Code (.mcp.json en el proyecto) o Claude Desktop (claude_desktop_config.json)
{
  "mcpServers": {
    "nomicheck": {
      "command": "node",
      "args": ["/ruta/al/repo/apps/mcp/dist/index.js"]
    }
  }
}
```

Con `pnpm` en vez de `node`, usar `--silent`: según la versión, el banner del
script puede salir por stdout, y **en stdio el protocolo ES stdout** — una línea
de banner corrompe el framing y el cliente desconecta "sin motivo":

```jsonc
{
  "mcpServers": {
    "nomicheck": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/ruta/al/repo/apps/mcp", "start"]
    }
  }
}
```

La base se cambia con `NOMICHECK_BASE_URL` (default `https://nomicheck.ynt.codes`),
por ejemplo para apuntar a un entorno local.

## Qué herramienta llama quién

| Herramienta | Cuándo la llama el agente | Red | Paga |
|---|---|---|---|
| `nomicheck_info` | Primero, siempre: catálogo, precios, redes y el cruce de payTo | sí | no |
| `nomicheck_ejemplo` | Para copiar el contrato de un listing (input+output real firmado) | sí | no |
| `nomicheck_schema` | Para validar su body de `/liquidar` antes de mandarlo | sí | no |
| `nomicheck_calcular` | Para ejecutar: sin pago recibe el 402 estructurado; con `x_payment` el resultado firmado | sí | según el muro |
| `nomicheck_verificar_sobre` | Después de cualquier resultado, para comprobar la firma | solo si no pinnea la llave | no |

El flujo típico: `info` → `ejemplo` → `calcular` (recibe 402) → firma EIP-3009
→ `calcular` con `x_payment` → `verificar_sobre` sobre el resultado.

## La advertencia que importa: el payTo pinneado

En x402 **el pago es inmediato y final** — sin escrow, sin disputa. Un atacante
que logre sustituir el `payTo` de la oferta 402 no rompe nada visible: el
servicio sigue verde, las firmas verifican, y la plata de cada orden se va a
otra parte. La única defensa es cruzar el `payTo` del `accepts` contra el
`x-executor.walletAddress` del agent card publicado en **otro origen**:
`https://ynt.codes/.well-known/agent-card.json`.

`nomicheck_info` y el 402 de `nomicheck_calcular` ya traen ese cruce hecho
(`cruce.coinciden` / `crucePayTo.coinciden`). **Si no es `true`, no firmes.**

## Desarrollo

```bash
pnpm --filter @pv/mcp test        # vitest; ningún test toca la red
pnpm --filter @pv/mcp typecheck   # tsc --noEmit, entrando al workspace
```

No hay script `dev` a propósito: el `pnpm dev` de la raíz levanta en paralelo
todos los `apps/*`, y un servidor stdio esperando un cliente MCP en esa
orquesta sería un proceso colgado leyendo un stdin que nadie va a escribir.

`src/vendor/sobre.mjs` es una **copia vendorizada** del verificador del repo
público `sobre` (CC0, cero dependencias) — no editarla acá: los cambios van
allá y se copian. Los fixtures de `src/__tests__/fixtures/` son una salida
firmada REAL de producción y su llave, capturadas el 2026-08-11; el test las
verifica offline.
