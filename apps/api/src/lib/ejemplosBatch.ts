// Los ejemplos de entrada de los wrappers, en UN solo sitio.
//
// Vivían dentro de `routes/batchPublico.ts` como constantes locales, y desde el
// 2026-08-03 tienen dos consumidores que NO pueden discrepar:
//
//   1. `GET /api/batch/<ruta>/ejemplo`, gratis, para integrar antes de pagar;
//   2. la extensión `bazaar` del 402, que es el contrato que el catálogo de
//      Coinbase le muestra a los agentes para que sepan qué mandar.
//
// Si se separaran, el Bazaar publicaría una forma que el endpoint no acepta y
// el fallo aparecería del lado del comprador —un 400 tras haber pagado— sin que
// nadie acá se enterara. Un ejemplo copiado es un lugar más donde
// desincronizarse.
//
// Además CDP valida el ejemplo contra el JSON Schema declarado, ESTRICTO: si
// divergen, la extensión se rechaza y el recurso no entra al catálogo.

/** Entrada de `/api/batch/retencion`. */
export const EJEMPLO_RETENCION = {
  version: "1",
  buyer: { noExternalLlm: true },
  personas: [
    { externalId: "P-1", ingresoLaboralMensual: 8_000_000, declaraRenta: false },
    {
      externalId: "P-2",
      ingresoLaboralMensual: 12_000_000,
      declaraRenta: true,
      aportesVoluntariosAfc: 1_000_000,
      tieneDependientes: true,
    },
  ],
};

/** Entrada de `/api/batch/verificar`. */
export const EJEMPLO_VERIFICACION = {
  version: "1",
  buyer: { noExternalLlm: true },
  comprobantes: [
    {
      externalId: "CMP-1",
      salarioBasicoMensual: 2_000_000,
      recibeAuxilioTransporte: true,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-31",
      declarado: [
        { nombre: "Salario básico", valor: 2_000_000 },
        { nombre: "Auxilio de transporte", valor: 200_000 },
        // Deducido de más a propósito — el ejemplo debe mostrar un veredicto
        // con discrepancia, no solo el camino feliz.
        { nombre: "Salud", valor: 100_000 },
      ],
    },
  ],
};
