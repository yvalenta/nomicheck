import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `usePeriodoEstado` es un bucle de polling, y los bucles fallan en las dos
// direcciones sin que nadie lo note:
//
//   - **No para.** Si deja de reconocer un estado terminal, sigue preguntando
//     por un periodo que ya terminó, una petición cada 3 segundos, para siempre,
//     por cada periodo expandido y por cada pestaña abierta. En pantalla se ve
//     igual de bien: el estado ya llegó. El que se entera es la factura.
//   - **Para de más.** Si se rinde ante un error de red, la UI se congela en
//     "liquidando" y la empresa cree que la liquidación sigue corriendo cuando
//     hace rato terminó. Nadie ve un error; ven una barra que no avanza.
//   - **No se cancela al desmontar.** Cerrar el periodo (o navegar) deja el
//     ciclo vivo en segundo plano.
//
// Ninguno de los tres se reproduce mirando la pantalla: hay que contar las
// peticiones. Por eso se prueba el hook REAL con relojes falsos, y no una
// copia de su lógica — el orden entre el `setTimeout`, el `await` y el cleanup
// del efecto ES lo que se está verificando.
//
// `apiEmpresa` va mockeado, y de paso resuelve la otra trampa: ese módulo
// importa `lib/supabase`, que llama a `createClient()` al cargarse y revienta
// sin las variables de Vite. Con el mock esta suite corre sin `.env.local`.
const { obtenerEstadoLiquidacion } = vi.hoisted(() => ({ obtenerEstadoLiquidacion: vi.fn() }));
vi.mock("../../apiEmpresa", () => ({ obtenerEstadoLiquidacion }));

import type { EstadoLiquidacion, EstadoPeriodo } from "../../apiEmpresa";
import { TERMINALES } from "./estadosPeriodo";
import { usePeriodoEstado } from "./usePeriodoEstado";

// React sólo acepta `act()` si el entorno lo declara; sin esto cada llamada
// escribe una advertencia en stderr y el ruido tapa los fallos de verdad.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function estadoDe(estado: EstadoPeriodo, progreso = 50): EstadoLiquidacion {
  return { id: 3, estado, progreso, jobId: "job-1", erroresLiquidacion: null, version: 1 };
}

