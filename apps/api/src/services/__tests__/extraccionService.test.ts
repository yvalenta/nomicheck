// `extraccionService.ts` tiene 7 líneas y NO decide nada: es la costura que
// re-exporta el tipo y delega en el proveedor de `services/ia/`. No se infla
// con pruebas de valor cero — lo único que puede romperse es la delegación
// misma (argumentos alterados, errores envueltos), y eso es lo que se fija.
// La validación de la salida vive en el proveedor (comprobanteExtraidoSchema,
// ya probado en la capa ia) y el uso del resultado en verificacionComprobante.
//
// RED PROHIBIDA: `../ia/index.js` mockeado — sin Gemini, sin Claude, sin keys.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { extraerMock } = vi.hoisted(() => ({ extraerMock: vi.fn() }));

vi.mock("../ia/index.js", () => ({
  proveedorExtraccion: () => ({ extraerComprobante: extraerMock }),
}));

import { extraerComprobante } from "../extraccionService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extraerComprobante", () => {
  it("delega el MISMO buffer y mimeType al proveedor y devuelve su resultado sin tocar", async () => {
    // Identidad, no igualdad: re-encodear o copiar el buffer acá rompería
    // PDFs grandes en silencio y este es el único lugar donde podría pasar.
    const comprobante = { conceptos: [{ nombre: "Salario", tipo: "devengo-legal", valor: 2_000_000 }] };
    extraerMock.mockResolvedValue(comprobante);
    const archivo = Buffer.from("%PDF-1.7 …");

    const r = await extraerComprobante(archivo, "application/pdf");

    expect(extraerMock).toHaveBeenCalledTimes(1);
    expect(extraerMock.mock.calls[0]![0]).toBe(archivo);
    expect(extraerMock.mock.calls[0]![1]).toBe("application/pdf");
    expect(r).toBe(comprobante);
  });

  it("el error del proveedor sube tal cual, sin envolver ni reintentar", async () => {
    const fallo = new Error("GEMINI_API_KEY no configurada en el servidor");
    extraerMock.mockRejectedValue(fallo);
    await expect(extraerComprobante(Buffer.from("x"), "image/png")).rejects.toBe(fallo);
    expect(extraerMock).toHaveBeenCalledTimes(1);
  });
});
