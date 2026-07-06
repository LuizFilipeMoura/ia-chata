import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { PORT, MODEL, NUM_CTX, OLLAMA_URL } from "./config.js";
import { createStore } from "./store.js";
import { loadRulebook } from "./prompt.js";
import { createChatRouter } from "./routes/chat.js";
import { createGameRouter } from "./routes/game.js";
import { createWsHub } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const store = createStore(path.join(rootDir, "data", "rooms.json"));
const hub = createWsHub();

const app = express();
app.use(express.json({ limit: "2mb" }));

// The built React client (Vite → client/dist) is web-served. `/shared` exposes
// the pure game-logic module so the browser can import it (weapon lists,
// defaults) without a copy. In dev, Vite serves the UI and proxies here instead.
app.use(express.static(path.join(rootDir, "client", "dist")));
app.use("/shared", express.static(path.join(rootDir, "shared")));

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "client", "dist", "index.html"));
});

app.use("/api", createChatRouter(store));
app.use("/api/game", createGameRouter(store, hub));

const httpServer = http.createServer(app);

// Push channel for room-state updates: a client connects to /ws?room=X&side=Y
// once (right after join, and on every reconnect); server/routes/game.js
// broadcasts the new state to every attached socket after each mutation. On
// connect we immediately send the current snapshot so a reconnecting client
// (page refresh, dropped socket) rehydrates without waiting for the next
// mutation — the socket is the client's only state channel after join.
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const roomCode = url.searchParams.get("room");
  const side = url.searchParams.get("side");
  if (!roomCode) { ws.close(); return; }
  hub.attach(ws, roomCode, side);
  const room = store.getRoom(roomCode);
  if (room) hub.sendState(ws, room, side);
});

async function start() {
  await loadRulebook(rootDir);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Oil & Iron rules master listening on http://0.0.0.0:${PORT}`);
    console.log(`Model: ${MODEL} | num_ctx: ${NUM_CTX} | Ollama: ${OLLAMA_URL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
