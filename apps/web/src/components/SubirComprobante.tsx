import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, FileUp, Loader2 } from "lucide-react";
import { extraerComprobante, type ComprobanteExtraido } from "../api";
import PaycheckCard from "./PaycheckCard.tsx";

interface Props {
  onExtraido: (datos: ComprobanteExtraido) => void;
  onAtras: () => void;
}

export default function SubirComprobante({ onExtraido, onAtras }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function procesar(archivo: File) {
    setCargando(true);
    setError(null);
    try {
      const datos = await extraerComprobante(archivo);
      onExtraido(datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center px-4">
        <h2 className="text-xl font-bold text-ink">Sube tu comprobante</h2>
        <p className="text-sm text-muted mt-1">
          Leemos tu comprobante de pago y precargamos los datos — tú revisas antes de calcular.
        </p>
      </div>

      <PaycheckCard>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const f = e.dataTransfer.files[0];
            if (f) procesar(f);
          }}
          onClick={() => !cargando && inputRef.current?.click()}
          className={`m-2 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-14 cursor-pointer transition-colors duration-200 ease-in-out ${
            arrastrando ? "border-mint bg-emerald-50" : "border-slate-200 hover:border-mint/60"
          }`}
        >
          {cargando ? (
            <>
              <Loader2 size={32} className="text-mint animate-spin" />
              <p className="text-sm text-muted">Leyendo tu comprobante…</p>
            </>
          ) : (
            <>
              <FileUp size={32} className="text-mint-dark" />
              <p className="text-sm font-medium text-ink">Arrastra tu comprobante aquí</p>
              <p className="text-xs text-muted">o haz clic para elegir un archivo — JPG, PNG o PDF</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) procesar(f);
            }}
          />
        </div>
      </PaycheckCard>

      {error && (
        <div className="rounded-2xl p-3.5 bg-red-50 text-coral flex items-start gap-2.5 text-sm">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-xs text-muted text-center px-4">
        Tu comprobante se procesa una sola vez y no se guarda en ningún lado.
      </p>

      <button
        onClick={onAtras}
        className="flex items-center justify-center gap-2 self-center text-sm font-medium text-mint-dark hover:underline"
      >
        <ArrowLeft size={15} /> Prefiero digitarlo yo
      </button>
    </div>
  );
}
