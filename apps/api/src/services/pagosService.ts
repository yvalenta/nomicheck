// Pago on-chain no-custodial (SDD §17). Dos operaciones:
//
//   generarBatchPago  — arma el lote de USDC para los contratistas con
//                       wallet del periodo, congela la tasa (snapshot con
//                       hash) y devuelve los artefactos de firma (links
//                       EIP-681 + Safe Transaction Builder JSON). El
//                       EMPLEADOR firma desde su wallet — aquí no hay
//                       llaves privadas ni custodia, jamás.
//
//   verificarBatchPago — recibe el txHash firmado por el empleador, lee el
//                       receipt del RPC de Base vía viem, decodifica los
//                       logs Transfer del contrato USDC y confirma monto y
//                       destino de CADA item. Todos confirmados → batch
//                       `verificado` + periodo `pagado` (con version).
//
// Fase 1: SOLO contratistas (Ley 1819/2016 — pago comercial). Salarios de
// Empleado se pagan en COP (CST art. 134-136) — nunca entran al lote.
import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem";
import { crearResolutorReglas } from "@pv/reglas";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";
import { ErrorConflicto } from "./empleadosService.js";
import { obtenerPeriodo } from "./periodosService.js";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { actualizarPeriodoConVersion } from "./liquidacionService.js";
import { capturarTasaSnapshot, type TasaSnapshot } from "./tasaCambioService.js";
import { disclaimerBatch, resolverRedPago, type RedPago } from "../lib/pagosConfig.js";

const RE_WALLET = /^0x[a-fA-F0-9]{40}$/;

/** COP → unidades enteras de USDC (6 decimales). Enteras SIEMPRE: el monto
 * on-chain es un uint256 en unidades, y volver de float a unidades en la
 * verificación introduciría off-by-one. */
export function copAUnidadesUsdc(montoCop: number, tasaEfectiva: number): bigint {
  if (tasaEfectiva <= 0) throw new Error("tasaEfectiva debe ser positiva");
  return BigInt(Math.round((montoCop / tasaEfectiva) * 1_000_000));
}

export function unidadesAUsdc(unidades: bigint): number {
  return Number(unidades) / 1_000_000;
}

/** Link EIP-681 de un transfer ERC-20 — abre la wallet del empleador con la
 * transacción prellenada. Formato: ethereum:<token>@<chainId>/transfer?... */
export function linkEip681(red: RedPago, destino: string, unidades: bigint): string {
  return `ethereum:${red.tokenAddress}@${red.chainId}/transfer?address=${destino}&uint256=${unidades.toString()}`;
}

/** JSON del Safe Transaction Builder — todo el lote en un solo batch que una
 * Safe multifirma ejecuta en una única transacción (n transfers). */
export function safeBatchJson(
  red: RedPago,
  items: { destino: string; unidades: bigint }[],
  descripcion: string
): object {
  return {
    version: "1.0",
    chainId: String(red.chainId),
    createdAt: Date.now(),
    meta: {
      name: "NomiCheck — lote de pago de contratistas (USDC)",
      description: descripcion,
    },
    transactions: items.map((i) => ({
      to: red.tokenAddress,
      value: "0",
      data: null,
      contractMethod: {
        inputs: [
          { name: "to", type: "address", internalType: "address" },
          { name: "value", type: "uint256", internalType: "uint256" },
        ],
        name: "transfer",
        payable: false,
      },
      contractInputsValues: { to: i.destino, value: i.unidades.toString() },
    })),
  };
}

export interface BatchGenerado {
  batchId: number;
  estado: string;
  red: string;
  token: string;
  tokenAddress: string;
  tasaSnapshot: TasaSnapshot;
  totalCop: number;
  totalUsdc: number;
  expiraEn: string;
  disclaimer: string;
  items: { contratista: string; destinoWallet: string; montoCop: number; montoUsdc: number; linkEip681: string }[];
  /** Contratistas del periodo que quedaron FUERA del lote por no tener wallet. */
  excluidosSinWallet: string[];
  safeBatch: object;
}

