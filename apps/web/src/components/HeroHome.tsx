import { ArrowRight, Bot, Building2, IdCard } from "lucide-react";
import Sello from "./Sello.tsx";

// Portada de la raíz (dirección C, 2026-08-20). Antes la calculadora ERA la
// página y el footer cargaba cuatro enlaces apilados; ahora el hero responde
// primero —¿te pagaron bien?— con UNA acción, la calculadora vive debajo como
// sección (#verificar) y las tres puertas absorben los enlaces del footer.

interface Props {
  /** Baja con scroll suave a la sección de la calculadora. */
  onVerificar: () => void;
}

export default function HeroHome({ onVerificar }: Props) {
  return (
    <header className="bg-midnight bg-dots text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <Sello size={32} variante="midnight" />
          <span className="font-display text-lg font-bold tracking-tight">NomiCheck</span>
        </div>
        <a
          href="/login"
          className="rounded-full border border-slate-700 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:border-slate-500"
        >
          Ingresar
        </a>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-5 pb-10 pt-8 text-center">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Nómina colombiana · cálculo determinístico · salida firmada
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          ¿Te pagaron bien?
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-slate-400">
          Dinos tu salario y tus horarios — hacemos las cuentas con la ley colombiana vigente y te
          decimos qué debía llegar a tu bolsillo. Gratis, sin registro, y nadie más que tú ve el
          resultado.
        </p>
        <button
          onClick={onVerificar}
          className="mt-1 flex items-center gap-2 rounded-full bg-mint px-6 py-3.5 text-[15px] font-medium text-white shadow-realce transition-colors hover:bg-mint-dark"
        >
          Verificar mi pago <ArrowRight size={16} />
        </button>
      </div>

      {/* Las tres puertas — lo que antes vivía apilado en el footer */}
      <div className="mx-auto grid max-w-5xl gap-3 px-5 pb-10 sm:grid-cols-3">
        <a
          href="/empresa"
          className="group flex items-center gap-3 rounded-[14px] border border-slate-800 bg-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.08]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-indigo-soft/20 text-indigo">
            <Building2 size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-white">Somos una empresa</span>
            <span className="block truncate text-[11.5px] text-slate-400">
              Liquida bien y pruébalo
            </span>
          </span>
        </a>
        <a
          href="/colaborador"
          className="group flex items-center gap-3 rounded-[14px] border border-slate-800 bg-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.08]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-teal-50/10 text-teal-300">
            <IdCard size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-white">Soy colaborador</span>
            <span className="block truncate text-[11.5px] text-slate-400">
              Mi empresa usa NomiCheck
            </span>
          </span>
        </a>
        <a
          href="/docs/"
          className="group flex items-center gap-3 rounded-[14px] border border-slate-800 bg-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.08]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-amber-50/10 text-amber-300">
            <Bot size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-white">Soy un agente</span>
            <span className="block truncate text-[11.5px] text-slate-400">
              API con x402, pago por llamada
            </span>
          </span>
        </a>
      </div>
    </header>
  );
}
