import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT, MODEL, NUM_CTX, OLLAMA_URL } from "./config.js";
import { createStore } from "./store.js";
import { loadRulebook } from "./prompt.js";
import { createChatRouter } from "./routes/chat.js";
import { createGameRouter } from "./routes/game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const store = createStore(path.join(rootDir, "data", "rooms.json"));

const app = express();
app.use(express.json({ limit: "2mb" }));

// Only the client bundle is web-served. `/shared` exposes the pure game-logic
// module so the browser can import it (weapon lists, defaults) without a copy.
app.use(express.static(path.join(rootDir, "public")));
app.use("/shared", express.static(path.join(rootDir, "shared")));

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

app.use("/api", createChatRouter(store));
app.use("/api/game", createGameRouter(store));

async function start() {
  await loadRulebook(rootDir);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Oil & Iron rules master listening on http://0.0.0.0:${PORT}`);
    console.log(`Model: ${MODEL} | num_ctx: ${NUM_CTX} | Ollama: ${OLLAMA_URL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