export async function generarBatchPago(
  empresaId: number,
  periodoId: number,
  usuarioId: string | null = null
): Promise<BatchGenerado> {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "liquidado" && periodo.estado !== "liquidado_con_rechazos") {
    throw new Error(`El periodo está en estado "${periodo.estado}" — solo se genera lote de pago sobre un periodo liquidado`);
  }

  // Validación estricta fase 1 — cualquier otro par red/token revienta con
  // mensaje claro (ErrorRedNoSoportada).
  const red = resolverRedPago("base", "USDC");

  const [{ reglas }, recibos] = await Promise.all([
    obtenerReglasYFestivos(),
    prisma.reciboPago.findMany({
      where: { periodoId, periodo: { empresaId }, contratistaId: { not: null } },
      include: { contratista: true },
    }),
  ]);
  if (recibos.length === 0) {
    throw new Error("El periodo no tiene recibos de contratistas — el pago on-chain fase 1 solo cubre contratistas de servicios");
  }

  const resolutor = crearResolutorReglas(reglas);
  const hoy = new Date().toISOString().slice(0, 10);
  const primaPct = resolutor.en("pago_onchain_prima_pct", hoy);
  const ventanaHoras = resolutor.en("pago_onchain_ventana_horas", hoy);

  const snapshot = await capturarTasaSnapshot(primaPct);

  const pagables = recibos.filter((r) => r.contratista?.walletAddress && RE_WALLET.test(r.contratista.walletAddress));
  const excluidos = recibos
    .filter((r) => !r.contratista?.walletAddress || !RE_WALLET.test(r.contratista.walletAddress))
    .map((r) => r.contratista?.nombre ?? `recibo ${r.id}`);
  if (pagables.length === 0) {
    throw new Error(
      "Ningún contratista del periodo tiene wallet registrada — captura las wallets en la pestaña Contratistas antes de generar el lote"
    );
  }

  const items = pagables.map((r) => {
    const unidades = copAUnidadesUsdc(r.neto, snapshot.tasaEfectiva);
    return {
      reciboId: r.id,
      contratista: r.contratista!.nombre,
      destinoWallet: r.contratista!.walletAddress!,
      montoCop: r.neto,
      unidades,
      montoUsdc: unidadesAUsdc(unidades),
    };
  });

  const totalCop = items.reduce((s, i) => s + i.montoCop, 0);
  const totalUsdc = unidadesAUsdc(items.reduce((s, i) => s + i.unidades, 0n));
  const expiraEn = new Date(Date.now() + ventanaHoras * 60 * 60 * 1000);

  const batch = await conAuditoria(usuarioId, async (tx) => {
    const creado = await tx.batchPago.create({
      data: {
        empresaId,
        periodoId,
        red: red.red,
        token: red.token,
        tokenAddress: red.tokenAddress,
        tasaSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        totalCop,
        totalUsdc,
        expiraEn,
      },
    });
    await tx.pagoItem.createMany({
      data: items.map((i) => ({
        batchId: creado.id,
        reciboId: i.reciboId,
        destinoWallet: i.destinoWallet,
        montoCop: i.montoCop,
        montoUsdc: i.montoUsdc,
      })),
    });
    return creado;
  });

  const disclaimer = disclaimerBatch(snapshot.hash);
  return {
    batchId: batch.id,
    estado: batch.estado,
    red: red.red,
    token: red.token,
    tokenAddress: red.tokenAddress,
    tasaSnapshot: snapshot,
    totalCop,
    totalUsdc,
    expiraEn: expiraEn.toISOString(),
    disclaimer,
    items: items.map((i) => ({
      contratista: i.contratista,
      destinoWallet: i.destinoWallet,
      montoCop: i.montoCop,
      montoUsdc: i.montoUsdc,
      linkEip681: linkEip681(red, i.destinoWallet, i.unidades),
    })),
    excluidosSinWallet: excluidos,
    safeBatch: safeBatchJson(
      red,
      items.map((i) => ({ destino: i.destinoWallet, unidades: i.unidades })),
      disclaimer
    ),
  };
}

