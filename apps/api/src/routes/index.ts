import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { calcular } from "../controllers/nominaController.js";
import { listarFestivos } from "../controllers/festivosController.js";
import { parametrosPublicos } from "../controllers/reglasController.js";
import { extraer } from "../controllers/comprobanteController.js";
import { registro, invitar } from "../controllers/authController.js";
import { listar, crear, actualizar } from "../controllers/empleadosController.js";
import {
  listar as listarPeriodos,
  crear as crearPeriodo,
  obtenerTurnos,
  guardarTurnos,
  liquidar,
  recibos,
} from "../controllers/periodosController.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

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

// Verificador anónimo — sin auth.
router.post("/nomina/calcular", calcular);
router.get("/festivos", listarFestivos);
router.get("/reglas/parametros", parametrosPublicos);
router.post("/comprobantes/extraer", limitadorIA, upload.single("archivo"), extraer);

// Auth y empresa.
router.post("/auth/registro", registro);

const soloEmpresa = [requiereAuth, requiereRol("admin_empresa")];
router.get("/empresa/empleados", ...soloEmpresa, listar);
router.post("/empresa/empleados", ...soloEmpresa, crear);
router.put("/empresa/empleados/:id", ...soloEmpresa, actualizar);
router.post("/empresa/empleados/:id/invitar", ...soloEmpresa, invitar);

router.get("/empresa/periodos", ...soloEmpresa, listarPeriodos);
router.post("/empresa/periodos", ...soloEmpresa, crearPeriodo);
router.get("/empresa/periodos/:id/turnos", ...soloEmpresa, obtenerTurnos);
router.put("/empresa/periodos/:id/turnos", ...soloEmpresa, guardarTurnos);
router.post("/empresa/periodos/:id/liquidar", ...soloEmpresa, liquidar);
router.get("/empresa/recibos", ...soloEmpresa, recibos);

export default router;
