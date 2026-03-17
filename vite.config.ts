import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        hud: path.resolve(__dirname, "hud.html")
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
