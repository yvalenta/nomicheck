import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { construirServidor, crearTransporteHttp } from "@pv/mcp";
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
import {
  registro,
  registroIndividual,
  invitar,
  perfilIndividual,
  whoami,
  empresaActiva,
  salirVistaPlataforma,
} from "../controllers/authController.js";
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
  entrar as entrarEmpresaAdmin,
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
import { requiereAuth, requierePermiso } from "../middleware/auth.js";
import type { Permiso } from "../lib/permisos.js";

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

// MCP sobre HTTP (transporte streamable, SIN sesión): las cinco herramientas
// de @pv/mcp, servidas por el mismo contenedor. Servidor y transporte se crean
// POR PETICIÓN a propósito — stateless como el wrapper que envuelven, así que
// no hay sesiones que administrar ni estado que se pudra entre llamadas. El
// muro x402 no toca esta ruta: las herramientas pegan a los endpoints reales,
// que cobran o no según su propia regla — el MCP expone el 402, no lo evita.
// Anunciado en /.well-known/mcp/server-card.json, que lee la MISMA identidad
// (INFO_SERVIDOR) que este servidor declara.
router.post("/mcp", limitadorBatch, async (req, res) => {
  const transporte = crearTransporteHttp();
  const servidor = construirServidor();
  res.on("close", () => {
    void transporte.close();
    void servidor.close();
  });
  try {
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, req.body);
  } catch {
    // JSON-RPC hasta en el fallo: un cliente MCP no sabe leer otra cosa.
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "internal_error" },
        id: null,
      });
    }
  }
});
// Sin sesión no hay stream que retomar (GET) ni que cerrar (DELETE): 405 con
// la pista, para que un cliente con transporte viejo entienda qué cambiar.
for (const metodo of ["get", "delete"] as const) {
  router[metodo]("/mcp", (_req, res) => {
    res.status(405).json({
      error: "method_not_allowed",
      mensaje: "El transporte es streamable HTTP sin sesión: POST con JSON-RPC 2.0.",
      card: "/.well-known/mcp/server-card.json",
    });
  });
}
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
// para redirigir al correcto según el rol real de la cuenta. Devuelve además
// TODAS las empresas de la cuenta: es lo que dibuja el selector del header.
router.get("/auth/whoami", requiereAuth, whoami);
// Cambiar de empresa activa sin re-login (SDD §15 — paso 5). Solo pide sesión:
// la autorización no es de rol sino de PERTENENCIA, y esa la comprueba el
// servicio contra `MembresiaEmpresa` dentro de la misma transacción que mueve
// el puntero. Un `requierePermiso` acá sería una guarda que mira el rol en la
// empresa de la que el usuario se está yendo — la pregunta equivocada.
router.post("/auth/empresa-activa", requiereAuth, empresaActiva);
// Salir del «ver como» de plataforma. Solo pide sesión por la misma razón de
// arriba — y además PORQUE NO QUEDA OTRA: con la vista puesta el rol efectivo
// es auditor y cualquier permiso de plataforma daría 403 justo a quien
// necesita salir. La cuenta se verifica en el servicio (rol de CUENTA
// admin_plataforma en la base); cualquier otra recibe 403.
router.post("/auth/vista-plataforma/salir", requiereAuth, salirVistaPlataforma);

// Historial personal de liquidaciones — cualquier usuario autenticado guarda
// y lista SUS propias (scoping por req.usuario.id, no por rol).
router.post("/liquidations", requiereAuth, crearLiquidacion);
router.get("/liquidations", requiereAuth, listarLiquidaciones);

// SDD §15, pilar 1 — quién puede qué NO se decide acá: cada ruta nombra la
// ACCIÓN que ejerce y `lib/permisos.ts` dice qué roles la tienen. Hasta el
// 2026-08-31 esto era `empresaLectura` / `empresaEdicion` / `soloAdminEmpresa`
// —listas de roles escritas en este archivo— y la web volvía a decidir por su
// cuenta para dibujar el menú: dos fuentes que ya divergían. Ahora las dos leen
// la misma celda.
//
// Los conjuntos de roles quedaron IDÉNTICOS en la migración: `empresa.ver` es
// exactamente quien pasaba por `empresaLectura`, `empleados.editar` quien
// pasaba por `empresaEdicion`, y así. Ninguna ruta cambió de gente.
//
// `guardas.test.ts` recorre este router y exige que toda ruta de empresa,
// colaborador y plataforma monte `requiereAuth` + un permiso de la matriz —
// una ruta nueva sin guarda se pone roja sola.
const conPermiso = (permiso: Permiso) => [requiereAuth, requierePermiso(permiso)];

// Los datos de la empresa misma (nombre, NIT, sector). Editar es solo del
// admin: el NIT sale impreso en las cuentas de cobro.
router.get("/empresa/datos", ...conPermiso("empresa.ver"), obtenerDatosEmpresa);
router.put("/empresa/datos", ...conPermiso("empresa.editar"), actualizarDatosEmpresa);

