// Suite del semáforo de cumplimiento (SDD §14). El semáforo NO recalcula
// nada: reusa las advertencias puras del motor sobre el estado ACTUAL de los
// empleados, y para horas extra lee las advertencias YA persistidas en los
// recibos de los últimos periodos liquidados. Lo que se prueba acá es el
// CABLEADO — qué entra al barrido, qué se ignora y cómo se agrega el nivel —
// porque el motor (advertenciaPatronAprendiz, advertenciaSalarioBajoMinimo)
// ya tiene sus propios tests en packages/reglas.
//
// El peso está en lo NEGATIVO: un semáforo que alerta de más entrena al
// usuario a ignorarlo, y uno que barre empleados inactivos, otras empresas o
// periodos en borrador da rojo por cosas que no son de esta empresa hoy.
//
// El catálogo es la semilla real (prisma/semillaLegal.ts): SMLMV vigente
// 2026 = 1.750.905 y el rango aprendiz para "indefinido" es 50%-75% de eso
// (875.452,50 – 1.313.178,75). Los salarios del fixture se eligen contra esos
// bordes, no al azar.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FESTIVOS_SEMILLA, REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

interface EmpleadoFila {
  id: number;
  empresaId: number;
  nombre: string;
  documento: string;
  salarioBase: number;
  tipoContrato: string;
  activo: boolean;
}

interface ReciboFila {
  empleadoId: number | null;
  empleado: EmpleadoFila | null;
  advertencias: string[] | null;
}

interface PeriodoFila {
  id: number;
  empresaId: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  recibos: ReciboFila[];
}

// Estado mutable del mock — vi.hoisted porque la fábrica de vi.mock se
// hoistea por encima de cualquier `const` del archivo.
const bd = vi.hoisted(() => ({
  empleados: [] as unknown[],
  periodos: [] as unknown[],
}));

// El mock HONRA los filtros que el servicio manda (empresaId, activo, estado,
// orderBy, take, empleadoId not null) en vez de devolver todo: así las
// pruebas negativas de abajo verifican que el servicio realmente los pide.
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    reglaLegal: {
      findMany: async () =>
        REGLAS_SEMILLA.map((r) => ({ ...r, vigenteHasta: r.vigenteHasta ?? null, fuente: r.fuente ?? null })),
    },
    festivo: { findMany: async () => FESTIVOS_SEMILLA },
    empleado: {
      findMany: async (args: { where: { empresaId: number; activo: boolean } }) =>
        (bd.empleados as EmpleadoFila[]).filter(
          (e) => e.empresaId === args.where.empresaId && e.activo === args.where.activo
        ),
    },
    periodoNomina: {
      findMany: async (args: {
        where: { empresaId: number; estado: { in: string[] } };
        orderBy: { fechaFin: "desc" };
        take: number;
      }) =>
        (bd.periodos as PeriodoFila[])
          .filter((p) => p.empresaId === args.where.empresaId && args.where.estado.in.includes(p.estado))
          .sort((a, b) => b.fechaFin.localeCompare(a.fechaFin))
          .slice(0, args.take)
          .map((p) => ({ ...p, recibos: p.recibos.filter((r) => r.empleadoId !== null) })),
    },
  },
}));

import { calcularSemaforoCumplimiento } from "../cumplimientoService.js";

const EMPRESA = 1;

let siguienteId = 1;
function empleado(salarioBase: number, extras: Partial<EmpleadoFila> = {}): EmpleadoFila {
  const id = siguienteId++;
  return {
    id,
    empresaId: EMPRESA,
    nombre: `Empleado ${id}`,
    documento: String(1_000_000_000 + id),
    salarioBase,
    tipoContrato: "indefinido",
    activo: true,
    ...extras,
  };
}

// Frase real de calculadoraTurnos.ts — el semáforo matchea por el substring
// fijo "supera el máximo legal de", así que el fixture usa la advertencia
// completa tal como se persiste, no una inventada que ya contenga la marca.
const ADVERTENCIA_HORAS_EXTRA =
  "En la semana del 2026-07-06 acumulaste 14 horas extra — supera el máximo legal de 12 h/semana (Ley 6 de 1981). Se pagan completas, pero la jornada excede lo permitido.";

