import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { calcular } from "../controllers/nominaController.js";
import { listarFestivos } from "../controllers/festivosController.js";
import { parametrosPublicos } from "../controllers/reglasController.js";
import { extraer } from "../controllers/comprobanteController.js";
import { registro, invitar } from "../controllers/authController.js";
import { listar, crear, actualizar, retirar, liquidacionFinal } from "../controllers/empleadosController.js";
import {
  listar as listarContratistas,
  crear as crearContratista,
  actualizar as actualizarContratista,
} from "../controllers/contratistasController.js";
import {
  listar as listarPeriodos,
  crear as crearPeriodo,
  obtenerTurnos,
  guardarTurnos,
  liquidar,
  recibos,
} from "../controllers/periodosController.js";
import { misRecibos, reportar } from "../controllers/colaboradorController.js";
import {
  listarReglas,
  crearRegla,
  listarFestivosAdminHandler,
  crearFestivoHandler,
  eliminarFestivoHandler,
} from "../controllers/reglasAdminController.js";
import { listar as listarDiscrepancias, responder as responderDiscrepancia } from "../controllers/discrepanciasController.js";
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

// El cálculo es anónimo y CPU-bound: límite generoso (30/min por IP,
// muy por encima del uso legítimo del wizard) que corta abuso automatizado.
const limitadorCalculo = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes — intenta de nuevo en un minuto." },
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Verificador anónimo — sin auth.
router.post("/nomina/calcular", limitadorCalculo, calcular);
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
router.post("/empresa/empleados/:id/retirar", ...soloEmpresa, retirar);
router.post("/empresa/empleados/:id/liquidacion-final", ...soloEmpresa, liquidacionFinal);

router.get("/empresa/contratistas", ...soloEmpresa, listarContratistas);
router.post("/empresa/contratistas", ...soloEmpresa, crearContratista);
router.put("/empresa/contratistas/:id", ...soloEmpresa, actualizarContratista);

router.get("/empresa/periodos", ...soloEmpresa, listarPeriodos);
router.post("/empresa/periodos", ...soloEmpresa, crearPeriodo);
router.get("/empresa/periodos/:id/turnos", ...soloEmpresa, obtenerTurnos);
router.put("/empresa/periodos/:id/turnos", ...soloEmpresa, guardarTurnos);
router.post("/empresa/periodos/:id/liquidar", ...soloEmpresa, liquidar);
router.get("/empresa/recibos", ...soloEmpresa, recibos);
router.get("/empresa/discrepancias", ...soloEmpresa, listarDiscrepancias);
router.put("/empresa/discrepancias/:id", ...soloEmpresa, responderDiscrepancia);

// Portal colaborador (Fase 7): un colaborador solo ve/reporta sobre SUS
// propios recibos — requiereAuth ya adjunta empleadoId, el controller
// valida que exista antes de tocar la DB.
const soloColaborador = [requiereAuth, requiereRol("colaborador")];
router.get("/colaborador/recibos", ...soloColaborador, misRecibos);
router.post("/colaborador/recibos/:id/reportar", ...soloColaborador, reportar);

// Panel admin de reglas legales (Fase 8) — rol de plataforma, no de empresa.
// No hay auto-registro público: el primer admin_plataforma se crea a mano
// (SQL directo o seed.ts en desarrollo), ver SDD.md §11.
const soloPlataforma = [requiereAuth, requiereRol("admin_plataforma")];
router.get("/admin/reglas", ...soloPlataforma, listarReglas);
router.post("/admin/reglas", ...soloPlataforma, crearRegla);
router.get("/admin/festivos", ...soloPlataforma, listarFestivosAdminHandler);
router.post("/admin/festivos", ...soloPlataforma, crearFestivoHandler);
router.delete("/admin/festivos/:id", ...soloPlataforma, eliminarFestivoHandler);

export default router;
