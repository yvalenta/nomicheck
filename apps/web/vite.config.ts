import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Swagger UI para `/docs/`, servido POR NOSOTROS y no desde un CDN.
//
// Los archivos no se commitean —son ~1,5 MB de vendor— ni entran al bundle de
// la SPA: `public/docs/index.html` es una página suelta que los pide a
// `/docs/assets/`, así que solo los baja quien entra a leer el contrato. Este
// plugin los pone ahí, en dev sirviéndolos desde `node_modules` y en build
// copiándolos al `dist`.
//
// Self-hosted y no CDN a propósito: si el CDN se cae, la documentación del
// producto se cae con él. Acá lo que se sirve es lo que hay en disco.
const ASSETS_SWAGGER = ["swagger-ui.css", "swagger-ui-bundle.js"];

function swaggerUi(): Plugin {
  const req = createRequire(import.meta.url);
  const dir = dirname(req.resolve("swagger-ui-dist/swagger-ui.css"));

  return {
    name: "nomicheck-swagger-ui",
    configureServer(server) {
      server.middlewares.use((req_, res, next) => {
        const nombre = ASSETS_SWAGGER.find((a) => req_.url?.startsWith(`/docs/assets/${a}`));
        if (!nombre) return next();
        res.setHeader("content-type", nombre.endsWith(".css") ? "text/css" : "text/javascript");
        res.end(readFileSync(join(dir, nombre)));
      });
    },
    closeBundle() {
      const aqui = dirname(fileURLToPath(import.meta.url));
      const destino = join(aqui, "dist", "docs", "assets");
      mkdirSync(destino, { recursive: true });
      for (const a of ASSETS_SWAGGER) copyFileSync(join(dir, a), join(destino, a));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), swaggerUi()],
  build: {
    rollupOptions: {
      output: {
        // Vendors en chunks propios (API `advancedChunks` de rolldown, el
        // bundler de Vite 8 — no `manualChunks`, que es de rollup). react,
        // supabase y recharts no cambian entre deploys, así el navegador los
        // conserva en caché aunque el código de la app sí cambie: sin esto un
        // fix de una línea invalidaba 1.2 MB. `test` corre contra el id del
        // módulo, por eso el separador de ruta explícito — con pnpm los paths
        // reales son `.pnpm/react@19/node_modules/react/…`.
        advancedChunks: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "vendor-supabase", test: /node_modules[\\/]@supabase[\\/]/ },
            { name: "vendor-charts", test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/ },
            { name: "vendor-fechas", test: /node_modules[\\/](date-fns|react-day-picker)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:3001",
    },
  },
});
