import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5310,
    proxy: { "/api": "http://localhost:4310" },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return "react";
          if (/[\/]pdfjs-dist[\/]/.test(id)) return "pdf";
        },
      },
    },
  },
});
