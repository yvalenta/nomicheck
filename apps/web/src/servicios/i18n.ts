// Toda la copia de la landing, en los dos idiomas.
//
// Dos decisiones que vale la pena dejar escritas:
//
// 1. **El español va en latinoamericano neutro (tuteo).** No es preferencia de
//    estilo: NomiCheck calcula nómina colombiana, y el voseo marca el texto
//    como rioplatense frente a quien lo lee. "Pruébalo", no "probalo".
//
// 2. **El idioma se detecta pero se puede cambiar.** Detectar y no dejar
//    cambiar es peor que no detectar: un navegador configurado en inglés en
//    Bogotá es común, y dejar a esa persona sin salida es un error que no se
//    ve desde acá. Por eso hay selector, y la elección se recuerda.
//
// El verificador público de ynt.codes ya es bilingüe EN/ES; esto sigue el
// mismo criterio.

export type Idioma = "es" | "en";
export type Audiencia = "persona" | "empresa" | "bot";

export type IconoCapacidad =
  | "receipt"
  | "calendar"
  | "share"
  | "users"
  | "percent"
  | "wallet"
  | "plug"
  | "shield"
  | "hash";

export interface Capacidad {
  icono: IconoCapacidad;
  titulo: string;
  detalle: string;
}

export interface PerfilAudiencia {
  etiqueta: string;
  gancho: string;
  titular: string;
  bajada: string;
  capacidades: Capacidad[];
}

export interface Textos {
  htmlLang: string;
  /** Locale para formatear moneda y fechas. El cálculo es colombiano: los
   *  pesos se escriben igual en las dos versiones, cambia el idioma alrededor. */
  locale: string;
  hero: { eyebrow: string; titulo1: string; titulo2: string; bajada: string };
  datos: { servicios: string; parametros: string; reglas: string; llave: string };
  agente: { titulo: string; orden: string; copiar: string; copiado: string; pago: string };
  audiencias: Record<Audiencia, PerfilAudiencia>;
  calculadora: {
    insignia: string;
    titulo: string;
    bajada: string;
    formTitulo: string;
    formBajada: string;
    salario: string;
    ingreso: string;
    retiro: string;
    vacaciones: string;
    auxilio: string;
    calcular: string;
    calculando: string;
    nota: string;
    vacio: string;
    resultadoTitulo: string;
    reglasAl: string;
    total: string;
    firmado: string;
    llave: string;
    hashCatalogo: string;
    verificar: string;
    error402: string;
    errorGenerico: string;
    cargando: string;
  };
  comparador: {
    titulo: string;
    bajada: string;
    volumen: string;
    minutosHoy: string;
    costoHora: string;
    minutosPortal: string;
    trm: string;
    hoy: string;
    comoEmpresa: string;
    comoAgente: string;
    porMes: string;
    ahorroTitulo: string;
    ahorroPie: string;
    supuestosTitulo: string;
    supuestos: string[];
    sinPrecio: string;
    detalleAgente: string;
    detalleEmpresa: string;
    detalleHoy: string;
  };
  catalogo: {
    titulo: string;
    bajada: string;
    gratis: string;
    paraVos: string;
    leyendo: string;
    sinCatalogo: string;
    verSwagger: string;
  };
  confianza: {
    titulo: string;
    bajada: string;
    puntos: { titulo: string; texto: string }[];
    cta: string;
  };
  footer: string;
  selectorIdioma: string;
}

/** Títulos de las operaciones en inglés, por `operationId`.
 *
 *  El catálogo (qué servicios existen, qué cuestan, en qué ruta) se sigue
 *  leyendo del OpenAPI vivo — eso NO se escribe acá y es lo que impide que la
 *  página mienta. Lo único que vive en esta tabla es cómo se llama cada
 *  operación en inglés, porque el `summary` del servidor está en español. Si
 *  aparece un `operationId` que no está acá, se muestra el del servidor: es
 *  preferible un título en español que un hueco. */
