/// <reference types="vitest/config" />
import { defineConfig, createLogger } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("./shared", import.meta.url));

// Vite core logs "ws proxy socket error" directly from its HTTP-upgrade
// socket handler — not via the http-proxy `error` event — so it can't be
// silenced through the proxy `configure` hook. A custom logger that drops
// only the benign write-abort/reset churn (client reconnect, HMR reload,
// React StrictMode double-mount) keeps real proxy errors visible.
const logger = createLogger();
const baseError = logger.error;
logger.error = (msg, options) => {
  if (
    typeof msg === "string" &&
    msg.includes("ws proxy socket error") &&
    /ECONNABORTED|ECONNRESET/.test(msg)
  ) {
    return;
  }
  baseError(msg, options);
};

export default defineConfig({
  root: "client",
  customLogger: logger,
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
