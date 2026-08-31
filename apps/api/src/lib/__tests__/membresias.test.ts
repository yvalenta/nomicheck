// Tests de `lib/membresias.ts` — el único lugar donde se otorga y se revoca la
// pertenencia a una empresa.
//
// Lo que se prueba acá NO es que las dos escrituras se hagan: es que después
// de cada una el INVARIANTE siga en pie —"el puntero jamás sobrevive a la baja
// de su membresía"—, que es lo que estaba roto. La revocación anterior ponía
// `empresaId = null` y dejaba viva la membresía, y la persona a la que
// acababan de sacar volvía sola con un `POST /auth/empresa-activa`: la prueba
// que faltaba no era "¿se borró la fila?" sino "¿queda alguna forma de
// volver?".
//
// Sin BD y sin mockear `lib/prisma.js`: estas funciones reciben el cliente
// transaccional como parámetro, así que la prueba le pasa una mini-base en
// memoria y lee el estado final. El `tx` es un objeto propio a propósito —
// igual que en `sedesService.test.ts`— porque si alguna escritura colgara del
// cliente global en vez del `tx`, quedaría fuera de la transacción del
// llamador y no se revertiría con las demás: acá directamente no existiría.
//
// La mini-base ordena SOLO si la consulta trae `orderBy`, y las filas se
// siembran en un orden distinto al de `creadoEn`. Si alguien le saca el orden
// a `membresiasDe`, el desempate de "a qué empresa cae el puntero" pasa a
// depender del orden físico de las filas y estas pruebas se ponen rojas.
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ErrorRolMembresiaDesconocido,
  ROLES_MEMBRESIA,
  esRolMembresia,
  membresiasDe,
  otorgarMembresia,
  revocarMembresia,
  type RolMembresia,
} from "../membresias.js";
import type { TxAcotada } from "../alcance.js";

// --- mini-base -------------------------------------------------------------

const UID_ANA = "11111111-1111-4111-8111-111111111111";
const UID_JEFE = "22222222-2222-4222-8222-222222222222";
const EMPRESA_3 = 3;
const EMPRESA_9 = 9;
const EMPRESA_12 = 12;
// Suspendida por admin_plataforma: `requiereAuth` responde 403 antes de
// adjuntar `req.usuario` cuando el puntero está parado en ella.
const EMPRESA_SUSPENDIDA = 40;

interface FilaMembresia {
  usuarioId: string;
  empresaId: number;
  rol: string;
  creadoEn: number;
}

interface FilaUsuario {
  id: string;
  rol: string;
  empresaId: number | null;
}

let bdMembresias: FilaMembresia[];
let bdUsuarios: FilaUsuario[];
const bdEmpresas: Record<number, { activa: boolean }> = {
  [EMPRESA_3]: { activa: true },
  [EMPRESA_9]: { activa: true },
  [EMPRESA_12]: { activa: true },
  [EMPRESA_SUSPENDIDA]: { activa: false },
};

type Orden = Record<string, "asc" | "desc">;

/** Ordena solo por lo que la consulta pidió. Sin `orderBy` devuelve el orden
 * de inserción — que es justo lo que hace una tabla real. */
function ordenar(filas: FilaMembresia[], orderBy: Orden | Orden[] | undefined): FilaMembresia[] {
  const criterios = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...filas].sort((a, b) => {
    for (const criterio of criterios) {
      const [campo, sentido] = Object.entries(criterio)[0]!;
      const va = a[campo as keyof FilaMembresia] as number | string;
      const vb = b[campo as keyof FilaMembresia] as number | string;
      if (va < vb) return sentido === "asc" ? -1 : 1;
      if (va > vb) return sentido === "asc" ? 1 : -1;
    }
    return 0;
  });
}

