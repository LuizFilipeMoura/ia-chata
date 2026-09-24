import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The 3D tactical client. Its own Vite root; imports the SAME rules engine the
// server runs (/shared) for previews (paths, arcs, legal targets, the advisor),
// while every state change still goes through the server's /api/game commands.
const shared = fileURLToPath(new URL("../shared", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/3d/",
  resolve: { alias: [{ find: /^\/shared/, replacement: shared }] },
  server: {
    host: true,
    port: 5174,
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
