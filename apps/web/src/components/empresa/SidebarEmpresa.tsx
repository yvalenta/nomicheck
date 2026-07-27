import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarRange,
  ChevronLeft,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

// Navegación del panel. Reemplaza al SegmentedControl: diez secciones no caben
// en una fila (el scroll horizontal era un parche), y sin agrupar no se lee la
// relación entre ellas. Aquí van en cuatro grupos que siguen el flujo real de
// trabajo — a quién le pagas, cómo liquidas, qué revisas, qué administras.
//
// Responsive: en pantallas grandes es una columna fija que se puede colapsar a
// solo iconos (preferencia recordada); en móvil se esconde y se abre como
// panel deslizante sobre el contenido.

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
  | "auditoria";

type Item = { valor: Seccion; etiqueta: string; Icon: typeof Users };

const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "General",
    items: [{ valor: "resumen", etiqueta: "Resumen", Icon: LayoutDashboard }],
  },
  {
    titulo: "Personas",
    items: [
      { valor: "colaboradores", etiqueta: "Colaboradores", Icon: Users },
      { valor: "contratistas", etiqueta: "Contratistas", Icon: Briefcase },
      { valor: "sedes", etiqueta: "Sedes", Icon: Building2 },
    ],
  },
  {
    titulo: "Liquidación",
    items: [
      { valor: "periodos", etiqueta: "Periodos", Icon: CalendarRange },
      { valor: "costos", etiqueta: "Costos", Icon: Wallet },
      { valor: "pila", etiqueta: "PILA", Icon: FileSpreadsheet },
    ],
  },
  {
    titulo: "Control",
    items: [
      { valor: "cumplimiento", etiqueta: "Cumplimiento", Icon: ShieldCheck },
      { valor: "discrepancias", etiqueta: "Discrepancias", Icon: AlertTriangle },
      { valor: "auditoria", etiqueta: "Auditoría", Icon: History },
    ],
  },
];

const CLAVE_COLAPSADO = "nc-sidebar-colapsado";

interface Props {
  activo: Seccion;
  onCambio: (s: Seccion) => void;
  /** Precarga del chunk de la sección al pasar el mouse. */
  onPreparar?: (s: Seccion) => void;
}

export default function SidebarEmpresa({ activo, onCambio, onPreparar }: Props) {
  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem(CLAVE_COLAPSADO) === "1",
  );
  const [abiertoMovil, setAbiertoMovil] = useState(false);

  useEffect(() => {
    localStorage.setItem(CLAVE_COLAPSADO, colapsado ? "1" : "0");
  }, [colapsado]);

  // En móvil el panel se superpone: cerrarlo con Escape y bloquear el scroll
  // de fondo mientras está abierto.
  useEffect(() => {
    if (!abiertoMovil) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbiertoMovil(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [abiertoMovil]);

  const activoItem = GRUPOS.flatMap((g) => g.items).find((i) => i.valor === activo);

  function elegir(s: Seccion) {
    onCambio(s);
    setAbiertoMovil(false);
  }

  const nav = (
    <nav className="flex flex-col gap-5 py-4" aria-label="Secciones del panel">
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-1">
          {!colapsado && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.09em] text-muted/70">
              {g.titulo}
            </p>
          )}
          {g.items.map(({ valor, etiqueta, Icon }) => {
            const on = valor === activo;
            return (
              <button
                key={valor}
                onClick={() => elegir(valor)}
                onMouseEnter={() => !on && onPreparar?.(valor)}
                onFocus={() => !on && onPreparar?.(valor)}
                aria-current={on ? "page" : undefined}
                title={colapsado ? etiqueta : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  on
                    ? "bg-mint/10 text-mint-dark"
                    : "text-muted hover:bg-slate-100 hover:text-ink"
                } ${colapsado ? "justify-center px-2" : ""}`}
              >
                <Icon size={16} className="shrink-0" />
                {!colapsado && <span className="truncate">{etiqueta}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Barra móvil: abre el panel y muestra dónde estás */}
      <div className="lg:hidden flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <button
          onClick={() => setAbiertoMovil(true)}
          className="flex items-center gap-2 text-sm font-medium text-ink"
          aria-label="Abrir menú de secciones"
        >
          <Menu size={18} />
          {activoItem && (
            <>
              <activoItem.Icon size={15} className="text-mint-dark" />
              {activoItem.etiqueta}
            </>
          )}
        </button>
      </div>

      {/* Panel deslizante en móvil */}
      {abiertoMovil && (
        <div
          className="lg:hidden fixed inset-0 z-[70] bg-navy/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
          onMouseDown={(e) => e.target === e.currentTarget && setAbiertoMovil(false)}
        >
          <div className="h-full w-72 max-w-[82vw] overflow-y-auto bg-white px-3 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-2 pt-4">
              <span className="text-sm font-bold text-ink">Secciones</span>
              <button
                onClick={() => setAbiertoMovil(false)}
                aria-label="Cerrar"
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      {/* Columna fija en escritorio */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-slate-200 pr-3 transition-[width] duration-200 ${
          colapsado ? "w-[4.25rem]" : "w-56"
        }`}
      >
        {nav}
        <button
          onClick={() => setColapsado((v) => !v)}
          className="mt-auto mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:bg-slate-100 hover:text-ink"
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
        >
          {colapsado ? <ChevronLeft size={15} className="rotate-180" /> : <PanelLeftClose size={15} />}
          {!colapsado && "Colapsar"}
        </button>
      </aside>
    </>
  );
}