const txMock = {
  membresiaEmpresa: {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { usuarioId_empresaId: { usuarioId: string; empresaId: number } };
        create: { usuarioId: string; empresaId: number; rol: string };
        update: { rol: string };
      }) => {
        const { usuarioId, empresaId } = where.usuarioId_empresaId;
        const existente = bdMembresias.find((m) => m.usuarioId === usuarioId && m.empresaId === empresaId);
        if (existente) {
          existente.rol = update.rol;
          return { ...existente };
        }
        // `creadoEn` monótono: la fila nueva es siempre la más joven, como el
        // DEFAULT CURRENT_TIMESTAMP de la migración.
        const fila = { ...create, creadoEn: Date.now() + bdMembresias.length };
        bdMembresias.push(fila);
        return { ...fila };
      }
    ),
    findMany: vi.fn(
      async ({ where, orderBy }: { where: { usuarioId: string }; orderBy?: Orden | Orden[] }) =>
        ordenar(
          bdMembresias.filter((m) => m.usuarioId === where.usuarioId),
          orderBy
        ).map((m) => ({ empresaId: m.empresaId, rol: m.rol, empresa: bdEmpresas[m.empresaId]! }))
    ),
    deleteMany: vi.fn(async ({ where }: { where: { usuarioId: string; empresaId: number } }) => {
      const antes = bdMembresias.length;
      bdMembresias = bdMembresias.filter(
        (m) => !(m.usuarioId === where.usuarioId && m.empresaId === where.empresaId)
      );
      return { count: antes - bdMembresias.length };
    }),
  },
  usuario: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = bdUsuarios.find((x) => x.id === where.id);
      return u ? { ...u } : null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<FilaUsuario> }) => {
        const u = bdUsuarios.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return { ...u };
      }
    ),
  },
};

const tx = txMock as unknown as TxAcotada;

/** Lo que una fila `Usuario` dice de sí misma después de la operación: el rol
 * de cuenta y dónde está parada. */
function perfil(id: string) {
  const u = bdUsuarios.find((x) => x.id === id)!;
  return { rol: u.rol, empresaId: u.empresaId };
}

/** Las empresas a las que la cuenta sigue perteniendo — o sea, las únicas que
 * `cambiarEmpresaActiva` podría encontrar por la PK del par. */
function pertenenciaDe(id: string): number[] {
  return bdMembresias.filter((m) => m.usuarioId === id).map((m) => m.empresaId);
}

beforeEach(() => {
  vi.clearAllMocks();
  bdMembresias = [];
  bdUsuarios = [
    { id: UID_ANA, rol: "individual", empresaId: null },
    { id: UID_JEFE, rol: "admin_plataforma", empresaId: null },
  ];
});

// --- otorgarMembresia ------------------------------------------------------

describe("otorgarMembresia", () => {
  it("crea la membresía Y mete el puntero en ella cuando la cuenta no estaba parada en ninguna empresa", async () => {
    // Es el caso de `POST /api/auth/registro`: sin esta escritura la cuenta
    // nace con puntero y sin membresía, que en `requiereAuth` es 403 en TODOS
    // los endpoints —`whoami` incluido— y sin camino de vuelta.
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });

    expect(pertenenciaDe(UID_ANA)).toEqual([EMPRESA_3]);
    expect(perfil(UID_ANA)).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_3 });
  });

  it("es IDEMPOTENTE: dar de alta dos veces a la misma persona no revienta ni duplica la fila", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "analista_rrhh" });
    await expect(
      otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "analista_rrhh" })
    ).resolves.toBeUndefined();

    expect(bdMembresias).toHaveLength(1);
    expect(perfil(UID_ANA)).toEqual({ rol: "analista_rrhh", empresaId: EMPRESA_3 });
  });

  it("el alta repetida que no cambia nada NO escribe el Usuario (un UPDATE de más es una línea de auditoría falsa)", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "auditor" });
    expect(txMock.usuario.update).toHaveBeenCalledTimes(1);

    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "auditor" });
    // Sigue en una: el segundo alta no tenía nada que corregir.
    expect(txMock.usuario.update).toHaveBeenCalledTimes(1);
  });

  it("cambiar el rol de alguien que ya está: se pisa la membresía y se sincroniza el rol de cuenta", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "analista_rrhh" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "auditor" });

    expect(bdMembresias).toHaveLength(1);
    expect(bdMembresias[0]!.rol).toBe("auditor");
    expect(perfil(UID_ANA)).toEqual({ rol: "auditor", empresaId: EMPRESA_3 });
  });

  it("sumar una SEGUNDA empresa no le mueve el puntero de la que está usando", async () => {
    // El caso de uso que las membresías vinieron a habilitar: admin en una,
    // auditor en otra. Que la alta en la 9 la sacara de la 3 sería una sesión
    // que se teletransporta sola.
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "auditor" });

    expect(pertenenciaDe(UID_ANA).sort()).toEqual([EMPRESA_3, EMPRESA_9]);
    expect(perfil(UID_ANA)).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_3 });
  });

  it("a un admin_plataforma le crea la membresía pero NO le toca el rol ni el puntero", async () => {
    // Su "ver como" entra por una membresía temporal de rol auditor. Copiarle
    // ese rol encima de `Usuario.rol` lo degradaría a auditor para siempre:
    // el rol de la plataforma no sale de ninguna membresía.
    await otorgarMembresia(tx, { usuarioId: UID_JEFE, empresaId: EMPRESA_3, rol: "auditor" });

    expect(pertenenciaDe(UID_JEFE)).toEqual([EMPRESA_3]);
    expect(perfil(UID_JEFE)).toEqual({ rol: "admin_plataforma", empresaId: null });
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });
});