export const TITULOS_EN: Record<string, string> = {
  "payroll-settlement": "Run payroll for a period",
  "withholding-tax": "Compute income-tax withholding",
  "payslip-verification": "Check whether a payslip is correct",
  "final-settlement": "Settle a terminated contract",
  "usdc-contractor-payout": "Build a USDC contractor payout batch",
};

const ES: Textos = {
  htmlLang: "es",
  locale: "es-CO",
  hero: {
    eyebrow: "Nómina colombiana · cálculo determinístico · salida firmada",
    titulo1: "La misma ley.",
    titulo2: "Tres formas de usarla.",
    bajada:
      "Persona, empresa o agente: el mismo motor, el mismo hash del catálogo legal y la misma firma. Lo único que cambia es cómo se pide — y qué haces con la respuesta.",
  },
  datos: {
    servicios: "Servicios",
    parametros: "Parámetros legales",
    reglas: "Reglas verificadas al",
    llave: "Llave de firma",
  },
  agente: {
    titulo: "Pásale esto a tu agente",
    orden:
      "Lee https://nomicheck.ynt.codes/api/batch/openapi.json y usa los endpoints de NomiCheck para calcular nómina colombiana. Cada respuesta viene firmada con Ed25519; la llave está en /api/batch/publickey.",
    copiar: "Copiar",
    copiado: "Copiado",
    pago: "pago: HTTP 402 (x402)",
  },
  audiencias: {
    persona: {
      etiqueta: "Soy una persona",
      gancho: "quiero saber si me pagaron bien",
      titular: "Tu comprobante, recalculado desde la ley.",
      bajada:
        "Pon lo que te pagaron y el motor recalcula cada línea contra el artículo que la obliga. Si falta plata, te dice cuánta y por qué. No pide tu nombre ni tu documento.",
      capacidades: [
        {
          icono: "receipt",
          titulo: "Revisar una quincena o un mes",
          detalle:
            "Recargos, nocturnos, dominicales y extras se recalculan uno por uno y se comparan con lo que te liquidaron.",
        },
        {
          icono: "calendar",
          titulo: "Saber cuánto te deben al salir",
          detalle:
            "Cesantías, intereses, prima y vacaciones pendientes, cada concepto desde su propio corte. Gratis, aquí abajo.",
        },
        {
          icono: "share",
          titulo: "Llevarlo a donde haga falta",
          detalle:
            "El resultado viene firmado: un tercero puede verificarlo sin volver a preguntarnos nada y sin confiar en nosotros.",
        },
      ],
    },
    empresa: {
      etiqueta: "Somos una empresa",
      gancho: "queremos liquidar bien y poder probarlo",
      titular: "Liquidar es fácil. Demostrar que está bien, no.",
      bajada:
        "El mismo motor determinístico para toda la nómina, con la norma citada línea por línea y una firma que convierte cada liquidación en evidencia — la misma que sirve ante una inspección o una demanda.",
      capacidades: [
        {
          icono: "users",
          titulo: "Nómina del periodo y liquidaciones finales",
          detalle:
            "Por lote, con los supuestos declarados en la respuesta: lo que no se informó se dice, en vez de asumirse en silencio.",
        },
        {
          icono: "percent",
          titulo: "Retención en la fuente",
          detalle:
            "Depuración del art. 383/388 del E.T. sobre parámetros numéricos. Piso 2023: antes de esa fecha lanza en vez de devolver un número plausible y falso.",
        },
        {
          icono: "wallet",
          titulo: "Pagar contratistas en USDC",
          detalle:
            "Arma el lote con la tasa congelada y los links de pago. El servidor nunca custodia ni firma: los fondos los mueve tu wallet.",
        },
      ],
    },
    bot: {
      etiqueta: "Soy un agente",
      gancho: "quiero integrarme y pagar por llamada",
      titular: "Endpoints sin estado, salida firmada, pago por petición.",
      bajada:
        "JSON entra, JSON firmado sale. El contrato está publicado en OpenAPI, la llave pública es un GET gratis, y el pago va sobre HTTP 402 — sin cuenta, sin API key, sin onboarding.",
      capacidades: [
        {
          icono: "plug",
          titulo: "Integrar antes de pagar",
          detalle:
            "El esquema de entrada, el ejemplo y la llave pública son GET libres. Puedes probar el contrato entero y solo después decidir.",
        },
        {
          icono: "shield",
          titulo: "Verificar la respuesta por tu cuenta",
          detalle:
            "En x402 el pago es inmediato y final: no hay escrow ni disputa. La firma Ed25519 es la única protección que te queda, y por eso está en cada respuesta.",
        },
        {
          icono: "hash",
          titulo: "Saber con qué reglas se calculó",
          detalle:
            "Cada salida trae `reglasHash` y `reglasVerificadasAl`. Si el catálogo legal cambia, el hash cambia — y tu resultado viejo sigue siendo verificable contra el suyo.",
        },
      ],
    },
  },
  calculadora: {
    insignia: "Gratis, sin cuenta",
    titulo: "Pruébalo ahora con el cálculo más caro de equivocar.",
    bajada:
      "La liquidación final es donde más plata se pierde y donde más difícil es notarlo: cada concepto se liquida desde su propio corte, y liquidarlos todos desde la fecha de ingreso paga otra vez lo ya pagado. Esto corre contra el mismo endpoint que usa un cliente que paga.",
    formTitulo: "Liquidación final",
    formBajada:
      "Cesantías, sus intereses, prima y vacaciones pendientes al retiro. Se calcula en el servidor y vuelve firmado.",
    salario: "Salario base mensual",
    ingreso: "Ingreso",
    retiro: "Retiro",
    vacaciones: "Días de vacaciones ya tomados",
    auxilio: "Recibe auxilio de transporte",
    calcular: "Calcular gratis",
    calculando: "Calculando…",
    nota: "No pide nombre ni documento. El cálculo es anónimo por diseño, y el empleador viaja como (no declarada) en la respuesta firmada — antes que inventar un dato dentro de un documento que después se verifica.",
    vacio:
      "Llena el formulario y el resultado aparece aquí: cada concepto con el artículo que lo obliga, y la firma con la que puedes verificarlo por tu cuenta.",
    resultadoTitulo: "Liquidación final calculada",
    reglasAl: "reglas verificadas al",
    total: "Total a liquidar",
    firmado: "Firmado y verificable por tu cuenta",
    llave: "llave",
    hashCatalogo: "hash del catálogo",
    verificar: "Verificar la firma en el verificador público",
    error402: "Este cálculo pasó a ser de pago (HTTP 402). El catálogo de abajo dice cuánto.",
    errorGenerico: "No se pudo calcular",
    cargando: "Cargando la calculadora…",
  },
  comparador: {
    titulo: "Cuánto cuesta, y contra qué lo estás comparando",
    bajada:
      "Los supuestos de abajo son tuyos: cámbialos y el gráfico se mueve. Lo único que ponemos nosotros es el precio por llamada, y ese sale del servidor — no de esta página.",
    volumen: "Liquidaciones al mes",
    minutosHoy: "Minutos que toma hoy cada una",
    costoHora: "Costo de esa hora (COP)",
    minutosPortal: "Minutos con el portal",
    trm: "Pesos por dólar (TRM)",
    hoy: "Como lo haces hoy",
    comoEmpresa: "Como empresa",
    comoAgente: "Como agente",
    porMes: "al mes",
    ahorroTitulo: "Diferencia al mes",
    ahorroPie: "Con tus números, contra hacerlo como lo haces hoy.",
    supuestosTitulo: "Lo que este cálculo está suponiendo",
    supuestos: [
      "El mismo endpoint cuesta lo mismo para una empresa que para un agente: lo que cambia no es el precio, es cuánto tiempo humano hace falta para pedirlo.",
      "«Como agente» supone cero minutos de persona: el agente arma el JSON, llama y lee la respuesta firmada.",
      "La TRM es un supuesto tuyo, no una tasa que consultemos acá.",
      "No incluye el costo de equivocarse, que es el que motiva el producto y el único que no se puede estimar con una regla de tres.",
    ],
    sinPrecio:
      "Este endpoint todavía no publica precio, así que el costo por llamada se muestra en cero. Cuando el muro se encienda, esto cambia solo.",
    detalleHoy: "minutos × costo hora × volumen",
    detalleEmpresa: "minutos con portal × costo hora × volumen + llamadas",
    detalleAgente: "solo el precio por llamada × volumen",
  },
  catalogo: {
    titulo: "Todo lo que sabe calcular",
    bajada:
      "Esta lista no está escrita en la página: se lee del contrato OpenAPI que el servidor publica, con el precio que cobra hoy. Si mañana cambia, cambia aquí sola.",
    gratis: "Gratis",
    paraVos: "Para lo tuyo",
    leyendo: "Leyendo el catálogo del servidor…",
    sinCatalogo: "No se pudo leer el catálogo en vivo. Está en",
    verSwagger: "Abrir el contrato completo en Swagger",
  },
  confianza: {
    titulo: "No te pedimos que nos creas.",
    bajada:
      "Cada respuesta viaja firmada con Ed25519 sobre el payload completo, con el sha256 del catálogo legal que la produjo y la fecha en que ese catálogo se verificó. Un tercero puede comprobarla sin volver a llamarnos y sin confiar en nosotros.",
    puntos: [
      {
        titulo: "Firma sobre todo el payload",
        texto:
          "Ed25519, canonicalización por claves ordenadas en UTF-8. Cambiar un peso invalida la firma.",
      },
      {
        titulo: "El catálogo legal, con hash",
        texto:
          "reglasHash identifica exactamente qué normas produjeron el número. Si cambian, cambia el hash.",
      },
      {
        titulo: "La ley, línea por línea",
        texto:
          "Cada concepto cita el artículo que lo obliga. No es una cifra: es una cifra con su fundamento.",
      },
    ],
    cta: "Verificar una respuesta real, de un clic",
  },
  footer:
    "NomiCheck calcula sobre normativa laboral colombiana vigente y no sustituye asesoría legal ni contable. Los cálculos son determinísticos y no pasan por un modelo de lenguaje. Las calculadoras públicas son anónimas: no piden nombre ni documento.",
  selectorIdioma: "English",
};