function montar() {
  const sonda = { estado: null as EstadoLiquidacion | null, error: null as string | null };
  const root = createRoot(document.createElement("div"));

  function Probe({ activo, intervaloMs }: { activo: boolean; intervaloMs?: number }) {
    const r = usePeriodoEstado(3, activo, intervaloMs);
    sonda.estado = r.estado;
    sonda.error = r.error;
    return null;
  }

  return {
    sonda,
    async render(activo: boolean, intervaloMs?: number) {
      await act(async () => {
        root.render(createElement(Probe, { activo, intervaloMs }));
      });
    },
    async desmontar() {
      await act(async () => {
        root.unmount();
      });
    },
    /** Corre el reloj falso dejando que los `await` del tick se resuelvan. */
    async avanzar(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
  };
}

describe("usePeriodoEstado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    obtenerEstadoLiquidacion.mockReset();
    obtenerEstadoLiquidacion.mockResolvedValue(estadoDe("liquidando"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con activo=false no pregunta nada", async () => {
    const h = montar();
    await h.render(false);
    await h.avanzar(30_000);
    // Un periodo colapsado no debe costar una petición cada 3 segundos.
    expect(obtenerEstadoLiquidacion).not.toHaveBeenCalled();
  });

  it("con activo=true pregunta al toque y expone el estado", async () => {
    const h = montar();
    await h.render(true);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledWith(3);
    expect(h.sonda.estado).toMatchObject({ estado: "liquidando", progreso: 50 });
  });

  it("mientras el estado no sea terminal sigue preguntando cada intervalo", async () => {
    const h = montar();
    await h.render(true);
    await h.avanzar(3000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(2);
    await h.avanzar(6000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(4);
  });

  // El fallo caro: no parar nunca.
  it.each(TERMINALES)("en estado terminal '%s' DEJA de preguntar", async (terminal) => {
    obtenerEstadoLiquidacion.mockResolvedValue(estadoDe(terminal, 100));
    const h = montar();
    await h.render(true);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);

    await h.avanzar(60_000);
    // Veinte intervalos después sigue habiendo UNA sola petición. Si alguna
    // vez esta cifra sube, hay un polling eterno por cada periodo liquidado.
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);
  });

  it("llegar a terminal DESPUÉS de varios ciclos también corta el bucle", async () => {
    obtenerEstadoLiquidacion
      .mockResolvedValueOnce(estadoDe("liquidando", 10))
      .mockResolvedValueOnce(estadoDe("liquidando", 60))
      .mockResolvedValue(estadoDe("liquidado", 100));

    const h = montar();
    await h.render(true);
    await h.avanzar(3000);
    await h.avanzar(3000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(3);
    expect(h.sonda.estado?.estado).toBe("liquidado");

    await h.avanzar(30_000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(3);
  });

  // El fallo opuesto: rendirse ante un error de red y congelar la UI.
  it("un error NO detiene el polling: reintenta y muestra el motivo", async () => {
    obtenerEstadoLiquidacion.mockRejectedValue(new Error("Failed to fetch"));
    const h = montar();
    await h.render(true);

    expect(h.sonda.error).toBe("Failed to fetch");
    await h.avanzar(3000);
    // Rendirse dejaría la barra en "liquidando" para siempre sin decir por qué.
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(2);
  });

  it("cuando la red vuelve, el error se limpia solo", async () => {
    obtenerEstadoLiquidacion
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue(estadoDe("liquidando"));

    const h = montar();
    await h.render(true);
    expect(h.sonda.error).toBe("Failed to fetch");

    await h.avanzar(3000);
    // Un error que no se limpia deja un cartel rojo sobre datos que ya son
    // buenos, y nadie sabe si mirarlos o no.
    expect(h.sonda.error).toBeNull();
    expect(h.sonda.estado?.estado).toBe("liquidando");
  });

  it("algo que no es un Error no llega a pantalla como '[object Object]'", async () => {
    obtenerEstadoLiquidacion.mockRejectedValue({ status: 500 });
    const h = montar();
    await h.render(true);
    expect(h.sonda.error).toBe("Error al consultar estado");
  });

  it("desmontar corta el ciclo: no queda un timer vivo en segundo plano", async () => {
    const h = montar();
    await h.render(true);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);

    await h.desmontar();
    await h.avanzar(30_000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);
  });

  // El caso que el `if (cancelado) return` cubre y el `clearTimeout` no: la
  // petición ya salió cuando el componente se fue. Al volver, escribe estado de
  // un componente muerto Y programa el siguiente tick — el ciclo revive después
  // del desmontaje, invisible salvo mirando la pestaña de red.
  it("una petición EN VUELO al desmontar no revive el ciclo", async () => {
    let resolver!: (v: EstadoLiquidacion) => void;
    obtenerEstadoLiquidacion.mockReturnValue(
      new Promise<EstadoLiquidacion>((r) => {
        resolver = r;
      }),
    );

    const h = montar();
    await h.render(true);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);

    await h.desmontar();
    await act(async () => {
      resolver(estadoDe("liquidando"));
      await Promise.resolve();
    });
    await h.avanzar(30_000);

    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);
  });

  it("colapsar el periodo (activo → false) también corta el ciclo", async () => {
    const h = montar();
    await h.render(true);
    await h.avanzar(3000);
    const antes = obtenerEstadoLiquidacion.mock.calls.length;

    await h.render(false);
    await h.avanzar(30_000);
    // Sin esto, abrir y cerrar cinco periodos deja cinco bucles corriendo.
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(antes);
  });

  it("respeta el intervalo que le pasen, no uno fijo", async () => {
    const h = montar();
    await h.render(true, 10_000);
    await h.avanzar(3000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(1);
    await h.avanzar(7000);
    expect(obtenerEstadoLiquidacion).toHaveBeenCalledTimes(2);
  });
});