function periodo(extras: Partial<PeriodoFila> = {}): PeriodoFila {
  const id = siguienteId++;
  return {
    id,
    empresaId: EMPRESA,
    fechaInicio: "2026-07-01",
    fechaFin: "2026-07-15",
    estado: "liquidado",
    recibos: [],
    ...extras,
  };
}

function recibo(e: EmpleadoFila, advertencias: string[] | null): ReciboFila {
  return { empleadoId: e.id, empleado: e, advertencias };
}

beforeEach(() => {
  bd.empleados = [];
  bd.periodos = [];
});

describe("calcularSemaforoCumplimiento — niveles", () => {
  it("sin novedades es verde, con las tres listas vacías", async () => {
    bd.empleados = [empleado(2_000_000)]; // ≥ SMLMV: legal
    bd.periodos = [periodo({ recibos: [recibo(bd.empleados[0] as EmpleadoFila, [])] })];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s).toEqual({
      nivel: "verde",
      aprendicesMalClasificados: [],
      salariosBajoMinimo: [],
      horasExtraExcedidas: [],
    });
  });

  it("salario bajo el mínimo (fuera del rango aprendiz) da rojo solo por esa lista", async () => {
    // 1.500.000 está SOBRE el techo aprendiz (1.313.178,75) y BAJO el SMLMV
    // (1.750.905): debe caer en salariosBajoMinimo y NO en aprendices — si
    // cayera en ambas, los bordes de las dos advertencias estarían pisados.
    const e = empleado(1_500_000);
    bd.empleados = [e];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("rojo");
    expect(s.aprendicesMalClasificados).toEqual([]);
    expect(s.salariosBajoMinimo).toHaveLength(1);
    expect(s.salariosBajoMinimo[0]).toMatchObject({ empleadoId: e.id, nombre: e.nombre });
    expect(s.salariosBajoMinimo[0]!.mensaje).toContain("salario mínimo");
  });

  it("salario en rango aprendiz sobre contrato indefinido da rojo con ambas alertas", async () => {
    // 1.000.000 cae dentro del 50%-75% del SMLMV. Como todo el rango aprendiz
    // queda bajo el mínimo, la alerta de aprendiz SIEMPRE viene acompañada de
    // la de salario bajo — el semáforo reporta las dos, no colapsa una.
    const e = empleado(1_000_000);
    bd.empleados = [e];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("rojo");
    expect(s.aprendicesMalClasificados).toHaveLength(1);
    expect(s.aprendicesMalClasificados[0]!.mensaje).toContain("aprendiz");
    expect(s.salariosBajoMinimo).toHaveLength(1);
  });

  it("horas extra excedidas sin problemas de empleados da amarillo con el periodo señalado", async () => {
    const e = empleado(2_000_000);
    bd.empleados = [e];
    const p = periodo({ fechaInicio: "2026-07-01", fechaFin: "2026-07-15", recibos: [recibo(e, [ADVERTENCIA_HORAS_EXTRA])] });
    bd.periodos = [p];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("amarillo");
    expect(s.horasExtraExcedidas).toHaveLength(1);
    // El periodo y sus fechas viajan en la alerta: sin ellos el usuario no
    // sabe QUÉ quincena revisar.
    expect(s.horasExtraExcedidas[0]).toMatchObject({
      empleadoId: e.id,
      periodoId: p.id,
      fechaInicio: "2026-07-01",
      fechaFin: "2026-07-15",
    });
  });

  it("rojo domina sobre amarillo, pero las horas extra igual se reportan", async () => {
    const bajo = empleado(1_500_000);
    const conExtras = empleado(2_000_000);
    bd.empleados = [bajo, conExtras];
    bd.periodos = [periodo({ recibos: [recibo(conExtras, [ADVERTENCIA_HORAS_EXTRA])] })];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("rojo");
    // Que el nivel sea rojo no puede ocultar la lista amarilla: son problemas
    // independientes y el usuario arregla los dos.
    expect(s.horasExtraExcedidas).toHaveLength(1);
  });
});

