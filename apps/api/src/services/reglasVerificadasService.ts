// Ledger de reglas legales verificadas (RUMBO §2.4). Ancla objetiva del
// contenido del catálogo `ReglaLegal` en un momento dado — se cita en el
// output del wrapper y en los listings del marketplace.
//
// El hash es determinista sobre el JSON canónico del catálogo (mismos
// insumos → mismo hash) y solo depende del par (reglas, festivos). El buyer
// puede volver a calcularlo con los mismos datos para verificar que el motor
// no se está saliendo del carril declarado.
import { createHash } from "node:crypto";
import type { Festivo, ReglaLegal } from "@pv/reglas";
import { obtenerReglasYFestivos } from "./nominaService.js";

// Fecha de última verificación del catálogo legal contra las fuentes
// oficiales (SMLMV, UVT, Ley 2466/2025, Ley 2101/2021, tarifas EPS/AFP,
// festivos). El spec humano vive en `sdd/vault/` (reglas estables en 01-04
// y 06, valores actualizables solo en 05_Valores_Actualizables.md, y el
// mapa clave↔regla↔código en 07_Trazabilidad_Codigo.md); el catálogo
// `ReglaLegal` (Prisma) es la implementación de ese spec, y deben coincidir
// en cada revisión. RUMBO §2.4.
//
// Esta constante NO se elige acá: es la fecha de verificación más reciente
// que declara el encabezado de `05_Valores_Actualizables.md`, y hay un test
// que falla si las dos se separan. El baúl manda porque es donde queda el
// alcance de cada pasada (qué se miró y contra qué fuente); acá solo cabe
// una fecha, y por eso lleva la última. Es el paso 3 del procedimiento de
// `07_Trazabilidad_Codigo.md` §5 — el único que no rompe ningún cálculo si
// se olvida, y por eso el que se olvidaba.
//
// Que coincidan no es un acto de fe: `vaultSincronia.test.ts` falla si se
// siembra una clave que el vault no documenta, si el vault cita una que no
// existe, o si esta fecha se queda atrás.
export const REGLAS_VERIFICADAS_AL = "2026-07-30";

interface ReglaCanonica {
  clave: string;
  valor: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
  fuente: string | null;
}

interface FestivoCanonico {
  fecha: string;
  nombre: string;
}

function toIsoDia(d: Date | string): string {
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

function canonicalizar(
  reglas: ReglaLegal[],
  festivos: Festivo[]
): { reglas: ReglaCanonica[]; festivos: FestivoCanonico[] } {
  const reglasOrd: ReglaCanonica[] = reglas
    .map((r) => ({
      clave: r.clave,
      valor: r.valor,
      vigenteDesde: toIsoDia(r.vigenteDesde as unknown as string),
      vigenteHasta: r.vigenteHasta ? toIsoDia(r.vigenteHasta as unknown as string) : null,
      fuente: r.fuente ?? null,
    }))
    .sort((a, b) => (a.clave === b.clave ? a.vigenteDesde.localeCompare(b.vigenteDesde) : a.clave.localeCompare(b.clave)));

  const festivosOrd: FestivoCanonico[] = festivos
    .map((f) => ({ fecha: toIsoDia(f.fecha as unknown as string), nombre: f.nombre }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { reglas: reglasOrd, festivos: festivosOrd };
}

export function hashCatalogo(reglas: ReglaLegal[], festivos: Festivo[]): string {
  const canonico = canonicalizar(reglas, festivos);
  const json = JSON.stringify(canonico);
  return createHash("sha256").update(json).digest("hex");
}

export interface LedgerReglas {
  fecha: string;
  hash: string;
  totalReglas: number;
  totalFestivos: number;
  fuente: string;
}

export async function obtenerLedgerReglas(): Promise<LedgerReglas> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  return {
    fecha: REGLAS_VERIFICADAS_AL,
    hash: hashCatalogo(reglas, festivos),
    totalReglas: reglas.length,
    totalFestivos: festivos.length,
    fuente:
      "sdd/vault/ (spec humano, valores en 05_Valores_Actualizables.md) — Prisma ReglaLegal es la implementación",
  };
}
