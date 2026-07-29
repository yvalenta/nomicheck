// La semilla legal, separada del script que la siembra.
//
// Vivia dentro de `seed.ts`, que instancia un PrismaClient al cargarse — o sea
// que era imposible leer estos valores sin abrir una conexion a la base. Por
// eso las pruebas de `batchPublicoService` terminaban consultando Postgres para
// conseguir el catalogo, cuando lo unico que necesitaban eran estas filas.
//
// Ahora hay un solo lugar donde viven: lo siembra `seed.ts` y lo usan las
// pruebas como fixture. Si cambia un valor legal, cambia para los dos.

// Semilla legal verificada contra fuentes oficiales/prensa especializada el
// 16-jul-2026 (ver SDD.md §03 Módulo A para el detalle y las fuentes de cada
// valor). Revisar si la reforma pensional (Ley 2381 de 2024, hoy suspendida
// por la Corte Constitucional) se reactiva — cambiaría fondo_solidaridad.
export const REGLAS_SEMILLA = [
  { clave: "smlmv", valor: 1750905, vigenteDesde: "2026-01-01", fuente: "Decreto 1469 de 2025" },
  { clave: "auxilio_transporte", valor: 249095, vigenteDesde: "2026-01-01", fuente: "Decreto 1470 de 2025" },
  // Recargo dominical/festivo: tramo hasta jun-2026
  { clave: "recargo_dominical", valor: 0.80, vigenteDesde: "2025-07-01", vigenteHasta: "2026-06-30", fuente: "Ley 2466 de 2025, art. 2" },
  // Recargo dominical/festivo: desde jul-2026
  { clave: "recargo_dominical", valor: 0.90, vigenteDesde: "2026-07-01", vigenteHasta: "2027-06-30", fuente: "Ley 2466 de 2025, art. 2" },
  { clave: "recargo_nocturno", valor: 0.35, vigenteDesde: "2025-12-25", fuente: "Ley 2466 de 2025, art. 3" },
  { clave: "hora_extra_diurna", valor: 0.25, vigenteDesde: "2020-01-01", fuente: "CST art. 168" },
  { clave: "hora_extra_nocturna", valor: 0.75, vigenteDesde: "2020-01-01", fuente: "CST art. 168" },
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993" },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993" },
  { clave: "fondo_solidaridad_umbral_smlmv", valor: 4, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993, art. 27" },
  // Divisor hora ordinaria: jornada 44h hasta 14-jul-2026
  { clave: "divisor_hora_ordinaria", valor: 220, vigenteDesde: "2021-01-01", vigenteHasta: "2026-07-14", fuente: "Ley 2101 de 2021" },
  // Divisor hora ordinaria: jornada 42h desde 15-jul-2026
  { clave: "divisor_hora_ordinaria", valor: 210, vigenteDesde: "2026-07-15", fuente: "Ley 2101 de 2021" },

  // Tope de deducciones sobre el salario devengado — protege el mínimo
  // vital. Usado hoy para recortar el aporte AFC (deducción por convenio)
  // si sumado a salud/pensión/fondo supera el 50%.
  { clave: "limite_deducciones_salario", valor: 0.50, vigenteDesde: "1950-01-01", fuente: "CST art. 149 (num. 2, excepción libranza Ley 1527 de 2012)" },

  // Auxilio de transporte: solo para quien devenga hasta 2 SMLMV.
  { clave: "auxilio_transporte_tope_smlmv", valor: 2, vigenteDesde: "1950-01-01", fuente: "Decreto de salario mínimo vigente (requisito histórico del auxilio de transporte)" },

  // Embargo de salario: dos regímenes independientes (ver deducciones.ts).
  { clave: "embargo_ordinario_fraccion_excedente", valor: 0.20, vigenteDesde: "1950-01-01", fuente: "CST art. 154 y 155" },
  { clave: "embargo_alimentos_pct_max", valor: 0.50, vigenteDesde: "1950-01-01", fuente: "CST art. 156" },

  // Tope legal de trabajo suplementario: se PAGA todo lo trabajado
  // (primacía de la realidad) pero el motor advierte si se excede.
  { clave: "max_horas_extra_dia", valor: 2, vigenteDesde: "1967-01-01", fuente: "D.L. 13 de 1967, art. 1" },
  { clave: "max_horas_extra_semana", valor: 12, vigenteDesde: "1981-01-01", fuente: "Ley 6 de 1981" },

  // --- Constantes tributarias (Fase 2: retención en la fuente por el
  // sistema de depuración, E.T. art. 383/388 — motor en retencionFuente.ts).
  // Verificado 16-jul-2026 (uvt/AFC/336); tabla de tarifas del art. 383 vive
  // como constante estructural en constantes.ts (no cambia por decreto anual).
  { clave: "uvt", valor: 52374, vigenteDesde: "2026-01-01", fuente: "DIAN, Resolución 000238 de 15-12-2025" },
  { clave: "limite_porcentaje_afc", valor: 0.30, vigenteDesde: "2012-01-01", fuente: "E.T. art. 126-1 y 126-4 (Ley 1607 de 2012)" },
  { clave: "limite_anual_uvt_afc", valor: 3800, vigenteDesde: "2012-01-01", fuente: "E.T. art. 126-1 y 126-4 (Ley 1607 de 2012)" },
  { clave: "limite_rentas_exentas_porcentaje", valor: 0.40, vigenteDesde: "2023-01-01", fuente: "E.T. art. 336 (Ley 2277 de 2022)" },
  { clave: "limite_rentas_exentas_uvt_anual", valor: 1340, vigenteDesde: "2023-01-01", fuente: "E.T. art. 336 (Ley 2277 de 2022)" },
  { clave: "limite_renta_exenta_laboral_uvt_mes", valor: 790, vigenteDesde: "2007-01-01", fuente: "E.T. art. 206, num. 10 (Ley 1111 de 2006)" },
  { clave: "limite_deduccion_dependientes_uvt_mes", valor: 32, vigenteDesde: "2016-01-01", fuente: "E.T. art. 387, par. 2 (Ley 1819 de 2016)" },
  { clave: "limite_deduccion_salud_uvt_mes", valor: 16, vigenteDesde: "2016-01-01", fuente: "E.T. art. 387, par. 1 (Ley 1819 de 2016)" },
  { clave: "ibc_tope_smlmv", valor: 25, vigenteDesde: "2003-01-29", fuente: "Ley 100 de 1993, art. 18 mod. Ley 797 de 2003, art. 5" },
  // Pago on-chain (SDD §17). Los knobs numéricos viven aquí con vigencias;
  // la config técnica (red/token/tokenAddress) vive en lib/pagosConfig.ts —
  // no es regla legal, es infraestructura.
  { clave: "pago_onchain_prima_pct", valor: 0, vigenteDesde: "2026-07-01", fuente: "Política NomiCheck — prima sobre TRM oficial para cubrir spread P2P COP→USDC" },
  { clave: "pago_onchain_ventana_horas", valor: 6, vigenteDesde: "2026-07-01", fuente: "Política NomiCheck — validez del snapshot de tasa antes de exigir regeneración del lote" },
];

