import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import router from "./routes/index.js";
import { detenerBoss, getBoss } from "./lib/boss.js";
import { delegadoCors } from "./lib/corsPublico.js";
import { montarMuroX402 } from "./lib/x402Muro.js";
import { registrarWorkerLiquidacion } from "./workers/liquidacionWorker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;

// CORS por ruta: `*` para los GET que sirven para verificar (llave pública,
// esquemas, ejemplos firmados) y `CORS_ORIGIN` para todo lo demás. Sin esto la
// llave pública era ilegible desde otro origen y ningún verificador de
// terceros en el navegador podía comprobarnos. Ver lib/corsPublico.ts.
app.use(cors(delegadoCors));
app.use(express.json());

// Antes del router: el 402 tiene que salir sin ejecutar el cálculo. Apagado
// por defecto — sin `X402_ACTIVO=true` no monta nada.
montarMuroX402(app);

app.use("/api", router);

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
if (existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist));
  // Fallback de SPA: todo lo que no sea `/api` lo resuelve el router del
  // cliente. La negación importa — sin ella, un endpoint mal escrito
  // devolvería el HTML de la web con 200 y el cliente vería una página en vez
  // de un error.
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
} else {
  // eslint-disable-next-line no-console
  console.warn(`[web] sin build en ${webDist}: solo se sirve /api`);
}

app.listen(PORT, async () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
  // pg-boss + workers arrancan en el mismo proceso del API (SDD §04: una
  // imagen, un contenedor). Para escalar horizontalmente = correr N réplicas
  // del contenedor — pg-boss reparte jobs vía SKIP LOCKED sobre Postgres.
  try {
    const boss = await getBoss();
    await registrarWorkerLiquidacion(boss);
  } catch (err) {
    console.error("[boss] fallo al arrancar workers:", err);
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
