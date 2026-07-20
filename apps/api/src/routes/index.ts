import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { calcular } from "../controllers/nominaController.js";
import { calcular as calcularIndemnizacion } from "../controllers/indemnizacionController.js";
import {
  calcularCesantias,
  calcularPrima,
  calcularRecargos,
} from "../controllers/calculadorasController.js";
import { listarFestivos } from "../controllers/festivosController.js";
import { parametrosPublicos } from "../controllers/reglasController.js";
import { extraer } from "../controllers/comprobanteController.js";
import { explicar } from "../controllers/chatController.js";
import { registro, registroIndividual, invitar, perfilIndividual, whoami } from "../controllers/authController.js";
import { listar as listarEmpresasAdmin, crear as crearEmpresaAdmin } from "../controllers/empresasAdminController.js";
import { crear as crearLiquidacion, listar as listarLiquidaciones } from "../controllers/liquidacionesController.js";
import { listar, crear, actualizar, eliminar, retirar, liquidacionFinal } from "../controllers/empleadosController.js";
import {
  listar as listarContratistas,
  crear as crearContratista,
  actualizar as actualizarContratista,
  eliminar as eliminarContratista,
} from "../controllers/contratistasController.js";
import { costos } from "../controllers/costosController.js";
import {
  listar as listarPeriodos,
  crear as crearPeriodo,
  editar as editarPeriodo,
  empleadosIncluidos,
  guardarEmpleadosIncluidos,
  obtenerTurnos,
  guardarTurnos,
  liquidar,
  revertir,
  recibos,
} from "../controllers/periodosController.js";
import {
  aceptar,
  misEmpresas,
  misInvitaciones,
  misRecibos,
  rechazar,
  reportar,
} from "../controllers/colaboradorController.js";
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
// Calculadora aparte de indemnización por terminación sin justa causa (SDD
// §14) — no es parte del recibo de nómina periódico, es otro modo de cálculo
// con sus propios inputs (fecha de ingreso/retiro o vencimiento pactado).
router.post("/indemnizacion/calcular", limitadorCalculo, calcularIndemnizacion);
// Calculadoras anónimas por concepto (SDD §14): prima, cesantías (+intereses)
// y recargos/horas extra — informativas, sin recibo ni deducciones.
router.post("/prima/calcular", limitadorCalculo, calcularPrima);
router.post("/cesantias/calcular", limitadorCalculo, calcularCesantias);
router.post("/recargos/calcular", limitadorCalculo, calcularRecargos);
router.get("/festivos", listarFestivos);
router.get("/reglas/parametros", parametrosPublicos);
router.post("/comprobantes/extraer", limitadorIA, upload.single("archivo"), extraer);
// Chat contador (Fase 4, SDD §03 Módulo E): disponible sobre cualquier
// ResultadoNomina ya calculado — anónimo o del portal colaborador, mismo
// endpoint. Mismo límite que extraer (costo de IA real por request).
router.post("/chat/explicar", limitadorIA, explicar);

// Auth y empresa.
router.post("/auth/registro", registro);
// Registro de cuenta individual (verificador anónimo → guardar historial).
router.post("/auth/registro-individual", registroIndividual);
// Asegura el perfil Usuario tras un login con OAuth (Google) — Supabase Auth
// crea la cuenta directo en el redirect, sin pasar por registro-individual.
router.post("/auth/perfil-individual", perfilIndividual);
// "¿Quién soy?" — usado por el login unificado (/login) y por los 3 portales
// para redirigir al correcto según el rol real de la cuenta.
router.get("/auth/whoami", requiereAuth, whoami);

// Historial personal de liquidaciones — cualquier usuario autenticado guarda
// y lista SUS propias (scoping por req.usuario.id, no por rol).
router.post("/liquidations", requiereAuth, crearLiquidacion);
router.get("/liquidations", requiereAuth, listarLiquidaciones);

const soloEmpresa = [requiereAuth, requiereRol("admin_empresa")];
router.get("/empresa/empleados", ...soloEmpresa, listar);
router.post("/empresa/empleados", ...soloEmpresa, crear);
router.put("/empresa/empleados/:id", ...soloEmpresa, actualizar);
// Borrado físico SOLO sin historial de nómina (caso "creado por error");
// con historial responde 409 y el camino es /retirar — los registros de
// nómina deben conservarse.
router.delete("/empresa/empleados/:id", ...soloEmpresa, eliminar);
router.post("/empresa/empleados/:id/invitar", ...soloEmpresa, invitar);
router.post("/empresa/empleados/:id/retirar", ...soloEmpresa, retirar);
router.post("/empresa/empleados/:id/liquidacion-final", ...soloEmpresa, liquidacionFinal);

