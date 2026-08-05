// Pruebas de TIPOS del gate de `alcance.ts`. No se ejecutan nunca: el
// verificador es `tsc`, y el corredor es el mismo `pnpm typecheck` del CI.
//
// El mecanismo es `@ts-expect-error`, que se pone ROJO cuando la línea de
// abajo NO da error. O sea: si alguien afloja el gate —vuelve opcional el
// ancla, mete `any`, ensancha la unión— este archivo deja de compilar y el CI
// lo dice. Una guarda de tipos sin una prueba de tipos es una guarda que nadie
// midió: exactamente lo que este repo ya pagó dos veces.
//
// Vitest no lo levanta (no es `*.test.ts`) y nada lo importa, así que en
// runtime no existe.

import { prisma } from "./prisma.js";
import { acotadoAparte, type TxAcotada } from "./alcance.js";

const EMPRESA = 1;
const PERIODO = 71;
const EMPLEADO = 501;

// ── Lo que NO debe compilar: la forma exacta de los dos bugs reales ────────

// `53a3c07`: turnos de un periodo, sin decir de quién es el periodo.
// @ts-expect-error — falta el ancla: `periodo` o `empleado`
void prisma.turno.findMany({ where: { periodoId: PERIODO } });

// `53a3c07`: la lista de participantes de la nómina, igual.
// @ts-expect-error — falta el ancla
void prisma.periodoNominaEmpleado.findMany({ where: { periodoId: PERIODO } });

// Recibos por periodo: es lo que sirve la PILA y el detalle de nómina.
// @ts-expect-error — falta el ancla
void prisma.reciboPago.findMany({ where: { periodoId: PERIODO } });

// Un borrado sin ancla es peor que una lectura sin ancla: no filtra, destruye.
// @ts-expect-error — falta el ancla
void prisma.reciboPago.deleteMany({ where: { periodoId: PERIODO } });
// @ts-expect-error — falta el ancla
void prisma.turno.deleteMany({ where: { periodoId: PERIODO } });

// Un `where` vacío se lleva la tabla entera de todas las empresas.
// @ts-expect-error — falta el ancla
void prisma.reciboPago.findMany({ where: {} });

// Sin `where` no hay nada que anclar, y devuelve todo.
// @ts-expect-error — `where` es obligatorio en los modelos derivados
void prisma.turno.findMany({});

// Contar también revela: un conteo por empleado ajeno dice si existe.
// @ts-expect-error — falta el ancla
void prisma.turno.count({ where: { empleadoId: EMPLEADO } });

// PagoItem cuelga del lote, que sí tiene empresaId propio.
// @ts-expect-error — falta el ancla `batch`
void prisma.pagoItem.findMany({ where: { batchId: 9 } });

// Dentro de una transacción vale lo mismo — si no, el agujero sería el de
// siempre con un `tx.` adelante.
declare const tx: TxAcotada;
// @ts-expect-error — falta el ancla
void tx.reciboPago.deleteMany({ where: { periodoId: PERIODO } });

// El cliente acotado no expone los modelos crudos por otro nombre.
// @ts-expect-error — `findUnique` no está en el delegado acotado: no lleva ancla posible
void prisma.reciboPago.findUnique({ where: { id: 1 } });

// ── Lo que SÍ debe compilar ────────────────────────────────────────────────

void prisma.turno.findMany({ where: { periodoId: PERIODO, periodo: { empresaId: EMPRESA } } });
void prisma.turno.count({ where: { empleadoId: EMPLEADO, empleado: { empresaId: EMPRESA } } });
void prisma.reciboPago.findMany({ where: { periodo: { empresaId: EMPRESA } } });
void prisma.reciboPago.count({ where: { contratistaId: 3, contratista: { empresaId: EMPRESA } } });
void prisma.periodoNominaEmpleado.deleteMany({
  where: { periodoId: PERIODO, periodo: { empresaId: EMPRESA } },
});

// La escotilla explícita: el portal del colaborador acota por la persona.
void prisma.reciboPago.findMany({
  where: acotadoAparte({ empleadoId: EMPLEADO }, "empleadoId de la sesión del colaborador"),
});

// Y no se puede fabricar la marca a mano: el símbolo no se exporta.
// @ts-expect-error — `Acotado` solo lo produce `acotadoAparte`
void prisma.reciboPago.findMany({ where: { empleadoId: EMPLEADO, __acotado: true } });

// Las escrituras pasan derecho: no llevan `where`, la FK va en el `data`.
void prisma.turno.createMany({ data: [{ periodoId: PERIODO, empleadoId: EMPLEADO, fecha: "2026-07-03", horaInicio: "08:00", horaFin: "17:00" }] });

// El `include` sigue infiriendo — el gate no puede costar el tipado del payload.
async function elIncludeSigueTipando() {
  const recibos = await prisma.reciboPago.findMany({
    where: { periodo: { empresaId: EMPRESA } },
    include: { contratista: true },
  });
  const wallet: string | null | undefined = recibos[0]?.contratista?.walletAddress;
  void wallet;
  // @ts-expect-error — `empleado` no se incluyó: el payload no lo trae
  void recibos[0]?.empleado?.nombre;
}
void elIncludeSigueTipando;
