import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";

// Los datos de la EMPRESA misma (nombre, NIT, sector) — la única entidad del
// panel que hasta el 2026-08-20 no se podía editar: empleados, contratistas
// y periodos tenían su PUT y la empresa no tenía ni endpoint. El caso que lo
// destapó: un NIT provisional sembrado que solo se corregía con SQL a mano.

export interface DatosEmpresa {
  nombre: string;
  nit: string;
  sector: string;
}

export function datosEmpresa(empresaId: number): Promise<DatosEmpresa> {
  return prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { nombre: true, nit: true, sector: true },
  });
}

export function actualizarEmpresa(
  empresaId: number,
  usuarioId: string,
  datos: DatosEmpresa
): Promise<DatosEmpresa> {
  // conAuditoria: el trigger auditoria_Empresa registra el cambio con autor —
  // editar el NIT es tocar lo que sale impreso en las cuentas de cobro.
  return conAuditoria(usuarioId, (tx) =>
    tx.empresa.update({
      where: { id: empresaId },
      data: datos,
      select: { nombre: true, nit: true, sector: true },
    })
  );
}
