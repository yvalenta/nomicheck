import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingAction,
  closeAuthModal,
  getPendingAction,
  openAuthModal,
  setPendingAction,
  type GuardarLiquidacionPendiente,
} from "./authFlow";

// El store de "delayed auth": guarda la acción que el usuario intentó hacer sin
// sesión, para reanudarla apenas entre. Se persiste en localStorage a propósito,
// porque tiene que sobrevivir al reload de un redirect OAuth de Google.
//
// Su modo de falla es silencioso y le pega al usuario en el peor momento: si el
// payload se pierde, alguien que llenó un wizard entero de nómina, hizo clic en
// "guardar", se autenticó con Google y volvió... encuentra el formulario vacío.
// No hay error, no hay pantalla rota; simplemente su trabajo no está.
//
// Los dos casos que más importan son los que NO se ven probando a mano en una
// sesión normal: el JSON corrupto y el modo incógnito.

function pendiente(neto = 1234): GuardarLiquidacionPendiente {
  return {
    tipo: "guardar_liquidacion",
    // El store no mira dentro de `resultado`; le basta con transportarlo.
    resultado: { total: neto } as unknown as GuardarLiquidacionPendiente["resultado"],
    netoRecibido: neto,
    capturadoEn: "2026-07-29T00:00:00.000Z",
  };
}

describe("authFlow", () => {
  beforeEach(() => {
    localStorage.clear();
    clearPendingAction();
  });

  it("guarda la acción y la devuelve tal cual", () => {
    setPendingAction(pendiente());
    expect(getPendingAction()).toEqual(pendiente());
  });

  it("la persiste en localStorage, que es lo que la salva del redirect de OAuth", () => {
    setPendingAction(pendiente());
    const crudo = localStorage.getItem("nomicheck:pendingAction");
    expect(crudo).not.toBeNull();
    expect(JSON.parse(crudo!)).toEqual(pendiente());
  });

  it("limpiarla la borra también del storage, no solo de memoria", () => {
    setPendingAction(pendiente());
    clearPendingAction();
    expect(getPendingAction()).toBeNull();
    expect(localStorage.getItem("nomicheck:pendingAction")).toBeNull();
  });

  it("guardar dos veces deja la última, no las acumula", () => {
    setPendingAction(pendiente(100));
    setPendingAction(pendiente(200));
    expect(getPendingAction()!.netoRecibido).toBe(200);
  });

  it("el modal abre y cierra sin tocar la acción pendiente", () => {
    setPendingAction(pendiente());
    openAuthModal();
    closeAuthModal();
    expect(getPendingAction()).not.toBeNull();
  });

  // Los dos que no se ven a mano.

  it("modo incógnito: si localStorage tira, NO revienta y el flujo in-page sigue", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => setPendingAction(pendiente())).not.toThrow();
    // Lo que importa: aunque no se pueda persistir, en memoria SÍ queda, así que
    // el login sin recarga de página funciona igual. Degradar no es fallar.
    expect(getPendingAction()).not.toBeNull();
  });

  it("un localStorage con JSON corrupto no tumba la app al arrancar", async () => {
    localStorage.setItem("nomicheck:pendingAction", "{esto no es json");
    // El estado inicial se lee al importar el módulo, así que hay que
    // recargarlo para ejercitar ese camino.
    vi.resetModules();
    const recargado = await import("./authFlow");
    expect(recargado.getPendingAction()).toBeNull();
  });
});
