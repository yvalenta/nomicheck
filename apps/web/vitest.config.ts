import { defineConfig } from "vitest/config";

// Este workspace no tenía una sola prueba hasta el 2026-07-29, y es el más
// grande del monorepo — 12.101 líneas contra las 10.231 de la API. Lo único que
// lo protegía era el typecheck.
//
// El alcance de esta suite es deliberado y conviene respetarlo: **lógica, no
// pintura**. Los stores, los hooks y los helpers de `lib/` tienen decisiones que
// se rompen en silencio; un `<div>` con la clase equivocada se ve. Empezar por
// renderizar pantallas grandes habría dado mucho test y poca señal.
//
// `jsdom` está acá porque esa lógica toca `localStorage`, `sessionStorage` y
// `window.location` — no para montar árboles de React. El día que se quieran
// probar componentes hay que sumar `@testing-library/react`, que hoy no está.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    restoreMocks: true,
  },
});
