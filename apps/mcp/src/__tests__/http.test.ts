import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INFO_SERVIDOR, crearTransporteHttp } from "../servidor.js";

// La identidad del servidor ahora la leen dos superficies: el handshake MCP y
// el server card que sirve @pv/api. Lo que se fija acá es que la fuente única
// no derive del package.json — un version bump que olvide INFO_SERVIDOR
// publicaría un card que miente sobre el servidor al que apunta.
describe("INFO_SERVIDOR", () => {
  it("la versión es la del package.json — una fuente, no dos", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(INFO_SERVIDOR.version).toBe(pkg.version);
    expect(INFO_SERVIDOR.name).toBe("nomicheck");
  });
});

describe("crearTransporteHttp", () => {
  it("devuelve un transporte por petición, listo para handleRequest", () => {
    const t = crearTransporteHttp();
    expect(typeof t.handleRequest).toBe("function");
    expect(typeof t.close).toBe("function");
    // Sin sesión: dos transportes no comparten nada.
    expect(crearTransporteHttp()).not.toBe(t);
  });
});
