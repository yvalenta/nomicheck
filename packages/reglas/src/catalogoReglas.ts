// Catálogo de claves válidas de ReglaLegal — metadatos para el futuro panel
// administrativo (Fase 8, SDD.md §11): qué claves existen, su unidad y su
// fuente legal, para que el admin no tenga que adivinar qué está editando.
// No valida datos en runtime (packages/reglas no depende de zod) — es
// documentación tipada que la UI del panel puede iterar.

export type UnidadReglaLegal = "pesos" | "porcentaje" | "horas" | "uvt" | "multiplo-smlmv";

export interface MetaReglaLegal {
  clave: string;
  etiqueta: string;
  unidad: UnidadReglaLegal;
  fuenteTipica: string;
  usadaEnCalculo: boolean;
  descripcion: string;
}

export const CATALOGO_REGLAS_LEGALES: MetaReglaLegal[] = [
  { clave: "smlmv", etiqueta: "Salario mínimo legal mensual vigente", unidad: "pesos", fuenteTipica: "Decreto anual de salario mínimo", usadaEnCalculo: true, descripcion: "Base para el umbral del fondo de solidaridad pensional (múltiplos de SMLMV)." },
  { clave: "auxilio_transporte", etiqueta: "Auxilio de transporte", unidad: "pesos", fuenteTipica: "Decreto anual de salario mínimo", usadaEnCalculo: true, descripcion: "Monto mensual, se prorratea por días del periodo. No hace IBC." },
  { clave: "recargo_dominical", etiqueta: "Recargo dominical/festivo", unidad: "porcentaje", fuenteTipica: "Ley 2466 de 2025, art. 2", usadaEnCalculo: true, descripcion: "Escalonado 80% → 90% → 100% entre jul-2025 y jul-2027." },
  { clave: "recargo_nocturno", etiqueta: "Recargo nocturno", unidad: "porcentaje", fuenteTipica: "Ley 2466 de 2025, art. 3", usadaEnCalculo: true, descripcion: "35%, franja 19:00–06:00." },
  { clave: "hora_extra_diurna", etiqueta: "Recargo hora extra diurna", unidad: "porcentaje", fuenteTipica: "CST art. 168", usadaEnCalculo: true, descripcion: "25% adicional sobre el valor de la hora ordinaria." },
  { clave: "hora_extra_nocturna", etiqueta: "Recargo hora extra nocturna", unidad: "porcentaje", fuenteTipica: "CST art. 168", usadaEnCalculo: true, descripcion: "75% adicional sobre el valor de la hora ordinaria." },
  { clave: "aporte_salud_empleado", etiqueta: "Aporte a salud (empleado)", unidad: "porcentaje", fuenteTipica: "Ley 100 de 1993", usadaEnCalculo: true, descripcion: "4% sobre el IBC." },
  { clave: "aporte_pension_empleado", etiqueta: "Aporte a pensión (empleado)", unidad: "porcentaje", fuenteTipica: "Ley 100 de 1993", usadaEnCalculo: true, descripcion: "4% sobre el IBC." },
  { clave: "fondo_solidaridad_umbral_smlmv", etiqueta: "Umbral fondo de solidaridad (en SMLMV)", unidad: "multiplo-smlmv", fuenteTipica: "Ley 100 de 1993, art. 27", usadaEnCalculo: true, descripcion: "IBC ≥ este múltiplo de SMLMV activa el fondo de solidaridad pensional." },
  { clave: "divisor_hora_ordinaria", etiqueta: "Divisor de hora ordinaria", unidad: "horas", fuenteTipica: "Ley 2101 de 2021", usadaEnCalculo: true, descripcion: "220 (jornada 44h) hasta 14-jul-2026; 210 (jornada 42h) desde 15-jul-2026." },
  { clave: "limite_deducciones_salario", etiqueta: "Tope de deducciones sobre el salario", unidad: "porcentaje", fuenteTipica: "CST art. 149", usadaEnCalculo: true, descripcion: "Protege el mínimo vital: recorta el AFC (nunca ley) si el total de deducciones lo supera." },
  { clave: "auxilio_transporte_tope_smlmv", etiqueta: "Tope de SMLMV para auxilio de transporte", unidad: "multiplo-smlmv", fuenteTipica: "Decreto de salario mínimo vigente", usadaEnCalculo: true, descripcion: "Salario > este múltiplo de SMLMV ⇒ no hay derecho a auxilio de transporte." },
  { clave: "embargo_ordinario_fraccion_excedente", etiqueta: "Fracción embargable del excedente (ordinario)", unidad: "porcentaje", fuenteTipica: "CST art. 154 y 155", usadaEnCalculo: true, descripcion: "1 SMLMV es inembargable; del excedente solo se puede embargar esta fracción (1/5)." },
  { clave: "embargo_alimentos_pct_max", etiqueta: "Tope embargo por alimentos/cooperativa", unidad: "porcentaje", fuenteTipica: "CST art. 156", usadaEnCalculo: true, descripcion: "Hasta este % de CUALQUIER salario, incluido el mínimo." },
  { clave: "max_horas_extra_dia", etiqueta: "Máximo de horas extra por día", unidad: "horas", fuenteTipica: "D.L. 13 de 1967, art. 1", usadaEnCalculo: true, descripcion: "Exceder este tope no recorta el pago (primacía de la realidad) — genera advertencia de infracción." },
  { clave: "max_horas_extra_semana", etiqueta: "Máximo de horas extra por semana", unidad: "horas", fuenteTipica: "Ley 6 de 1981", usadaEnCalculo: true, descripcion: "Exceder este tope no recorta el pago — genera advertencia de infracción." },
  { clave: "uvt", etiqueta: "Unidad de Valor Tributario (UVT)", unidad: "pesos", fuenteTipica: "DIAN, resolución anual", usadaEnCalculo: true, descripcion: "Fase 2 (retención en la fuente / rentas exentas) — base de todos los topes en UVT del art. 383/387/126-1." },
  { clave: "limite_porcentaje_afc", etiqueta: "Límite AFC — % del ingreso laboral", unidad: "porcentaje", fuenteTipica: "E.T. art. 126-1 y 126-4", usadaEnCalculo: true, descripcion: "AFC + aportes voluntarios a pensión no pueden superar este % del ingreso mensual, si declara renta." },
  { clave: "limite_anual_uvt_afc", etiqueta: "Límite AFC — tope anual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 126-1 y 126-4", usadaEnCalculo: true, descripcion: "Tope anual combinado de AFC + aportes voluntarios a pensión — se prorratea a mensual (÷12) porque el cálculo es por periodo, no lleva acumulado anual." },
  { clave: "limite_rentas_exentas_porcentaje", etiqueta: "Límite de rentas exentas + deducciones", unidad: "porcentaje", fuenteTipica: "E.T. art. 336 (Ley 2277 de 2022)", usadaEnCalculo: true, descripcion: "Tope del 40% del ingreso para la sumatoria de rentas exentas y deducciones en la depuración de retención." },
  { clave: "limite_rentas_exentas_uvt_anual", etiqueta: "Límite de rentas exentas + deducciones — tope anual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 336 (Ley 2277 de 2022)", usadaEnCalculo: true, descripcion: "Tope anual absoluto (1.340 UVT) de la misma sumatoria — el menor entre este y el 40% aplica. Se prorratea a mensual (÷12)." },
  { clave: "limite_renta_exenta_laboral_uvt_mes", etiqueta: "Renta exenta laboral 25% — tope mensual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 206, num. 10", usadaEnCalculo: true, descripcion: "El 25% del ingreso laboral es renta exenta, sin importar si declara renta — tope 790 UVT/mes." },
  { clave: "limite_deduccion_dependientes_uvt_mes", etiqueta: "Deducción por dependientes — tope mensual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 387, par. 2", usadaEnCalculo: true, descripcion: "10% del ingreso es deducible si hay al menos un dependiente a cargo — tope 32 UVT/mes, una sola deducción sin importar cuántos dependientes." },
  { clave: "limite_deduccion_salud_uvt_mes", etiqueta: "Deducción por medicina prepagada/seguros de salud — tope mensual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 387, par. 1", usadaEnCalculo: true, descripcion: "Lo efectivamente pagado en medicina prepagada/seguros de salud (propios o de la familia) es deducible hasta 16 UVT/mes, sin importar si declara renta." },
  { clave: "ibc_tope_smlmv", etiqueta: "Tope superior del IBC (en SMLMV)", unidad: "multiplo-smlmv", fuenteTipica: "Ley 100 de 1993, art. 18 mod. Ley 797 de 2003, art. 5", usadaEnCalculo: true, descripcion: "Techo del ingreso base de cotización a seguridad social — 25 SMLMV. Se prorratea por periodo para validar en el motor de QA." },
  { clave: "pago_onchain_prima_pct", etiqueta: "Prima sobre TRM para pago on-chain", unidad: "porcentaje", fuenteTipica: "Política NomiCheck", usadaEnCalculo: false, descripcion: "Prima aplicada sobre la TRM oficial al convertir COP→USDC en lotes de pago on-chain (cubre el spread P2P). 0 = TRM pura." },
  { clave: "pago_onchain_ventana_horas", etiqueta: "Ventana de validez del snapshot de tasa", unidad: "horas", fuenteTipica: "Política NomiCheck", usadaEnCalculo: false, descripcion: "Horas de validez del snapshot de tasa congelado en un BatchPago; vencida la ventana el lote expira y debe regenerarse." },
];
