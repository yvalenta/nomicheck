import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import router from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use("/api", router);

// En producción, esta misma imagen sirve el build estático de apps/web
// (un solo contenedor, un solo puerto) — no hay separación api/web en runtime.
if (process.env.NODE_ENV === "production") {
  const webDist = path.join(__dirname, "../web-dist");
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
