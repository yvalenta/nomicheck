import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Scale, Shield, Zap } from "lucide-react";
import ReciboDemo from "./ReciboDemo.tsx";
import { trackEvento } from "./tracking.ts";

// Landing canónica (SDD §16 + sdd/marketing/posicionamiento.md). Sirve a las
// 4 campañas Meta Ads simultáneamente vía anclas (#hero, #caso-real, #empresas,
// #contadores). Cada campaña llega con su utm_campaign distinto para atribución.
// Cuando el volumen justifique A/B, se especializa en /lanzamientos/{campana}.

// Copy centralizado — cambios de tono deben editar posicionamiento.md primero
// y luego reflejarse aquí. No inventar frases fuera del territorio de marca.
const PILARES = [
  {
    icono: Zap,
    titulo: "Gratis y sin registro",
    descripcion:
      "Sube tu comprobante o cuenta tu horario. En dos minutos, ves el resultado. Sin correo, sin tarjeta, sin nombre.",
  },
  {
    icono: Scale,
    titulo: "Cada cifra cita la ley",
    descripcion:
      "No es una opinión. Cada peso trae el artículo del CST o el decreto que lo respalda — puedes verificarlo tú mismo.",
  },
  {
    icono: Shield,
    titulo: "El motor que usan las empresas",
    descripcion:
      "Verificas con el mismo cálculo determinístico y versionado con el que las pymes liquidan su nómina completa.",
  },
];

const PASOS = [
  {
    numero: "1",
    titulo: "Cuentas tu horario o subes tu comprobante",
    descripcion:
      "Foto del PDF, o tres campos con las horas que trabajaste. Nada más.",
  },
  {
    numero: "2",
    titulo: "El motor aplica la ley vigente del periodo",
    descripcion:
      "Cada regla tiene fecha de vigencia. Julio 2026 usa las normas de julio 2026 — no las de hoy.",
  },
  {
    numero: "3",
    titulo: "Ves cada cifra con su semáforo y su artículo",
    descripcion:
      "Verde correcto, ámbar a revisar, rojo discrepancia. Debajo, el artículo del CST y la fórmula.",
  },
];

const FAQ: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "¿Mi jefe puede saber que usé esto?",
    respuesta:
      "No. El uso es anónimo — sin login, sin registro, sin correo. Nadie más que tú ve el resultado. NomiCheck no envía notificaciones a ningún empleador.",
  },
  {
    pregunta: "No entiendo de leyes ni de nómina. ¿Esto es para mí?",
    respuesta:
      "Sí. No necesitas entender de CST ni de recargos. El motor traduce la ley a tu recibo: tú solo cuentas tu horario y ves cifras con semáforo. Si algo no cuadra, la app te muestra por qué en lenguaje humano.",
  },
  {
    pregunta: "¿Cuánto tiempo lleva verificar un pago?",
    respuesta:
      "Dos minutos con foto del comprobante, o cinco con captura manual del horario. El motor calcula en menos de un segundo.",
  },
  {
    pregunta: "¿Si detecto una discrepancia, ustedes me representan legalmente?",
    respuesta:
      "No. NomiCheck no reemplaza asesoría jurídica. Te decimos qué dice la ley sobre cada peso de tu pago, con el artículo citado, para que puedas decidir con información — hablar con la empresa, con un abogado, o simplemente saber.",
  },
  {
    pregunta: "¿Cómo funciona para una empresa que quiere liquidar nómina?",
    respuesta:
      "El mismo motor que verifica también liquida. Cargas empleados una vez, capturas turnos, y NomiCheck genera los recibos con prestaciones, seguridad social y retención — con la ley citada en cada línea. Los colaboradores verifican solos su recibo dentro de la app.",
  },
  {
    pregunta: "¿Qué pasa cuando cambia una ley o el salario mínimo?",
    respuesta:
      "El motor separa reglas de código. Cada decreto entra como registro con fecha de vigencia. La reforma laboral (Ley 2466 de 2025) o el nuevo salario mínimo aparecen en los cálculos del periodo correspondiente automáticamente, sin actualizar nada.",
  },
];

