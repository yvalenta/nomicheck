// Quién puede hacer qué, en UN solo lugar.
//
// Hasta acá el permiso vivía dos veces: la API lo hace cumplir en
// `routes/index.ts` (`empresaLectura` / `empresaEdicion` / `soloAdminEmpresa` /
// `soloColaborador` / `soloPlataforma`) y la web lo vuelve a decidir por su
// cuenta para dibujar el menú — hoy `EmpresaApp.tsx` deja entrar SOLO a
// `admin_empresa`, aunque la API acepta también a `analista_rrhh` y `auditor`
// en todas las rutas de empresa. Dos fuentes que ya divergen: una pantalla que
// esconde lo que el servidor permite miente, y una que muestra lo que el
// servidor rechaza es peor (el usuario descubre el 403 después de trabajar).
//
// Esta matriz es la fuente: la API la hace cumplir y la web la dibuja
// (`permisosDe`/`rolesCon` alimentan la página de Roles). Si un permiso no
// está acá, no existe.
//
// Alcance de lo que se modela: SOLO lo que depende del rol. Las rutas que
// únicamente piden sesión (`/liquidations`, el historial personal) no están:
// no las gobierna el rol sino `req.usuario.id`, y meterlas haría parecer que
// el `auditor` escribe algo (guarda su propia liquidación, y puede) cuando la
// regla real de la casa es que no toca datos de la empresa.
//
// La matriz dice QUÉ acciones tiene un rol. Sobre QUÉ FILAS las ejerce lo
// sigue diciendo `sedesDelUsuario()` en `middleware/auth.ts` — un
// `analista_rrhh` con sedes asignadas tiene `empleados.editar` igual que el
// admin, pero solo sobre los empleados de sus sedes.
//
// Convención de nombres, y de ella dependen las pruebas: un permiso que
// termina en `.ver` es de LECTURA; cualquier otro es de ESCRITURA. Por eso el
// `auditor` (solo lectura, SDD §15 pilar 1) no puede aparecer en ninguna celda
// cuyo permiso no termine en `.ver`.

// Los roles existen en tiempo de ejecución (no solo como tipo) porque
// `rolesCon` necesita recorrerlos para que la web dibuje la columna de cada
// rol. El comentario de `Usuario.rol` en schema.prisma es el mismo listado.
export const ROLES = [
  "admin_plataforma",
  "admin_empresa",
  "analista_rrhh",
  "auditor",
  "colaborador",
  "individual",
] as const;

export type Rol = (typeof ROLES)[number];

// Un permiso por ACCIÓN, no por endpoint: `nomina.operar` cubre crear el
// periodo, editar sus fechas, guardar turnos, elegir incluidos y liquidar —
// las cinco rutas las guarda el mismo `empresaEdicion` y separarlas inventaría
// distinciones que nadie hace cumplir.
export const PERMISOS = [
  // Empresa: datos propios, panel de costos y semáforo de cumplimiento — los
  // tres son el mismo tablero de lectura de la empresa (`empresaLectura`).
  "empresa.ver",
  // PUT /empresa/datos: solo el admin. El NIT sale impreso en las cuentas de
  // cobro.
  "empresa.editar",
  // GET /empresa/cuenta — qué se va a cobrar este mes. Aparte de `empresa.ver`
  // porque es plata, no operación, y la página de Roles debe poder decirlo.
  "empresa.cuenta.ver",

  "empleados.ver",
  // Crear, actualizar, retirar y liquidación final.
  "empleados.editar",
  // DELETE físico (solo sin historial de nómina): destructivo, solo admin.
  "empleados.eliminar",
  // Invitar crea vínculos entre cuentas y la empresa: solo admin.
  "empleados.invitar",

  "contratistas.ver",
  "contratistas.editar",
  "contratistas.eliminar",

  // Periodos, turnos, incluidos, estado de liquidación, recibos, PILA y el
  // lote de pago vigente (GET).
  "nomina.ver",
  // Crear/editar periodo, turnos, incluidos y liquidar.
  "nomina.operar",
  // Revertir un periodo liquidado: solo admin.
  "nomina.revertir",
  // Generar el lote USDC y verificar el txHash: mueve dinero real, solo admin.
  "nomina.pagar",

  "discrepancias.ver",
  "discrepancias.responder",
  // Del lado del colaborador: reportar una discrepancia sobre SU recibo.
  "discrepancias.reportar",

  "sedes.ver",
  // Crear/eliminar sedes: solo admin.
  "sedes.gestionar",

  // Staff empresarial (quién de la empresa entra y a qué sedes).
  "miembros.ver",
  // Asignar/quitar staff: dar acceso es decisión de administración.
  "miembros.gestionar",

  // Bitácora de cambios. Lectura para los tres roles de empresa: es la
  // herramienta con la que el auditor verifica quién tocó qué.
  "auditoria.ver",

  // Portal colaborador — todo acotado a lo suyo por `empleadoId`/`usuarioId`.
  "recibos.propios.ver",
  "invitaciones.ver",
  // Aceptar o rechazar una invitación.
  "invitaciones.responder",
  "empresas.propias.ver",

  // Plataforma. No se parten en ver/editar porque la API no lo parte: las
  // rutas de reglas, festivos y empresas están todas detrás del mismo
  // `soloPlataforma`, en todos los métodos. Partirlas acá dibujaría en la web
  // una distinción que el servidor no hace cumplir.
  "plataforma.reglas",
  "plataforma.empresas",
] as const;