const EN: Textos = {
  htmlLang: "en",
  locale: "es-CO", // el monto sigue siendo en pesos colombianos
  hero: {
    eyebrow: "Colombian payroll · deterministic engine · signed output",
    titulo1: "One law.",
    titulo2: "Three ways to use it.",
    bajada:
      "Person, company or agent: the same engine, the same legal-rules hash and the same signature. All that changes is how you ask — and what you do with the answer.",
  },
  datos: {
    servicios: "Services",
    parametros: "Legal parameters",
    reglas: "Rules verified on",
    llave: "Signing key",
  },
  agente: {
    titulo: "Send this to your agent",
    orden:
      "Read https://nomicheck.ynt.codes/api/batch/openapi.json and use the NomiCheck endpoints to compute Colombian payroll. Every response is Ed25519-signed; the public key is at /api/batch/publickey.",
    copiar: "Copy",
    copiado: "Copied",
    pago: "payment: HTTP 402 (x402)",
  },
  audiencias: {
    persona: {
      etiqueta: "I'm a person",
      gancho: "I want to know if I was paid correctly",
      titular: "Your payslip, recomputed from the law.",
      bajada:
        "Enter what you were paid and the engine recomputes every line against the article that mandates it. If money is missing, it tells you how much and why. It never asks for your name or ID.",
      capacidades: [
        {
          icono: "receipt",
          titulo: "Check a pay period",
          detalle:
            "Night, Sunday and overtime premiums are recomputed one by one and compared against what you were actually paid.",
        },
        {
          icono: "calendar",
          titulo: "Know what you're owed when you leave",
          detalle:
            "Severance, its interest, statutory bonus and unused vacation — each one from its own cutoff date. Free, right below.",
        },
        {
          icono: "share",
          titulo: "Take it wherever you need to",
          detalle:
            "The result comes signed: a third party can verify it without asking us anything and without trusting us.",
        },
      ],
    },
    empresa: {
      etiqueta: "We're a company",
      gancho: "we want to run payroll right and prove it",
      titular: "Running payroll is easy. Proving it was right is not.",
      bajada:
        "The same deterministic engine for the whole payroll, with the statute cited line by line and a signature that turns every settlement into evidence — the kind that holds up in an inspection or a lawsuit.",
      capacidades: [
        {
          icono: "users",
          titulo: "Payroll runs and final settlements",
          detalle:
            "In batch, with every assumption declared in the response: whatever you didn't report is stated, instead of being assumed silently.",
        },
        {
          icono: "percent",
          titulo: "Income-tax withholding",
          detalle:
            "Colombian tax code art. 383/388 over numeric inputs. Floor at 2023: before that date it throws instead of returning a plausible, wrong number.",
        },
        {
          icono: "wallet",
          titulo: "Pay contractors in USDC",
          detalle:
            "Builds the batch with a frozen FX rate and the payment links. The server never holds funds and never signs: your own wallet moves the money.",
        },
      ],
    },
    bot: {
      etiqueta: "I'm an agent",
      gancho: "I want to integrate and pay per call",
      titular: "Stateless endpoints, signed output, pay per request.",
      bajada:
        "JSON in, signed JSON out. The contract is published as OpenAPI, the public key is a free GET, and payment rides on HTTP 402 — no account, no API key, no onboarding.",
      capacidades: [
        {
          icono: "plug",
          titulo: "Integrate before paying",
          detalle:
            "The input schema, the worked example and the public key are free GETs. You can exercise the whole contract and only then decide.",
        },
        {
          icono: "shield",
          titulo: "Verify the answer yourself",
          detalle:
            "In x402 payment is immediate and final: no escrow, no dispute. The Ed25519 signature is the only protection you have left, which is why it ships with every response.",
        },
        {
          icono: "hash",
          titulo: "Know which rules produced the number",
          detalle:
            "Every output carries reglasHash and reglasVerificadasAl. If the legal catalog changes, the hash changes — and your old result stays verifiable against its own.",
        },
      ],
    },
  },
  calculadora: {
    insignia: "Free, no account",
    titulo: "Try it on the calculation that costs the most to get wrong.",
    bajada:
      "Final settlement is where the most money is lost and where it's hardest to notice: each item accrues from its own cutoff, and settling everything from the hire date pays again what was already paid. This runs against the very same endpoint a paying client uses.",
    formTitulo: "Final settlement",
    formBajada:
      "Severance, its interest, statutory bonus and unused vacation at termination. Computed on the server and returned signed.",
    salario: "Monthly base salary",
    ingreso: "Hire date",
    retiro: "Termination date",
    vacaciones: "Vacation days already taken",
    auxilio: "Receives transport allowance",
    calcular: "Calculate for free",
    calculando: "Calculating…",
    nota: "No name, no ID. The calculation is anonymous by design, and the employer travels as (no declarada) — “not declared” — inside the signed response, rather than inventing a value in a document meant to be verified.",
    vacio:
      "Fill in the form and the result shows up here: every item with the article that mandates it, and the signature you can verify yourself.",
    resultadoTitulo: "Final settlement computed",
    reglasAl: "rules verified on",
    total: "Total owed",
    firmado: "Signed and verifiable by you",
    llave: "key",
    hashCatalogo: "legal-rules hash",
    verificar: "Verify the signature in the public verifier",
    error402: "This calculation is now paid (HTTP 402). The catalog below says how much.",
    errorGenerico: "Could not compute",
    cargando: "Loading the calculator…",
  },
  comparador: {
    titulo: "What it costs, and what you're comparing it against",
    bajada:
      "The assumptions below are yours: change them and the chart moves. The only number we supply is the price per call, and that one comes from the server — not from this page.",
    volumen: "Settlements per month",
    minutosHoy: "Minutes each one takes today",
    costoHora: "Cost of that hour (COP)",
    minutosPortal: "Minutes using the portal",
    trm: "Pesos per dollar (FX)",
    hoy: "The way you do it today",
    comoEmpresa: "As a company",
    comoAgente: "As an agent",
    porMes: "per month",
    ahorroTitulo: "Difference per month",
    ahorroPie: "With your own numbers, against doing it the way you do it today.",
    supuestosTitulo: "What this calculation is assuming",
    supuestos: [
      "The same endpoint costs the same for a company and for an agent: what changes isn't the price, it's how much human time it takes to ask.",
      "\"As an agent\" assumes zero human minutes: the agent builds the JSON, calls, and reads the signed response.",
      "The FX rate is your assumption, not a rate we look up here.",
      "It excludes the cost of getting it wrong — the one that motivates the product, and the only one no rule of three can estimate.",
    ],
    sinPrecio:
      "This endpoint doesn't publish a price yet, so the per-call cost shows as zero. When the paywall goes live, this changes by itself.",
    detalleHoy: "minutes × hourly cost × volume",
    detalleEmpresa: "portal minutes × hourly cost × volume + calls",
    detalleAgente: "just the price per call × volume",
  },
  catalogo: {
    titulo: "Everything it knows how to compute",
    bajada:
      "This list is not written into the page: it's read from the OpenAPI contract the server publishes, with the price it charges today. If that changes tomorrow, this changes by itself.",
    gratis: "Free",
    paraVos: "For your case",
    leyendo: "Reading the catalog from the server…",
    sinCatalogo: "Could not read the live catalog. It lives at",
    verSwagger: "Open the full contract in Swagger",
  },
  confianza: {
    titulo: "We're not asking you to trust us.",
    bajada:
      "Every response is Ed25519-signed over the full payload, with the sha256 of the legal catalog that produced it and the date that catalog was verified. A third party can check it without calling us again and without trusting us.",
    puntos: [
      {
        titulo: "Signed over the whole payload",
        texto:
          "Ed25519, canonicalized with sorted keys over UTF-8. Change one peso and the signature breaks.",
      },
      {
        titulo: "The legal catalog, hashed",
        texto:
          "reglasHash identifies exactly which rules produced the number. If they change, the hash changes.",
      },
      {
        titulo: "The statute, line by line",
        texto:
          "Every item cites the article that mandates it. It isn't a figure: it's a figure with its grounds.",
      },
    ],
    cta: "Verify a real response, in one click",
  },
  footer:
    "NomiCheck computes against Colombian labor law in force and does not replace legal or accounting advice. Calculations are deterministic and never go through a language model. The public calculators are anonymous: they ask for no name and no ID.",
  selectorIdioma: "Español",
};

export const TEXTOS: Record<Idioma, Textos> = { es: ES, en: EN };

const CLAVE = "nomicheck.idioma";

/**
 * Idioma inicial: lo que la persona eligió antes; si no, lo que dice el
 * navegador; si no, español.
 *
 * El default es español y no inglés a propósito: el producto calcula nómina
 * colombiana, así que ante la duda el visitante más probable lee español.
 */
export function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "es" || guardado === "en") return guardado;
  } catch {
    // localStorage puede estar bloqueado (modo privado, cookies de terceros).
    // No es motivo para no mostrar la página: se sigue con la detección.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav.toLowerCase().startsWith("en") ? "en" : "es";
}

export function recordarIdioma(idioma: Idioma): void {
  try {
    localStorage.setItem(CLAVE, idioma);
  } catch {
    // Ver arriba: que no se pueda recordar no rompe nada de esta visita.
  }
}