function Header({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <header className="w-full px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-[color:var(--color-ink)] flex items-center justify-center">
          <span className="text-[color:var(--color-papel)] font-[family-name:var(--font-display)] font-bold text-sm">
            N
          </span>
        </div>
        <span className="font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)]">
          NomiCheck
        </span>
      </div>
      <button
        onClick={onCtaClick}
        className="text-sm text-[color:var(--color-ink)]/80 hover:text-[color:var(--color-ink)] font-[family-name:var(--font-display)]"
      >
        Verificar mi pago →
      </button>
    </header>
  );
}

function Hero({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <section id="hero" className="w-full">
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16 lg:pt-16 lg:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)] mb-6">
            <span className="w-8 h-px bg-[color:var(--color-ink)]/30" />
            NomiCheck para trabajadores
          </p>
          {/* Titular: la promesa de marca, ni una palabra sobrante. El display
              es Space Grotesk 600, tracking negativo para densidad. */}
          <h1 className="font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)] text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-[-0.02em]">
            La ley colombiana,{" "}
            <span className="relative inline-block">
              convertida
              <span className="absolute left-0 right-0 bottom-1 h-2 bg-[color:var(--color-ambar)]/50 -z-10" />
            </span>{" "}
            en un cálculo que puedes revisar tú mismo.
          </h1>
          <p className="mt-6 text-lg text-[color:var(--color-ink)]/70 leading-relaxed max-w-md">
            Verifica cada cifra de tu comprobante contra el CST vigente. Recargos, horas
            extra, prestaciones — con el artículo de ley al lado de cada peso.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={onCtaClick}
              className="group inline-flex items-center gap-2 bg-[color:var(--color-ink)] text-[color:var(--color-papel)] px-6 py-3.5 rounded-md font-[family-name:var(--font-display)] font-medium hover:bg-[color:var(--color-midnight-2)] transition-colors"
            >
              Verifica tu pago gratis
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-xs text-[color:var(--color-ink)]/60 leading-relaxed">
              Sin registro. Sin tarjeta.<br />En dos minutos.
            </p>
          </div>
        </div>
        <div>
          <ReciboDemo />
        </div>
      </div>
    </section>
  );
}