// --- otorgarMembresia · allowlist de roles ---------------------------------
//
// `MembresiaEmpresa.rol` es una columna `String` y `otorgarMembresia` es su
// único escritor: lo que no se filtre acá queda escrito en la columna de la
// que `requiereAuth` saca el rol EFECTIVO de cada request. Hoy no lo alcanza
// ningún camino HTTP (los llamadores pasan literales y `asignarStaff` viene de
// un `z.enum` cerrado) y `requierePermiso` falla cerrado ante un rol que no
// conoce — pero la red va donde se ESCRIBE, no donde se lee, así el próximo
// llamador no tiene que acordarse.
//
// El `as RolMembresia` de estas pruebas es el punto entero: representa
// exactamente los llamadores que el compilador no ve (una semilla `.mjs`, un
// `JSON.parse`, un cast). Si en vez de esto se probara con un rol válido, la
// prueba estaría midiendo el tipo, que no es el que corre en producción.

describe("otorgarMembresia · allowlist de roles", () => {
  it("un rol desconocido revienta ACÁ y no escribe absolutamente nada", async () => {
    await expect(
      otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "superadmin" as RolMembresia })
    ).rejects.toBeInstanceOf(ErrorRolMembresiaDesconocido);

    // Ni la membresía ni el puntero: la validación va ANTES del upsert, porque
    // una fila con un rol inventado no la borra nadie después.
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
    expect(pertenenciaDe(UID_ANA)).toEqual([]);
    expect(perfil(UID_ANA)).toEqual({ rol: "individual", empresaId: null });
  });

  it("el mensaje nombra el rol rechazado y los que sí valen (el que lea el log no tiene que abrir el archivo)", async () => {
    await expect(
      otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "auditorr" as RolMembresia })
    ).rejects.toThrow(/"auditorr".*admin_empresa, analista_rrhh, auditor, colaborador/s);
  });

  it("los dos roles de CUENTA no son roles de pertenencia: escribirlos en la columna es una contradicción", async () => {
    // `admin_plataforma` no pertenece a ninguna empresa (su acceso no depende
    // de eso) e `individual` es justo lo que queda CUANDO NO HAY membresía. Si
    // alguno entrara, `otorgarMembresia` además le sincronizaría el rol de
    // cuenta al puntero: una promoción a admin de la plataforma por upsert.
    for (const rol of ["admin_plataforma", "individual"]) {
      await expect(
        otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: rol as RolMembresia })
      ).rejects.toBeInstanceOf(ErrorRolMembresiaDesconocido);
    }
    expect(pertenenciaDe(UID_ANA)).toEqual([]);
  });

  it("los cuatro roles de pertenencia sí pasan — la allowlist no rompe ningún alta real", async () => {
    expect([...ROLES_MEMBRESIA]).toEqual(["admin_empresa", "analista_rrhh", "auditor", "colaborador"]);
    for (const rol of ROLES_MEMBRESIA) {
      await expect(
        otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol })
      ).resolves.toBeUndefined();
      expect(bdMembresias.find((m) => m.empresaId === EMPRESA_3)!.rol).toBe(rol);
    }
  });

  it("el 'ver como' del admin_plataforma sigue entrando: membresía de rol auditor, sin tocarle la cuenta", async () => {
    // La allowlist tenía que dejar pasar `auditor` justamente por esto. Si
    // alguien la estrechara a los tres roles "de empresa", el admin de la
    // plataforma perdería la única forma que tiene de mirar un tenant.
    await expect(
      otorgarMembresia(tx, { usuarioId: UID_JEFE, empresaId: EMPRESA_9, rol: "auditor" })
    ).resolves.toBeUndefined();
    expect(pertenenciaDe(UID_JEFE)).toEqual([EMPRESA_9]);
    expect(perfil(UID_JEFE)).toEqual({ rol: "admin_plataforma", empresaId: null });
  });

  it("esRolMembresia responde por la lista, no por una copia suya", () => {
    expect(esRolMembresia("analista_rrhh")).toBe(true);
    expect(esRolMembresia("admin_plataforma")).toBe(false);
    expect(esRolMembresia("")).toBe(false);
    expect(ROLES_MEMBRESIA.every((rol) => esRolMembresia(rol))).toBe(true);
  });
});

