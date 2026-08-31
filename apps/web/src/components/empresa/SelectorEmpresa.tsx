import { Building2, Check, ChevronsUpDown } from "lucide-react";
import type { EmpresaDeLaCuenta } from "../../api.ts";
import { etiquetaDeRol } from "../../lib/rolesEtiquetas.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

// Selector de empresa activa en el header del portal (SDD §15 — paso 5).
//
// Aparece SOLO con dos o más membresías. Una empresa con un selector de una
// opción le enseña a la persona que hay algo que elegir donde no lo hay, y
// además le ocupa el header a la mayoría de las cuentas, que tienen una sola.
//
// El rol va al lado de cada empresa porque es POR EMPRESA: la misma persona
// puede ser admin en la suya y auditor en la de un cliente, y saber con qué
// permisos entra es parte de elegir a dónde entrar.
//
// Accesibilidad: el disparador y cada opción son `<button>` de verdad, no divs
// con onClick. Eso trae gratis el foco, Enter/Espacio y el orden de tabulación;
// Radix agrega Escape y devolver el foco al disparador al cerrar.

interface Props {
  empresas: EmpresaDeLaCuenta[];
  /** La empresa donde está parada la sesión (`whoami.empresaId`). */
  activaId: number | null;
  onElegir: (empresaId: number) => void;
  /** Hay un cambio en vuelo. Solo cambia el rótulo: bloquear el disparador le
   *  quita el foco al menú abierto, y si el servidor rechaza, el error se
   *  imprime dentro de un menú que ya se cerró — nadie lo lee. Los clics
   *  encimados los descarta quien maneja el estado. */
  cambiando?: boolean;
  error?: string | null;
  /** ¿Este portal abre para ese rol? Una empresa donde la cuenta es auditor
   *  hoy rebota a la calculadora, y como el selector vive DENTRO del portal, la
   *  persona se quedaría afuera sin forma de volver. Se ofrece igual —esconder
   *  la membresía sería mentir sobre lo que tiene— pero sin poder elegirla. */
  rolAdmitido?: (rol: string) => boolean;
}

export default function SelectorEmpresa({
  empresas,
  activaId,
  onElegir,
  cambiando,
  error,
  rolAdmitido = () => true,
}: Props) {
  if (empresas.length < 2) return null;
  const activa = empresas.find((e) => e.id === activaId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-busy={cambiando}
          aria-label={`Empresa activa: ${activa?.nombre ?? "sin elegir"}. Cambiar de empresa`}
          className="flex max-w-[15rem] items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[13px] text-slate-100 transition-colors hover:bg-white/15"
        >
          <Building2 size={14} className="shrink-0 text-slate-400" />
          <span className="truncate">{cambiando ? "Cambiando…" : activa?.nombre ?? "Elegir empresa"}</span>
          <ChevronsUpDown size={14} className="shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.05em] text-quiet">
          Tus empresas
        </p>
        {empresas.map((e) => {
          const on = e.id === activaId;
          const admitida = on || rolAdmitido(e.rol);
          return (
            <button
              key={e.id}
              type="button"
              // `aria-disabled` y no `disabled`: un botón deshabilitado no
              // recibe eventos de ratón ni foco, así que se tragaría el título
              // que explica POR QUÉ no se puede elegir. Así queda alcanzable y
              // el motivo se lee, con ratón y con teclado.
              aria-disabled={!admitida}
              title={admitida ? undefined : `El panel de empresa todavía no abre con rol ${etiquetaDeRol(e.rol)}.`}
              onClick={() => admitida && !on && onElegir(e.id)}
              aria-current={on ? "true" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                on ? "bg-indigo-soft" : "hover:bg-slate-50"
              } ${admitida ? "" : "cursor-not-allowed opacity-50 hover:bg-transparent"}`}
            >
              <Check size={14} className={`shrink-0 ${on ? "text-mint-dark" : "text-transparent"}`} />
              <span className="min-w-0 flex-1 truncate text-ink">{e.nombre}</span>
              <span className="shrink-0 rounded-full border border-borde bg-surface px-2 py-0.5 text-[11px] text-muted">
                {etiquetaDeRol(e.rol)}
              </span>
            </button>
          );
        })}
        {error && <p className="px-2.5 pb-1 pt-2 text-xs text-coral">{error}</p>}
        <p className="mt-1 border-t border-borde px-2.5 py-2 text-[11px] leading-relaxed text-quiet">
          Cambiar de empresa no vuelve a pedir contraseña: el servidor comprueba tu membresía y deja
          el cambio en la bitácora de auditoría.
        </p>
      </PopoverContent>
    </Popover>
  );
}
