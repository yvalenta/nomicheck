import { useEffect, useState } from "react";
import { Check, Coins, FileJson, Loader2, Sparkles, Unplug } from "lucide-react";
import { RECOMENDADOS } from "./audiencias";
import { TITULOS_EN, type Audiencia, type Idioma, type Textos } from "./i18n";
import { serviciosDe, type DocOpenApi, type Servicio } from "./catalogo";

// El catálogo NO está escrito aquí: se lee de `/api/batch/openapi.json`, que el
// servidor genera de los mismos zod que validan en runtime.
//
// El motivo es el de siempre en este producto: una lista de servicios escrita a
// mano es una lista que miente en cuanto alguien agrega un endpoint o enciende
// el muro de pago. El precio sale de `x-x402`, que el API publica en número
// justamente para no obligar a nadie a parsear una frase. Si el muro se
// enciende mañana, esta sección lo dice sola.

function Precio({ s, t }: { s: Servicio; t: Textos }) {
  if (s.cobra && s.precioUsd !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-navy)] text-white px-2.5 py-0.5 text-[11px] font-[family-name:var(--font-mono)]">
        <Coins className="w-3 h-3" aria-hidden />
        US${s.precioUsd.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-verde)]/10 text-[color:var(--color-verde)] px-2.5 py-0.5 text-[11px] font-medium">
      <Check className="w-3 h-3" aria-hidden />
      {t.catalogo.gratis}
    </span>
  );
}

export default function CatalogoVivo({
  audiencia,
  idioma,
  t,
}: {
  audiencia: Audiencia;
  idioma: Idioma;
  t: Textos;
}) {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/batch/openapi.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: DocOpenApi) => vivo && setServicios(serviciosDe(d)))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  if (error) {
    // Un catálogo que no carga se DICE. Dejar el hueco en blanco haría pensar
    // que no hay servicios, que es peor que decir que no se pudo leer.
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <Unplug className="w-5 h-5 text-[color:var(--color-muted)]" aria-hidden />
        <p className="text-sm text-[color:var(--color-muted)]">
          {t.catalogo.sinCatalogo}{" "}
          <a
            className="underline hover:text-[color:var(--color-indigo)]"
            href="/api/batch/openapi.json"
          >
            /api/batch/openapi.json
          </a>
          .
        </p>
      </div>
    );
  }

  if (!servicios) {
    return (
      <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)] p-5">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        {t.catalogo.leyendo}
      </div>
    );
  }

  const recomendados = RECOMENDADOS[audiencia];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {servicios.map((s) => {
        const destacado = recomendados.includes(s.id);
        // En inglés se usa el título traducido si existe; si no, el `summary`
        // del servidor. Un título en español es mejor que un hueco.
        const titulo = idioma === "en" ? (TITULOS_EN[s.id] ?? s.titulo) : s.titulo;
        return (
          <article
            key={s.ruta}
            className={`rounded-lg border p-5 bg-white transition-colors ${
              destacado
                ? "border-[color:var(--color-indigo)]/40 shadow-[0_0_0_3px_rgba(91,80,232,0.06)]"
                : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <FileJson
                className={`w-5 h-5 shrink-0 ${
                  destacado
                    ? "text-[color:var(--color-indigo)]"
                    : "text-[color:var(--color-muted)]"
                }`}
                aria-hidden
              />
              <Precio s={s} t={t} />
            </div>
            <h3 className="mt-3 font-[family-name:var(--font-display)] font-semibold text-sm text-[color:var(--color-ink)] leading-snug">
              {titulo}
            </h3>
            <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--color-muted)] break-all">
              POST /api/batch{s.ruta}
            </p>
            {destacado && (
              <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-[color:var(--color-indigo)] font-medium">
                <Sparkles className="w-3 h-3" aria-hidden />
                {t.catalogo.paraVos}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
