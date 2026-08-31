// La matriz es la fuente de la que salen el enforcement de la API y el dibujo
// de la web (`lib/permisos.ts`). Una fuente única solo sirve si alguien vigila
// que las invariantes del producto sigan ciertas cuando se agregue una celda:
// el día que a alguien le urja darle una escritura al `auditor` para
// destrabarse, esto se pone rojo y obliga a decirlo en voz alta.
//
// Las listas de abajo se escriben A MANO a propósito. Derivarlas de la matriz
// las volvería tautológicas: probarían que la matriz es igual a sí misma.
import { describe, expect, it } from "vitest";
import { MATRIZ, PERMISOS, ROLES, permisosDe, puede, rolesCon, type Permiso } from "../permisos.js";

// Convención declarada en permisos.ts: termina en `.ver` = lectura; cualquier
// otra cosa es escritura.
const ESCRITURA = PERMISOS.filter((p) => !p.endsWith(".ver"));

// Los tres roles que viven dentro de una empresa (ROLES_EMPRESA en
// middleware/auth.ts).
const DOMINIOS_DE_EMPRESA = [
  "empresa.",
  "empleados.",
  "contratistas.",
  "nomina.",
  "sedes.",
  "miembros.",
  "auditoria.",
] as const;

// Lo único que hace el portal colaborador, restated a mano desde las rutas
// `soloColaborador`.
const PERMISOS_DEL_COLABORADOR: Permiso[] = [
  "discrepancias.reportar",
  "recibos.propios.ver",
  "invitaciones.ver",
  "invitaciones.responder",
  "empresas.propias.ver",
];

const PERMISOS_DE_PLATAFORMA: Permiso[] = ["plataforma.reglas", "plataforma.empresas"];

const ordenado = (xs: readonly string[]) => [...xs].sort();

describe("la matriz no tiene huecos", () => {
  it("hay una celda por permiso declarado, ni de más ni de menos", () => {
    // El compilador ya lo exige (`Record<Permiso, ...>`), pero esto lo atrapa
    // también en runtime: una celda borrada, un nombre con typo o una matriz
    // armada condicionalmente salen acá y no en producción.
    expect(ordenado(Object.keys(MATRIZ))).toEqual(ordenado(PERMISOS));
  });

  it("ninguna celda queda vacía y ningún rol se repite en una celda", () => {
    for (const permiso of PERMISOS) {
      const roles = MATRIZ[permiso];
      // Un permiso que nadie tiene es una ruta muerta o una celda a medio
      // llenar: en los dos casos hay que decidirlo, no dejarlo pasar.
      expect(roles.length, `nadie tiene ${permiso}`).toBeGreaterThan(0);
      expect(new Set(roles).size, `${permiso} repite un rol`).toBe(roles.length);
      for (const rol of roles) expect(ROLES).toContain(rol);
    }
  });

  it("la lista de escritura no está vacía", () => {
    // Guarda de la guarda: si la convención de nombres cambiara y `ESCRITURA`
    // quedara vacía, la invariante del auditor pasaría sin probar nada.
    expect(ESCRITURA.length).toBeGreaterThan(0);
  });
});

describe("invariantes de los roles", () => {
  it("el auditor no tiene NINGÚN permiso de escritura", () => {
    // SDD §15, pilar 1: el auditor es solo lectura y cualquier escritura le
    // devuelve 403 (`requiereEmpresaEdicion` no lo incluye).
    const escriturasDelAuditor = ESCRITURA.filter((permiso) => puede("auditor", permiso));
    expect(escriturasDelAuditor).toEqual([]);
  });

  it("el auditor ve todo lo que se puede ver de su empresa", () => {
    // La otra mitad de "solo lectura": que no le hayan recortado la lectura.
    const lecturaDeEmpresa = PERMISOS.filter(
      (p) => p.endsWith(".ver") && DOMINIOS_DE_EMPRESA.some((d) => p.startsWith(d))
    );
    for (const permiso of lecturaDeEmpresa) {
      expect(puede("auditor", permiso), `el auditor no puede ${permiso}`).toBe(true);
    }
  });

  it("admin_empresa tiene todos los permisos de empresa salvo los de plataforma", () => {
    const deEmpresa = PERMISOS.filter(
      (p) => !PERMISOS_DE_PLATAFORMA.includes(p) && !PERMISOS_DEL_COLABORADOR.includes(p)
    );
    expect(ordenado(permisosDe("admin_empresa"))).toEqual(ordenado(deEmpresa));
    for (const permiso of PERMISOS_DE_PLATAFORMA) {
      expect(puede("admin_empresa", permiso), `admin_empresa no debería ${permiso}`).toBe(false);
    }
  });

  it("el colaborador solo tiene permisos de colaborador", () => {
    expect(ordenado(permisosDe("colaborador"))).toEqual(ordenado(PERMISOS_DEL_COLABORADOR));
    // Y nada de los tableros de la empresa: su portal es SU recibo.
    for (const permiso of permisosDe("colaborador")) {
      expect(
        DOMINIOS_DE_EMPRESA.some((d) => permiso.startsWith(d)),
        `${permiso} es de la empresa, no del colaborador`
      ).toBe(false);
    }
  });

  it("admin_plataforma solo tiene lo de plataforma — ninguna empresa es suya", () => {
    // No tiene `empresaId` y `requiereEmpresaLectura` no lo incluye: si algún
    // día aparece en una celda de empresa, la matriz estaría prometiendo algo
    // que la API rechaza con 403.
    expect(ordenado(permisosDe("admin_plataforma"))).toEqual(ordenado(PERMISOS_DE_PLATAFORMA));
  });

  it("individual no tiene permisos: su historial no depende del rol", () => {
    // `/liquidations` solo pide sesión y se acota por `req.usuario.id`. Si esto
    // deja de estar vacío, alguien modeló como permiso algo que no lo es.
    expect(permisosDe("individual")).toEqual([]);
  });

  it("solo los roles de plataforma administran la plataforma", () => {
    for (const permiso of PERMISOS_DE_PLATAFORMA) {
      expect(rolesCon(permiso)).toEqual(["admin_plataforma"]);
    }
  });
});

describe("puede/permisosDe/rolesCon dicen lo mismo que la matriz", () => {
  it("permisosDe(rol) coincide celda por celda con MATRIZ", () => {
    for (const rol of ROLES) {
      const suyos = permisosDe(rol);
      for (const permiso of PERMISOS) {
        expect(suyos.includes(permiso), `${rol} × ${permiso}`).toBe(MATRIZ[permiso].includes(rol));
      }
    }
  });

  it("rolesCon(permiso) coincide celda por celda con MATRIZ", () => {
    for (const permiso of PERMISOS) {
      expect(ordenado(rolesCon(permiso)), permiso).toEqual(ordenado(MATRIZ[permiso]));
    }
  });

  it("puede() es exactamente la pertenencia a la celda", () => {
    for (const rol of ROLES) {
      for (const permiso of PERMISOS) {
        expect(puede(rol, permiso), `${rol} × ${permiso}`).toBe(MATRIZ[permiso].includes(rol));
      }
    }
  });

  it("rolesCon respeta el orden declarado en ROLES", () => {
    // La página de Roles pinta columnas: el orden tiene que ser estable y no
    // depender de cómo se escribió cada celda.
    for (const permiso of PERMISOS) {
      const roles = rolesCon(permiso);
      const indices = roles.map((r) => ROLES.indexOf(r));
      expect(indices, permiso).toEqual([...indices].sort((a, b) => a - b));
    }
  });
});
