import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app lives in web/; /api is proxied to the Node server (npm run dev:server).
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.PORT ?? 3000}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
