// Eventos personalizados del Meta Pixel (SDD §16, sdd/marketing/campanas-meta-ads.md).
// Sin pixel conectado todavía: estas funciones son no-op y console.debug — se
// vuelven llamadas reales cuando el equipo cablee fbq(). Mantener el contrato
// aquí evita tocar la landing cuando eso pase.
//
// Contrato tipado con los cinco eventos que optimizan las 4 campañas Meta Ads.
// Cambiar un nombre aquí sin sincronizarlo con Meta rompe la optimización de
// conversiones — la fuente de verdad de los nombres es este archivo.
export type EventoMeta =
  | "verificacion_iniciada"
  | "verificacion_completada"
  | "discrepancia_detectada"
  | "registro_empresa"
  // Click en el CTA de empresas del landing. Es INTERES, no conversion: se
  // separo de `registro_empresa` el 2026-08-16, que hasta entonces se disparaba
  // en este click y hacia que Meta optimizara contra curiosidad.
  | "interes_empresa"
  | "interes_partners";

interface WindowConPixel extends Window {
  fbq?: (accion: "track" | "trackCustom", nombre: string, params?: Record<string, unknown>) => void;
}

export function trackEvento(nombre: EventoMeta, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const win = window as WindowConPixel;
  if (typeof win.fbq === "function") {
    win.fbq("trackCustom", nombre, params);
  } else if (import.meta.env.DEV) {
    console.debug(`[tracking] ${nombre}`, params ?? "");
  }
}
