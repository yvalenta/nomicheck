import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { llavePorIpReal } from "../lib/llaveRateLimit.js";
import { calcular } from "../controllers/nominaController.js";
import { batchPublicoRouter } from "./batchPublico.js";
import { calcular as calcularIndemnizacion } from "../controllers/indemnizacionController.js";
import {
  calcularCesantias,
  calcularPrima,
  calcularRecargos,
  calcularRetencion,
} from "../controllers/calculadorasController.js";
import { listarFestivos } from "../controllers/festivosController.js";
import { parametrosPublicos, reglasVerificadasAl } from "../controllers/reglasController.js";
import { verificarHashTasa } from "../controllers/tasaController.js";
import { extraer } from "../controllers/comprobanteController.js";
import { explicar } from "../controllers/chatController.js";
import { registro, registroIndividual, invitar, perfilIndividual, whoami } from "../controllers/authController.js";
import {
  actualizarDatos as actualizarDatosEmpresa,
  obtenerDatos as obtenerDatosEmpresa,
} from "../controllers/empresaController.js";
import {
  listar as listarEmpresasAdmin,
  crear as crearEmpresaAdmin,
  reasignarAdmin as reasignarAdminEmpresa,
  quitarAdmin as quitarAdminEmpresa,
  cambiarEstado as cambiarEstadoEmpresa,
} from "../controllers/empresasAdminController.js";
import { crear as crearLiquidacion, listar as listarLiquidaciones } from "../controllers/liquidacionesController.js";
import { listar, crear, actualizar, eliminar, retirar, liquidacionFinal } from "../controllers/empleadosController.js";
import {
  listar as listarContratistas,
  crear as crearContratista,
  actualizar as actualizarContratista,
  eliminar as eliminarContratista,
} from "../controllers/contratistasController.js";
import { costos } from "../controllers/costosController.js";
import { pilaPeriodo } from "../controllers/pilaController.js";
import { generarBatch, obtenerBatch, verificarBatch } from "../controllers/pagosController.js";
import { cumplimiento } from "../controllers/cumplimientoController.js";
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
  estadoLiquidacion,
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
import {
  asignarStaffCtrl,
  crear as crearSedeCtrl,
  eliminar as eliminarSedeCtrl,
  listar as listarSedesCtrl,
  listarStaffCtrl,
  quitarStaffCtrl,
} from "../controllers/sedesController.js";
import { listar as listarAuditoriaCtrl } from "../controllers/auditoriaController.js";
import { estadoCuenta as estadoCuentaCtrl } from "../controllers/cuentaController.js";
import { requiereAuth, requiereEmpresaEdicion, requiereEmpresaLectura, requiereRol } from "../middleware/auth.js";

const router = Router();

// El archivo nunca toca disco: multer lo guarda en memoria y el controller
// lo descarta después de llamar a Claude (SDD §03 Módulo E, req. 6).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Los tres limitadores llavean por `llavePorIpReal` y no por `req.ip`: el
// porqué está en `lib/llaveRateLimit.ts`, junto a la función.

// Endpoints con costo de IA: límite generoso pero real por IP para evitar
// abuso del flujo anónimo (SDD §08).
const limitadorIA = rateLimit({
  keyGenerator: llavePorIpReal,
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes — intenta de nuevo en unos minutos." },
});

// El cálculo es anónimo y CPU-bound: límite generoso (30/min por IP,
// muy por encima del uso legítimo del wizard) que corta abuso automatizado.
const limitadorCalculo = rateLimit({
  keyGenerator: llavePorIpReal,
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes — intenta de nuevo en un minuto." },
});

