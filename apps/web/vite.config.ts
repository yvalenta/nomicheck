import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
