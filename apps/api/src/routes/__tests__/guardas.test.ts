// Ninguna ruta privada sin guarda — y la prueba lo comprueba RECORRIENDO el
// router montado, no leyendo `routes/index.ts` como texto.
//
// Por qué existe: el olvido no se ve. Una ruta nueva de empresa a la que se le
// olvidó el `...conPermiso(...)` compila, arranca, responde 200 y sirve la
// nómina de la empresa que diga el puntero a cualquiera que tenga sesión —
// incluida una cuenta `individual` del verificador anónimo. No hay tipo que lo
// atrape (Express acepta cualquier cantidad de handlers) y la revisión humana
// lo pasa por alto justo porque las cuarenta líneas de alrededor sí la tienen:
// la vista completa el patrón. Es la misma clase de bug que `lib/alcance.ts`
// cerró para los `where` sin empresa.
//
// La prueba recorre el stack de Express en vez de importar una tabla declarada
// aparte a propósito: una tabla que hay que acordarse de actualizar tiene el
// mismo modo de falla que la guarda que hay que acordarse de poner.
//
// NINGUNA PRUEBA TOCA LA BASE NI SUPABASE: importar el router arrastra todos
// los controladores y con ellos `lib/prisma.js` y `lib/supabaseAdmin.js` (que
// además explota en el import sin variables de entorno). Se cortan los dos y
// nada se ejecuta — solo se mira cómo quedó montado.
import { describe, expect, it, vi } from "vitest";
import { Router, type Request, type RequestHandler, type Response } from "express";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: {} } }));

import router from "../index.js";
import { esGuarda, requiereAuth, requierePermiso, requiereRol, type Guarda } from "../../middleware/auth.js";
import { puede, type Permiso } from "../../lib/permisos.js";

// Las rutas que exigen sesión + rol. Todo lo que cuelga de estos tres prefijos
// es privado por definición: el panel de la empresa, el portal del colaborador
// y el de plataforma. Lo público (el verificador anónimo, las calculadoras, el
// wrapper batch) vive fuera de ellos.
const PREFIJOS_PRIVADOS = ["/empresa/", "/colaborador/", "/admin/"];

// La forma interna del router de Express 5, declarada acá porque los tipos
// públicos no la exponen. Si una versión futura la cambia, esta prueba se cae
// con un error de forma — que es mejor que quedarse en verde por vacío (ver la
// prueba del piso más abajo).
interface CapaExpress {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: unknown }[];
  };
}

interface RutaMontada {
  metodo: string;
  ruta: string;
  handlers: unknown[];
}

function rutasDe(r: Router): RutaMontada[] {
  const capas = (r as unknown as { stack: CapaExpress[] }).stack;
  return capas.flatMap((capa) => {
    // `router.use(...)` (el wrapper batch, el MCP) no monta una ruta terminal.
    if (!capa.route) return [];
    const { path, methods, stack } = capa.route;
    const handlers = stack.map((s) => s.handle);
    return Object.keys(methods).map((metodo) => ({ metodo, ruta: path, handlers }));
  });
}

const esPrivada = (r: RutaMontada) => PREFIJOS_PRIVADOS.some((p) => r.ruta.startsWith(p));

/**
 * Qué le falta a una ruta para estar guardada. Lista vacía = está bien.
 *
 * El orden importa y por eso se comprueba: `requierePermiso` lee
 * `req.usuario.rol`, que lo adjunta `requiereAuth`. Montada al revés, la guarda
 * ve `req.usuario` undefined y responde 403 SIEMPRE — la ruta queda muerta en
 * vez de abierta, pero es igual de rota y nadie lo nota hasta que un rol
 * legítimo se queja.
 */
function faltas(r: RutaMontada): string[] {
  const problemas: string[] = [];
  const iAuth = r.handlers.indexOf(requiereAuth);
  const iGuarda = r.handlers.findIndex(esGuarda);

  if (iAuth === -1) problemas.push("no monta requiereAuth");
  if (iGuarda === -1) {
    problemas.push("no monta ninguna guarda de autorización");
    return problemas;
  }
  if (iAuth !== -1 && iGuarda < iAuth) problemas.push("la guarda corre ANTES de requiereAuth");
  // La matriz es la fuente (`lib/permisos.ts`): una ruta que enumera roles a
  // mano vuelve a abrir la divergencia entre lo que la API hace cumplir y lo
  // que la web dibuja, que es justo lo que la migración del 2026-08-31 cerró.
  if (!("permiso" in (r.handlers[iGuarda] as Guarda).exige)) {
    problemas.push("enumera roles en vez de pedir un permiso de la matriz");
  }
  return problemas;
}

