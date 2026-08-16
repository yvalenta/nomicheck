import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { mesCorriente, obtenerEstadoCuenta } from "../services/cuentaEmpresaService.js";

/** `YYYY-MM`. Se valida con forma exacta y no con un parse permisivo: un mes
 *  inválido que se convierte en "algún mes" devolvería un estado de cuenta de
 *  otro periodo con aspecto correcto. */
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function estadoCuenta(req: Request, res: Response) {
  const mes = typeof req.query.mes === "string" && req.query.mes ? req.query.mes : mesCorriente();
  if (!MES.test(mes)) {
    return res.status(400).json({ error: "mes inválido: se espera YYYY-MM" });
  }
  try {
    res.json(await obtenerEstadoCuenta(prisma, req.usuario!.empresaId!, mes));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error consultando la cuenta" });
  }
}
