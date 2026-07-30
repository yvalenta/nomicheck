// La semilla legal, separada del script que la siembra.
//
// Vivia dentro de `seed.ts`, que instancia un PrismaClient al cargarse — o sea
// que era imposible leer estos valores sin abrir una conexion a la base. Por
// eso las pruebas de `batchPublicoService` terminaban consultando Postgres para
// conseguir el catalogo, cuando lo unico que necesitaban eran estas filas.
//
// Ahora hay un solo lugar donde viven: lo siembra `seed.ts` y lo usan las
// pruebas como fixture. Si cambia un valor legal, cambia para los dos.

// Semilla legal verificada contra fuentes oficiales/prensa especializada. Las
// fechas de cada pasada y su alcance los lleva el encabezado de
// `sdd/vault/05_Valores_Actualizables.md`, que es la fuente de verdad: acá van
// los valores, allá va desde cuándo se sabe que son ciertos. (Detalle y
// fuentes por valor: SDD.md §03 Módulo A.)
//
// Revisar si la reforma pensional (Ley 2381 de 2024, hoy suspendida por la
// Corte Constitucional) se reactiva — cambiaría fondo_solidaridad.
export const REGLAS_SEMILLA = [
  // --- Valores anuales, con su historia desde 2020 ---
  //
  // El decreto de diciembre del año N fija el valor del año N+1, y cada uno
  // deroga al anterior: por eso son tramos cerrados de 1-ene a 31-dic, no
  // filas abiertas. Sin la historia, el sistema solo podía liquidar desde
  // 2026 — cualquier periodo anterior lanzaba `No hay regla legal vigente`
  // aunque el resto del catálogo sí lo cubriera. 2020-01-01 queda como piso
  // uniforme de todo el catálogo (es también el piso de las tarifas de
  // salud/pensión y del umbral del fondo de solidaridad).
  //
  // Valores y decretos verificados el 30-jul-2026 contra dos fuentes
  // independientes (actualicese.com y consultorcontable.com) y, en los casos
  // en que discrepaban, contra el Gestor Normativo de Función Pública.
  { clave: "smlmv", valor: 877803, vigenteDesde: "2020-01-01", vigenteHasta: "2020-12-31", fuente: "Decreto 2360 del 26 de diciembre de 2019" },
  { clave: "smlmv", valor: 908526, vigenteDesde: "2021-01-01", vigenteHasta: "2021-12-31", fuente: "Decreto 1785 del 29 de diciembre de 2020" },
  { clave: "smlmv", valor: 1000000, vigenteDesde: "2022-01-01", vigenteHasta: "2022-12-31", fuente: "Decreto 1724 del 15 de diciembre de 2021" },
  { clave: "smlmv", valor: 1160000, vigenteDesde: "2023-01-01", vigenteHasta: "2023-12-31", fuente: "Decreto 2613 del 28 de diciembre de 2022" },
  { clave: "smlmv", valor: 1300000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31", fuente: "Decreto 2292 del 29 de diciembre de 2023" },
  { clave: "smlmv", valor: 1423500, vigenteDesde: "2025-01-01", vigenteHasta: "2025-12-31", fuente: "Decreto 1572 del 24 de diciembre de 2024" },
  { clave: "smlmv", valor: 1750905, vigenteDesde: "2026-01-01", fuente: "Decreto 1469 de 2025" },

  { clave: "auxilio_transporte", valor: 102854, vigenteDesde: "2020-01-01", vigenteHasta: "2020-12-31", fuente: "Decreto 2361 del 26 de diciembre de 2019" },
  { clave: "auxilio_transporte", valor: 106454, vigenteDesde: "2021-01-01", vigenteHasta: "2021-12-31", fuente: "Decreto 1786 del 29 de diciembre de 2020" },
  { clave: "auxilio_transporte", valor: 117172, vigenteDesde: "2022-01-01", vigenteHasta: "2022-12-31", fuente: "Decreto 1725 del 15 de diciembre de 2021" },
  { clave: "auxilio_transporte", valor: 140606, vigenteDesde: "2023-01-01", vigenteHasta: "2023-12-31", fuente: "Decreto 2614 del 28 de diciembre de 2022" },
  { clave: "auxilio_transporte", valor: 162000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31", fuente: "Decreto 2293 del 29 de diciembre de 2023" },
  { clave: "auxilio_transporte", valor: 200000, vigenteDesde: "2025-01-01", vigenteHasta: "2025-12-31", fuente: "Decreto 1573 del 24 de diciembre de 2024" },
  { clave: "auxilio_transporte", valor: 249095, vigenteDesde: "2026-01-01", fuente: "Decreto 1470 de 2025" },
  // Recargo dominical/festivo: los CUATRO tramos, no solo los vigentes.
  //
  // Las calculadoras resuelven esta clave de forma incondicional por cada
  // tramo de días (calculadoraTurnos.ts), antes de mirar si alguien trabajó
  // domingo — y el resolutor LANZA si no hay vigencia. Con solo los tramos
  // de 2025-2027 sembrados, toda liquidación por turnos fechada fuera de esa
  // ventana se caía: las retroactivas anteriores a jul-2025 ya lo hacían, y
  // el 1-jul-2027 se habría caído la nómina entera, con o sin dominical.
  // Sembrar los tramos de los extremos no altera ningún cálculo que hoy
  // funcione: cubren fechas donde antes solo había excepción.
  { clave: "recargo_dominical", valor: 0.75, vigenteDesde: "2003-01-01", vigenteHasta: "2025-06-30", fuente: "Ley 789 de 2002, art. 26 (CST art. 179)" },
  { clave: "recargo_dominical", valor: 0.80, vigenteDesde: "2025-07-01", vigenteHasta: "2026-06-30", fuente: "Ley 2466 de 2025, art. 2" },
  { clave: "recargo_dominical", valor: 0.90, vigenteDesde: "2026-07-01", vigenteHasta: "2027-06-30", fuente: "Ley 2466 de 2025, art. 2" },
  { clave: "recargo_dominical", valor: 1.00, vigenteDesde: "2027-07-01", fuente: "Ley 2466 de 2025, art. 2" },

  // Recargo nocturno: el 35% no lo creó la Ley 2466 de 2025 — viene del CST
  // art. 168 desde la Ley 50 de 1990. Lo que la Ley 2466 cambió fue la
  // FRANJA (21:00→19:00), no el porcentaje. Por eso hay dos filas con el
  // mismo valor: sin la primera, una liquidación anterior al 25-dic-2025
  // lanzaba por falta de vigencia.
  { clave: "recargo_nocturno", valor: 0.35, vigenteDesde: "1991-01-01", vigenteHasta: "2025-12-24", fuente: "CST art. 168, mod. Ley 50 de 1990, art. 24" },
  { clave: "recargo_nocturno", valor: 0.35, vigenteDesde: "2025-12-25", fuente: "Ley 2466 de 2025, art. 3" },
  { clave: "hora_extra_diurna", valor: 0.25, vigenteDesde: "2020-01-01", fuente: "CST art. 168" },
  { clave: "hora_extra_nocturna", valor: 0.75, vigenteDesde: "2020-01-01", fuente: "CST art. 168" },
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993" },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993" },
  { clave: "fondo_solidaridad_umbral_smlmv", valor: 4, vigenteDesde: "2020-01-01", fuente: "Ley 100 de 1993, art. 27" },
  // Divisor de hora ordinaria = horas semanales x 5 semanas comerciales.
  //
  // La Ley 2101 de 2021 no bajó la jornada de 44h a 42h de un salto: la bajó
  // en CUATRO escalones (48 → 47 → 46 → 44 → 42), cada uno un 15 de julio.
  // La semilla tenía una sola fila de 220 cubriendo 2021-01-01 a 2026-07-14,
  // o sea que aplicaba la jornada de 44h a periodos en que la jornada legal
  // era de 48, 47 o 46 horas — subestimando el valor de la hora ordinaria
  // hasta un 9% en cualquier liquidación retroactiva de 2021 a jul-2025.
  //
  // (Se mantiene la postura ya adoptada por el motor: reducir la jornada
  // reduce el divisor, así que el valor de la hora sube y el salario mensual
  // no se toca. Es la lectura del Ministerio del Trabajo.)
  { clave: "divisor_hora_ordinaria", valor: 240, vigenteDesde: "1991-01-01", vigenteHasta: "2023-07-14", fuente: "CST art. 161 (jornada de 48 horas, antes de la Ley 2101 de 2021)" },
  { clave: "divisor_hora_ordinaria", valor: 235, vigenteDesde: "2023-07-15", vigenteHasta: "2024-07-14", fuente: "Ley 2101 de 2021, art. 3 (jornada de 47 horas)" },
  { clave: "divisor_hora_ordinaria", valor: 230, vigenteDesde: "2024-07-15", vigenteHasta: "2025-07-14", fuente: "Ley 2101 de 2021, art. 3 (jornada de 46 horas)" },
  { clave: "divisor_hora_ordinaria", valor: 220, vigenteDesde: "2025-07-15", vigenteHasta: "2026-07-14", fuente: "Ley 2101 de 2021, art. 3 (jornada de 44 horas)" },
  { clave: "divisor_hora_ordinaria", valor: 210, vigenteDesde: "2026-07-15", fuente: "Ley 2101 de 2021, art. 3 (jornada de 42 horas)" },

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
  // UVT: misma lógica que el SMLMV — resolución de la DIAN a fin de año para
  // el año siguiente, tramos cerrados de 1-ene a 31-dic. La usa toda la
  // depuración de retención en la fuente, así que sin historia no se puede
  // recalcular una retención de un año anterior.
  { clave: "uvt", valor: 35607, vigenteDesde: "2020-01-01", vigenteHasta: "2020-12-31", fuente: "DIAN, Resolución 000084 de 2019" },
  { clave: "uvt", valor: 36308, vigenteDesde: "2021-01-01", vigenteHasta: "2021-12-31", fuente: "DIAN, Resolución 000111 de 11-12-2020" },
  { clave: "uvt", valor: 38004, vigenteDesde: "2022-01-01", vigenteHasta: "2022-12-31", fuente: "DIAN, Resolución 000140 de 2021" },
  { clave: "uvt", valor: 42412, vigenteDesde: "2023-01-01", vigenteHasta: "2023-12-31", fuente: "DIAN, Resolución 001264 de 18-11-2022" },
  { clave: "uvt", valor: 47065, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31", fuente: "DIAN, Resolución 000187 de 2023" },
  { clave: "uvt", valor: 49799, vigenteDesde: "2025-01-01", vigenteHasta: "2025-12-31", fuente: "DIAN, Resolución 000193 de 04-12-2024" },
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
