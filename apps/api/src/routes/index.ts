import { Router } from "express";
import { calcular } from "../controllers/nominaController.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.post("/nomina/calcular", calcular);

export default router;
