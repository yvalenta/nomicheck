import { obtenerMiRol } from "../api.ts";

const RUTA_POR_ROL: Record<string, string> = {
  admin_plataforma: "/admin",
  admin_empresa: "/empresa",
  colaborador: "/colaborador",
  // "individual" no tiene portal propio (es quien guardó liquidaciones desde
  // el verificador anónimo) — su lugar es el wizard, donde ya puede ver
  // "Mis liquidaciones" con sesión activa.
  individual: "/",
};

// Consulta GET /api/auth/whoami y manda al portal correcto según el rol real
// de la cuenta — usado tras un login exitoso (/login) y por los 3 portales
// para rebotar si alguien entra con Google al portal equivocado.
export async function irAPortalSegunRol(): Promise<void> {
  const { rol } = await obtenerMiRol();
  window.location.href = RUTA_POR_ROL[rol] ?? "/";
}
