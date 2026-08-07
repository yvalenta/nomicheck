// Único lugar canónico del vocabulario de estados de PeriodoNomina. Todo el
// resto (controllers, services, filtros de query, tests) importa desde aquí
// para que agregar un valor nuevo sea un cambio localizado. El schema.prisma
// deja `estado String` (no enum nativo) para no partir el patrón existente,
// pero la validación en runtime se apoya en este set.
//
//   borrador → liquidando → (liquidado | liquidado_con_rechazos | fallido)
//   liquidado / liquidado_con_rechazos ↔ borrador (revertirABorrador)
//   liquidado → pagado (transición futura, no implementada aún)
export const ESTADOS_PERIODO = [
  "borrador",
  "liquidando",
  "liquidado",
  "liquidado_con_rechazos",
  "fallido",
  "pagado",
] as const;

export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number];

export function esEstadoPeriodo(v: unknown): v is EstadoPeriodo {
  return typeof v === "string" && (ESTADOS_PERIODO as readonly string[]).includes(v);
}

// Estados terminales del pipeline de liquidación asíncrona — el polling del
// frontend debe parar al alcanzar cualquiera de estos.
//
// OJO: nada en apps/api la referencia, pero NO es código muerto — el espejo
// del frontend (apps/web estadosPeriodo.test.ts) LEE ESTE ARCHIVO COMO TEXTO
// para verificar que su copia local coincide. Borrarla rompe esa suite, no
// esta. Ya pasó una vez (2026-08-07): un barrido de exports sin referencias
// la dio por muerta porque ningún grep de símbolos ve una lectura textual.
export const ESTADOS_TERMINALES_LIQUIDACION: EstadoPeriodo[] = [
  "liquidado",
  "liquidado_con_rechazos",
  "fallido",
];
