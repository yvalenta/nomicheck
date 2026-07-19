import { useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Lock, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { registrarIndividual } from "../api";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

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

  async function conGoogle() {
    setError(null);
    // signInWithOAuth redirige la página entera — el pendingAction ya vive en
    // localStorage (no en memoria) precisamente para sobrevivir a ese reload;
    // AuthFlowManager retoma la acción al volver (getSession al montar).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) setError(error.message);
  }

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

        <button
          type="button"
          onClick={conGoogle}
          className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-ink hover:bg-slate-50 transition-colors duration-200"
        >
          <GoogleIcon />
          Continuar con Google
        </button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-slate-200" />
          o con tu correo
          <div className="h-px flex-1 bg-slate-200" />
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
