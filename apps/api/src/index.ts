import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import router from "./routes/index.js";
import { crearFallback, crearPaginasPublicas, sinPrerender } from "./routes/paginasPublicas.js";
import { origenPublico } from "./lib/pagosConfig.js";
import { detenerBoss, getBoss } from "./lib/boss.js";
import { delegadoCors } from "./lib/corsPublico.js";
import { construirLlmsTxt } from "./services/llmsTxtService.js";
import { registro } from "./lib/registro.js";
import { montarMuroX402 } from "./lib/x402Muro.js";
import { registrarAcceso } from "./middleware/acceso.js";
import { capturarErroresDeProceso, manejadorDeErrores } from "./middleware/errores.js";
import { registrarWorkerLiquidacion } from "./workers/liquidacionWorker.js";

// Antes de todo: los errores que Express no ve (promesas sin catch, throws
// fuera de una petición) tienen que quedar registrados desde el primer tick.
capturarErroresDeProceso();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;

// CORS por ruta: `*` para los GET que sirven para verificar (llave pública,
// esquemas, ejemplos firmados) y `CORS_ORIGIN` para todo lo demás. Sin esto la
// llave pública era ilegible desde otro origen y ningún verificador de
// terceros en el navegador podía comprobarnos. Ver lib/corsPublico.ts.
app.use(cors(delegadoCors));
// Lo más arriba posible, y a propósito ANTES del muro x402: un 402 es un
// evento que interesa —alguien pidió un endpoint que cobra sin pagarlo— y
// montarlo después lo dejaría fuera del registro. Solo observa; no toca la
// petición ni la respuesta.
app.use(registrarAcceso);
// El contrato batch admite lotes de hasta 500 empleados con sus turnos del
// periodo, y eso no cabe en el default de 100kb de express.json: un lote de
// 100 empleados con turnos pesa ~160kb y moría en 500 antes de llegar al
// handler. 5mb cubre el lote máximo del contrato con margen; el resto del
// API se queda con el default (nada fuera de /api/batch recibe lotes).
app.use("/api/batch", express.json({ limit: "5mb" }));
app.use(express.json());

// Antes del router: el 402 tiene que salir sin ejecutar el cálculo. Apagado
// por defecto — sin `X402_ACTIVO=true` no monta nada.
montarMuroX402(app);

app.use("/api", router);

// El 404 de la API en JSON, después del router y antes de todo lo demás: un
// endpoint que no existe le respondía a un agente con el HTML por defecto de
// Express ("Cannot GET …"), que ningún cliente programático puede parsear.
// Código, mensaje y pistas — el mismo contrato que los demás errores del API.
app.use("/api", (req, res) => {
  const base = origenPublico();
  res.status(404).json({
    error: "not_found",
    // baseUrl + path: dentro de un `app.use("/api")` el path llega sin el
    // prefijo montado, y un mensaje que dice "/no-existe" a secas desorienta.
    mensaje: `No existe ${req.method} ${req.baseUrl}${req.path} en esta API.`,
    pistas: {
      openapi: `${base}/api/batch/openapi.json`,
      quickstart: `${base}/api/batch/quickstart`,
      docs: `${base}/docs/`,
      llms: `${base}/llms.txt`,
    },
  });
});

// `/llms.txt` va ANTES del fallback del SPA, y esa posición es el arreglo.
// Con el catch-all adelante, cualquier ruta fuera de `/api` devolvía el HTML
// de React con 200: un agente pedía este archivo, recibía una página, y no
// tenía forma de saber que no existía. Un 200 que miente es peor que un 404.
app.get("/llms.txt", (_req, res) => {
  res.type("text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(construirLlmsTxt());
});

// Esta misma imagen sirve el build estático de apps/web (un solo contenedor, un
// solo puerto) — no hay separación api/web en runtime. Lo construye
// `bin/docker-entrypoint.dev` al arrancar.
//
// La condición es que el build EXISTA, no que `NODE_ENV` diga "production".
// Antes dependía de la variable, y eso confunde dos cosas distintas: durante
// meses `NODE_ENV` valía "production" en el contenedor y `web-dist` no existía,
// así que el `sendFile` del fallback tiraba sobre un archivo ausente en vez de
// dejar pasar un 404 legible. Un directorio se puede mirar; la intención
// declarada en una variable de entorno, no.
const webDist = path.join(__dirname, "../web-dist");
// Se lee UNA vez al arrancar: el build no cambia en vida del proceso, y tener
// el string permite servir dos variantes del mismo archivo — la portada con su
// bloque prerenderizado en `/`, y el shell limpio para las rutas del cliente.
const indexHtml = existsSync(path.join(webDist, "index.html"))
  ? readFileSync(path.join(webDist, "index.html"), "utf8")
  : null;

// Las páginas con dueño (portada negociada HTML/markdown, /about, /contact,
// /privacy, /sitemap.xml) van ANTES de los assets; el catch-all va DESPUÉS,
// y ya no miente: shell del SPA solo para las rutas del cliente, 404 de
// verdad —negociado, con adónde ir— para todo lo demás.
app.use(crearPaginasPublicas(indexHtml));
if (indexHtml !== null) {
  // `/` no llega acá —lo atiende la negociación de arriba, montada antes—
  // así que el index por defecto solo resuelve subdirectorios como /docs/.
  app.use(express.static(webDist));
} else {
  registro.warn("web", `sin build en ${webDist}: solo se sirve /api`);
}
// La negación importa — sin ella, un endpoint mal escrito devolvería el HTML
// de la web con 200 y el cliente vería una página en vez de un error.
app.get(/^(?!\/api).*/, crearFallback(indexHtml === null ? null : sinPrerender(indexHtml)));

// Último de la cadena, a propósito: es la red de seguridad de TODO lo de
// arriba. Un error que escape de un controlador sale como 500 con id
// registrado, no como la página HTML de Express con el stack adentro.
app.use(manejadorDeErrores);

app.listen(PORT, async () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
  // pg-boss + workers arrancan en el mismo proceso del API (SDD §04: una
  // imagen, un contenedor). Para escalar horizontalmente = correr N réplicas
  // del contenedor — pg-boss reparte jobs vía SKIP LOCKED sobre Postgres.
  try {
    const boss = await getBoss();
    await registrarWorkerLiquidacion(boss);
  } catch (err) {
    // Registrado como error de verdad, no como un console.error que se pierde:
    // sin workers, las liquidaciones asíncronas se encolan y no corren — el
    // servicio se ve verde y el trabajo no sale.
    registro.error("boss", "fallo al arrancar workers: las liquidaciones encoladas NO van a correr", err);
  }
});

// Cierre limpio: pg-boss termina los jobs en vuelo antes de bajar. SIGTERM
// llega en `docker stop` y en el hot-reload de tsx.
for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.on(senal, async () => {
    console.log(`[boss] recibido ${senal}, apagando cola...`);
    await detenerBoss().catch((err) => console.error("[boss] error al cerrar:", err));
    process.exit(0);
  });
}
