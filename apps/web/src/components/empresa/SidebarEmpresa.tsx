import {
  CalendarRange,
  Home,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

// Navegación del panel — unificación 2026-08-20 (dirección C de la propuesta).
// Once ítems en cuatro grupos eran demasiado menú: cada sección repetía título
// y el mapa completo no cabía en la cabeza. Ahora hay CINCO destinos y lo
// secundario vive DENTRO de cada destino como pestañas que pinta el shell
// (EmpresaApp), no este componente. El menú dice a dónde vas; la pestaña dice
// qué parte estás mirando.
//
// Responsive: en escritorio es un riel fijo de cinco entradas (sin colapso:
// cinco ítems no lo necesitan); en móvil se vuelve bottom nav — el patrón que
// el pulgar alcanza — y el shell le deja espacio con padding inferior.

export type Seccion =
  | "resumen"
  | "colaboradores"
  | "contratistas"
  | "periodos"
  | "discrepancias"
  | "costos"
  | "pila"
  | "cumplimiento"
  | "sedes"
  | "auditoria"
  | "roles"
  | "cuenta";

export type Destino = "inicio" | "personas" | "liquidacion" | "control" | "cuenta";

type Pestana = { valor: Seccion; etiqueta: string };

export const DESTINOS: {
  valor: Destino;
  etiqueta: string;
  Icon: typeof Users;
  pestanas: Pestana[];
}[] = [
  {
    valor: "inicio",
    etiqueta: "Inicio",
    Icon: Home,
    pestanas: [{ valor: "resumen", etiqueta: "Resumen" }],
  },
  {
    valor: "personas",
    etiqueta: "Personas",
    Icon: Users,
    pestanas: [
      { valor: "colaboradores", etiqueta: "Colaboradores" },
      { valor: "contratistas", etiqueta: "Contratistas" },
      { valor: "sedes", etiqueta: "Sedes" },
    ],
  },
  {
    valor: "liquidacion",
    etiqueta: "Liquidación",
    Icon: CalendarRange,
    pestanas: [
      { valor: "periodos", etiqueta: "Periodos" },
      { valor: "costos", etiqueta: "Costos" },
      { valor: "pila", etiqueta: "PILA" },
    ],
  },
  {
    valor: "control",
    etiqueta: "Control",
    Icon: ShieldCheck,
    pestanas: [
      { valor: "cumplimiento", etiqueta: "Cumplimiento" },
      { valor: "discrepancias", etiqueta: "Discrepancias" },
      { valor: "auditoria", etiqueta: "Auditoría" },
      // Junto a Auditoría a propósito: esa dice quién tocó qué y esta quién
      // puede tocarlo. Son la misma pregunta en pasado y en futuro.
      { valor: "roles", etiqueta: "Roles" },
    ],
  },
  {
    // Sale del grupo Control (donde vivía como cuarto ítem): es la relación
    // comercial con NomiCheck, no una tarea de nómina — destino propio.
    valor: "cuenta",
    etiqueta: "Cuenta",
    Icon: UserRound,
    pestanas: [{ valor: "cuenta", etiqueta: "Tu cuenta" }],
  },
];

export function destinoDeSeccion(s: Seccion): (typeof DESTINOS)[number] {
  return DESTINOS.find((d) => d.pestanas.some((p) => p.valor === s)) ?? DESTINOS[0];
}

interface Props {
  activo: Seccion;
  onCambio: (s: Seccion) => void;
  /** Precarga del chunk de la sección al pasar el mouse. */
  onPreparar?: (s: Seccion) => void;
}

export default function SidebarEmpresa({ activo, onCambio, onPreparar }: Props) {
  const destinoActivo = destinoDeSeccion(activo).valor;

  function elegir(d: (typeof DESTINOS)[number]) {
    // Ir a un destino es ir a su primera pestaña; si ya estás en el destino,
    // el clic te devuelve a esa primera pestaña (comportamiento de "subir").
    onCambio(d.pestanas[0].valor);
  }

  return (
    <>
      {/* Riel fijo en escritorio */}
      <aside className="hidden lg:flex w-44 shrink-0 flex-col gap-1 py-4" aria-label="Destinos del panel">
        {DESTINOS.map((d) => {
          const on = d.valor === destinoActivo;
          return (
            <button
              key={d.valor}
              onClick={() => elegir(d)}
              onMouseEnter={() => !on && onPreparar?.(d.pestanas[0].valor)}
              onFocus={() => !on && onPreparar?.(d.pestanas[0].valor)}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                on
                  ? "border-transparent bg-indigo-soft text-mint-dark"
                  : "border-transparent text-muted hover:bg-white/60 hover:text-ink"
              }`}
            >
              <d.Icon size={14} className="shrink-0" />
              <span className="truncate">{d.etiqueta}</span>
            </button>
          );
        })}
      </aside>

      {/* Bottom nav en móvil — el shell reserva el espacio con pb */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="Destinos del panel"
      >
        {DESTINOS.map((d) => {
          const on = d.valor === destinoActivo;
          return (
            <button
              key={d.valor}
              onClick={() => elegir(d)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] ${
                on ? "font-semibold text-mint-dark" : "text-muted"
              }`}
            >
              <d.Icon size={19} />
              {d.etiqueta}
            </button>
          );
        })}
      </nav>
    </>
  );
}
