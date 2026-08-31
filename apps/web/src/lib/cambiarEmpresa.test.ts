import { beforeEach, describe, expect, it, vi } from "vitest";

// El cambio de empresa activa es la única acción del portal que reapunta TODO
// lo que se ve después. Sus dos fallos no dan error en pantalla:
//
//   1. **Navegar antes de que el servidor acepte.** Si el portal recarga sin
//      esperar la respuesta, una persona sin membresía (o con la empresa
//      suspendida) ve el portal recargarse entero para volver exactamente a la
//      empresa anterior — y lee el nombre viejo como si el cambio hubiera
//      fallado a medias. La verdad es que nunca ocurrió: el 403 se perdió.
//   2. **Quedarse sin recargar.** El puntero cambió en el servidor pero la
//      pantalla sigue con los datos de la empresa anterior: mismas columnas,
//      mismo layout, otra empresa. En multi-tenant ese es el error que no se ve.

vi.mock("../apiEmpresa", () => ({ cambiarEmpresaActiva: vi.fn() }));

const { cambiarEmpresaActiva } = await import("../apiEmpresa");
const { cambiarEmpresaYRecargar, DESTINO_TRAS_CAMBIO } = await import("./cambiarEmpresa");

describe("cambiarEmpresaYRecargar", () => {
  let navegadoA: string | null = null;

  beforeEach(() => {
    navegadoA = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: (v: string) => { navegadoA = v; } },
    });
  });

  it("manda el id al servidor y recarga el portal desde la raíz", async () => {
    vi.mocked(cambiarEmpresaActiva).mockResolvedValue({ empresaId: 7, rol: "admin_empresa" });
    await cambiarEmpresaYRecargar(7);
    expect(cambiarEmpresaActiva).toHaveBeenCalledWith(7);
    expect(navegadoA).toBe(DESTINO_TRAS_CAMBIO);
  });

  it("vuelve a la raíz del portal, no a la sección actual", () => {
    // Deep-links como /empresa/periodos/123 apuntan a registros de la empresa
    // que se acaba de dejar: en la nueva son un 403 o, peor, otro registro con
    // el mismo id.
    expect(DESTINO_TRAS_CAMBIO).toBe("/empresa");
  });

  it("si el servidor rechaza, NO navega y el error sube", async () => {
    vi.mocked(cambiarEmpresaActiva).mockRejectedValue(new Error("No perteneces a esa empresa"));
    await expect(cambiarEmpresaYRecargar(99)).rejects.toThrow("No perteneces a esa empresa");
    expect(navegadoA).toBeNull();
  });
});
