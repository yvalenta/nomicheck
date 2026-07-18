import { useSyncExternalStore } from "react";
import type { ResultadoNomina } from "@pv/reglas";

// Store mínimo de "delayed auth": guarda la acción que el usuario intentó
// hacer sin estar autenticado (guardar su liquidación) para reanudarla apenas
// inicie sesión. Se persiste en localStorage a propósito — así sobrevive al
// reload de un redirect OAuth (Google), cosa que un store solo-en-memoria
// perdería. No usamos Zustand: el proyecto no tiene store global y esto es un
// único trozo de estado; useSyncExternalStore alcanza y no suma dependencias.

const STORAGE_KEY = "nomicheck:pendingAction";

// Payload de la acción pendiente. Discriminada por `tipo` para poder crecer a
// otras acciones diferidas en el futuro (ej. reportar, exportar) sin romper.
export interface GuardarLiquidacionPendiente {
  tipo: "guardar_liquidacion";
  resultado: ResultadoNomina;
  netoRecibido?: number;
  capturadoEn: string; // ISO — para descartar payloads viejos si hiciera falta
}

export type PendingAction = GuardarLiquidacionPendiente | null;

interface AuthFlowState {
  pendingAction: PendingAction;
  isAuthModalOpen: boolean;
}

function leerPersistido(): PendingAction {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingAction) : null;
  } catch {
    return null; // JSON corrupto o modo incógnito sin storage
  }
}

let estado: AuthFlowState = {
  pendingAction: leerPersistido(),
  isAuthModalOpen: false,
};

const listeners = new Set<() => void>();

function emitir(parcial: Partial<AuthFlowState>) {
  estado = { ...estado, ...parcial };
  for (const l of listeners) l();
}

// --- API imperativa (usable fuera de React: handlers, interceptores) ---

export function getPendingAction(): PendingAction {
  return estado.pendingAction;
}

export function setPendingAction(action: PendingAction) {
  try {
    if (action) localStorage.setItem(STORAGE_KEY, JSON.stringify(action));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin acceso a storage (incógnito): seguimos en memoria, el flujo in-page igual funciona.
  }
  emitir({ pendingAction: action });
}

export function clearPendingAction() {
  setPendingAction(null);
}

export function openAuthModal() {
  emitir({ isAuthModalOpen: true });
}

export function closeAuthModal() {
  emitir({ isAuthModalOpen: false });
}

// --- Hook para componentes ---

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return estado;
}

export function useAuthFlow(): AuthFlowState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