function Problema() {
  return (
    <section className="w-full bg-[color:var(--color-ink)] text-[color:var(--color-papel)] py-20 lg:py-28">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-ambar)] font-[family-name:var(--font-display)] mb-6">
          El problema
        </p>
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-[-0.01em]">
          Saber si te pagaron bien fue siempre un privilegio de quien puede pagar un contador.
        </h2>
        <div className="mt-10 grid sm:grid-cols-2 gap-8 items-start">
          <p className="text-lg text-[color:var(--color-papel)]/80 leading-relaxed">
            Un domingo hasta las 10pm son cuatro horas de recargo dominical y cuatro de
            recargo nocturno. Si alguna falta, no hay señal visible: solo un total que se
            ve normal.
          </p>
          <div className="border-l-2 border-[color:var(--color-ambar)] pl-6">
            <p className="font-[family-name:var(--font-mono)] text-4xl lg:text-5xl text-[color:var(--color-ambar)] font-semibold leading-none">
              $150.000
            </p>
            <p className="text-sm text-[color:var(--color-papel)]/70 mt-3 leading-relaxed">
              Lo que en promedio cuesta pedirle a un contador que revise <em>un solo</em>{" "}
              comprobante. NomiCheck lo hace gratis, y cita la ley en cada línea.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComoFunciona() {
  return (
    <section className="w-full py-20 lg:py-28 bg-[color:var(--color-papel)]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)] mb-6">
            Cómo funciona
          </p>
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em]">
            Tres pasos. Cero jerga. La ley al lado de cada cifra.
          </h2>
        </div>
        <ol className="mt-14 grid md:grid-cols-3 gap-8 lg:gap-12">
          {PASOS.map((p) => (
            <li key={p.numero} className="relative">
              <div className="flex items-baseline gap-4">
                <span className="font-[family-name:var(--font-mono)] text-4xl text-[color:var(--color-verde)] font-semibold leading-none">
                  0{p.numero}
                </span>
                <div className="h-px flex-1 bg-[color:var(--color-ink)]/15 translate-y-[-4px]" />
              </div>
              <h3 className="mt-5 font-[family-name:var(--font-display)] font-semibold text-lg text-[color:var(--color-ink)] leading-snug">
                {p.titulo}
              </h3>
              <p className="mt-3 text-[color:var(--color-ink)]/70 leading-relaxed text-[15px]">
                {p.descripcion}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Confianza() {
  return (
    <section className="w-full py-20 lg:py-28 bg-[color:var(--color-papel-2)]/50">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)] mb-6">
          Por qué puedes confiar en el resultado
        </p>
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl lg:text-5xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em] max-w-3xl">
          No es una IA adivinando. Es la ley convertida en código, versionada por fecha
          de vigencia.
        </h2>
        <div className="mt-12 grid lg:grid-cols-3 gap-6">
          {PILARES.map((p) => (
            <div
              key={p.titulo}
              className="bg-white rounded-md p-6 border border-[color:var(--color-papel-2)]"
            >
              <p.icono size={22} strokeWidth={1.75} className="text-[color:var(--color-verde)]" />
              <h3 className="mt-4 font-[family-name:var(--font-display)] font-semibold text-[color:var(--color-ink)]">
                {p.titulo}
              </h3>
              <p className="mt-2 text-sm text-[color:var(--color-ink)]/70 leading-relaxed">
                {p.descripcion}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CasoReal() {
  return (
    <section id="caso-real" className="w-full py-20 lg:py-28 bg-[color:var(--color-papel)]">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-coral-fuerte)] font-[family-name:var(--font-display)] mb-6">
          Un caso real, sin adornos
        </p>
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em] mb-8">
          Domingo trabajado, seis a dos.<br />
          <span className="text-[color:var(--color-ink)]/60">Faltó pagar $84.665.</span>
        </h2>
        <div className="prose prose-slate max-w-none">
          <p className="text-[color:var(--color-ink)]/80 leading-relaxed">
            Juan es mesero en un restaurante. Trabajó el domingo 22 de julio desde las
            6 de la tarde hasta las 2 de la madrugada. Ocho horas nocturnas y dominicales.
            El comprobante que le pasaron muestra un total que <em>parece</em> correcto —
            hasta que se abre línea a línea con el CST vigente:
          </p>
          <ul className="mt-6 space-y-3 text-[color:var(--color-ink)]/80 leading-relaxed">
            <li className="flex gap-3">
              <span className="w-2 h-2 rounded-full bg-[color:var(--color-coral-fuerte)] shrink-0 translate-y-2" />
              <span>
                <strong>Recargo dominical (art. 179):</strong> le pagaron $15.800 por 4
                horas. La ley exige el 75% sobre la hora ordinaria. Con salario mínimo,
                son{" "}
                <span className="font-[family-name:var(--font-mono)] text-[color:var(--color-coral-fuerte)]">
                  $24.312
                </span>
                . Faltaron $8.512.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-2 h-2 rounded-full bg-[color:var(--color-coral-fuerte)] shrink-0 translate-y-2" />
              <span>
                <strong>Recargo nocturno (art. 168):</strong> las 4 horas entre 10pm y
                2am ni siquiera aparecen en el comprobante. La ley pide el 36%: son{" "}
                <span className="font-[family-name:var(--font-mono)] text-[color:var(--color-coral-fuerte)]">
                  $11.669
                </span>{" "}
                que no se pagaron.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-2 h-2 rounded-full bg-[color:var(--color-coral-fuerte)] shrink-0 translate-y-2" />
              <span>
                <strong>Hora extra dominical nocturna:</strong> le pagaron como hora
                ordinaria. La ley la calcula al 187.5% del ordinario. Diferencia:{" "}
                <span className="font-[family-name:var(--font-mono)] text-[color:var(--color-coral-fuerte)]">
                  $28.364
                </span>
                .
              </span>
            </li>
          </ul>
          <p className="mt-8 text-[color:var(--color-ink)]/80 leading-relaxed">
            No es un fraude sofisticado. Es la aritmética normal de un pequeño empleador
            que liquida manualmente y no persigue cada artículo del CST. NomiCheck no
            promete cambiar esa realidad — le da al trabajador la cifra exacta con la
            ley al lado para poder decidir qué hacer.
          </p>
        </div>
      </div>
    </section>
  );
}

function PuenteB2B({ onEmpresasClick, onContadoresClick }: {
  onEmpresasClick: () => void;
  onContadoresClick: () => void;
}) {
  return (
    <section id="empresas" className="w-full py-20 lg:py-28 bg-[color:var(--color-ink)] text-[color:var(--color-papel)]">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-verde)] font-[family-name:var(--font-display)] mb-6">
          El mismo motor, del otro lado
        </p>
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl leading-tight tracking-[-0.01em]">
              ¿Tienes un negocio? Deja que el mismo motor liquide tu nómina.
            </h2>
            <p className="mt-6 text-[color:var(--color-papel)]/80 leading-relaxed text-lg">
              Prestaciones sociales, seguridad social, retención en la fuente. Cada línea
              cita el artículo detrás. Tus colaboradores verifican su recibo dentro de la
              misma app, y si algo no cuadra hay canal para responder.
            </p>
            <button
              onClick={onEmpresasClick}
              className="mt-8 inline-flex items-center gap-2 bg-[color:var(--color-papel)] text-[color:var(--color-ink)] px-6 py-3.5 rounded-md font-[family-name:var(--font-display)] font-medium hover:bg-[color:var(--color-mint)] transition-colors"
            >
              Prueba NomiCheck Empresas
              <ArrowRight size={18} />
            </button>
          </div>
          <div id="contadores" className="border-l border-[color:var(--color-papel)]/20 pl-8">
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-mint)] font-[family-name:var(--font-display)] mb-4">
              Para contadores
            </p>
            <h3 className="font-[family-name:var(--font-display)] font-semibold text-2xl leading-tight">
              El motor actualizado con cada decreto — ya no persigues reformas.
            </h3>
            <p className="mt-4 text-[color:var(--color-papel)]/80 leading-relaxed">
              Cada regla legal es un registro con fecha de vigencia. Cuando cambia el
              salario mínimo o entra una nueva ley, tus liquidaciones futuras la usan
              sin que tú actualices nada.
            </p>
            <button
              onClick={onContadoresClick}
              className="mt-6 inline-flex items-center gap-2 text-[color:var(--color-mint)] font-[family-name:var(--font-display)] font-medium hover:gap-3 transition-all"
            >
              Conoce el programa para contadores
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqItem({ pregunta, respuesta }: { pregunta: string; respuesta: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="border-b border-[color:var(--color-ink)]/15">
      <button
        onClick={() => setAbierta(!abierta)}
        className="w-full py-5 flex items-start justify-between gap-6 text-left group"
      >
        <span className="font-[family-name:var(--font-display)] font-medium text-[color:var(--color-ink)] text-lg leading-snug group-hover:text-[color:var(--color-verde)] transition-colors">
          {pregunta}
        </span>
        <ChevronDown
          size={20}
          className={`text-[color:var(--color-ink)]/50 shrink-0 mt-1 transition-transform ${abierta ? "rotate-180" : ""}`}
        />
      </button>
      {abierta && (
        <p className="pb-5 pr-10 text-[color:var(--color-ink)]/75 leading-relaxed">
          {respuesta}
        </p>
      )}
    </div>
  );
}

function Preguntas() {
  return (
    <section className="w-full py-20 lg:py-28 bg-[color:var(--color-papel)]">
      <div className="max-w-3xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-ink)]/60 font-[family-name:var(--font-display)] mb-6">
          Antes de que preguntes
        </p>
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-3xl sm:text-4xl text-[color:var(--color-ink)] leading-tight tracking-[-0.01em] mb-8">
          Las dudas más frecuentes, con respuesta directa.
        </h2>
        <div className="mt-10 border-t border-[color:var(--color-ink)]/15">
          {FAQ.map((f) => (
            <FaqItem key={f.pregunta} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CierreYFooter({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <>
      <section className="w-full py-24 lg:py-32 bg-[color:var(--color-papel-2)]/60">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-[family-name:var(--font-display)] font-semibold text-4xl sm:text-5xl lg:text-6xl text-[color:var(--color-ink)] leading-[1.05] tracking-[-0.02em]">
            Dos minutos.
            <br />
            <span className="text-[color:var(--color-verde)]">Cero pesos.</span>{" "}
            La ley al lado.
          </h2>
          <p className="mt-6 text-lg text-[color:var(--color-ink)]/70">
            Empieza por tu último comprobante. Descubre exactamente qué te deben —
            y por qué.
          </p>
          <button
            onClick={onCtaClick}
            className="mt-10 inline-flex items-center gap-2 bg-[color:var(--color-ink)] text-[color:var(--color-papel)] px-8 py-4 rounded-md font-[family-name:var(--font-display)] font-medium text-lg hover:bg-[color:var(--color-midnight-2)] transition-colors"
          >
            Verifica tu pago gratis
            <ArrowRight size={20} />
          </button>
          <p className="mt-6 text-xs text-[color:var(--color-ink)]/60 flex items-center justify-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Check size={12} className="text-[color:var(--color-verde)]" /> Sin registro
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={12} className="text-[color:var(--color-verde)]" /> Sin tarjeta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={12} className="text-[color:var(--color-verde)]" /> Anónimo
            </span>
          </p>
        </div>
      </section>

      <footer className="w-full py-10 bg-[color:var(--color-ink)] text-[color:var(--color-papel)]/60 text-sm">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <p className="leading-relaxed max-w-2xl text-xs">
            NomiCheck es un estimador basado en el Código Sustantivo del Trabajo y normas
            vigentes en Colombia. No reemplaza asesoría jurídica ni contable formal. Cada
            cifra cita el artículo o decreto que la respalda para que puedas verificarla
            por tu cuenta.
          </p>
          <p className="text-xs whitespace-nowrap">© 2026 NomiCheck</p>
        </div>
      </footer>
    </>
  );
}

export default function Lanzamiento() {
  // Ir a la app real del verificador anónimo (raíz del sitio). Meta Ads dispara
  // el evento al hacer click en cualquier CTA primario — es la señal de intención
  // más fuerte antes del `verificacion_completada` (que dispara en el flujo del
  // verificador, no aquí).
  function irAVerificar() {
    trackEvento("verificacion_iniciada", { origen: "landing_hero" });
    window.location.href = "/";
  }
  function irAEmpresas() {
    trackEvento("registro_empresa", { paso: "landing_cta" });
    window.location.href = "/login?rol=empresa";
  }
  function irAContadores() {
    trackEvento("interes_partners", {});
    // TODO: crear /programa-contadores cuando el volumen justifique landing propia.
    window.location.href = "mailto:hola@nomicheck.co?subject=Programa%20para%20contadores";
  }

  useEffect(() => {
    // Cargó la landing — el pixel base ya disparó PageView; este trackCustom
    // marca la visita como "audiencia calificada de la landing" para lookalike.
    trackEvento("verificacion_iniciada", { origen: "landing_load", accion: "view" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[color:var(--color-papel)] text-[color:var(--color-ink)]">
      <Header onCtaClick={irAVerificar} />
      <Hero onCtaClick={irAVerificar} />
      <Problema />
      <ComoFunciona />
      <Confianza />
      <CasoReal />
      <PuenteB2B onEmpresasClick={irAEmpresas} onContadoresClick={irAContadores} />
      <Preguntas />
      <CierreYFooter onCtaClick={irAVerificar} />
    </div>
  );
}
