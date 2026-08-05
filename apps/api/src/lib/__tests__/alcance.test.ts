// El gate de `alcance.ts` lo hace cumplir el compilador, y sus pruebas son de
// tipos (`alcance.tipos.ts`, verificadas por `pnpm typecheck`).
//
// Queda UN camino alrededor que el compilador no puede ver: construir un
// `PrismaClient` propio dentro de `src/`. Ese cliente sale crudo, con los
// cuatro modelos derivados sin acotar, y ninguna de las dos capas se entera.
// No es hipotético: es la salida obvia el día que el gate estorbe y haya
// prisa. Esta prueba la cierra.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../..", import.meta.url).pathname;

// Se barre lo que SE SIRVE. Los `__tests__` quedan afuera a propósito: un
// doble de la base es exactamente el lugar donde armar un cliente propio es
// legítimo, y nada de ahí llega a producción. (También se excluye a sí misma
// esta prueba, que si no se atrapa por nombrar el patrón que busca.)
function archivosServidos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivosServidos(ruta);
    return e.name.endsWith(".ts") ? [ruta] : [];
  });
}

describe("nadie se salta el cliente acotado", () => {
  it("`new PrismaClient()` existe en UN solo archivo de src/: lib/prisma.ts", () => {
    const culpables = archivosServidos(SRC)
      .filter((f) => /new\s+PrismaClient\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length))
      .filter((f) => f !== "lib/prisma.ts");

    // Si esto se pone rojo, el archivo que aparece acá está consultando
    // `Turno`/`ReciboPago`/`PeriodoNominaEmpleado`/`PagoItem` sin que nada le
    // exija el ancla. Ver `lib/alcance.ts`.
    expect(culpables).toEqual([]);
  });

  it("`lib/prisma.ts` exporta el cliente acotado y nada más", () => {
    const fuente = readFileSync(join(SRC, "lib/prisma.ts"), "utf8");
    const exportados = [...fuente.matchAll(/^export\s+(?:const|function|type|interface)\s+(\w+)/gm)].map(
      (m) => m[1]
    );
    // Un segundo export es, casi con seguridad, la escotilla cruda volviendo
    // por la ventana. Si de verdad hace falta, esta prueba se cambia a mano —
    // que es el punto: obliga a decidirlo, no a que se cuele.
    expect(exportados).toEqual(["prisma"]);
  });
});
