import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Semilla legal verificada contra fuentes oficiales/prensa especializada el
// 16-jul-2026 (ver SDD.md §03 Módulo A para el detalle y las fuentes de cada
// valor). Revisar si la reforma pensional (Ley 2381 de 2024, hoy suspendida
// por la Corte Constitucional) se reactiva — cambiaría fondo_solidaridad.
const reglas = [
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

  // --- Constantes tributarias (preparación Fase 2: alivios para quienes
  // declaran renta — AFC como renta exenta, no solo deducción de convenio).
  // No se usan todavía en el cálculo, solo quedan disponibles en el panel
  // administrativo para cuando se implemente la Fase 2. Verificado 16-jul-2026.
  { clave: "uvt", valor: 52374, vigenteDesde: "2026-01-01", fuente: "DIAN, Resolución 000238 de 15-12-2025" },
  { clave: "limite_porcentaje_afc", valor: 0.30, vigenteDesde: "2012-01-01", fuente: "E.T. art. 126-1 y 126-4 (Ley 1607 de 2012)" },
  { clave: "limite_anual_uvt_afc", valor: 3800, vigenteDesde: "2012-01-01", fuente: "E.T. art. 126-1 y 126-4 (Ley 1607 de 2012)" },
  { clave: "limite_rentas_exentas_porcentaje", valor: 0.40, vigenteDesde: "2023-01-01", fuente: "E.T. art. 336 (Ley 2277 de 2022)" },
];

// Festivos Colombia 2026 (Ley Emiliani)
const festivos2026 = [
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

async function main() {
  console.log("Sembrando reglas legales...");
  for (const r of reglas) {
    await prisma.reglaLegal.upsert({
      where: {
        // Usamos un índice compuesto simulado — la clave + vigenteDesde es única por convención
        id: (await prisma.reglaLegal.findFirst({
          where: { clave: r.clave, vigenteDesde: r.vigenteDesde },
        }))?.id ?? 0,
      },
      create: r,
      update: r,
    });
  }

  console.log("Sembrando festivos 2026...");
  for (const f of festivos2026) {
    await prisma.festivo.upsert({
      where: { fecha: f.fecha },
      create: f,
      update: f,
    });
  }

  console.log("Seed completo.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
