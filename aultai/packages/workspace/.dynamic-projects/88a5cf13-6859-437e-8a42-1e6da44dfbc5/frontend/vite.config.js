import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express server (backend/server.js) runs Vite for you,
// so there is no separate frontend server or proxy to configure.
export default defineConfig({
  plugins: [react()],
});