export async function obtenerBatchVigente(empresaId: number, periodoId: number) {
  const batch = await prisma.batchPago.findFirst({
    where: { empresaId, periodoId },
    orderBy: { generadoEn: "desc" },
    include: { items: true },
  });
  if (!batch) return null;
  // Marca perezosa de expiración: si venció y sigue "generado", reflejarlo
  // en la lectura (la escritura real ocurre al intentar verificar).
  const expirado = batch.estado === "generado" && batch.expiraEn < new Date();
  const snapshot = batch.tasaSnapshot as unknown as TasaSnapshot;
  return {
    ...batch,
    estado: expirado ? "expirado" : batch.estado,
    disclaimer: disclaimerBatch(snapshot.hash),
  };
}

export interface ResultadoVerificacion {
  estado: "verificado" | "fallido_verificacion";
  detalle: { destinoWallet: string; montoUsdc: number; confirmado: boolean }[];
}

export async function verificarBatchPago(
  empresaId: number,
  batchId: number,
  txHash: string,
  usuarioId: string | null = null
): Promise<ResultadoVerificacion> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("txHash inválido — debe ser un hash de transacción 0x + 64 hex");
  }
  const batch = await prisma.batchPago.findFirst({
    where: { id: batchId, empresaId },
    include: { items: true, periodo: true },
  });
  if (!batch) throw new Error("Lote de pago no encontrado");
  if (batch.estado === "verificado") throw new Error("Este lote ya fue verificado");
  if (batch.expiraEn < new Date()) {
    await prisma.batchPago.update({ where: { id: batchId }, data: { estado: "expirado" } });
    throw new Error(
      "El lote expiró — la tasa congelada ya no es válida. Genera un lote nuevo con tasa fresca antes de pagar."
    );
  }

  const red = resolverRedPago(batch.red, batch.token);
  const cliente = createPublicClient({ transport: http(red.rpcUrl) });

  const receipt = await cliente.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!receipt) {
    throw new Error(`No se encontró la transacción ${txHash} en ${red.red} — confirma que ya fue minada`);
  }
  if (receipt.status !== "success") {
    throw new Error(`La transacción ${txHash} está revertida (status: ${receipt.status}) — no cuenta como pago`);
  }

  // Decodifica todos los Transfer del contrato USDC dentro del tx (cubre
  // tanto un transfer suelto como el batch de una Safe con n transfers).
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === red.tokenAddress.toLowerCase())
    .map((l) => ({ to: (l.args.to as string).toLowerCase(), value: l.args.value as bigint }));

  // Cada item debe tener un Transfer con destino y monto EXACTOS. Se consume
  // el transfer al matchear para que dos items al mismo destino requieran
  // dos transfers (no reutilizar el mismo log).
  const disponibles = [...transfers];
  const detalle = batch.items.map((item) => {
    const unidadesEsperadas = BigInt(Math.round(item.montoUsdc * 1_000_000));
    const idx = disponibles.findIndex(
      (t) => t.to === item.destinoWallet.toLowerCase() && t.value === unidadesEsperadas
    );
    const confirmado = idx >= 0;
    if (confirmado) disponibles.splice(idx, 1);
    return { destinoWallet: item.destinoWallet, montoUsdc: item.montoUsdc, confirmado };
  });

  const todosConfirmados = detalle.every((d) => d.confirmado);

  await conAuditoria(usuarioId, async (tx) => {
    await tx.batchPago.update({
      where: { id: batchId },
      data: {
        estado: todosConfirmados ? "verificado" : "fallido_verificacion",
        txHash,
        verificadoEn: todosConfirmados ? new Date() : null,
      },
    });
    if (todosConfirmados) {
      try {
        await actualizarPeriodoConVersion(tx, batch.periodoId, batch.periodo.version, { estado: "pagado" });
      } catch (err) {
        // Si otra sesión movió el periodo mientras se verificaba, el batch
        // queda verificado (el pago on-chain ES un hecho) pero la transición
        // del periodo se reporta como conflicto para que la UI recargue.
        if (err instanceof ErrorConflicto) throw err;
        throw err;
      }
    }
  });

  return { estado: todosConfirmados ? "verificado" : "fallido_verificacion", detalle };
}
