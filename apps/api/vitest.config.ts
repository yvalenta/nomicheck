import { defineConfig } from "vitest/config";

// Solo tests de módulos PUROS del backend (funciones sin BD/HTTP), tipo
// liquidacionCalculo.ts — el motor de reglas ya tiene sus 160 tests en
// packages/reglas. Los tests con Prisma se quedan como E2E ad-hoc contra
// el contenedor de dev.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
