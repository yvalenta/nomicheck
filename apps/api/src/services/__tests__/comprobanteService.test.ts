// Tests de la constancia de pago verificable. Mockean `viem` (el receipt
// on-chain) y la tasa para ser deterministas; el lote de entrada se genera con
// el `ejecutarBatchPagoOnchain` REAL para que la firma que se autentica sea
// una firma de verdad, no una fabricada por el test.
//
// El foco está en las propiedades que hacen que el documento valga algo:
//   - un lote alterado NO produce constancia (si esto falla, el resto es humo)
//   - la wallet solo ve lo suyo
//   - se emite aunque el lote esté vencido (el pago ya ocurrió)
//   - toda línea trae prueba verificable
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

const REGLAS: ReglaLegal[] = [
  { clave: "pago_onchain_prima_pct", valor: 0, vigenteDesde: "2026-01-01" },
  { clave: "pago_onchain_ventana_horas", valor: 6, vigenteDesde: "2026-01-01" },
];

const SNAPSHOT = {
  trm: 4000,
  fuente: "TEST — TRM fija",
  fechaTrm: "2026-07-24",
  primaPct: 0,
  tasaEfectiva: 4000,
  capturadoEn: "2026-07-24T12:00:00.000Z",
  hash: "a".repeat(64),
};

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const AJENA = "0x9999999999999999999999999999999999999999";
const PAGADOR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const TX = `0x${"c".repeat(64)}`;

// Estado que cada test moldea antes de llamar al servicio.
let receiptMock: unknown = null;
let logsMock: { args: { from: string; to: string; value: bigint }; address: string }[] = [];

vi.mock("../nominaService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nominaService.js")>()),
  obtenerReglasYFestivos: vi.fn(async () => ({ reglas: REGLAS, festivos: [] as Festivo[] })),
}));
vi.mock("../tasaCambioService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tasaCambioService.js")>()),
  capturarTasaSnapshot: vi.fn(async () => SNAPSHOT),
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(() => ({
    getTransactionReceipt: vi.fn(async () => {
      if (!receiptMock) throw new Error("not found");
      return receiptMock;
    }),
  })),
  parseEventLogs: vi.fn(() => logsMock),
}));

const { ejecutarBatchPagoOnchain } = await import("../batchPagoOnchainService.js");
const {
  emitirComprobantes,
  ErrorLoteNoAutentico,
  ErrorWalletSinItems,
  ErrorPagoNoConfirmado,
  ErrorPagoNoCoincide,
} = await import("../comprobanteService.js");
const { verificarFirma } = await import("../batchSignatureService.js");
import type { BatchPagoOnchainOutput } from "../../validation/batchPagoOnchain.js";

/** 4.000.000 COP / 4000 = 1000 USDC = 1_000_000_000 unidades. */
const UNIDADES_W1 = 1_000_000_000n;
const UNIDADES_W2 = 500_000_000n;

function transfer(to: string, value: bigint) {
  return { address: USDC, args: { from: PAGADOR, to, value } };
}

async function loteDeDos(): Promise<BatchPagoOnchainOutput> {
  return ejecutarBatchPagoOnchain({
    version: "1",
    buyer: { noExternalLlm: true },
    red: "base",
    token: "USDC",
    pagos: [
      { externalId: "C-1", montoCop: 4_000_000, walletAddress: W1 },
      { externalId: "C-2", montoCop: 2_000_000, walletAddress: W2 },
    ],
  });
}

beforeEach(() => {
  receiptMock = { status: "success", blockNumber: 49_148_323n, logs: [] };
  logsMock = [transfer(W1, UNIDADES_W1), transfer(W2, UNIDADES_W2)];
});

