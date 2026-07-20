import { supabase } from "./lib/supabase";
import type { LineaRecibo } from "./apiEmpresa";

async function autenticado(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Error de red");
  return body;
}

export type TipoDiscrepancia = "pago_de_mas" | "pago_de_menos" | "concepto_faltante";

export interface ReporteDiscrepancia {
  id: number;
  reciboId: number;
  tipo: TipoDiscrepancia;
  detalle: string;
  estado: "abierto" | "en_revision" | "resuelto";
  respuestaEmpresa: string | null;
}

export interface ReciboPropio {
  id: number;
  periodoId: number;
  periodo: { fechaInicio: string; fechaFin: string; empresa: { nombre: string } };
  empleado: { nombre: string; documento: string } | null;
  lineas: LineaRecibo[];
  advertencias: string[];
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
  liquidadoEn: string;
  reportes: ReporteDiscrepancia[];
}

export function listarMisRecibos(): Promise<ReciboPropio[]> {
  return autenticado("/colaborador/recibos");
}

export function reportarDiscrepancia(
  reciboId: number,
  datos: { tipo: TipoDiscrepancia; detalle: string }
): Promise<ReporteDiscrepancia> {
  return autenticado(`/colaborador/recibos/${reciboId}/reportar`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export interface Invitacion {
  id: number; // empleadoId
  nombre: string;
  empresa: { nombre: string; sector: string };
}

export interface EmpresaHistorial {
  empleadoId: number;
  empresa: string;
  sector: string;
  fechaIngreso: string;
  fechaRetiro: string | null;
  estado: "activa" | "pendiente" | "retirada";
}

export function listarInvitaciones(): Promise<Invitacion[]> {
  return autenticado("/colaborador/invitaciones");
}

export function aceptarInvitacion(empleadoId: number): Promise<unknown> {
  return autenticado(`/colaborador/invitaciones/${empleadoId}/aceptar`, { method: "POST" });
}

export function rechazarInvitacion(empleadoId: number): Promise<{ ok: true }> {
  return autenticado(`/colaborador/invitaciones/${empleadoId}/rechazar`, { method: "POST" });
}

export function listarMisEmpresas(): Promise<EmpresaHistorial[]> {
  return autenticado("/colaborador/empresas");
}