router.get("/empresa/contratistas", ...soloEmpresa, listarContratistas);
router.post("/empresa/contratistas", ...soloEmpresa, crearContratista);
router.put("/empresa/contratistas/:id", ...soloEmpresa, actualizarContratista);
router.delete("/empresa/contratistas/:id", ...soloEmpresa, eliminarContratista);

// Panel de costo total empleador (SDD §13): salario + aportes patronales +
// provisiones por empleado activo, con la exoneración Ley 1607 como toggle.
router.get("/empresa/costos", ...soloEmpresa, costos);

router.get("/empresa/periodos", ...soloEmpresa, listarPeriodos);
router.post("/empresa/periodos", ...soloEmpresa, crearPeriodo);
// Editar fechas SOLO en borrador (uno liquidado se revierte primero) — la
// nota de edición queda como rastro de auditoría, ver periodosService.ts.
router.put("/empresa/periodos/:id", ...soloEmpresa, editarPeriodo);
router.get("/empresa/periodos/:id/turnos", ...soloEmpresa, obtenerTurnos);
router.put("/empresa/periodos/:id/turnos", ...soloEmpresa, guardarTurnos);
// Qué empleados quedan incluidos en el periodo (autopoblado al crear, solo
// editable en borrador) — ver editarEmpleadosPeriodo en periodosService.ts.
router.get("/empresa/periodos/:id/empleados", ...soloEmpresa, empleadosIncluidos);
router.put("/empresa/periodos/:id/empleados", ...soloEmpresa, guardarEmpleadosIncluidos);
router.post("/empresa/periodos/:id/liquidar", ...soloEmpresa, liquidar);
router.post("/empresa/periodos/:id/revertir", ...soloEmpresa, revertir);
router.get("/empresa/recibos", ...soloEmpresa, recibos);
router.get("/empresa/discrepancias", ...soloEmpresa, listarDiscrepancias);
router.put("/empresa/discrepancias/:id", ...soloEmpresa, responderDiscrepancia);

// Portal colaborador (Fase 7): un colaborador solo ve/reporta sobre SUS
// propios recibos — requiereAuth ya adjunta empleadoId, el controller
// valida que exista antes de tocar la DB.
const soloColaborador = [requiereAuth, requiereRol("colaborador")];
router.get("/colaborador/recibos", ...soloColaborador, misRecibos);
router.post("/colaborador/recibos/:id/reportar", ...soloColaborador, reportar);
// Invitaciones (notificaciones in-app) e historial de empresas de la cuenta —
// operan sobre el Usuario, no sobre el empleado activo (un colaborador libre
// entre empresas puede tener invitaciones pendientes sin empleado activo).
router.get("/colaborador/invitaciones", ...soloColaborador, misInvitaciones);
router.post("/colaborador/invitaciones/:id/aceptar", ...soloColaborador, aceptar);
router.post("/colaborador/invitaciones/:id/rechazar", ...soloColaborador, rechazar);
router.get("/colaborador/empresas", ...soloColaborador, misEmpresas);

// Panel admin de reglas legales (Fase 8) — rol de plataforma, no de empresa.
// No hay auto-registro público: el primer admin_plataforma se crea a mano
// (SQL directo o seed.ts en desarrollo), ver SDD.md §11.
const soloPlataforma = [requiereAuth, requiereRol("admin_plataforma")];
router.get("/admin/reglas", ...soloPlataforma, listarReglas);
router.post("/admin/reglas", ...soloPlataforma, crearRegla);
router.get("/admin/festivos", ...soloPlataforma, listarFestivosAdminHandler);
router.post("/admin/festivos", ...soloPlataforma, crearFestivoHandler);
router.delete("/admin/festivos/:id", ...soloPlataforma, eliminarFestivoHandler);
// Solo lectura por ahora — ver qué empresas usan la plataforma y quién las
// administra. Crear/reasignar/suspender quedan para otra ronda.
router.get("/admin/empresas", ...soloPlataforma, listarEmpresasAdmin);
// Onboarding manual: crea la empresa + invita a su primer admin_empresa
// (define su propia contraseña por correo, sin reasignar/suspender todavía).
router.post("/admin/empresas", ...soloPlataforma, crearEmpresaAdmin);

export default router;
