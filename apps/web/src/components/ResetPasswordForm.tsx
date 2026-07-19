import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  // Se llama tras guardar la nueva contraseña con éxito — el llamador
  // decide qué hacer (ej. salir del modo recuperación y mostrar el dashboard).
  onListo: () => void;
}

// Se muestra cuando Supabase dispara el evento PASSWORD_RECOVERY (el usuario
// llegó desde el enlace de "olvidé mi contraseña" en su correo) — ese enlace
// ya trae una sesión válida, solo falta pedir la contraseña nueva y llamar
// updateUser. Mismo componente para empresa y colaborador.
export default function ResetPasswordForm({ onListo }: Props) {
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la contraseña");
    } finally {
      setCargando(false);
    }
  }

  if (listo) {
    return (
      <div className="flex flex-col items-center gap-3 max-w-md mx-auto text-center px-4 py-10">
        <CheckCircle2 size={32} className="text-mint-dark" />
        <p className="text-sm font-medium text-ink">Contraseña actualizada.</p>
        <button onClick={onListo} className="text-sm font-medium text-mint-dark hover:underline">
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center px-4">
        <KeyRound size={32} className="text-mint-dark mx-auto mb-2" />
        <h2 className="text-xl font-bold text-ink">Nueva contraseña</h2>
        <p className="text-sm text-muted mt-1">Elige una contraseña nueva para tu cuenta.</p>
      </div>

      <form onSubmit={guardar} className="flex flex-col gap-3">
        <input
          required
          type="password"
          placeholder="Contraseña nueva"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
        <input
          required
          type="password"
          placeholder="Confirma la contraseña"
          minLength={8}
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          className={inputCls}
        />

        {error && (
          <div className="rounded-xl p-3 bg-red-50 text-coral flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
        >
          Guardar contraseña <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
