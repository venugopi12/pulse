import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Where the API runs. The load test points this at its own server port.
const api = process.env.PULSE_API_URL ?? "http://localhost:4000";

// In dev (and `vite preview`), the browser calls same-origin /api and /ws,
// and Vite forwards them to Express: no CORS, and the same relative URLs
// work in production behind a reverse proxy.
const proxy = {
  "/api": { target: api, changeOrigin: true },
  "/ws": { target: api.replace(/^http/, "ws"), ws: true },
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // `@/components/ui/button` instead of `../../../components/ui/button`.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `vite build --mode profile`: production React, but with the Profiler
      // API still reporting, so the load test measures real production renders.
      ...(mode === "profile" ? { "react-dom/client": "react-dom/profiling" } : {}),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  // `vite preview` serves the production build with the same proxy.
  preview: { port: 4173, proxy },
}));
