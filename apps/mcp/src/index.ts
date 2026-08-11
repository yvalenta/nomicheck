#!/usr/bin/env node
// Punto de entrada stdio del servidor MCP de NomiCheck.
//
// OJO al invariante del transporte: en stdio EL PROTOCOLO ES stdout. Un
// `console.log` de diagnóstico en cualquier parte de este proceso corrompe el
// framing JSON-RPC y el cliente desconecta "sin motivo" — por eso acá no se
// loguea nada, y si algún día hace falta, va por stderr (`console.error`).
//
// No hay script `dev` en el package.json, y es a propósito: el `pnpm dev` de la
// raíz levanta en paralelo el dev de TODOS los workspaces de `apps/*`, y un
// servidor stdio esperando un cliente MCP en esa orquesta sería un proceso
// colgado leyendo un stdin que nadie va a escribir.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { construirServidor } from "./servidor.js";

const servidor = construirServidor();
await servidor.connect(new StdioServerTransport());