/** El informe que se compara contra `[]`: una entrada por ruta con problemas,
 * nombrando cuál — un `expect(...).toBe(true)` diría "algo está mal" y
 * obligaría a ir a buscarlo a mano. */
function desguarnecidas(r: Router): string[] {
  return rutasDe(r)
    .filter(esPrivada)
    .map((ruta) => ({ ruta, problemas: faltas(ruta) }))
    .filter(({ problemas }) => problemas.length > 0)
    .map(({ ruta, problemas }) => `${ruta.metodo.toUpperCase()} ${ruta.ruta}: ${problemas.join("; ")}`);
}

const nada: RequestHandler = (_req: Request, res: Response) => {
  res.json({});
};

describe("el router privado", () => {
  it("no tiene una sola ruta sin requiereAuth + un permiso de la matriz", () => {
    expect(desguarnecidas(router)).toEqual([]);
  });

  it("no pasa por vacío: hay decenas de rutas privadas montadas de verdad", () => {
    // Sin este piso, un import que se rompa (o un cambio en la forma interna
    // del router de Express) dejaría la prueba de arriba comparando `[]` contra
    // `[]` y en verde para siempre. El número es un piso holgado, no el conteo
    // exacto: borrar una ruta no debe poner nada rojo.
    const privadas = rutasDe(router).filter(esPrivada);
    expect(privadas.length).toBeGreaterThanOrEqual(30);
  });

  it("cada ruta privada nombra un permiso de la matriz, y se puede listar", () => {
    // La otra mitad del valor: el mapa ruta→permiso se LEE del router, así que
    // la página de Roles y esta prueba no pueden divergir de lo que se hace
    // cumplir. Se afirman tres celdas de las que más duelen si cambian solas.
    const mapa = new Map(
      rutasDe(router)
        .filter(esPrivada)
        .map((r) => {
          const guarda = r.handlers.find(esGuarda) as Guarda;
          return [`${r.metodo} ${r.ruta}`, "permiso" in guarda.exige ? guarda.exige.permiso : null];
        })
    );
    expect(mapa.get("post /empresa/periodos/:id/batch-pago")).toBe("nomina.pagar");
    expect(mapa.get("post /empresa/periodos/:id/revertir")).toBe("nomina.revertir");
    expect(mapa.get("delete /empresa/empleados/:id")).toBe("empleados.eliminar");
    // El «entrar» del ver-como es acción de plataforma; el «salir» vive en
    // /auth a propósito (adentro el rol efectivo es auditor y /admin da 403).
    expect(mapa.get("post /admin/empresas/:id/entrar")).toBe("plataforma.empresas");
  });

  // La suite negativa del «ver como» (tarea 2026-08-31): no basta con que la
  // MATRIZ le niegue la escritura al auditor (permisos.test.ts ya lo afirma) —
  // acá se recorre cada ruta /empresa MONTADA y se exige que toda la que pide
  // un permiso de escritura se lo niegue al rol auditor. Si mañana una ruta
  // de escritura se cuelga con un permiso .ver por error, esta enumeración la
  // nombra; la de la matriz sola no la vería.
  it("toda ruta /empresa de escritura montada le queda vedada al rol auditor", () => {
    const deEscritura = rutasDe(router)
      .filter((r) => r.ruta.startsWith("/empresa/"))
      .map((r) => {
        const guarda = r.handlers.find(esGuarda) as Guarda;
        return { ruta: `${r.metodo} ${r.ruta}`, permiso: "permiso" in guarda.exige ? guarda.exige.permiso : null };
      })
      .filter((r): r is { ruta: string; permiso: Permiso } => r.permiso !== null && !r.permiso.endsWith(".ver"));

    // Guarda de la guarda: si el filtro quedara vacío, el for de abajo pasaría
    // en verde sin haber mirado nada.
    expect(deEscritura.length).toBeGreaterThanOrEqual(10);
    for (const { ruta, permiso } of deEscritura) {
      expect(puede("auditor", permiso), `${ruta} (${permiso})`).toBe(false);
    }
  });

  // La señal INDEPENDIENTE que la enumeración de arriba no tiene: aquella
  // deriva "escritura" del NOMBRE del permiso, que es justo lo que un
  // copy-paste corrompe — POST /empresa/sedes colgado de "sedes.ver" quedaba
  // FILTRADO (no nombrado) y el auditor habilitado para crear sedes, con la
  // suite en verde (verificado por mutación). El método HTTP no depende del
  // nombre: ninguna ruta /empresa que muta puede llevar un permiso .ver.
  it("ninguna ruta /empresa con método de escritura lleva un permiso .ver", () => {
    const sospechosas = rutasDe(router)
      .filter((r) => r.ruta.startsWith("/empresa/") && ["post", "put", "patch", "delete"].includes(r.metodo))
      .map((r) => {
        const guarda = r.handlers.find(esGuarda) as Guarda;
        return { ruta: `${r.metodo} ${r.ruta}`, permiso: "permiso" in guarda.exige ? guarda.exige.permiso : null };
      })
      .filter((r) => r.permiso !== null && r.permiso.endsWith(".ver"));

    expect(sospechosas).toEqual([]);
  });
});

