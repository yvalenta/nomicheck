// Los nombres de los roles, en su propio módulo.
//
// Aparte de `permisosCatalogo.ts` por peso, no por gusto: el selector del
// header necesita SOLO estas dos tablas y se carga con el armazón del portal,
// mientras que las fichas de permisos —varios kB de texto— las mira una sola
// pantalla. Cuando vivían juntas, el bundler metía el catálogo entero en el
// chunk del selector y toda empresa lo bajaba al entrar (9,56 kB del chunk
// contra 2,6 kB reales del selector).
//
// Igual que allá: acá no hay ni un permiso. Quién puede qué lo dice la API.

const ROL_ETIQUETA: Record<string, string> = {
  admin_plataforma: "Admin plataforma",
  admin_empresa: "Admin empresa",
  analista_rrhh: "Analista RR.HH.",
  auditor: "Auditor",
  colaborador: "Colaborador",
  individual: "Individual",
};

/** Qué es cada rol, para el tooltip de la columna. */
const ROL_NOTA: Record<string, string> = {
  admin_plataforma: "NomiCheck: reglas legales, festivos y alta de empresas. No tiene empresa propia.",
  admin_empresa: "Dueño de la cuenta de empresa.",
  analista_rrhh: "Opera la nómina. Con sedes asignadas, solo sobre las suyas.",
  auditor: "Todo lo ve, nada lo toca: no aparece en ninguna celda de escritura.",
  colaborador: "El empleado con cuenta: ve y reporta lo suyo.",
  individual: "Cuenta sin empresa del verificador anónimo.",
};

/** Un rol que el backend agregue y acá no esté se dibuja con su clave: mejor
 *  una columna fea que una columna que falta. */
export function etiquetaDeRol(rol: string): string {
  return ROL_ETIQUETA[rol] ?? rol;
}

export function notaDeRol(rol: string): string | undefined {
  return ROL_NOTA[rol];
}
