import type { FilaMatriz } from "../apiEmpresa";

// Cómo se LEE la matriz. Nada de quién puede qué.
//
// La línea que este archivo no cruza: acá no hay ni un rol. Quién tiene cada
// permiso lo dice `apps/api/src/lib/permisos.ts` y llega por
// `GET /empresa/permisos`; esto solo pone nombre humano, agrupación y una frase
// de ayuda encima de las claves que la API mandó. Si alguna vez alguien agrega
// una lista de roles a este archivo, la página vuelve a ser una segunda fuente
// que puede mentir — que es justo lo que la matriz vino a cerrar.
//
// Consecuencia de esa división, y es la regla que sostiene la prueba: la tabla
// se dibuja recorriendo lo que llegó de la API, no este catálogo. Un permiso
// nuevo en el backend sin ficha acá SE MUESTRA igual, con su clave cruda por
// etiqueta. Un permiso que ya no exista en la API desaparece de la tabla aunque
// su ficha siga escrita. La API manda; esto acompaña.

export interface FichaPermiso {
  /** Grupo de la tabla. El orden de los grupos sale del orden en que la API
   *  manda los permisos, no de una lista acá. */
  dominio: string;
  etiqueta: string;
  /** Qué hace ese permiso, en una frase — es el tooltip de la fila. */
  que: string;
  /** Resumen legible de las rutas que lo montan. Es texto de apoyo: la verdad
   *  son las rutas del router, y cuando la API las publique en `fila.rutas`
   *  esas ganan (ver `rutasDe`). */
  rutas: string;
}

const SIN_CLASIFICAR = "Otros permisos";

