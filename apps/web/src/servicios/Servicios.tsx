import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Building2,
  CalendarClock,
  Check,
  Copy,
  FileJson,
  FileSignature,
  Hash,
  Languages,
  Loader2,
  Percent,
  Plug,
  Receipt,
  Scale,
  Share2,
  ShieldCheck,
  Terminal,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { ORDEN_AUDIENCIAS } from "./audiencias";
import {
  TEXTOS,
  idiomaInicial,
  recordarIdioma,
  type Audiencia,
  type IconoCapacidad,
  type Idioma,
  type Textos,
} from "./i18n";
import CatalogoVivo from "./CatalogoVivo";
import { contactoDe } from "./catalogo";

const CalculadoraLiquidacion = lazy(() => import("./CalculadoraLiquidacion"));
// recharts es el vendor más pesado de la página: se baja al llegar acá, no al
// abrir la landing. Su chunk ya está separado en `vite.config.ts`.
const ComparadorCostos = lazy(() => import("./ComparadorCostos"));

// Landing de servicios: el mismo motor, visto desde las tres formas de usarlo.
//
// Regla que sostiene esta página: **nada de lo que afirma está escrito a mano.**
// El catálogo sale del OpenAPI vivo, el precio de `x-x402`, la fecha de las
// reglas y la llave pública de sus endpoints, y la calculadora del servidor.
// Una landing que promete números escritos en el JSX empieza a mentir el día
// que alguien cambia el producto y no se acuerda de esta carpeta.
//
// La copia —en español neutro y en inglés— vive en `i18n.ts`.

const ICONOS: Record<Audiencia, typeof User> = {
  persona: User,
  empresa: Building2,
  bot: Bot,
};

// Un ícono por capacidad. Antes las nueve tarjetas repetían la balanza, y una
// grilla con el mismo dibujo nueve veces deja de comunicar: el ojo lo lee como
// textura, no como información.
const ICONOS_CAPACIDAD: Record<IconoCapacidad, typeof User> = {
  receipt: Receipt,
  calendar: CalendarClock,
  share: Share2,
  users: Users,
  percent: Percent,
  wallet: Wallet,
  plug: Plug,
  shield: ShieldCheck,
  hash: Hash,
};

/** Lo que la página afirma sobre sí misma, leído del servidor. */
interface Vivo {
  publicKeyId: string | null;
  reglasVerificadasAl: string | null;
  parametros: number | null;
  operaciones: number | null;
  /** `x-x402.precioUsd` de `/liquidar` — el cálculo del que vive una empresa.
   *  Se lee del servidor y no se escribe acá, igual que todo lo demás. */
  precioLiquidarUsd: number | null;
  /** La dirección de contacto que el API publica en su OpenAPI. `null` mientras
   *  carga o si el servidor no la declara — y en ese caso NO se ofrece enlace:
   *  ver `contactoDe` en `catalogo.ts`, escrito sobre un `mailto:` que estuvo
   *  servido apuntando a un dominio inexistente. */
  contacto: string | null;
}

function useDatosVivos(): Vivo {
  const [v, setV] = useState<Vivo>({
    publicKeyId: null,
    reglasVerificadasAl: null,
    parametros: null,
    operaciones: null,
    precioLiquidarUsd: null,
    contacto: null,
  });

  useEffect(() => {
    let vivo = true;
    const json = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));

    Promise.all([
      json("/api/batch/publickey"),
      json("/api/batch/parametros"),
      json("/api/batch/openapi.json"),
    ])
      .then(([llave, params, doc]) => {
        if (!vivo) return;
        setV({
          publicKeyId: llave?.publicKeyId ?? null,
          reglasVerificadasAl: params?.reglasVerificadasAl ?? null,
          parametros: Array.isArray(params?.parametros) ? params.parametros.length : null,
          // Sin las gemelas `/csv`: son el mismo cálculo en otro formato, y
          // contarlas inflaría el número sin agregar una capacidad.
          operaciones: doc?.paths
            ? Object.entries(doc.paths).filter(
                ([ruta, m]) => (m as Record<string, unknown>).post && !ruta.endsWith("/csv"),
              ).length
            : null,
          precioLiquidarUsd:
            typeof doc?.paths?.["/liquidar"]?.post?.["x-x402"]?.precioUsd === "number"
              ? doc.paths["/liquidar"].post["x-x402"].precioUsd
              : null,
          contacto: doc ? contactoDe(doc) : null,
        });
      })
      .catch(() => undefined);

    return () => {
      vivo = false;
    };
  }, []);

  return v;
}

