import { obtenerMiRol } from "../api.ts";

const RUTA_POR_ROL: Record<string, string> = {
  admin_plataforma: "/admin",
  admin_empresa: "/empresa",
  // El auditor entra al panel de empresa en solo lectura: la matriz de
  // permisos del server no le concede ni una celda de escritura. Es también
  // el portal del «ver como» del admin_plataforma (membresía auditor).
  auditor: "/empresa",
  colaborador: "/colaborador",
  // "individual" no tiene portal propio (es quien guardó liquidaciones desde
  // el verificador anónimo) — su lugar es el wizard, donde ya puede ver
  // "Mis liquidaciones" con sesión activa.
  individual: "/",
};

/** El portal que le corresponde a un rol, o `undefined` si no tiene uno propio.
 *  Lo consulta el selector de empresa antes de ofrecer un cambio: entrar a una
 *  empresa donde la cuenta es auditor la rebotaría a "/" —y como el selector
 *  vive DENTRO del portal, se quedaría sin forma de volver. */
export function portalDeRol(rol: string): string | undefined {
  return RUTA_POR_ROL[rol];
}

// Consulta GET /api/auth/whoami y manda al portal correcto según el rol real
// de la cuenta — usado tras un login exitoso (/login) y por los 3 portales
// para rebotar si alguien entra con Google al portal equivocado.
export async function irAPortalSegunRol(): Promise<void> {
  const { rol } = await obtenerMiRol();
  window.location.href = portalDeRol(rol) ?? "/";
}