router.get("/empresa/empleados", ...conPermiso("empleados.ver"), listar);
router.post("/empresa/empleados", ...conPermiso("empleados.editar"), crear);
router.put("/empresa/empleados/:id", ...conPermiso("empleados.editar"), actualizar);
// Borrado físico SOLO sin historial de nómina (caso "creado por error");
// con historial responde 409 y el camino es /retirar — los registros de
// nómina deben conservarse. Permiso propio: es destructivo.
router.delete("/empresa/empleados/:id", ...conPermiso("empleados.eliminar"), eliminar);
// Invitar es una acción de admin — crea vínculos entre cuentas y sedes.
router.post("/empresa/empleados/:id/invitar", ...conPermiso("empleados.invitar"), invitar);
router.post("/empresa/empleados/:id/retirar", ...conPermiso("empleados.editar"), retirar);
router.post("/empresa/empleados/:id/liquidacion-final", ...conPermiso("empleados.editar"), liquidacionFinal);

router.get("/empresa/contratistas", ...conPermiso("contratistas.ver"), listarContratistas);
router.post("/empresa/contratistas", ...conPermiso("contratistas.editar"), crearContratista);
router.put("/empresa/contratistas/:id", ...conPermiso("contratistas.editar"), actualizarContratista);
router.delete("/empresa/contratistas/:id", ...conPermiso("contratistas.eliminar"), eliminarContratista);

// Panel de costo total empleador (SDD §13): salario + aportes patronales +
// provisiones por empleado activo, con la exoneración Ley 1607 como toggle.
// Costos y cumplimiento son el mismo tablero de lectura de la empresa que
// `/empresa/datos` — un permiso, no tres (ver `lib/permisos.ts`).
router.get("/empresa/costos", ...conPermiso("empresa.ver"), costos);

// Semáforo de cumplimiento (SDD §14): aprendices mal clasificados, salarios
// bajo el mínimo (estado actual de empleados activos) y horas extra
// excedidas (últimos periodos liquidados) — reusa detección ya existente.
router.get("/empresa/cumplimiento", ...conPermiso("empresa.ver"), cumplimiento);

router.get("/empresa/periodos", ...conPermiso("nomina.ver"), listarPeriodos);
router.post("/empresa/periodos", ...conPermiso("nomina.operar"), crearPeriodo);
// Editar fechas SOLO en borrador (uno liquidado se revierte primero) — la
// nota de edición queda como rastro de auditoría, ver periodosService.ts.
router.put("/empresa/periodos/:id", ...conPermiso("nomina.operar"), editarPeriodo);
router.get("/empresa/periodos/:id/turnos", ...conPermiso("nomina.ver"), obtenerTurnos);
router.put("/empresa/periodos/:id/turnos", ...conPermiso("nomina.operar"), guardarTurnos);
// Qué empleados quedan incluidos en el periodo (autopoblado al crear, solo
// editable en borrador) — ver editarEmpleadosPeriodo en periodosService.ts.
router.get("/empresa/periodos/:id/empleados", ...conPermiso("nomina.ver"), empleadosIncluidos);
router.put("/empresa/periodos/:id/empleados", ...conPermiso("nomina.operar"), guardarEmpleadosIncluidos);
router.post("/empresa/periodos/:id/liquidar", ...conPermiso("nomina.operar"), liquidar);
// Polling desde la UI mientras estado='liquidando' — respuesta ligera con
// solo { estado, progreso, jobId, erroresLiquidacion, version }.
router.get("/empresa/periodos/:id/estado", ...conPermiso("nomina.ver"), estadoLiquidacion);
router.post("/empresa/periodos/:id/revertir", ...conPermiso("nomina.revertir"), revertir);
// PILA exacta por periodo ya liquidado (SDD §14): IBC real de cada recibo,
// no un salario mensual estimado — ver pilaService.ts.
router.get("/empresa/periodos/:id/pila", ...conPermiso("nomina.ver"), pilaPeriodo);
// Pago on-chain no-custodial (SDD §17): generar lote USDC (`nomina.pagar` —
// mueve dinero real aunque la firma sea del empleador), leer lote vigente
// (`nomina.ver`, los 3 roles), verificar txHash y transicionar a `pagado`.
router.post("/empresa/periodos/:id/batch-pago", ...conPermiso("nomina.pagar"), generarBatch);
router.get("/empresa/periodos/:id/batch-pago", ...conPermiso("nomina.ver"), obtenerBatch);
router.post("/empresa/batches/:batchId/verificar", ...conPermiso("nomina.pagar"), verificarBatch);
router.get("/empresa/recibos", ...conPermiso("nomina.ver"), recibos);
router.get("/empresa/discrepancias", ...conPermiso("discrepancias.ver"), listarDiscrepancias);
router.put("/empresa/discrepancias/:id", ...conPermiso("discrepancias.responder"), responderDiscrepancia);

