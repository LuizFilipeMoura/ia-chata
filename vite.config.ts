/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("./shared", import.meta.url));

export default defineConfig({
  root: "client",
  plugins: [react()],
  resolve: {
    alias: [{ find: /^\/shared/, replacement: shared }],
  },
  server: {
    port: 5173,
    allowedHosts: [".ngrok-free.app"],
    proxy: {
      "/api": "http://localhost:8000",
      "/shared": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/src/test/setup.ts"],
    include: ["client/**/*.test.{ts,tsx}"],
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
});