describe("emitirComprobantes", () => {
  it("emite la constancia con el pago leído de la cadena, no de lo declarado", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    expect(c.tipo).toBe("constancia_pago_verificable");
    expect(c.beneficiario).toEqual({ wallet: W1, externalId: "C-1" });
    expect(c.pago.txHash).toBe(TX);
    expect(c.pago.bloque).toBe("49148323");
    expect(c.pago.unidades).toBe(UNIDADES_W1.toString());
    // El pagador NO viene del input: sale del log Transfer.
    expect(c.pago.desdeWallet).toBe(PAGADOR);
    expect(c.pago.montoUsdc).toBe(1000);
  });

  it("rechaza un lote alterado — un peso de más invalida la firma", async () => {
    const lote = await loteDeDos();
    const adulterado = {
      ...lote,
      items: lote.items.map((i) => (i.externalId === "C-1" ? { ...i, montoCop: i.montoCop + 1 } : i)),
    };
    await expect(emitirComprobantes(adulterado, TX, W1)).rejects.toThrow(ErrorLoteNoAutentico);
  });

  it("rechaza cualquier cosa que no sea un lote firmado por nosotros", async () => {
    await expect(emitirComprobantes({ items: [] }, TX, W1)).rejects.toThrow(ErrorLoteNoAutentico);
    await expect(emitirComprobantes(null, TX, W1)).rejects.toThrow(ErrorLoteNoAutentico);
  });

  it("solo entrega las líneas de la wallet que pregunta", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W2);

    expect(c.beneficiario.externalId).toBe("C-2");
    // El otro contratista no aparece por ningún lado del documento.
    const serializado = JSON.stringify(c);
    expect(serializado).not.toContain("C-1");
    expect(serializado.toLowerCase()).not.toContain(W1.toLowerCase());
  });

  it("no emite nada para una wallet ajena al lote", async () => {
    const lote = await loteDeDos();
    await expect(emitirComprobantes(lote, TX, AJENA)).rejects.toThrow(ErrorWalletSinItems);
  });

  it("emite aunque el lote esté vencido — el pago ya es un hecho pasado", async () => {
    const lote = await loteDeDos();
    // Se avanza el reloj en vez de editar `expiraEn`: alterar el campo rompería
    // la firma y el test pasaría por el motivo equivocado. Este test es la
    // guarda de regresión de la decisión comentada en el servicio — si alguien
    // agrega una validación de vencimiento a la emisión, esto se pone rojo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(lote.expiraEn) + 86_400_000));
    const [c] = await emitirComprobantes(lote, TX, W1);
    expect(c.pago.montoUsdc).toBe(1000);
    vi.useRealTimers();
  });

  it("distingue tx revertida de monto que no cuadra", async () => {
    const lote = await loteDeDos();

    receiptMock = { status: "reverted", blockNumber: 1n, logs: [] };
    await expect(emitirComprobantes(lote, TX, W1)).rejects.toThrow(ErrorPagoNoConfirmado);

    receiptMock = { status: "success", blockNumber: 1n, logs: [] };
    logsMock = [transfer(W1, UNIDADES_W1 - 1n)];
    await expect(emitirComprobantes(lote, TX, W1)).rejects.toThrow(ErrorPagoNoCoincide);
  });

  it("falla si la transacción no existe en la red", async () => {
    const lote = await loteDeDos();
    receiptMock = null;
    await expect(emitirComprobantes(lote, TX, W1)).rejects.toThrow(ErrorPagoNoConfirmado);
  });

  it("no reutiliza un mismo Transfer para dos items iguales", async () => {
    const lote = await ejecutarBatchPagoOnchain({
      version: "1",
      buyer: { noExternalLlm: true },
      red: "base",
      token: "USDC",
      pagos: [
        { externalId: "A", montoCop: 4_000_000, walletAddress: W1 },
        { externalId: "B", montoCop: 4_000_000, walletAddress: W1 },
      ],
    });

    // Un solo Transfer en la tx: alcanza para uno de los dos items, no para ambos.
    logsMock = [transfer(W1, UNIDADES_W1)];
    await expect(emitirComprobantes(lote, TX, W1)).rejects.toThrow(ErrorPagoNoCoincide);

    // Con los dos Transfer sí salen las dos constancias.
    logsMock = [transfer(W1, UNIDADES_W1), transfer(W1, UNIDADES_W1)];
    const cs = await emitirComprobantes(lote, TX, W1);
    expect(cs.map((c) => c.beneficiario.externalId)).toEqual(["A", "B"]);
  });

  it("toda línea trae una prueba verificable y ninguna queda sin referencia", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    expect(c.lineas.length).toBeGreaterThan(0);
    for (const l of c.lineas) {
      expect(l.prueba.referencia).toBeTruthy();
      expect(l.prueba.verificarEn).toMatch(/^https?:\/\//);
      expect(l.prueba.demuestra.length).toBeGreaterThan(20);
    }
    // La línea del dinero recibido apunta al explorador, no a nosotros.
    const recibido = c.lineas.find((l) => l.clave === "recibido_usdc");
    expect(recibido?.prueba.verificarEn).toContain("basescan.org");
    expect(recibido?.prueba.tipo).toBe("onchain_transfer");
  });

  it("firma la constancia y la firma cubre cada campo", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    expect(verificarFirma(c, c.signature)).toBe(true);
    expect(verificarFirma({ ...c, pago: { ...c.pago, montoUsdc: 9999 } }, c.signature)).toBe(false);
    expect(verificarFirma({ ...c, beneficiario: { ...c.beneficiario, wallet: AJENA } }, c.signature)).toBe(false);
  });

  it("conserva la cadena de custodia hacia el lote origen", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    expect(c.cadenaDeCustodia.loteFirmaValor).toBe(lote.signature.valor);
    expect(c.cadenaDeCustodia.lotePublicKeyId).toBe(lote.signature.publicKeyId);
  });

  // Un `verificarEn` que apunta a una ruta inexistente es peor que no ponerlo:
  // el documento invita a comprobar algo y entrega un 404. Ya paso una vez
  // (prometia /api/batch/public-key cuando la ruta es /publickey), asi que
  // queda como invariante en vez de depender de que alguien lo note.
  it("cada URL de verificacion apunta a una ruta que existe", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    const rutas = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../routes/batchPublico.ts", import.meta.url), "utf8")
    );
    // El router se monta en /api/batch (routes/index.ts).
    const declaradas = [...rutas.matchAll(/batchPublicoRouter\.(?:get|post)\("([^"]+)"/g)].map(
      (m) => `/api/batch${m[1]}`
    );

    const promesasBatch = c.lineas
      .map((l) => new URL(l.prueba.verificarEn).pathname)
      .filter((p) => p.startsWith("/api/batch"));

    expect(promesasBatch.length).toBeGreaterThan(0);
    for (const p of promesasBatch) expect(declaradas).toContain(p);
  });

  it("declara que NO es documento tributario", async () => {
    const lote = await loteDeDos();
    const [c] = await emitirComprobantes(lote, TX, W1);

    expect(c.naturalezaJuridica).toContain("NO es documento soporte");
    expect(c.naturalezaJuridica).toContain("000013");
    // El límite CST art. 134-136 viaja heredado del disclaimer del lote.
    expect(c.disclaimer).toContain("CST art. 134-136");
    expect(c.habeasData.persistidoEnBd).toBe(false);
  });
});