// Sedes + staff empresarial (SDD §15, pilar 1). Gestionar es solo del admin —
// dar/quitar acceso a la empresa es una decisión de administración.
router.get("/empresa/sedes", ...conPermiso("sedes.ver"), listarSedesCtrl);
router.post("/empresa/sedes", ...conPermiso("sedes.gestionar"), crearSedeCtrl);
router.delete("/empresa/sedes/:id", ...conPermiso("sedes.gestionar"), eliminarSedeCtrl);
router.get("/empresa/staff", ...conPermiso("miembros.ver"), listarStaffCtrl);
router.post("/empresa/staff", ...conPermiso("miembros.gestionar"), asignarStaffCtrl);
router.delete("/empresa/staff/:id", ...conPermiso("miembros.gestionar"), quitarStaffCtrl);

// Bitácora de cambios (SDD §15, pilar 1B) — solo lectura para todos los
// roles de empresa. El auditor la usa para verificar quién tocó qué.
router.get("/empresa/auditoria", ...conPermiso("auditoria.ver"), listarAuditoriaCtrl);

// Estado de cuenta: qué se le va a cobrar este mes y por qué. Lectura para
// todos los roles de empresa a propósito — un cobro que solo puede anticipar
// el admin es un cobro que sorprende a quien lo recibe. El monto sale del
// mismo cálculo que producirá la factura (`services/medidorCierres.ts`).
router.get("/empresa/cuenta", ...conPermiso("empresa.cuenta.ver"), estadoCuentaCtrl);

// Portal colaborador (Fase 7): un colaborador solo ve/reporta sobre SUS
// propios recibos — requiereAuth ya adjunta empleadoId, el controller
// valida que exista antes de tocar la DB.
router.get("/colaborador/recibos", ...conPermiso("recibos.propios.ver"), misRecibos);
router.post("/colaborador/recibos/:id/reportar", ...conPermiso("discrepancias.reportar"), reportar);
// Invitaciones (notificaciones in-app) e historial de empresas de la cuenta —
// operan sobre el Usuario, no sobre el empleado activo (un colaborador libre
// entre empresas puede tener invitaciones pendientes sin empleado activo).
router.get("/colaborador/invitaciones", ...conPermiso("invitaciones.ver"), misInvitaciones);
router.post("/colaborador/invitaciones/:id/aceptar", ...conPermiso("invitaciones.responder"), aceptar);
router.post("/colaborador/invitaciones/:id/rechazar", ...conPermiso("invitaciones.responder"), rechazar);
router.get("/colaborador/empresas", ...conPermiso("empresas.propias.ver"), misEmpresas);

// Panel admin de reglas legales (Fase 8) — rol de plataforma, no de empresa.
// No hay auto-registro público: el primer admin_plataforma se crea a mano
// (SQL directo o seed.ts en desarrollo), ver SDD.md §11.
//
// Los dos permisos de plataforma no se parten en ver/editar porque la API no
// lo parte: todos los métodos de reglas, festivos y empresas estaban detrás
// del mismo `soloPlataforma` (ver `lib/permisos.ts`).
router.get("/admin/reglas", ...conPermiso("plataforma.reglas"), listarReglas);
router.post("/admin/reglas", ...conPermiso("plataforma.reglas"), crearRegla);
router.get("/admin/festivos", ...conPermiso("plataforma.reglas"), listarFestivosAdminHandler);
router.post("/admin/festivos", ...conPermiso("plataforma.reglas"), crearFestivoHandler);
router.delete("/admin/festivos/:id", ...conPermiso("plataforma.reglas"), eliminarFestivoHandler);
// Ver qué empresas usan la plataforma, quién las administra y su estado.
router.get("/admin/empresas", ...conPermiso("plataforma.empresas"), listarEmpresasAdmin);
// Onboarding manual: crea la empresa + invita a su primer admin_empresa
// (define su propia contraseña por correo).
router.post("/admin/empresas", ...conPermiso("plataforma.empresas"), crearEmpresaAdmin);
// Reasignar = reemplazar al admin_empresa actual por uno nuevo (invitación).
router.put("/admin/empresas/:id/admin", ...conPermiso("plataforma.empresas"), reasignarAdminEmpresa);
// Quitar: desvincula al admin_empresa indicado (no borra su cuenta).
router.delete("/admin/empresas/:id/admin/:usuarioId", ...conPermiso("plataforma.empresas"), quitarAdminEmpresa);
// Suspender/reactivar: bloquea/desbloquea de verdad el acceso (ver middleware/auth.ts).
router.put("/admin/empresas/:id/estado", ...conPermiso("plataforma.empresas"), cambiarEstadoEmpresa);
// «Ver como» solo lectura: membresía auditor + puntero, auditados. La vuelta
// vive en POST /auth/vista-plataforma/salir — con la vista puesta el rol
// efectivo es auditor y este prefijo entero responde 403.
router.post("/admin/empresas/:id/entrar", ...conPermiso("plataforma.empresas"), entrarEmpresaAdmin);

export default router;