// Wrapper stateless del marketplace (RUMBO §3.4, listing 5/6/8a/8b): el
// buyer pagó un order y espera ejecución inmediata — 30/min sería un cuello
// artificial para un agente que quiere reintentar CSV+JSON o pedir el
// schema/ejemplo antes del POST. 60/min por IP sigue cortando abuso pero
// no fricciona al buyer legítimo. Sobreescribible por env porque el bucket
// es POR IP: detrás del proxy, un integrador con muchos agentes en un mismo
// egress agota el bucket de todos — subirlo es decisión de operación, no un
// redeploy.
const limitadorBatch = rateLimit({
  keyGenerator: llavePorIpReal,
  windowMs: 60 * 1000,
  limit: Number(process.env.BATCH_RATE_LIMIT_POR_MINUTO ?? 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes al wrapper batch — reintenta en un minuto." },
});

// `sha` es el commit que quedó desplegado, y existe para que una guarda EXTERNA
// pueda comparar lo servido contra la punta del repo sin entrar al VPS. Hasta
// que existió, el sha desplegado solo se sabía entrando por SSH: se escribía a
// mano en la documentación de nomicheck_ops y estuvo días falso con todos sus
// auditores en verde.
//
// `?? null` y no un default: si el deploy no lo inyectó, la respuesta tiene que
// decir "no sé" y no inventar un valor plausible. La guarda del otro lado
// distingue los dos casos — un null degrada a instantánea, un sha distinto de la
// punta es rojo.
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    sha: process.env.GIT_SHA ?? null,
  });
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
router.post("/retencion/calcular", limitadorCalculo, calcularRetencion);
// Wrapper stateless para Execution Market (listings 5/6/8a/8b, RUMBO §3.4):
// entra JSON, sale JSON, cero persistencia. Rate-limit propio más generoso
// (60/min) — el buyer pagó un order y espera ejecución inmediata + puede
// pedir schema/ejemplo antes del POST.
router.use("/batch", limitadorBatch, batchPublicoRouter);
router.get("/festivos", listarFestivos);
router.get("/reglas/parametros", parametrosPublicos);
// Ledger de reglas verificadas (RUMBO §2.4): fecha + hash sha256 canónico
// del catálogo ReglaLegal. Sin rate-limit — es lectura constante barata,
// pensada para ser citada por buyers del marketplace y auditores.
router.get("/reglas/verificadas-al", reglasVerificadasAl);
// Verificación pública de snapshot de tasa (listing 8b): recibe hash sha256
// y devuelve si coincide con el snapshot almacenado en el batch.
router.get("/tasa/verify", verificarHashTasa);
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

// SDD §15, pilar 1 — separación lectura/edición por rol:
//   lectura  = admin_empresa | analista_rrhh | auditor
//   edición  = admin_empresa | analista_rrhh (el auditor sale con 403)
// Invitaciones/eliminación de empleados y CRUD de sedes solo admin_empresa,
// ver más abajo con `soloAdminEmpresa`.
const empresaLectura = [requiereAuth, requiereEmpresaLectura];
const empresaEdicion = [requiereAuth, requiereEmpresaEdicion];
const soloAdminEmpresa = [requiereAuth, requiereRol("admin_empresa")];

// Los datos de la empresa misma (nombre, NIT, sector). Editar es solo del
// admin: el NIT sale impreso en las cuentas de cobro.
router.get("/empresa/datos", ...empresaLectura, obtenerDatosEmpresa);
router.put("/empresa/datos", ...soloAdminEmpresa, actualizarDatosEmpresa);

router.get("/empresa/empleados", ...empresaLectura, listar);
router.post("/empresa/empleados", ...empresaEdicion, crear);
router.put("/empresa/empleados/:id", ...empresaEdicion, actualizar);
// Borrado físico SOLO sin historial de nómina (caso "creado por error");
// con historial responde 409 y el camino es /retirar — los registros de
// nómina deben conservarse. Restringido a admin_empresa: es destructivo.
router.delete("/empresa/empleados/:id", ...soloAdminEmpresa, eliminar);
// Invitar es una acción de admin — crea vínculos entre cuentas y sedes.
router.post("/empresa/empleados/:id/invitar", ...soloAdminEmpresa, invitar);
router.post("/empresa/empleados/:id/retirar", ...empresaEdicion, retirar);
router.post("/empresa/empleados/:id/liquidacion-final", ...empresaEdicion, liquidacionFinal);

router.get("/empresa/contratistas", ...empresaLectura, listarContratistas);
router.post("/empresa/contratistas", ...empresaEdicion, crearContratista);
router.put("/empresa/contratistas/:id", ...empresaEdicion, actualizarContratista);
router.delete("/empresa/contratistas/:id", ...soloAdminEmpresa, eliminarContratista);

// Panel de costo total empleador (SDD §13): salario + aportes patronales +
// provisiones por empleado activo, con la exoneración Ley 1607 como toggle.
router.get("/empresa/costos", ...empresaLectura, costos);

// Semáforo de cumplimiento (SDD §14): aprendices mal clasificados, salarios
// bajo el mínimo (estado actual de empleados activos) y horas extra
// excedidas (últimos periodos liquidados) — reusa detección ya existente.
router.get("/empresa/cumplimiento", ...empresaLectura, cumplimiento);

