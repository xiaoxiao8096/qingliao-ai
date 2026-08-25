import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __QINGLIAO_MEDIA_PROXY_URL__: JSON.stringify(
      process.env.VERCEL === "1" ? "/api/media-proxy" : process.env.VITE_MEDIA_PROXY_URL ?? "",
    ),
  },
  base: process.env.VITE_GITHUB_PAGES === "true" ? "/qingliao-ai/" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
