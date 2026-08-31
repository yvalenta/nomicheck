import { KeyRound } from "lucide-react";
import { obtenerMatrizPermisos } from "../../apiEmpresa";
import { obtenerMiRol } from "../../api.ts";
import { useDatos } from "../../hooks/useDatos.ts";
import { agruparPorDominio, masRestringidos } from "../../lib/permisosCatalogo.ts";
import { etiquetaDeRol } from "../../lib/rolesEtiquetas.ts";
import PaycheckCard from "../PaycheckCard.tsx";
import Skeleton from "../Skeleton.tsx";
import TablaPermisos from "./TablaPermisos.tsx";

// Roles y permisos (SDD §15, pilar 1 — paso 2 de la tarea del 2026-08-31).
//
// Cada fila es una acción real de la API, y la tabla se dibuja desde la MISMA
// matriz que la hace cumplir (`apps/api/src/lib/permisos.ts`, servida en
// `GET /empresa/permisos`). Esa es la única razón de existir de la pantalla:
// una página de permisos escrita a mano se desincroniza el día que alguien
// cambia una guarda, y entonces enseña un permiso que el servidor niega.
//
// Fase 1: documental. Los indicadores no se editan porque hoy los roles son
// fijos; la edición llega con los roles personalizados.

export default function RolesEmpresa() {
  const matriz = useDatos("permisos:matriz", obtenerMatrizPermisos);
  const yo = useDatos("permisos:whoami", obtenerMiRol);

  const rolPropio = yo.datos?.rol ?? null;
  const empresaActiva = yo.datos?.empresas.find((e) => e.id === yo.datos?.empresaId);
  // En una constante propia y no `matriz.datos?.publicada` suelto: el
  // estrechamiento de una propiedad se pierde dentro de los callbacks del map,
  // el de una const no.
  const publicada = matriz.datos?.publicada ? matriz.datos : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <KeyRound size={18} className="text-mint-dark" /> Roles y permisos
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Cada fila es una acción real de la API. La tabla se dibuja desde la misma matriz que la
          hace cumplir, así que no pueden decir cosas distintas.
        </p>
      </div>

      {(matriz.error || yo.error) && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-coral">{matriz.error ?? yo.error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="flex flex-col gap-4">
          {matriz.cargando && <Skeleton />}
          {publicada && (
            <PaycheckCard titulo="Matriz de la empresa" aBorde>
              <TablaPermisos
                roles={publicada.roles}
                grupos={agruparPorDominio(publicada.permisos)}
                rolPropio={rolPropio}
              />
              {!publicada.roles.includes("admin_plataforma") && (
                <p className="border-t border-borde px-4 py-3 text-xs leading-relaxed text-muted">
                  <b className="font-medium text-ink">Admin plataforma</b> no aparece en esta matriz:
                  administra NomiCheck (reglas legales, festivos, alta y suspensión de empresas) y
                  nunca tiene una empresa propia que mirar.
                </p>
              )}
            </PaycheckCard>
          )}
          {matriz.datos && !matriz.datos.publicada && <MatrizSinPublicar />}
        </div>

        <aside className="flex flex-col gap-4">
          <PaycheckCard titulo="Tu acceso">
            <Fila etiqueta="Empresa activa" valor={empresaActiva?.nombre ?? "—"} />
            <Fila etiqueta="Tu rol acá" valor={rolPropio ? etiquetaDeRol(rolPropio) : "—"} mono />
            <Fila etiqueta="Membresías" valor={String(yo.datos?.empresas.length ?? 0)} mono />
            {publicada && rolPropio && (
              <Fila
                etiqueta="Permisos de tu rol"
                valor={`${publicada.permisos.filter((p) => p.roles.includes(rolPropio)).length}/${publicada.permisos.length}`}
                mono
              />
            )}
          </PaycheckCard>

          {publicada && (
            <PaycheckCard titulo="Lo más restringido">
              {masRestringidos(publicada.permisos, 5).map((f) => (
                <Fila
                  key={f.clave}
                  etiqueta={f.ficha.etiqueta}
                  valor={`${f.roles.length}/${publicada.roles.length}`}
                  mono
                />
              ))}
            </PaycheckCard>
          )}

          <PaycheckCard>
            <p className="px-3 py-3 text-xs leading-relaxed text-muted">
              La matriz es una sola fuente:{" "}
              <code className="font-mono text-[11px] text-ink">lib/permisos.ts</code>. La API la hace
              cumplir en cada ruta y esta página la pide con{" "}
              <code className="font-mono text-[11px] text-ink">GET /empresa/permisos</code>. Un check
              acá sin guarda allá no puede existir.
            </p>
          </PaycheckCard>
        </aside>
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borde px-3 py-2.5 text-[13px] last:border-b-0">
      <span className="text-muted">{etiqueta}</span>
      <span className={`min-w-0 truncate text-right font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}>
        {valor}
      </span>
    </div>
  );
}

// Lo que se ve mientras el paso 2 de la tarea no esté: la API no publica la
// matriz todavía. Se dice cuál es el estado en vez de dibujar una copia local
// de quién puede qué — esa copia es exactamente lo que esta pantalla existe
// para eliminar, y sería indistinguible de la verdad hasta el día que mintiera.
function MatrizSinPublicar() {
  return (
    <PaycheckCard titulo="Matriz de la empresa">
      <div className="flex flex-col gap-2 px-3 py-4">
        <p className="text-sm font-medium text-ink">La API todavía no publica la matriz.</p>
        <p className="text-xs leading-relaxed text-muted">
          El portal la pide en{" "}
          <code className="font-mono text-[11px] text-ink">GET /empresa/permisos</code> y dibuja la
          tabla apenas exista. No se muestra una matriz escrita en el front: la que decide es la de{" "}
          <code className="font-mono text-[11px] text-ink">lib/permisos.ts</code>, y una segunda
          copia acá volvería a abrir la divergencia que se acaba de cerrar en las rutas.
        </p>
        <p className="text-xs leading-relaxed text-muted">
          Mientras tanto, lo de al lado sí es medido: sale de{" "}
          <code className="font-mono text-[11px] text-ink">GET /auth/whoami</code>, que es el
          endpoint que hoy sí responde.
        </p>
      </div>
    </PaycheckCard>
  );
}