router.get("/empresa/periodos", ...empresaLectura, listarPeriodos);
router.post("/empresa/periodos", ...empresaEdicion, crearPeriodo);
// Editar fechas SOLO en borrador (uno liquidado se revierte primero) — la
// nota de edición queda como rastro de auditoría, ver periodosService.ts.
router.put("/empresa/periodos/:id", ...empresaEdicion, editarPeriodo);
router.get("/empresa/periodos/:id/turnos", ...empresaLectura, obtenerTurnos);
router.put("/empresa/periodos/:id/turnos", ...empresaEdicion, guardarTurnos);
// Qué empleados quedan incluidos en el periodo (autopoblado al crear, solo
// editable en borrador) — ver editarEmpleadosPeriodo en periodosService.ts.
router.get("/empresa/periodos/:id/empleados", ...empresaLectura, empleadosIncluidos);
router.put("/empresa/periodos/:id/empleados", ...empresaEdicion, guardarEmpleadosIncluidos);
router.post("/empresa/periodos/:id/liquidar", ...empresaEdicion, liquidar);
// Polling desde la UI mientras estado='liquidando' — respuesta ligera con
// solo { estado, progreso, jobId, erroresLiquidacion, version }.
router.get("/empresa/periodos/:id/estado", ...empresaLectura, estadoLiquidacion);
router.post("/empresa/periodos/:id/revertir", ...soloAdminEmpresa, revertir);
// PILA exacta por periodo ya liquidado (SDD §14): IBC real de cada recibo,
// no un salario mensual estimado — ver pilaService.ts.
router.get("/empresa/periodos/:id/pila", ...empresaLectura, pilaPeriodo);
// Pago on-chain no-custodial (SDD §17): generar lote USDC (solo admin —
// mueve dinero real aunque la firma sea del empleador), leer lote vigente
// (los 3 roles), verificar txHash y transicionar a `pagado` (solo admin).
router.post("/empresa/periodos/:id/batch-pago", ...soloAdminEmpresa, generarBatch);
router.get("/empresa/periodos/:id/batch-pago", ...empresaLectura, obtenerBatch);
router.post("/empresa/batches/:batchId/verificar", ...soloAdminEmpresa, verificarBatch);
router.get("/empresa/recibos", ...empresaLectura, recibos);
router.get("/empresa/discrepancias", ...empresaLectura, listarDiscrepancias);
router.put("/empresa/discrepancias/:id", ...empresaEdicion, responderDiscrepancia);

// Sedes + staff empresarial (SDD §15, pilar 1). Solo admin_empresa — dar/
// quitar acceso a la empresa es una decisión de administración.
router.get("/empresa/sedes", ...empresaLectura, listarSedesCtrl);
router.post("/empresa/sedes", ...soloAdminEmpresa, crearSedeCtrl);
router.delete("/empresa/sedes/:id", ...soloAdminEmpresa, eliminarSedeCtrl);
router.get("/empresa/staff", ...empresaLectura, listarStaffCtrl);
router.post("/empresa/staff", ...soloAdminEmpresa, asignarStaffCtrl);
router.delete("/empresa/staff/:id", ...soloAdminEmpresa, quitarStaffCtrl);

// Bitácora de cambios (SDD §15, pilar 1B) — solo lectura para todos los
// roles de empresa. El auditor la usa para verificar quién tocó qué.
router.get("/empresa/auditoria", ...empresaLectura, listarAuditoriaCtrl);

// Estado de cuenta: qué se le va a cobrar este mes y por qué. Lectura para
// todos los roles de empresa a propósito — un cobro que solo puede anticipar
// el admin es un cobro que sorprende a quien lo recibe. El monto sale del
// mismo cálculo que producirá la factura (`services/medidorCierres.ts`).
router.get("/empresa/cuenta", ...empresaLectura, estadoCuentaCtrl);

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
// Ver qué empresas usan la plataforma, quién las administra y su estado.
router.get("/admin/empresas", ...soloPlataforma, listarEmpresasAdmin);
// Onboarding manual: crea la empresa + invita a su primer admin_empresa
// (define su propia contraseña por correo).
router.post("/admin/empresas", ...soloPlataforma, crearEmpresaAdmin);
// Reasignar = reemplazar al admin_empresa actual por uno nuevo (invitación).
router.put("/admin/empresas/:id/admin", ...soloPlataforma, reasignarAdminEmpresa);
// Quitar: desvincula al admin_empresa indicado (no borra su cuenta).
router.delete("/admin/empresas/:id/admin/:usuarioId", ...soloPlataforma, quitarAdminEmpresa);
// Suspender/reactivar: bloquea/desbloquea de verdad el acceso (ver middleware/auth.ts).
router.put("/admin/empresas/:id/estado", ...soloPlataforma, cambiarEstadoEmpresa);

export default router;
