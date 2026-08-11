import { defineConfig } from "vitest/config";

// Ningún test de este workspace toca la red: `fetch` se mockea en cada uno y
// el sobre de fixture se verifica OFFLINE contra la llave también guardada.
// Si un test necesitara red, fallaría distinto en CI que en un portátil sin
// conexión — y este repo ya aprendió que un verde que depende del clima no
// es un verde.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
