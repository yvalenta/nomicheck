import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { calcular } from "../controllers/nominaController.js";
import { listarFestivos } from "../controllers/festivosController.js";
import { extraer } from "../controllers/comprobanteController.js";

const router = Router();

// El archivo nunca toca disco: multer lo guarda en memoria y el controller
// lo descarta después de llamar a Claude (SDD §03 Módulo E, req. 6).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Endpoints con costo de IA: límite generoso pero real por IP para evitar
// abuso del flujo anónimo (SDD §08).
const limitadorIA = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes — intenta de nuevo en unos minutos." },
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.post("/nomina/calcular", calcular);
router.get("/festivos", listarFestivos);
router.post("/comprobantes/extraer", limitadorIA, upload.single("archivo"), extraer);

export default router;
