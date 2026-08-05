import { describe, expect, it } from "vitest";
import { createElement, useState, act } from "react";
import { createRoot } from "react-dom/client";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("spike", () => {
  it("renderiza un hook", async () => {
    let visto: number | undefined;
    function Sonda() {
      const [n, setN] = useState(1);
      visto = n;
      // @ts-expect-error spike
      globalThis.__set = setN;
      return null;
    }
    const cont = document.createElement("div");
    const root = createRoot(cont);
    await act(async () => { root.render(createElement(Sonda)); });
    expect(visto).toBe(1);
    // @ts-expect-error spike
    await act(async () => { globalThis.__set(5); });
    expect(visto).toBe(5);
    await act(async () => { root.unmount(); });
  });
});