describe("calcularSemaforoCumplimiento — lo que NO debe alertar", () => {
  it("un aprendiz SENA real con auxilio bajo el mínimo NO es infracción", async () => {
    // Su "salario" es legalmente un auxilio de sostenimiento < SMLMV (Ley 789
    // de 2002): alertarlo enseñaría a la empresa a desconfiar del semáforo.
    bd.empleados = [empleado(1_000_000, { tipoContrato: "aprendizaje_sena_practica" })];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("verde");
    expect(s.aprendicesMalClasificados).toEqual([]);
    expect(s.salariosBajoMinimo).toEqual([]);
  });

  it("tiempo parcial bajo el SMLMV tampoco: es proporcional por diseño", async () => {
    bd.empleados = [empleado(900_000, { tipoContrato: "tiempo_parcial" })];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("verde");
  });

  it("empleados inactivos y de otras empresas quedan fuera del barrido", async () => {
    // Un ex-empleado con salario viejo bajo el mínimo de HOY daría rojo
    // eterno; y el semáforo es por empresa, no global.
    bd.empleados = [
      empleado(1_000_000, { activo: false }),
      empleado(1_000_000, { empresaId: 99 }),
    ];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("verde");
    expect(s.salariosBajoMinimo).toEqual([]);
  });

  it("advertencias que no son de horas extra excedidas no encienden el amarillo", async () => {
    const e = empleado(2_000_000);
    bd.empleados = [e];
    bd.periodos = [
      periodo({
        recibos: [
          // Advertencia real del motor, pero de OTRO tema (término fijo):
          // matchear por substring solo es seguro si el substring discrimina.
          recibo(e, ["Este contrato a término fijo se liquida igual que uno indefinido para este periodo."]),
          recibo(e, null), // recibos viejos sin campo: tolerado, no revienta
        ],
      }),
    ];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("verde");
    expect(s.horasExtraExcedidas).toEqual([]);
  });

  it("recibos de contratistas (sin empleado) se saltan sin romper", async () => {
    bd.empleados = [empleado(2_000_000)];
    bd.periodos = [
      periodo({ recibos: [{ empleadoId: null, empleado: null, advertencias: [ADVERTENCIA_HORAS_EXTRA] }] }),
    ];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    // Un contratista no tiene jornada máxima legal de empleado: su recibo no
    // entra al semáforo aunque arrastre texto con la marca.
    expect(s.nivel).toBe("verde");
  });

  it("periodos en borrador o fallidos no cuentan aunque tengan advertencias", async () => {
    const e = empleado(2_000_000);
    bd.empleados = [e];
    bd.periodos = [
      periodo({ estado: "borrador", recibos: [recibo(e, [ADVERTENCIA_HORAS_EXTRA])] }),
      periodo({ estado: "fallido", recibos: [recibo(e, [ADVERTENCIA_HORAS_EXTRA])] }),
    ];
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    // Un borrador es un ensayo: sus advertencias pueden desaparecer al
    // corregir turnos antes de liquidar. Solo lo liquidado/pagado es historia.
    expect(s.nivel).toBe("verde");
  });

  it("el barrido es una foto reciente: solo los últimos 6 periodos liquidados", async () => {
    const e = empleado(2_000_000);
    bd.empleados = [e];
    // 7 periodos liquidados; la única advertencia vive en el MÁS VIEJO.
    bd.periodos = Array.from({ length: 7 }, (_, i) =>
      periodo({
        fechaInicio: `2026-0${i + 1}-01`,
        fechaFin: `2026-0${i + 1}-15`,
        recibos: i === 0 ? [recibo(e, [ADVERTENCIA_HORAS_EXTRA])] : [],
      })
    );
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    // Enero quedó fuera de la ventana de 6: una infracción de hace medio año
    // no es el estado de cumplimiento de hoy.
    expect(s.nivel).toBe("verde");
    expect(s.horasExtraExcedidas).toEqual([]);
  });

  it("y dentro de la ventana, cada recibo con la marca aporta su alerta", async () => {
    const e = empleado(2_000_000);
    bd.empleados = [e];
    bd.periodos = Array.from({ length: 6 }, (_, i) =>
      periodo({
        fechaInicio: `2026-0${i + 2}-01`,
        fechaFin: `2026-0${i + 2}-15`,
        recibos: [recibo(e, [ADVERTENCIA_HORAS_EXTRA])],
      })
    );
    const s = await calcularSemaforoCumplimiento(EMPRESA);
    expect(s.nivel).toBe("amarillo");
    expect(s.horasExtraExcedidas).toHaveLength(6);
  });
});
