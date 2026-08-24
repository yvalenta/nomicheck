import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Chrome, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";
import { irAPortalSegunRol } from "./lib/irAPortal.ts";
import HeaderProfile from "./components/HeaderProfile.tsx";

const inputCls =
  "rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

// Punto de entrada único: cualquier cuenta (empresa, colaborador, admin de
// plataforma) inicia sesión aquí y se le manda a su portal automáticamente
// según su rol real (irAPortalSegunRol → GET /api/auth/whoami) — antes había
// que saber de antemano si ir a /empresa o /colaborador. No hay registro
// aquí (cada rol tiene su propio flujo de alta: registro de empresa,
// invitación de colaborador, o alta manual de admin de plataforma).
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Retorno de un redirect OAuth (Google) — ya hay sesión, solo falta
    // resolver el rol y mandar al portal correcto.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (session) irAPortalSegunRol().catch((e) => setError(e instanceof Error ? e.message : "Error inesperado"));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function conGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/login" },
    });
    if (error) setError(error.message);
  }

  async function conEmail(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await irAPortalSegunRol();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderProfile paso="Ingresar" />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        <div className="flex flex-col gap-4 max-w-md mx-auto">
          <div className="text-center px-4">
            <ShieldCheck size={32} className="text-mint-dark mx-auto mb-2" />
            <h2 className="text-xl font-bold text-ink">Ingresa a NomiCheck</h2>
            <p className="text-sm text-muted mt-1">Te llevamos a tu portal automáticamente.</p>
          </div>

          <button
            onClick={conGoogle}
            className="flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white text-ink font-medium py-3 hover:bg-slate-50 transition-colors duration-200"
          >
            <Chrome size={18} /> Continuar con Google
          </button>

          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="h-px bg-slate-200 flex-1" /> o con correo <div className="h-px bg-slate-200 flex-1" />
          </div>

          <form onSubmit={conEmail} className="flex flex-col gap-3">
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
              className="flex items-center justify-center gap-2 rounded-full bg-mint text-white font-medium py-3 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
            >
              Ingresar <ArrowRight size={18} />
            </button>
          </form>

          <a href="/empresa" className="text-sm text-muted hover:underline self-center">
            ¿Empresa nueva? Regístrate aquí
          </a>
        </div>
      </main>
    </div>
  );
}