function Dato({ valor, etiqueta }: { valor: string | number | null; etiqueta: string }) {
  return (
    <div className="text-center">
      <p className="font-[family-name:var(--font-mono)] text-2xl sm:text-3xl text-white tabular-nums">
        {valor ?? <span className="text-white/25">—</span>}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/45 font-[family-name:var(--font-display)]">
        {etiqueta}
      </p>
    </div>
  );
}

function SelectorAudiencia({
  id,
  t,
  activa,
  onSelect,
}: {
  id: Audiencia;
  t: Textos;
  activa: boolean;
  onSelect: () => void;
}) {
  const Icono = ICONOS[id];
  const perfil = t.audiencias[id];
  return (
    <button
      onClick={onSelect}
      aria-pressed={activa}
      className={`group text-left rounded-lg border px-5 py-4 transition-all duration-200 ${
        activa
          ? "bg-white border-white text-[color:var(--color-ink)] shadow-[0_0_0_4px_rgba(255,255,255,0.08)]"
          : "bg-transparent border-white/20 text-white/80 hover:border-white/45 hover:bg-white/[0.03]"
      }`}
    >
      <Icono
        className={`w-5 h-5 mb-2 ${activa ? "text-[color:var(--color-indigo)]" : "text-white/50"}`}
        aria-hidden
      />
      <p className="font-[family-name:var(--font-display)] font-semibold text-base leading-tight">
        {perfil.etiqueta}
      </p>
      <p
        className={`font-[family-name:var(--font-mono)] text-[11px] mt-1 ${
          activa ? "text-[color:var(--color-muted)]" : "text-white/45"
        }`}
      >
        → {perfil.gancho}
      </p>
    </button>
  );
}

/** El bloque de copiar-y-pegar para agentes: una línea que se le pasa al bot
 *  y ya. Es la forma en que un agente llega hoy a un servicio. */
function ParaTuAgente({ t }: { t: Textos }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(t.agente.orden);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles la orden sigue visible y seleccionable:
      // el texto está en pantalla, que es lo que importa.
      setCopiado(false);
    }
  }

  return (
    <div className="mt-8">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-[family-name:var(--font-display)] mb-2">
        {t.agente.titulo}
      </p>
      <div className="flex items-start gap-3 rounded-lg border border-white/15 bg-white/[0.04] p-4">
        <Terminal className="w-4 h-4 text-white/40 shrink-0 mt-0.5" aria-hidden />
        <p className="flex-1 font-[family-name:var(--font-mono)] text-[12px] leading-relaxed text-white/80">
          {t.agente.orden}
        </p>
        <button
          onClick={copiar}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-white/20 hover:border-white/40 px-2.5 py-1.5 text-[11px] text-white/80 transition-colors"
        >
          {copiado ? (
            <Check className="w-3 h-3" aria-hidden />
          ) : (
            <Copy className="w-3 h-3" aria-hidden />
          )}
          {copiado ? t.agente.copiado : t.agente.copiar}
        </button>
      </div>
      <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px] text-white/40">
        OpenAPI:{" "}
        <a className="hover:text-white/70 underline" href="/api/batch/openapi.json">
          /api/batch/openapi.json
        </a>{" "}
        · A2A:{" "}
        <a
          className="hover:text-white/70 underline"
          href="https://ynt.codes/.well-known/agent-card.json"
        >
          ynt.codes/.well-known/agent-card.json
        </a>{" "}
        · {t.agente.pago}
      </p>
    </div>
  );
}

/** El paso siguiente para una empresa — el espejo de `ParaTuAgente`.
 *
 *  Existía para agentes y no para empresas, y eso se midió el 2026-08-15: en
 *  toda la página había cinco botones (idioma, las tres audiencias y "calcular
 *  gratis") y dos enlaces (Swagger y el verificador). Quien leía "Liquidar es
 *  fácil. Demostrar que está bien, no", movía la calculadora de costos y veía
 *  el ahorro, **no tenía después ninguna acción que tomar** — mientras el
 *  portal de empresa, el registro con NIT y el panel de nómina ya llevaban
 *  meses construidos y servidos en `/empresa`.
 *
 *  `contacto` llega del OpenAPI del servidor. Si no llega, el botón de escribir
 *  **no se pinta**: un `mailto:` a una dirección que no existe se ve idéntico a
 *  uno que funciona, y el que escribe no se entera nunca. */