describe("la prueba tiene dientes", () => {
  // Un router de mentira con las cuatro formas de equivocarse. Si alguna de
  // estas dejara de reportarse, la prueba de arriba estaría en verde por no
  // mirar, no por estar bien.
  it("reporta la ruta sin ninguna guarda", () => {
    const r = Router();
    r.get("/empresa/nueva", nada);
    expect(desguarnecidas(r)).toEqual([
      "GET /empresa/nueva: no monta requiereAuth; no monta ninguna guarda de autorización",
    ]);
  });

  it("reporta la ruta que solo pide sesión (el olvido más plausible)", () => {
    // El caso real: se copia una ruta de arriba, se cambia el handler y se
    // borra sin querer el permiso. Con sesión y sin permiso, un `individual`
    // entra al panel de la empresa.
    const r = Router();
    r.post("/empresa/nueva", requiereAuth, nada);
    expect(desguarnecidas(r)).toEqual(["POST /empresa/nueva: no monta ninguna guarda de autorización"]);
  });

  it("reporta la guarda montada antes de requiereAuth", () => {
    const r = Router();
    r.get("/colaborador/nueva", requierePermiso("recibos.propios.ver"), requiereAuth, nada);
    expect(desguarnecidas(r)).toEqual(["GET /colaborador/nueva: la guarda corre ANTES de requiereAuth"]);
  });

  it("reporta la ruta que vuelve a enumerar roles a mano", () => {
    const r = Router();
    r.delete("/admin/nueva", requiereAuth, requiereRol("admin_plataforma"), nada);
    expect(desguarnecidas(r)).toEqual([
      "DELETE /admin/nueva: enumera roles en vez de pedir un permiso de la matriz",
    ]);
  });

  it("una ruta bien montada no aparece en el informe", () => {
    const r = Router();
    r.put("/empresa/nueva", requiereAuth, requierePermiso("empresa.editar"), nada);
    expect(desguarnecidas(r)).toEqual([]);
  });
});

describe("las excepciones, dichas y no supuestas", () => {
  const todas = rutasDe(router);
  const buscar = (metodo: string, ruta: string) =>
    todas.find((r) => r.metodo === metodo && r.ruta === ruta);

  it("/auth/empresa-activa pide sesión pero NINGÚN permiso, a propósito", () => {
    // Cambiar de empresa no es una acción DENTRO de una empresa: la
    // autorización es la pertenencia, y la comprueba el servicio contra
    // MembresiaEmpresa. Un `requierePermiso` acá miraría el rol en la empresa
    // de la que el usuario se está yendo — la pregunta equivocada.
    const ruta = buscar("post", "/auth/empresa-activa");
    expect(ruta).toBeDefined();
    expect(ruta!.handlers).toContain(requiereAuth);
    expect(ruta!.handlers.some(esGuarda)).toBe(false);
  });

  it("/auth/vista-plataforma/salir pide sesión y NINGÚN permiso — un permiso acá ENCIERRA al admin", () => {
    // La excepción más frágil de todas: con la vista puesta el rol efectivo
    // es auditor, así que un requierePermiso("plataforma.*") le daría 403
    // exactamente a quien necesita salir. La cuenta se verifica en el
    // servicio (rol de CUENTA en la base). Verificado por mutación: con la
    // guarda montada, las 978 pruebas quedaban en verde y el admin preso.
    const ruta = buscar("post", "/auth/vista-plataforma/salir");
    expect(ruta).toBeDefined();
    expect(ruta!.handlers).toContain(requiereAuth);
    expect(ruta!.handlers.some(esGuarda)).toBe(false);
  });

  it("whoami exige sesión (el rol que devuelve sale de ella, no del cliente)", () => {
    expect(buscar("get", "/auth/whoami")?.handlers).toContain(requiereAuth);
  });

  it("el verificador anónimo sigue siendo anónimo", () => {
    // Promesa del producto, no un descuido: calcular una nómina no pide cuenta.
    // Si alguien monta `requiereAuth` acá, que sea con esta prueba en la mano.
    for (const publica of ["/nomina/calcular", "/indemnizacion/calcular", "/prima/calcular"]) {
      const ruta = buscar("post", publica);
      expect(ruta, publica).toBeDefined();
      expect(ruta!.handlers, publica).not.toContain(requiereAuth);
    }
  });
});
