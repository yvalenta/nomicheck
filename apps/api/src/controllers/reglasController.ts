import type { Request, Response } from "express";
import { reglaEn } from "@pv/reglas";
import { obtenerReglasYFestivos } from "../services/nominaService.js";
import { obtenerLedgerReglas } from "../services/reglasVerificadasService.js";

// Parámetros públicos que el wizard anónimo necesita para dar feedback
// inmediato en el navegador (ej. ocultar el checkbox de auxilio de
// transporte si el salario supera el tope) sin duplicar la cifra como
// constante en el frontend — el motor server-side sigue siendo la única
// fuente de verdad, esto es solo un espejo de lectura.
export async function parametrosPublicos(_req: Request, res: Response) {
  const { reglas } = await obtenerReglasYFestivos();
  const hoy = new Date().toISOString().slice(0, 10);
  res.json({
    smlmv: reglaEn(reglas, "smlmv", hoy),
    auxilioTransporteTopeSmlmv: reglaEn(reglas, "auxilio_transporte_tope_smlmv", hoy),
  });
}

// Ledger de reglas verificadas (RUMBO §2.4). Ancla objetiva del contenido
// del catálogo `ReglaLegal` en un momento dado — el buyer puede citar este
// endpoint en su propio flujo de auditoría, y el mismo `hash` viaja en cada
// output del wrapper batch (`reglasHash`) para probar que el motor no se
// salió del carril entre la consulta y el cálculo.
export async function reglasVerificadasAl(_req: Request, res: Response) {
  const ledger = await obtenerLedgerReglas();
  res.json(ledger);
}