export type Permiso = (typeof PERMISOS)[number];

// La matriz. `Record<Permiso, ...>` obliga al compilador a exigir una celda
// por permiso: agregar un permiso arriba sin decidir quién lo tiene no
// compila.
//
// Cada fila refleja lo que HOY hace cumplir `routes/index.ts`, no lo que
// sería ideal. Si una celda parece rara, el lugar donde discutirla es la ruta.
export const MATRIZ: Record<Permiso, readonly Rol[]> = {
  // `admin_plataforma` no aparece en NINGUNA celda de empresa, y es a
  // propósito: `requiereEmpresaLectura` no lo incluye y además nunca tiene
  // `empresaId` (middleware/auth.ts) — no hay empresa "suya" que ver.
  "empresa.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "empresa.editar": ["admin_empresa"],
  // El auditor ve el cobro a propósito: un cobro que solo puede anticipar el
  // admin es un cobro que sorprende a quien lo recibe (ver la ruta).
  "empresa.cuenta.ver": ["admin_empresa", "analista_rrhh", "auditor"],

  "empleados.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "empleados.editar": ["admin_empresa", "analista_rrhh"],
  "empleados.eliminar": ["admin_empresa"],
  "empleados.invitar": ["admin_empresa"],

  "contratistas.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "contratistas.editar": ["admin_empresa", "analista_rrhh"],
  "contratistas.eliminar": ["admin_empresa"],

  "nomina.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  // El analista SÍ liquida (es su trabajo operativo); revertir y pagar no.
  "nomina.operar": ["admin_empresa", "analista_rrhh"],
  "nomina.revertir": ["admin_empresa"],
  "nomina.pagar": ["admin_empresa"],

  "discrepancias.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "discrepancias.responder": ["admin_empresa", "analista_rrhh"],
  // Solo el colaborador reporta: la ruta es `soloColaborador`. Un admin que
  // quisiera abrir una discrepancia por su cuenta hoy recibe 403.
  "discrepancias.reportar": ["colaborador"],

  "sedes.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "sedes.gestionar": ["admin_empresa"],

  "miembros.ver": ["admin_empresa", "analista_rrhh", "auditor"],
  "miembros.gestionar": ["admin_empresa"],

  "auditoria.ver": ["admin_empresa", "analista_rrhh", "auditor"],

  "recibos.propios.ver": ["colaborador"],
  "invitaciones.ver": ["colaborador"],
  "invitaciones.responder": ["colaborador"],
  "empresas.propias.ver": ["colaborador"],

  "plataforma.reglas": ["admin_plataforma"],
  "plataforma.empresas": ["admin_plataforma"],

  // `individual` no aparece en ninguna celda: es la cuenta sin empresa del
  // verificador anónimo. Lo único que hace (guardar y listar SUS
  // liquidaciones) no lo gobierna el rol, ver la nota de alcance arriba.
};

/** La pregunta que hace la API antes de dejar pasar y la web antes de dibujar. */
export function puede(rol: Rol, permiso: Permiso): boolean {
  return MATRIZ[permiso].includes(rol);
}

/** Todo lo que un rol puede hacer, en el orden declarado en `PERMISOS`. */
export function permisosDe(rol: Rol): Permiso[] {
  return PERMISOS.filter((permiso) => puede(rol, permiso));
}

/** Qué roles tienen un permiso, en el orden declarado en `ROLES` — así la
 * página de Roles pinta las columnas siempre igual, sin depender del orden en
 * que se escribió cada celda de la matriz. */
export function rolesCon(permiso: Permiso): Rol[] {
  return ROLES.filter((rol) => puede(rol, permiso));
}
