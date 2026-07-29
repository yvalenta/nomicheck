import { PrismaClient } from "@prisma/client";

import { FESTIVOS_SEMILLA as festivos2026, REGLAS_SEMILLA as reglas } from "./semillaLegal.js";

const prisma = new PrismaClient();

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
