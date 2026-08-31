import { Check } from "lucide-react";
import type { FilaMatriz } from "../../apiEmpresa";
import { rutasDe, type GrupoPermisos } from "../../lib/permisosCatalogo.ts";
import { etiquetaDeRol, notaDeRol } from "../../lib/rolesEtiquetas.ts";

// La tabla permiso × rol. Componente de pintura pura: recibe la matriz ya
// pedida y no sabe de dónde salió — así la vitrina puede montarla con una
// matriz de ejemplo sin tocar la red.
//
// Fase 1, documental: los indicadores no se pueden tocar. La edición llega con
// los roles personalizados, y hasta entonces un checkbox activable prometería
// que el clic hace algo. Aquí el "estado deshabilitado" no es un input gris
// sino que directamente no hay input: cada celda es un símbolo con su lectura
// para lector de pantalla.

interface Props {
  /** Las columnas, en el orden que mandó la API. */
  roles: string[];
  grupos: GrupoPermisos[];
  /** El rol de quien está mirando: su columna queda resaltada. */
  rolPropio?: string | null;
}

/**
 * ¿Este rol es de solo lectura? Se MIDE sobre la matriz recibida, con la
 * convención que el backend declara y hace cumplir: un permiso que termina en
 * `.ver` es de lectura, cualquier otro es de escritura. Por eso el sello del
 * auditor no puede quedar viejo — si algún día apareciera en una celda de
 * escritura, el sello desaparece solo.
 */
function esSoloLectura(rol: string, grupos: GrupoPermisos[]): boolean {
  const suyos = grupos.flatMap((g) => g.filas).filter((f) => f.roles.includes(rol));
  return suyos.length > 0 && suyos.every((f) => f.clave.endsWith(".ver"));
}

export default function TablaPermisos({ roles, grupos, rolPropio }: Props) {
  const columnas = roles.length + 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-borde px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-quiet">
              Permiso
            </th>
            {roles.map((rol) => (
              <th
                key={rol}
                title={notaDeRol(rol)}
                className={`border-b border-borde px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-quiet ${
                  rol === rolPropio ? "bg-indigo-soft/50" : ""
                }`}
              >
                <span className="block">{etiquetaDeRol(rol)}</span>
                {esSoloLectura(rol, grupos) && (
                  <span className="mt-1 inline-block rounded-full bg-verde/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-verde">
                    solo lectura
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map((grupo) => (
            <FragmentoGrupo key={grupo.dominio} grupo={grupo} roles={roles} rolPropio={rolPropio} columnas={columnas} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentoGrupo({
  grupo,
  roles,
  rolPropio,
  columnas,
}: {
  grupo: GrupoPermisos;
  roles: string[];
  rolPropio?: string | null;
  columnas: number;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={columnas}
          className="bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"
        >
          {grupo.dominio}
        </td>
      </tr>
      {grupo.filas.map((fila) => (
        <tr key={fila.clave} className="border-b border-borde last:border-b-0">
          <td className="px-4 py-2.5">
            {/* El tooltip del ratón y el texto del lector de pantalla dicen lo
                mismo: `title` solo no llega a quien navega con teclado. */}
            <span title={fila.ficha.que} className="font-medium text-ink underline decoration-dotted decoration-quiet underline-offset-4">
              {fila.ficha.etiqueta}
            </span>
            <span className="sr-only"> — {fila.ficha.que}</span>
            <span className="mt-0.5 block font-mono text-[10.5px] text-quiet">{rutasDe(fila)}</span>
          </td>
          {roles.map((rol) => (
            <Celda
              key={rol}
              tiene={fila.roles.includes(rol)}
              rol={rol}
              permiso={fila}
              propia={rol === rolPropio}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function Celda({
  tiene,
  rol,
  permiso,
  propia,
}: {
  tiene: boolean;
  rol: string;
  permiso: FilaMatriz & { ficha: { etiqueta: string } };
  propia: boolean;
}) {
  return (
    <td
      title={`${etiquetaDeRol(rol)} ${tiene ? "puede" : "no puede"}: ${permiso.ficha.etiqueta.toLowerCase()}`}
      className={`px-3 py-2.5 text-center ${propia ? "bg-indigo-soft/50" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`inline-grid h-5 w-5 place-items-center rounded-md ${
          tiene ? "bg-mint text-white" : "border border-borde bg-surface"
        }`}
      >
        {tiene && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="sr-only">{tiene ? "sí" : "no"}</span>
    </td>
  );
}
