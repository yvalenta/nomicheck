import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  titulo: string;
  descripcion?: string;
}

// Reemplaza los textos sueltos tipo "No tienes colaboradores activos" por un
// bloque consistente (ícono + título + descripción) — mismo componente en
// toda la app en vez de un <p> de estilo distinto por pantalla.
export default function EmptyState({ icon: Icon = Inbox, titulo, descripcion }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="w-11 h-11 rounded-xl bg-slate-100 text-muted flex items-center justify-center">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-ink">{titulo}</p>
      {descripcion && <p className="text-xs text-muted max-w-xs">{descripcion}</p>}
    </div>
  );
}
