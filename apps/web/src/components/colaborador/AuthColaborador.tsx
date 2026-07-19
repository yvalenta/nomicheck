import { useState } from "react";
import { AlertTriangle, ArrowRight, UserRound } from "lucide-react";
import { supabase } from "../../lib/supabase";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

// Sin auto-registro: la cuenta la crea la invitación de la empresa
// (Supabase Auth inviteUserByEmail, ver authService.ts). El colaborador
// solo inicia sesión — si aún no puso contraseña, usa el link del correo.
export default function AuthColaborador() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center px-4">
        <UserRound size={32} className="text-mint-dark mx-auto mb-2" />
        <h2 className="text-xl font-bold text-ink">Portal del colaborador</h2>
        <p className="text-sm text-muted mt-1">
          Ingresa con el correo al que tu empresa te invitó.
        </p>
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

      <a href="/empresa" className="text-sm text-mint-dark hover:underline self-center">
        ¿Eres empresa? Ingresa aquí
      </a>
    </div>
  );
}
