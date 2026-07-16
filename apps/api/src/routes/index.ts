import { Router } from "express";
import { calcular } from "../controllers/nominaController.js";
import { listarFestivos } from "../controllers/festivosController.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.post("/nomina/calcular", calcular);
router.get("/festivos", listarFestivos);

export default router;