// Las fichas siguen el orden de `PERMISOS` en el backend, para que leer los dos
// archivos en paralelo sea posible.
const CATALOGO: Record<string, FichaPermiso> = {
  "empresa.ver": {
    dominio: "Empresa",
    etiqueta: "Ver datos de la empresa",
    que: "Razón social, NIT y sector, más el panel de costos y el semáforo de cumplimiento — el mismo tablero de lectura.",
    rutas: "GET /empresa/datos · /costos · /cumplimiento",
  },
  "empresa.editar": {
    dominio: "Empresa",
    etiqueta: "Editar datos",
    que: "Cambiar razón social y datos fiscales. Solo el admin: el NIT sale impreso en las cuentas de cobro.",
    rutas: "PUT /empresa/datos",
  },
  "empresa.cuenta.ver": {
    dominio: "Empresa",
    etiqueta: "Ver estado de cuenta",
    que: "Qué se le va a cobrar a la empresa este mes. Aparte de ver la empresa porque es plata, no operación.",
    rutas: "GET /empresa/cuenta",
  },

  "empleados.ver": {
    dominio: "Empleados y contratistas",
    etiqueta: "Ver empleados",
    que: "Listar la nómina. Un analista con sedes asignadas ve solo las suyas; sin sedes asignadas, toda la empresa.",
    rutas: "GET /empresa/empleados",
  },
  "empleados.editar": {
    dominio: "Empleados y contratistas",
    etiqueta: "Crear, editar y retirar",
    que: "Alta, actualización, retiro y liquidación final de un empleado.",
    rutas: "POST·PUT /empresa/empleados · /retirar · /liquidacion-final",
  },
  "empleados.eliminar": {
    dominio: "Empleados y contratistas",
    etiqueta: "Eliminar empleado",
    que: "Borrado físico, y solo si no tiene historial de nómina. Destructivo: el camino legal es retirar, que conserva los registros.",
    rutas: "DELETE /empresa/empleados/:id",
  },
  "empleados.invitar": {
    dominio: "Empleados y contratistas",
    etiqueta: "Invitar colaborador",
    que: "Crea el vínculo entre una cuenta y la empresa. Dar acceso es decisión de administración.",
    rutas: "POST /empresa/empleados/:id/invitar",
  },
  "contratistas.ver": {
    dominio: "Empleados y contratistas",
    etiqueta: "Ver contratistas",
    que: "Listar quienes están por prestación de servicios.",
    rutas: "GET /empresa/contratistas",
  },
  "contratistas.editar": {
    dominio: "Empleados y contratistas",
    etiqueta: "Crear y editar contratistas",
    que: "Alta y actualización de contratistas.",
    rutas: "POST·PUT /empresa/contratistas",
  },
  "contratistas.eliminar": {
    dominio: "Empleados y contratistas",
    etiqueta: "Eliminar contratista",
    que: "Borrado del contratista. Destructivo: solo el admin.",
    rutas: "DELETE /empresa/contratistas/:id",
  },

  "nomina.ver": {
    dominio: "Nómina",
    etiqueta: "Ver nómina completa",
    que: "Periodos, turnos, incluidos, estado de liquidación, recibos, PILA y el lote de pago vigente.",
    rutas: "GET /empresa/periodos* · /empresa/recibos",
  },
  "nomina.operar": {
    dominio: "Nómina",
    etiqueta: "Operar y liquidar",
    que: "Crear el periodo, editar sus fechas, cargar turnos, elegir incluidos y liquidar. El analista sí liquida: es su trabajo.",
    rutas: "POST·PUT /empresa/periodos* · /liquidar",
  },
  "nomina.revertir": {
    dominio: "Nómina",
    etiqueta: "Revertir a borrador",
    que: "Deshace una liquidación y devuelve el periodo a borrador.",
    rutas: "POST /empresa/periodos/:id/revertir",
  },
  "nomina.pagar": {
    dominio: "Nómina",
    etiqueta: "Generar y verificar el lote de pago",
    que: "Arma el lote USDC y verifica el txHash. Mueve dinero real: solo el admin.",
    rutas: "POST /empresa/periodos/:id/batch-pago · /empresa/batches/:id/verificar",
  },

  "discrepancias.ver": {
    dominio: "Discrepancias",
    etiqueta: "Ver discrepancias",
    que: "Los reportes que los colaboradores abren sobre sus recibos.",
    rutas: "GET /empresa/discrepancias",
  },
  "discrepancias.responder": {
    dominio: "Discrepancias",
    etiqueta: "Responder discrepancias",
    que: "Contestar y cerrar un reporte.",
    rutas: "PUT /empresa/discrepancias/:id",
  },
  "discrepancias.reportar": {
    dominio: "Discrepancias",
    etiqueta: "Reportar sobre el recibo propio",
    que: "Abrir la discrepancia. Solo el colaborador: un admin que quisiera abrirla por su cuenta hoy recibe 403.",
    rutas: "POST /colaborador/recibos/:id/reportar",
  },

  "sedes.ver": {
    dominio: "Miembros y permisos",
    etiqueta: "Ver sedes",
    que: "Las sucursales o departamentos en que está dividida la empresa.",
    rutas: "GET /empresa/sedes",
  },
  "sedes.gestionar": {
    dominio: "Miembros y permisos",
    etiqueta: "Crear y eliminar sedes",
    que: "Cambiar la división de la empresa. Mueve de golpe qué ve cada analista.",
    rutas: "POST·DELETE /empresa/sedes",
  },
  "miembros.ver": {
    dominio: "Miembros y permisos",
    etiqueta: "Ver miembros",
    que: "Quién de la empresa entra al portal y con qué rol.",
    rutas: "GET /empresa/staff",
  },
  "miembros.gestionar": {
    dominio: "Miembros y permisos",
    etiqueta: "Asignar y quitar miembros",
    que: "Vincular o desvincular analistas y auditores, y sus sedes. Dar acceso es decisión de administración.",
    rutas: "POST·DELETE /empresa/staff",
  },
  "auditoria.ver": {
    dominio: "Miembros y permisos",
    etiqueta: "Ver la bitácora de auditoría",
    que: "Quién cambió qué y cuándo — incluidos los cambios de empresa activa. Es la herramienta con la que el auditor verifica.",
    rutas: "GET /empresa/auditoria",
  },

  "recibos.propios.ver": {
    dominio: "Portal del colaborador",
    etiqueta: "Ver los recibos propios",
    que: "Sus desprendibles, con la verificación del cálculo. Acotado por `empleadoId`, no por rol.",
    rutas: "GET /colaborador/recibos",
  },
  "invitaciones.ver": {
    dominio: "Portal del colaborador",
    etiqueta: "Ver invitaciones",
    que: "Las invitaciones a empresas que le llegaron a la cuenta.",
    rutas: "GET /colaborador/invitaciones",
  },
  "invitaciones.responder": {
    dominio: "Portal del colaborador",
    etiqueta: "Aceptar o rechazar invitaciones",
    que: "Entrar a una empresa —o no— es decisión de la persona invitada.",
    rutas: "POST /colaborador/invitaciones/:id/aceptar · /rechazar",
  },
  "empresas.propias.ver": {
    dominio: "Portal del colaborador",
    etiqueta: "Ver sus empresas",
    que: "El historial de empresas a las que ha pertenecido la cuenta.",
    rutas: "GET /colaborador/empresas",
  },

  "plataforma.reglas": {
    dominio: "Plataforma",
    etiqueta: "Administrar reglas legales y festivos",
    que: "Los parámetros con los que calcula el motor. No se parte en ver/editar porque la API tampoco lo parte.",
    rutas: "GET·POST·DELETE /admin/reglas · /admin/festivos",
  },
  "plataforma.empresas": {
    dominio: "Plataforma",
    etiqueta: "Administrar empresas",
    que: "Alta manual, reasignación de admin y suspensión de una empresa.",
    rutas: "GET·POST·PUT·DELETE /admin/empresas*",
  },
};

