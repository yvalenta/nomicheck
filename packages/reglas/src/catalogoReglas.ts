// Catálogo de claves válidas de ReglaLegal — metadatos para el futuro panel
// administrativo (Fase 8, SDD.md §11): qué claves existen, su unidad y su
// fuente legal, para que el admin no tenga que adivinar qué está editando.
// No valida datos en runtime (packages/reglas no depende de zod) — es
// documentación tipada que la UI del panel puede iterar.

export type UnidadReglaLegal = "pesos" | "porcentaje" | "horas" | "uvt";

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
  { clave: "fondo_solidaridad_umbral_smlmv", etiqueta: "Umbral fondo de solidaridad (en SMLMV)", unidad: "horas", fuenteTipica: "Ley 100 de 1993, art. 27", usadaEnCalculo: true, descripcion: "IBC ≥ este múltiplo de SMLMV activa el fondo de solidaridad pensional." },
  { clave: "divisor_hora_ordinaria", etiqueta: "Divisor de hora ordinaria", unidad: "horas", fuenteTipica: "Ley 2101 de 2021", usadaEnCalculo: true, descripcion: "220 (jornada 44h) hasta 14-jul-2026; 210 (jornada 42h) desde 15-jul-2026." },
  { clave: "limite_deducciones_salario", etiqueta: "Tope de deducciones sobre el salario", unidad: "porcentaje", fuenteTipica: "CST art. 149", usadaEnCalculo: true, descripcion: "Protege el mínimo vital: recorta el AFC (nunca ley) si el total de deducciones lo supera." },
  { clave: "uvt", etiqueta: "Unidad de Valor Tributario (UVT)", unidad: "pesos", fuenteTipica: "DIAN, resolución anual", usadaEnCalculo: false, descripcion: "Preparación Fase 2 (retención en la fuente / rentas exentas) — aún no se usa en el cálculo." },
  { clave: "limite_porcentaje_afc", etiqueta: "Límite AFC — % del ingreso laboral", unidad: "porcentaje", fuenteTipica: "E.T. art. 126-1 y 126-4", usadaEnCalculo: false, descripcion: "Preparación Fase 2: AFC + aportes voluntarios a pensión no pueden superar este % del ingreso mensual." },
  { clave: "limite_anual_uvt_afc", etiqueta: "Límite AFC — tope anual en UVT", unidad: "uvt", fuenteTipica: "E.T. art. 126-1 y 126-4", usadaEnCalculo: false, descripcion: "Preparación Fase 2: tope anual combinado de AFC + aportes voluntarios a pensión." },
  { clave: "limite_rentas_exentas_porcentaje", etiqueta: "Límite de rentas exentas + deducciones", unidad: "porcentaje", fuenteTipica: "E.T. art. 336 (Ley 2277 de 2022)", usadaEnCalculo: false, descripcion: "Preparación Fase 2: tope del 40% del ingreso para la sumatoria de rentas exentas y deducciones en la depuración de renta." },
];
