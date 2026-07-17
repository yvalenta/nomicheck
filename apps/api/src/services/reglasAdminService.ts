import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { prisma } from "../lib/prisma.js";
import { invalidarCacheReglas } from "./nominaService.js";
import type { nuevaReglaSchema, nuevoFestivoSchema } from "../validation/reglasAdmin.js";
import type { z } from "zod";

function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Todas las vigencias de ReglaLegal, agrupadas por clave y enriquecidas con
// la metadata del catálogo (etiqueta/unidad/fuente típica) para que la UI
// no tenga que hardcodear labels — packages/reglas/src/catalogoReglas.ts es
// la fuente de verdad de esos metadatos.
export async function listarReglasAgrupadas() {
  const reglas = await prisma.reglaLegal.findMany({ orderBy: [{ clave: "asc" }, { vigenteDesde: "desc" }] });
  return CATALOGO_REGLAS_LEGALES.map((meta) => ({
    ...meta,
    vigencias: reglas.filter((r) => r.clave === meta.clave),
  }));
}

// Nueva vigencia (patrón SCD2 ya usado en fixtures.ts/seed.ts): cierra
// automáticamente la fila abierta anterior de esa clave (vigenteHasta = el
// día antes de la nueva vigenteDesde) e inserta la nueva, abierta
// (vigenteHasta null). Invalida el cache de la API para que el próximo
// cálculo vea el cambio de inmediato en vez de esperar el TTL.
export async function crearVigenciaRegla(datos: z.infer<typeof nuevaReglaSchema>) {
  const vigenteAnterior = await prisma.reglaLegal.findFirst({
    where: { clave: datos.clave, vigenteHasta: null },
    orderBy: { vigenteDesde: "desc" },
  });
  if (vigenteAnterior) {
    if (vigenteAnterior.vigenteDesde >= datos.vigenteDesde) {
      throw new Error(
        `Ya existe una vigencia de "${datos.clave}" desde ${vigenteAnterior.vigenteDesde} — la nueva vigencia debe ser posterior`
      );
    }
    await prisma.reglaLegal.update({
      where: { id: vigenteAnterior.id },
      data: { vigenteHasta: diaAnterior(datos.vigenteDesde) },
    });
  }
  const nueva = await prisma.reglaLegal.create({ data: datos });
  invalidarCacheReglas();
  return nueva;
}

export function listarFestivosAdmin() {
  return prisma.festivo.findMany({ orderBy: { fecha: "asc" } });
}

export async function crearFestivo(datos: z.infer<typeof nuevoFestivoSchema>) {
  const festivo = await prisma.festivo.create({ data: datos });
  invalidarCacheReglas();
  return festivo;
}

export async function eliminarFestivo(id: number) {
  await prisma.festivo.delete({ where: { id } });
  invalidarCacheReglas();
}
