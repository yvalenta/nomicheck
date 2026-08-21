import { useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "../lib/supabase.ts";

// Cerrar sesión — EL MISMO en los tres portales (empresa, colaborador,
// verificador con cuenta). signOut dispara onAuthStateChange en el shell y el
// portal vuelve solo a su pantalla de acceso, sin recargar: la sesión es
// estado de React, no una URL. Existía un botón ad-hoc enterrado en la
// pestaña de colaboradores de empresa (2026-08-20) — este lo reemplaza.

interface Props {
  /** oscuro: para el header midnight. claro: para superficies blancas. */
  variante?: "oscuro" | "claro";
}

export default function BotonCerrarSesion({ variante = "oscuro" }: Props) {
  const [saliendo, setSaliendo] = useState(false);
  const estilo =
    variante === "oscuro"
      ? "border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
      : "border border-slate-200 text-muted hover:text-coral hover:border-rose-200";

  return (
    <button
      onClick={async () => {
        setSaliendo(true);
        try {
          await supabase.auth.signOut();
        } finally {
          setSaliendo(false);
        }
      }}
      disabled={saliendo}
      className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${estilo}`}
    >
      <LogOut size={13} /> {saliendo ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
