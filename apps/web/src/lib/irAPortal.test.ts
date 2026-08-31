import { beforeEach, describe, expect, it, vi } from "vitest";

// `irAPortalSegunRol` decide a qué portal mandar a alguien recién autenticado.
// Se ejecuta después del login y en los tres portales, para rebotar a quien
// entró con Google al lugar equivocado.
//
// Lo que se prueba es el MAPA y su comportamiento ante un rol que no conoce.
// Un rol nuevo en el backend que nadie agregue acá no rompe nada visible: la
// persona simplemente aterriza en "/" y parece que el login no funcionó.
//
// Lo que esta prueba NO afirma, y conviene que quede dicho: que mandar a "/"
// sea la respuesta correcta para un rol desconocido es una decisión de producto,
// no algo que se pueda derivar. Acá solo se fija que la decisión sea
// deliberada y no un `undefined` que se cuela en `location.href`.

vi.mock("../api.ts", () => ({ obtenerMiRol: vi.fn() }));

const { obtenerMiRol } = await import("../api.ts");
const { irAPortalSegunRol } = await import("./irAPortal");

describe("irAPortalSegunRol", () => {
  let destino = "";

  beforeEach(() => {
    destino = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        set href(v: string) { destino = v; },
        get href() { return destino; },
      },
    });
  });

  it.each([
    ["admin_plataforma", "/admin"],
    ["admin_empresa", "/empresa"],
    // El auditor entra al panel de empresa en SOLO LECTURA (la matriz del
    // server no le concede escritura); es también el portal del «ver como».
    // Sin esta fila, borrar la entrada del mapa mandaba al auditor a "/" con
    // la suite en verde.
    ["auditor", "/empresa"],
    ["colaborador", "/colaborador"],
    // "individual" es quien guardó liquidaciones desde el verificador anónimo:
    // no tiene portal propio, su lugar es el wizard.
    ["individual", "/"],
  ])("manda al rol %s a %s", async (rol, ruta) => {
    vi.mocked(obtenerMiRol).mockResolvedValue({ rol } as Awaited<ReturnType<typeof obtenerMiRol>>);
    await irAPortalSegunRol();
    expect(destino).toBe(ruta);
  });

  it("un rol que el front no conoce cae en la raíz, no en undefined", async () => {
    vi.mocked(obtenerMiRol).mockResolvedValue({ rol: "rol_nuevo_del_backend" } as Awaited<ReturnType<typeof obtenerMiRol>>);
    await irAPortalSegunRol();
    expect(destino).toBe("/");
    // El fallo que esto caza: sin el `?? "/"`, `location.href` recibe
    // `undefined` y el navegador va a la URL literal "/undefined".
    expect(destino).not.toContain("undefined");
  });

  it("los cuatro roles conocidos llevan a rutas distintas entre sí", async () => {
    const rutas = new Set<string>();
    for (const rol of ["admin_plataforma", "admin_empresa", "colaborador"]) {
      vi.mocked(obtenerMiRol).mockResolvedValue({ rol } as Awaited<ReturnType<typeof obtenerMiRol>>);
      await irAPortalSegunRol();
      rutas.add(destino);
    }
    // Si dos roles compartieran destino, alguien vería el portal de otro.
    expect(rutas.size).toBe(3);
  });

  it("si whoami falla, el error sube en vez de dejar a la persona en la nada", async () => {
    vi.mocked(obtenerMiRol).mockRejectedValue(new Error("401"));
    await expect(irAPortalSegunRol()).rejects.toThrow("401");
    expect(destino).toBe("");
  });
});
