// El sello de NomiCheck (dirección C, propuesta 2026-08-20): el escudo se
// vuelve sello de verificación — el check rompe el borde del marco y remata
// en el punto ámbar (la evidencia queda a la vista). Reemplaza al ShieldCheck
// genérico de lucide en las superficies de marca; el favicon es este mismo
// dibujo en su variante "gradiente" (public/favicon.svg).
interface Props {
  size?: number;
  /** midnight: contorno índigo para fondos oscuros. gradiente: tile relleno. */
  variante?: "midnight" | "gradiente";
}

export default function Sello({ size = 30, variante = "midnight" }: Props) {
  if (variante === "gradiente") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="56" height="56" rx="17" fill="url(#sello-g)" />
        <path
          d="M18 33 L28.5 43.5 L51 20"
          stroke="#ffffff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="51" cy="20" r="5" fill="#f59e0b" />
        <defs>
          <linearGradient id="sello-g" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6f66ee" />
            <stop offset="1" stopColor="#4a3fd0" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="15" fill="none" stroke="#6f66ee" strokeWidth="3" />
      <path
        d="M20 32.5 L29 41.5 L50 20.5"
        stroke="#f7f8fc"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="20.5" r="4.5" fill="#f59e0b" />
    </svg>
  );
}
