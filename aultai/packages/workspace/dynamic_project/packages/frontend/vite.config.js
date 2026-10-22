import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend port is passed in by scripts/start.js (npm start). Default 3000.
const backend = `http://localhost:${process.env.AULTAI_BACKEND_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/shop-api": backend,
      "/preview": backend,
    },
  },
});
