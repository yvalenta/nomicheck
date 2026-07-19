import { useState } from "react";
import { AlertTriangle, ArrowRight, Building2, Chrome } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { registrarEmpresa } from "../../apiEmpresa";
import PaycheckCard from "../PaycheckCard.tsx";

const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint/40 focus:border-mint transition-shadow duration-200";

export default function AuthEmpresa() {
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [nit, setNit] = useState("");
  const [sector, setSector] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function conGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/empresa" },
    });
    if (error) setError(error.message);
  }

  async function conEmail(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        await registrarEmpresa({
          email,
          password,
          nombre,
          empresa: { nombre: nombreEmpresa, nit, sector },
        });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto">
      <div className="text-center px-4">
        <Building2 size={32} className="text-mint-dark mx-auto mb-2" />
        <h2 className="text-xl font-bold text-ink">
          {modo === "login" ? "Ingresa a tu empresa" : "Registra tu empresa"}
        </h2>
        <p className="text-sm text-muted mt-1">Liquida y verifica la nómina de tu equipo.</p>
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

      <form onSubmit={conEmail} className="flex flex-col gap-3">
        {modo === "registro" && (
          <PaycheckCard titulo="Tu empresa">
            <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
              <input
                required
                placeholder="Tu nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={inputCls}
              />
              <input
                required
                placeholder="Nombre de la empresa"
                value={nombreEmpresa}
                onChange={(e) => setNombreEmpresa(e.target.value)}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="NIT"
                  value={nit}
                  onChange={(e) => setNit(e.target.value)}
                  className={inputCls}
                />
                <input
                  required
                  placeholder="Sector (ej: restaurante)"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </PaycheckCard>
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
            <div className="flex flex-col gap-1.5">
              <span>{error}</span>
              {modo === "registro" && error.includes("Ya existe una cuenta") && (
                <button
                  type="button"
                  onClick={() => {
                    setModo("login");
                    setError(null);
                  }}
                  className="self-start text-xs font-medium underline"
                >
                  Ir a iniciar sesión
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="flex items-center justify-center gap-2 rounded-xl bg-mint text-white font-semibold py-3 hover:bg-mint-dark transition-colors duration-200 disabled:opacity-40"
        >
          {modo === "login" ? "Ingresar" : "Crear cuenta"} <ArrowRight size={18} />
        </button>
      </form>

      <button
        onClick={() => setModo(modo === "login" ? "registro" : "login")}
        className="text-sm text-mint-dark hover:underline self-center"
      >
        {modo === "login" ? "¿Empresa nueva? Regístrate" : "¿Ya tienes cuenta? Ingresa"}
      </button>

      <a href="/colaborador" className="text-sm text-muted hover:underline self-center">
        ¿Eres colaborador de una empresa? Ingresa aquí
      </a>
    </div>
  );
}