// Festivos Colombia 2026 (Ley Emiliani)
export const FESTIVOS_SEMILLA = [
  { fecha: "2026-01-01", nombre: "Año Nuevo" },
  { fecha: "2026-01-12", nombre: "Reyes Magos (trasladado)" },
  { fecha: "2026-03-23", nombre: "San José (trasladado)" },
  { fecha: "2026-04-02", nombre: "Jueves Santo" },
  { fecha: "2026-04-03", nombre: "Viernes Santo" },
  { fecha: "2026-05-01", nombre: "Día del Trabajo" },
  { fecha: "2026-05-18", nombre: "Ascensión del Señor (trasladado)" },
  { fecha: "2026-06-08", nombre: "Corpus Christi (trasladado)" },
  { fecha: "2026-06-15", nombre: "Sagrado Corazón (trasladado)" },
  { fecha: "2026-06-29", nombre: "San Pedro y San Pablo (trasladado)" },
  { fecha: "2026-07-20", nombre: "Día de la Independencia" },
  { fecha: "2026-08-07", nombre: "Batalla de Boyacá" },
  { fecha: "2026-08-17", nombre: "Asunción de la Virgen (trasladado)" },
  { fecha: "2026-10-12", nombre: "Día de la Raza (trasladado)" },
  { fecha: "2026-11-02", nombre: "Todos los Santos (trasladado)" },
  { fecha: "2026-11-16", nombre: "Independencia de Cartagena (trasladado)" },
  { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2026-12-25", nombre: "Navidad" },
];