// --- revocarMembresia ------------------------------------------------------

describe("revocarMembresia", () => {
  it("BORRA la membresía: no queda ninguna forma de volver a entrar", async () => {
    // El agujero que esto cierra: la baja anterior ponía el puntero en null y
    // dejaba viva la fila. `whoami` seguía ofreciendo la empresa y un solo
    // `POST /auth/empresa-activa` devolvía el rol que le habían quitado —
    // porque `cambiarEmpresaActiva` encuentra la membresía por la PK del par
    // y con eso alcanza.
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "analista_rrhh" });
    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    expect(pertenenciaDe(UID_ANA)).toEqual([]);
    expect(perfil(UID_ANA)).toEqual({ rol: "individual", empresaId: null });
  });

  it("revocar la ACTIVA reapunta el puntero a otra membresía viva, con el rol de ESA empresa", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "auditor" });
    // Está parada en la 3 (la primera alta movió el puntero).
    expect(perfil(UID_ANA).empresaId).toBe(EMPRESA_3);

    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    expect(pertenenciaDe(UID_ANA)).toEqual([EMPRESA_9]);
    // El rol es el de la 9, no el que traía de la 3: si arrastrara
    // `admin_empresa` hasta acá, la baja en una empresa la promovería en otra.
    expect(perfil(UID_ANA)).toEqual({ rol: "auditor", empresaId: EMPRESA_9 });
  });

  it("revocar la ÚLTIMA deja el puntero en null y el rol de cuenta en individual", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "auditor" });

    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });
    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9 });

    expect(pertenenciaDe(UID_ANA)).toEqual([]);
    expect(perfil(UID_ANA)).toEqual({ rol: "individual", empresaId: null });
  });

  it("revocar una empresa que NO es la activa borra su membresía y NO mueve el puntero", async () => {
    // Quitarle a alguien la membresía de la 3 no puede desalojarlo de la 9,
    // donde sigue siendo miembro y está trabajando ahora mismo.
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "analista_rrhh" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "admin_empresa" });
    bdUsuarios[0]!.empresaId = EMPRESA_9;
    bdUsuarios[0]!.rol = "admin_empresa";
    // Las altas de arriba ya escribieron el Usuario: lo que se mide es si la
    // BAJA lo vuelve a tocar, así que el contador arranca de cero acá.
    vi.clearAllMocks();

    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    expect(pertenenciaDe(UID_ANA)).toEqual([EMPRESA_9]);
    expect(perfil(UID_ANA)).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_9 });
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("revocar dos veces (o a quien nunca estuvo) es inocuo: la baja ya está hecha, no es un error", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "auditor" });
    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    await expect(revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 })).resolves.toBeUndefined();
    await expect(revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_12 })).resolves.toBeUndefined();
    expect(perfil(UID_ANA)).toEqual({ rol: "individual", empresaId: null });
  });

  it("no manda el puntero a una empresa SUSPENDIDA aunque la membresía siga viva: eso encerraría la cuenta", async () => {
    // Con el puntero en una suspendida, `requiereAuth` responde 403 antes de
    // adjuntar `req.usuario` — incluido el request que intentara salir. La
    // membresía se conserva: la persona vuelve sola cuando la reactiven.
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_SUSPENDIDA, rol: "auditor" });

    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    expect(pertenenciaDe(UID_ANA)).toEqual([EMPRESA_SUSPENDIDA]);
    expect(perfil(UID_ANA)).toEqual({ rol: "individual", empresaId: null });
  });

  it("con varias vivas elige la más antigua ACTIVA, saltándose la suspendida que va primero", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_SUSPENDIDA, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "analista_rrhh" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_12, rol: "auditor" });

    await revocarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3 });

    expect(perfil(UID_ANA)).toEqual({ rol: "analista_rrhh", empresaId: EMPRESA_9 });
  });

  it("a un admin_plataforma con puntero le limpia el puntero y NO lo degrada a individual", async () => {
    // Invariante ya rota (el backfill excluye a admin_plataforma). Bajarle el
    // rol lo dejaría fuera de la plataforma entera por una fila que no usa.
    await otorgarMembresia(tx, { usuarioId: UID_JEFE, empresaId: EMPRESA_3, rol: "auditor" });
    bdUsuarios[1]!.empresaId = EMPRESA_3;

    await revocarMembresia(tx, { usuarioId: UID_JEFE, empresaId: EMPRESA_3 });

    expect(pertenenciaDe(UID_JEFE)).toEqual([]);
    expect(perfil(UID_JEFE)).toEqual({ rol: "admin_plataforma", empresaId: null });
  });
});

