import { useState } from "react";
import { AlertTriangle, ArrowRight, Chrome, UserRound } from "lucide-react";
import { supabase } from "../../lib/supabase";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

// Sin auto-registro: la cuenta la crea la invitación de la empresa
// (Supabase Auth inviteUserByEmail, ver authService.ts). El colaborador
// solo inicia sesión — si aún no puso contraseña, usa el link del correo,
// o entra directo con Google si su correo invitado coincide con esa cuenta.
export default function AuthColaborador() {
  const [modo, setModo] = useState<"login" | "olvide">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  async function conGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/colaborador" },
    });
    if (error) setError(error.message);
  }

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  async function enviarEnlaceRecuperacion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/colaborador",
      });
      if (error) throw error;
      setEnlaceEnviado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el enlace");
    } finally {
      setCargando(false);
    }
  }

  if (modo === "olvide") {
    return (
      <div className="flex flex-col gap-4 max-w-md mx-auto">
        <div className="text-center px-4">
          <UserRound size={32} className="text-mint-dark mx-auto mb-2" />
          <h2 className="text-xl font-bold text-ink">Recupera tu contraseña</h2>
          <p className="text-sm text-muted mt-1">Te enviamos un enlace para elegir una nueva.</p>
        </div>
        {enlaceEnviado ? (
          <p className="rounded-xl bg-emerald-50 text-mint-dark text-sm p-3.5 text-center">
            Revisa tu correo ({email}) y sigue el enlace para continuar.
          </p>
        ) : (
          <form onSubmit={enviarEnlaceRecuperacion} className="flex flex-col gap-3">
            <input
              required
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              Enviar enlace <ArrowRight size={18} />
            </button>
          </form>
        )}
        <button
          onClick={() => { setModo("login"); setError(null); setEnlaceEnviado(false); }}
          className="text-sm text-mint-dark hover:underline self-center"
        >
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center px-4">
        <UserRound size={32} className="text-mint-dark mx-auto mb-2" />
        <h2 className="text-xl font-bold text-ink">Portal del colaborador</h2>
        <p className="text-sm text-muted mt-1">
          Ingresa con el correo al que tu empresa te invitó.
        </p>
      </div>

      <button
        onClick={conGoogle}
        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-ink font-medium py-3 hover:bg-slate-50 transition-colors duration-200"
      >
        <Chrome size={18} /> Continuar con Google
      </button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px bg-slate-200 flex-1" /> o con correo <div className="h-px bg-slate-200 flex-1" />
      </div>

      <form onSubmit={ingresar} className="flex flex-col gap-3">
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
          Ingresar <ArrowRight size={18} />
        </button>
      </form>

      <button
        onClick={() => { setModo("olvide"); setError(null); }}
        className="text-xs text-muted hover:underline self-center -mt-2"
      >
        ¿Olvidaste tu contraseña?
      </button>

      <a href="/empresa" className="text-sm text-mint-dark hover:underline self-center">
        ¿Eres empresa? Ingresa aquí
      </a>
    </div>
  );
}
