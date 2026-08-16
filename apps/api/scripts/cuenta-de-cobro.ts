// Emite la cuenta de cobro de una empresa por un mes, para mandarla a mano.
//
//     pnpm cobro --empresa 3 --mes 2026-08          # a pantalla
//     pnpm cobro --empresa 3 --mes 2026-08 --guardar out/
//     pnpm cobro --listar --mes 2026-08             # quién tiene algo que cobrar
//
// ── Por qué a mano, y por qué está bien ────────────────────────────────────
//
// Con las primeras empresas, emitir a mano cuesta menos que integrar una
// pasarela — y sobre todo **enseña qué hace falta de verdad** antes de
// construirlo. Ver `sdd/marketing/precio-empresas.md`.
//
// Este script NO cobra, NO manda correos y NO marca nada como pagado. Produce
// un documento y lo imprime. Todo lo que tiene efecto hacia afuera lo hace una
// persona, mirando el documento primero.
//
// ── Los datos del emisor NO viven acá ──────────────────────────────────────
//
// Salen del entorno (`COBRO_EMISOR_*`). No están en el repo ni tienen valor por
// defecto: una cuenta de cobro con la identificación de otro, o sin cuenta a
// dónde consignar, es peor que no tener documento. Si falta algo, el script
// dice exactamente qué y no emite.
import { PrismaClient } from "@prisma/client";
import type { ClienteAcotado } from "../src/lib/alcance.js";
import { obtenerEstadoCuenta, mesCorriente } from "../src/services/cuentaEmpresaService.js";
import { construirCuentaDeCobro, type Emisor } from "../src/services/cuentaDeCobroService.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const bandera = (n: string) => process.argv.includes(`--${n}`);

const emisor: Partial<Emisor> = {
  nombre: process.env.COBRO_EMISOR_NOMBRE,
  identificacion: process.env.COBRO_EMISOR_IDENTIFICACION,
  correo: process.env.COBRO_EMISOR_CORREO,
  formaDePago: process.env.COBRO_EMISOR_FORMA_DE_PAGO,
  ciudad: process.env.COBRO_EMISOR_CIUDAD,
  telefono: process.env.COBRO_EMISOR_TELEFONO,
};

// La URL va EXPLÍCITA y no por env: el cliente de Prisma recarga `.env`, que
// apunta a producción, y ese fue el camino por el que una migración "local"
// terminó aplicándose allá. Acá leer producción es lo correcto —es donde están
// los cierres—, pero que sea una decisión visible y no un descuido.
const url = process.env.COBRO_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("falta DATABASE_URL (o COBRO_DATABASE_URL) — sin base no hay cierres que cobrar");
  process.exit(1);
}
const cliente = new PrismaClient({ datasources: { db: { url } } });
const prisma = cliente as unknown as ClienteAcotado;

async function listar(mes: string) {
  const empresas = await cliente.empresa.findMany({ where: { activa: true }, orderBy: { id: "asc" } });
  console.log(`Empresas con algo que cobrar en ${mes}:\n`);
  let n = 0;
  for (const e of empresas) {
    const c = await obtenerEstadoCuenta(prisma, e.id, mes);
    if (c.cierresFacturables === 0) continue;

    n++;
    const monto = c.precioCop === null ? "a conversar" : `COP ${c.precioCop.toLocaleString("es-CO")}`;
    console.log(
      `  #${e.id}  ${e.nombre} (NIT ${e.nit}) — ${c.cierresFacturables} cierre(s), ` +
        `${c.empleadosFacturables} persona(s) → ${monto}`
    );
  }
  if (n === 0) console.log("  (ninguna)");
  console.log(`\n${n} empresa(s). Para emitir: --empresa <id> --mes ${mes}`);
}

async function emitirUna(empresaId: number, mes: string) {
  const empresa = await cliente.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    console.error(`no existe la empresa #${empresaId}`);
    process.exit(1);
  }

  const cuenta = await obtenerEstadoCuenta(prisma, empresaId, mes);
  const doc = construirCuentaDeCobro({
    emisor,
    adquirente: { nombre: empresa.nombre, nit: empresa.nit },
    cuenta,
    emitidaEl: new Date(),
  });

  if (!doc.ok) {
    console.error(`No se emite la cuenta de cobro de ${empresa.nombre} para ${mes}:\n`);
    for (const m of doc.motivos) console.error(`  · ${m}`);
    console.error(
      "\nLos datos del emisor salen del entorno: COBRO_EMISOR_NOMBRE, " +
        "COBRO_EMISOR_IDENTIFICACION, COBRO_EMISOR_CORREO, COBRO_EMISOR_FORMA_DE_PAGO."
    );
    process.exit(1);
  }

  const destino = arg("guardar");
  if (destino) {
    mkdirSync(destino, { recursive: true });
    const ruta = join(destino, `cuenta-de-cobro-${doc.numero}-${empresa.nit}.md`);
    writeFileSync(ruta, doc.markdown, "utf8");
    console.error(`→ ${ruta}  (COP ${doc.totalCop.toLocaleString("es-CO")})`);
    console.error("   Revisalo antes de mandarlo: este script no manda nada.");
  } else {
    console.log(doc.markdown);
  }
}

async function main() {
  const mes = arg("mes") ?? mesCorriente();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    console.error(`mes inválido: "${mes}" — se espera YYYY-MM`);
    process.exit(1);
  }
  if (bandera("listar")) return listar(mes);

  const id = Number(arg("empresa"));
  if (!Number.isInteger(id) || id < 1) {
    console.error("falta --empresa <id>. Para ver cuáles hay: --listar --mes YYYY-MM");
    process.exit(1);
  }
  return emitirUna(id, mes);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => cliente.$disconnect());