/** La ficha de un permiso, o una de emergencia con la clave cruda. Nunca
 *  devuelve `undefined`: la tabla no puede tener una fila sin nombre. */
export function fichaDe(clave: string): FichaPermiso {
  return (
    CATALOGO[clave] ?? {
      dominio: SIN_CLASIFICAR,
      etiqueta: clave,
      que: "Permiso nuevo en la API: el portal todavía no tiene su descripción, pero la guarda ya existe.",
      rutas: "",
    }
  );
}

/** Las rutas que muestra la fila: las de la API si las publicó, si no el
 *  resumen del catálogo. */
export function rutasDe(fila: FilaMatriz): string {
  if (fila.rutas?.length) return fila.rutas.join(" · ");
  return fichaDe(fila.clave).rutas;
}

export interface FilaConFicha extends FilaMatriz {
  ficha: FichaPermiso;
}

export interface GrupoPermisos {
  dominio: string;
  filas: FilaConFicha[];
}

/**
 * Agrupa las filas por dominio conservando el orden en que llegaron.
 *
 * El orden de los grupos es el de la primera aparición: si la API decide
 * reordenar `PERMISOS`, la tabla la sigue sola. Un dominio no se declara en
 * ninguna lista de este archivo — se descubre.
 */
export function agruparPorDominio(filas: FilaMatriz[]): GrupoPermisos[] {
  const grupos: GrupoPermisos[] = [];
  const porDominio = new Map<string, GrupoPermisos>();
  for (const fila of filas) {
    const ficha = fichaDe(fila.clave);
    let grupo = porDominio.get(ficha.dominio);
    if (!grupo) {
      grupo = { dominio: ficha.dominio, filas: [] };
      porDominio.set(ficha.dominio, grupo);
      grupos.push(grupo);
    }
    grupo.filas.push({ ...fila, ficha });
  }
  return grupos;
}

/**
 * Los permisos que menos roles tienen — el panel de cobertura.
 *
 * Se mide, no se elige: la lista sale de contar la matriz que mandó la API, así
 * que el día que una celda cambie, este panel cambia con ella. Empatan en el
 * orden en que la API los mandó (`sort` estable).
 */
export function masRestringidos(filas: FilaMatriz[], cuantos: number): FilaConFicha[] {
  return [...filas]
    .sort((a, b) => a.roles.length - b.roles.length)
    .slice(0, cuantos)
    .map((fila) => ({ ...fila, ficha: fichaDe(fila.clave) }));
}