function ParaTuEmpresa({ t, contacto }: { t: Textos; contacto: string | null }) {
  return (
    <div className="mt-8">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-[family-name:var(--font-display)] mb-2">
        {t.empresaCta.titulo}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/empresa"
          className="inline-flex items-center gap-1.5 rounded-md bg-white text-slate-900 px-3.5 py-2 text-[13px] font-medium hover:bg-white/90 transition-colors"
        >
          <Building2 className="w-3.5 h-3.5" aria-hidden />
          {t.empresaCta.registrar}
        </a>
        <a
          href="/login?rol=empresa"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 hover:border-white/40 px-3.5 py-2 text-[13px] text-white/80 transition-colors"
        >
          {t.empresaCta.entrar}
          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
        </a>
        {contacto && (
          <a
            href={`mailto:${contacto}?subject=${encodeURIComponent("NomiCheck para empresas")}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 hover:border-white/40 px-3.5 py-2 text-[13px] text-white/80 transition-colors"
          >
            {t.empresaCta.escribir}
          </a>
        )}
      </div>
      <p className="mt-3 text-[11px] text-white/40 max-w-xl leading-relaxed">{t.empresaCta.nota}</p>
    </div>
  );
}

export default function Servicios() {
  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial);
  const [audiencia, setAudiencia] = useState<Audiencia>("persona");
  const vivo = useDatosVivos();
  const t = TEXTOS[idioma];
  const perfil = t.audiencias[audiencia];

  // El `lang` del documento no es cosmético: lo usan los lectores de pantalla
  // para elegir la voz, y los traductores del navegador para no ofrecer
  // traducir una página que ya está en el idioma de quien la lee.
  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
  }, [t.htmlLang]);

  function cambiarIdioma() {
    const otro: Idioma = idioma === "es" ? "en" : "es";
    setIdioma(otro);
    recordarIdioma(otro);
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-surface)]">
      {/* ── Hero oscuro ───────────────────────────────────────────────── */}
      <header className="bg-[color:var(--color-navy)] bg-dots text-white">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-12 lg:pb-16">
          {/* Selector de idioma arriba a la derecha: se detecta el del
              navegador, pero siempre se puede cambiar. Detectar sin dar salida
              es peor que no detectar — un navegador en inglés en Bogotá es
              común, y esa persona quedaría encerrada. */}
          <div className="flex justify-end">
            <button
              onClick={cambiarIdioma}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 hover:border-white/40 px-2.5 py-1.5 text-[11px] text-white/70 hover:text-white transition-colors"
              lang={idioma === "es" ? "en" : "es"}
            >
              <Languages className="w-3.5 h-3.5" aria-hidden />
              {t.selectorIdioma}
            </button>
          </div>

          <p className="mt-6 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-white/45 font-[family-name:var(--font-display)] text-center">
            {t.hero.eyebrow}
          </p>

          <h1 className="mt-5 text-center font-[family-name:var(--font-display)] font-semibold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-[-0.02em]">
            {t.hero.titulo1}
            <br />
            <span className="text-white/45">{t.hero.titulo2}</span>
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-center text-white/65 leading-relaxed">
            {t.hero.bajada}
          </p>

          {/* El selector. Tres botones grandes, como la pregunta que son. */}
          <div className="mt-10 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {ORDEN_AUDIENCIAS.map((id) => (
              <SelectorAudiencia
                key={id}
                id={id}
                t={t}
                activa={id === audiencia}
                onSelect={() => setAudiencia(id)}
              />
            ))}
          </div>

          {audiencia === "bot" && <ParaTuAgente t={t} />}
          {audiencia === "empresa" && <ParaTuEmpresa t={t} contacto={vivo.contacto} />}

          {/* Franja de datos — TODOS leídos del servidor. Un número escrito
              aquí se volvería falso sin que nadie se entere. */}
          <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <Dato valor={vivo.operaciones} etiqueta={t.datos.servicios} />
            <Dato valor={vivo.parametros} etiqueta={t.datos.parametros} />
            <Dato valor={vivo.reglasVerificadasAl} etiqueta={t.datos.reglas} />
            <Dato
              valor={vivo.publicKeyId ? `${vivo.publicKeyId.slice(0, 8)}…` : null}
              etiqueta={t.datos.llave}
            />
          </div>
        </div>
      </header>

      {/* ── Qué puedes hacer, según quién seas ────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em] max-w-2xl">
          {perfil.titular}
        </h2>
        <p className="mt-4 max-w-2xl text-[color:var(--color-muted)] leading-relaxed">
          {perfil.bajada}
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {perfil.capacidades.map((c) => {
            const Icono = ICONOS_CAPACIDAD[c.icono];
            return (
              <div
                key={c.titulo}
                className="rounded-lg bg-white border border-slate-200 p-6 hover:border-[color:var(--color-indigo)]/35 transition-colors"
              >
                <Icono className="w-5 h-5 text-[color:var(--color-indigo)]" aria-hidden />
                <h3 className="mt-4 font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)] leading-snug">
                  {c.titulo}
                </h3>
                <p className="mt-2 text-sm text-[color:var(--color-muted)] leading-relaxed">
                  {c.detalle}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── La calculadora gratis ─────────────────────────────────────── */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-verde)]/10 text-[color:var(--color-verde)] px-2.5 py-0.5 text-[11px] font-medium">
              <Check className="w-3 h-3" aria-hidden />
              {t.calculadora.insignia}
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em]">
            {t.calculadora.titulo}
          </h2>
          <p className="mt-4 max-w-2xl text-[color:var(--color-muted)] leading-relaxed">
            {t.calculadora.bajada}
          </p>

          <div className="mt-10">
            <Suspense
              fallback={
                <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)] p-10">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  {t.calculadora.cargando}
                </div>
              }
            >
              <CalculadoraLiquidacion t={t} />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ── Cuánto cuesta y contra qué se compara ─────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em] max-w-3xl">
          {t.comparador.titulo}
        </h2>
        <p className="mt-4 max-w-2xl text-[color:var(--color-muted)] leading-relaxed">
          {t.comparador.bajada}
        </p>

        <div className="mt-10">
          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)] p-10">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {t.calculadora.cargando}
              </div>
            }
          >
            <ComparadorCostos t={t} precioUsdPorLlamada={vivo.precioLiquidarUsd} />
          </Suspense>
        </div>
      </section>

      {/* ── Catálogo vivo ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em]">
          {t.catalogo.titulo}
        </h2>
        <p className="mt-4 max-w-2xl text-[color:var(--color-muted)] leading-relaxed">
          {t.catalogo.bajada}
        </p>

        {/* El contrato completo NO se dibuja acá: vive en `/docs/`, una página
            suelta con Swagger UI self-hosted. Meterlo en esta landing habría
            sumado ~1,5 MB al bundle para quien solo quiere calcular su
            liquidación — y se habría visto como otra web pegada adentro. */}
        <a
          href="/docs/"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-indigo)] hover:underline"
        >
          <FileJson className="w-4 h-4" aria-hidden />
          {t.catalogo.verSwagger}
          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
        </a>

        <div className="mt-10">
          <CatalogoVivo audiencia={audiencia} idioma={idioma} t={t} />
        </div>
      </section>

      {/* ── Confianza ─────────────────────────────────────────────────── */}
      <section className="bg-[color:var(--color-navy)] text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl leading-tight tracking-[-0.01em] max-w-2xl">
            {t.confianza.titulo}
          </h2>
          <p className="mt-4 max-w-2xl text-white/65 leading-relaxed">{t.confianza.bajada}</p>

          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {t.confianza.puntos.map((p, i) => {
              const Icono = [FileSignature, Hash, Scale][i] ?? ShieldCheck;
              return (
                <div key={p.titulo} className="rounded-lg border border-white/12 bg-white/[0.03] p-6">
                  <Icono className="w-5 h-5 text-[color:var(--color-verde)]" aria-hidden />
                  <h3 className="mt-4 font-[family-name:var(--font-display)] font-semibold leading-snug">
                    {p.titulo}
                  </h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{p.texto}</p>
                </div>
              );
            })}
          </div>

          <a
            href="https://ynt.codes/verificar?url=https://nomicheck.ynt.codes/api/batch/verificar/ejemplo"
            target="_blank"
            rel="noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-md bg-white text-[color:var(--color-ink)] hover:bg-white/90 font-medium text-sm px-5 py-3 transition-colors"
          >
            {t.confianza.cta}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </a>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
        <p className="text-xs text-[color:var(--color-muted)] leading-relaxed max-w-3xl">
          {t.footer}
        </p>
        {/* La marca, igual que en los cuatro portales — pero con un color que
            SÍ resuelve: `text-base-content/25` es un token de DaisyUI que este
            tema no define, así que compila a cero CSS y el texto termina
            saliendo a color heredado y opacidad plena. El diseño pide un
            susurro (9px, 25%), no un renglón más. */}
        <span className="font-display text-[9px] font-medium uppercase tracking-[0.2em] text-[color:var(--color-ink)]/25">
          © {new Date().getFullYear()} Ynt-labs
        </span>
      </footer>
    </div>
  );
}