// --- membresiasDe ----------------------------------------------------------

describe("membresiasDe", () => {
  it("devuelve las membresías de la cuenta con el estado de su empresa, y ninguna ajena", async () => {
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa" });
    await otorgarMembresia(tx, { usuarioId: UID_ANA, empresaId: EMPRESA_SUSPENDIDA, rol: "auditor" });
    await otorgarMembresia(tx, { usuarioId: UID_JEFE, empresaId: EMPRESA_9, rol: "auditor" });

    expect(await membresiasDe(tx, UID_ANA)).toEqual([
      { empresaId: EMPRESA_3, rol: "admin_empresa", activa: true },
      { empresaId: EMPRESA_SUSPENDIDA, rol: "auditor", activa: false },
    ]);
  });

  it("orden estable por antigüedad: el desempate del puntero no puede depender del orden físico de las filas", async () => {
    // Se siembra al revés de como se creó para que el orden de inserción NO
    // sea el de `creadoEn`: sin `orderBy` en la consulta, esto sale al revés.
    bdMembresias = [
      { usuarioId: UID_ANA, empresaId: EMPRESA_12, rol: "auditor", creadoEn: 300 },
      { usuarioId: UID_ANA, empresaId: EMPRESA_9, rol: "analista_rrhh", creadoEn: 200 },
      { usuarioId: UID_ANA, empresaId: EMPRESA_3, rol: "admin_empresa", creadoEn: 100 },
    ];

    expect((await membresiasDe(tx, UID_ANA)).map((m) => m.empresaId)).toEqual([
      EMPRESA_3,
      EMPRESA_9,
      EMPRESA_12,
    ]);
  });

  it("cuenta sin ninguna membresía: lista vacía, no null (esto es camino de escritura, no degrada)", async () => {
    expect(await membresiasDe(tx, UID_ANA)).toEqual([]);
  });
});
