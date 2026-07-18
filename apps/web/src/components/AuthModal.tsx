import { useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Lock, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { registrarIndividual } from "../api";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

interface Props {
  open: boolean;
  onClose: () => void;
  // Se llama cuando ya hay sesión activa (login OK, o signup sin confirmación
  // de correo). El interceptor de AuthFlowManager reanuda la acción pendiente.
  onAuthSuccess: () => void;
}

// Modal de registro/login para el flujo de "guardar liquidación". Usa el
// cliente Supabase del proyecto — mismas credenciales que /empresa y
// /colaborador, sin fijar contraseñas del lado servidor.
export default function AuthModal({ open, onClose, onAuthSuccess }: Props) {
  const [modo, setModo] = useState<"login" | "registro">("registro");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      if (modo === "registro") {
        // La cuenta se crea server-side con email_confirm=true — así el
        // signInWithPassword de abajo trae sesión inmediata (sin correo) y el
        // guardado diferido se dispara al toque. Mismo patrón que AuthEmpresa.
        await registrarIndividual({ email, password, nombre });
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuthSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autenticar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-mint-dark flex items-center justify-center shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">
                {modo === "login" ? "Inicia sesión" : "Crea tu cuenta"}
              </h2>
              <p className="text-xs text-muted">Para guardar esta liquidación en tu historial.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink shrink-0" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          {modo === "registro" && (
            <input
              required
              placeholder="Tu nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputCls}
            />
          )}
          <input
            required
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
          <input
            required
            type="password"
            placeholder="Contraseña"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            {cargando ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                {modo === "login" ? "Entrar y guardar" : "Crear cuenta y guardar"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => {
            setModo(modo === "login" ? "registro" : "login");
            setError(null);
          }}
          className="text-sm text-mint-dark hover:underline self-center"
        >
          {modo === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
