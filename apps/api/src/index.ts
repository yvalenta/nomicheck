import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import router from "./routes/index.js";
import { detenerBoss, getBoss } from "./lib/boss.js";
import { montarMuroX402 } from "./lib/x402Muro.js";
import { registrarWorkerLiquidacion } from "./workers/liquidacionWorker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

// Antes del router: el 402 tiene que salir sin ejecutar el cálculo. Apagado
// por defecto — sin `X402_ACTIVO=true` no monta nada.
montarMuroX402(app);

app.use("/api", router);

// En producción, esta misma imagen sirve el build estático de apps/web
// (un solo contenedor, un solo puerto) — no hay separación api/web en runtime.
if (process.env.NODE_ENV === "production") {
  const webDist = path.join(__dirname, "../web-dist");
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
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
