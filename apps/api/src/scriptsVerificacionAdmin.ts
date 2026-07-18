// Script de verificación manual (docker compose exec api) para el dashboard
// admin: DELETE con guarda y panel de costos. No es parte del build.
import { prisma } from "./lib/prisma.js";
import { eliminarEmpleado, ErrorConflicto } from "./services/empleadosService.js";
import { calcularCostosEmpresa } from "./services/costosService.js";

async function main() {
  // DB de desarrollo puede estar vacía — sembrar lo mínimo para el escenario.
  let empresa = await prisma.empresa.findFirst();
  if (!empresa) {
    empresa = await prisma.empresa.create({
      data: { nombre: "Restaurante Resplandor (dev)", nit: `900${Date.now() % 1_000_000}`, sector: "gastronomía" },
    });
    const emp = await prisma.empleado.create({
      data: {
        empresaId: empresa.id,
        nombre: "Marisol Pruebas",
        documento: "1000000001",
        salarioBase: 1_750_905,
        tipoNomina: "turnos",
        auxilioTransporte: true,
        fechaIngreso: "2026-01-01",
      },
    });
    const periodo = await prisma.periodoNomina.create({
      data: { empresaId: empresa.id, fechaInicio: "2026-06-01", fechaFin: "2026-06-15", estado: "liquidado" },
    });
    await prisma.reciboPago.create({
      data: {
        empleadoId: emp.id,
        periodoId: periodo.id,
        lineas: [],
        totalDevengado: 875_453,
        totalDeducido: 70_036,
        neto: 805_417,
      },
    });
    console.log("(DB vacía: sembrada empresa + empleado con un recibo)");
  }
  console.log(`Empresa: ${empresa.nombre} (id ${empresa.id})`);

  // 1. Crear un empleado "por error" y eliminarlo → debe funcionar.
  const fantasma = await prisma.empleado.create({
    data: {
      empresaId: empresa.id,
      nombre: "Creado Por Error",
      documento: `ERR-${Date.now()}`,
      salarioBase: 1_500_000,
      tipoNomina: "fijo",
      fechaIngreso: "2026-01-01",
    },
  });
  await eliminarEmpleado(empresa.id, fantasma.id);
  const sigue = await prisma.empleado.findUnique({ where: { id: fantasma.id } });
  console.log(`1. DELETE sin historial: ${sigue === null ? "OK (eliminado)" : "FALLO (sigue existiendo)"}`);

  // 2. Empleado CON recibos → debe rechazar con ErrorConflicto.
  const conHistorial = await prisma.empleado.findFirst({
    where: { empresaId: empresa.id, recibos: { some: {} } },
  });
  if (conHistorial) {
    try {
      await eliminarEmpleado(empresa.id, conHistorial.id);
      console.log("2. DELETE con historial: FALLO (no rechazó)");
    } catch (e) {
      console.log(
        `2. DELETE con historial: ${e instanceof ErrorConflicto ? "OK (409)" : `FALLO (error equivocado: ${e})`}`
      );
    }
  } else {
    console.log("2. DELETE con historial: SIN DATOS (ningún empleado con recibos)");
  }

  // 3. Scoping por empresa: id inexistente → "no encontrado".
  try {
    await eliminarEmpleado(empresa.id, 999_999);
    console.log("3. Scoping: FALLO");
  } catch (e) {
    console.log(`3. Scoping id ajeno/inexistente: OK (${(e as Error).message})`);
  }

  // 4. Costos con y sin exoneración.
  const conExo = await calcularCostosEmpresa(empresa.id, true);
  const sinExo = await calcularCostosEmpresa(empresa.id, false);
  console.log(
    `4. Costos: ${conExo.empleados.length} empleados, nómina base $${conExo.totales.nominaBaseMensual.toLocaleString("es-CO")}`
  );
  console.log(
    `   Exonerado:    costo total $${conExo.totales.costoTotalMensual.toLocaleString("es-CO")} (factor ${conExo.totales.factorPromedio})`
  );
  console.log(
    `   Sin exonerar: costo total $${sinExo.totales.costoTotalMensual.toLocaleString("es-CO")} (factor ${sinExo.totales.factorPromedio})`
  );
  const primero = conExo.empleados.find((e) => e.costo);
  if (primero?.costo) {
    console.log(`   Desglose de ${primero.nombre}:`);
    for (const l of primero.costo.lineas) {
      console.log(`     - ${l.concepto}: $${l.valor.toLocaleString("es-CO")} (${l.ley})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
