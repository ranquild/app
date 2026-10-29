import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const FRONTEND_ROOT = path.resolve(import.meta.dirname, "frontend");
const BACKEND_URL = process.env.APP_BACKEND_URL ?? "http://localhost:3100";

export default defineConfig({
  root: FRONTEND_ROOT,
  plugins: [
    react({ babel: { plugins: ["@emotion/babel-plugin"] } }),
    svgr({ include: "**/*.svg?component", svgrOptions: { ref: true } }),
  ],
  resolve: {
    alias: {
      metabase: path.join(FRONTEND_ROOT, "src/metabase"),
      "metabase-types": path.join(FRONTEND_ROOT, "src/metabase-types"),
      shared: path.resolve(import.meta.dirname, "shared"),
    },
  },
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": BACKEND_URL,
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
});
