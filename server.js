import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { applyCommand, claimSide, publicState, formatBattleState } from "./game-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = createStore(path.join(__dirname, "data", "rooms.json"));

const MODEL = process.env.MODEL || "hf.co/mradermacher/gemma-4-12B-it-heretic_decensored-GGUF:Q4_K_M";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const NUM_CTX = Number(process.env.NUM_CTX || 32768);
const RULEBOOK_MD = process.env.RULEBOOK_MD || "rules.md";
const PORT = Number(process.env.PORT || 8000);

let SYSTEM_PROMPT = "";

// Instructions that teach Gemma the rig-tracker command protocol. The browser
// parses these [[RIG ...]] tags out of the reply, applies them to the tracker,
// and strips them before display + text-to-speech, so the spoken answer stays
// clean while the on-screen rig state updates.
const TRACKER_PROTOCOL = [
  "",
  "=== RIG CONDITION TRACKER ===",
  "The app shows a live tracker of each Rig's condition. You can change it by",
  "embedding commands in your reply. Whenever the player narrates something that",
  "changes a Rig's condition (damage, repair, heat, a new Rig, destruction),",
  "emit the matching command AND speak a short natural confirmation. Reply in the",
  "same language the player used. Put commands on their own, exactly in this form:",
  "",
  '[[RIG add name="<name>" class="light|medium|heavy|colossal" owner="a|b"]]',
  '[[RIG damage name="<name>" loc="hull|arms|legs|engine" amount="<n>"]]',
  '[[RIG repair name="<name>" loc="hull|arms|legs|engine" amount="<n>"]]',
  '[[RIG heat name="<name>" amount="+<n>" | "-<n>" | "0" | "<n>"]]',
  '[[RIG set name="<name>" loc="hull|arms|legs|engine" sp="<n>"]]',
  '[[RIG remove name="<name>"]]',
  "",
  "Rules for the tags:",
  "- Emit one tag per change; the app applies each exactly once.",
  "- On `add`, `owner` picks the side; if you omit it, the requesting player's",
  "  side is used. Never invent Rigs for the enemy unless the player says so.",
  "- Use the Rig name exactly as it appears in CURRENT RIG STATE when it exists.",
  "- `damage`/`repair` are relative; `set` and `heat` (bare number) are absolute,",
  "  `heat amount=\"+2\"`/`\"-1\"` are relative, `heat amount=\"0\"` vents to zero.",
  "- Default Structure Points by class: Hull 6/7/8/9, Arms 5/6/7/8, Legs 5/6/7/8,",
  "  Engine 4/5/6/7 (light/medium/heavy/colossal). A component at 0 SP is",
  "  catastrophically damaged; further damage destroys it. The Rig is destroyed",
  "  when its Hull or Engine is destroyed, or all four components reach 0.",
  "- Do NOT explain the tags or read them aloud; the app hides them. Just narrate",
  "  the outcome for the player normally.",
].join("\n");

async function loadRulebook() {
  const mdPath = path.join(__dirname, RULEBOOK_MD);
  const text = await fs.readFile(mdPath, "utf8");

  SYSTEM_PROMPT = [
    "You are the rules master for the board game 'Of Oil and Iron'.",
    "Answer questions about the rules strictly based on the rulebook text provided below.",
    "The rulebook below is the current working ruleset (Markdown) and is the single source of truth — there is no other rulebook.",
    "If the rulebook does not clearly cover a situation, say so explicitly instead of guessing or inventing a rule.",
    "Be concise and cite the relevant section (its § number or heading) from the rulebook when helpful.",
    "",
    "=== RULEBOOK START ===",
    text,
    "=== RULEBOOK END ===",
  ].join("\n");

  console.log(`Rulebook loaded (${text.length} chars) from ${RULEBOOK_MD}`);
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/chat", async (req, res) => {
  const clientMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const think = req.body?.think !== false;
  const room = req.body?.room ? store.getRoom(req.body.room) : null;
  const battle = room ? formatBattleState(room) : "";
  const system = SYSTEM_PROMPT + "\n" + TRACKER_PROTOCOL + "\n" + battle;
  const messages = [{ role: "system", content: system }, ...clientMessages];

  const ollamaBody = {
    model: MODEL,
    messages,
    stream: true,
    options: {
      num_ctx: NUM_CTX,
      temperature: 0.3,
    },
  };

  // Only send `think: false` to suppress reasoning. We never send `think: true`:
  // models like this Gemma 4 GGUF reason natively but aren't registered as
  // thinking-capable, so an explicit `think: true` is rejected with a 400.
  // Omitting the param lets their native reasoning stream as `message.thinking`.
  if (!think) ollamaBody.think = false;

  let ollamaResponse;
  try {
    ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaBody),
    });
  } catch (err) {
    console.error("Failed to reach Ollama:", err);
    res.status(502).end("Could not reach Ollama. Is it running?");
    return;
  }

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    const errText = await ollamaResponse.text().catch(() => "");
    console.error("Ollama error:", ollamaResponse.status, errText);
    res.status(502).end("Ollama returned an error.");
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

  const reader = ollamaResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const msg = parsed?.message || {};
        if (msg.thinking) {
          res.write(JSON.stringify({ type: "thinking", text: msg.thinking }) + "\n");
        }
        if (msg.content) {
          res.write(JSON.stringify({ type: "content", text: msg.content }) + "\n");
        }
        if (parsed?.done) {
          res.end();
          return;
        }
      }
    }
  } catch (err) {
    console.error("Stream error:", err);
  } finally {
    res.end();
  }
});

app.post("/api/game/:room/join", (req, res) => {
  const room = store.getOrCreateRoom(req.params.room);
  const side = claimSide(room, { name: req.body?.name, side: req.body?.side });
  store.persist();
  res.json({ side, version: room.version, state: publicState(room) });
});

app.get("/api/game/:room", (req, res) => {
  const room = store.getRoom(req.params.room);
  if (!room) return res.status(404).json({ error: "no such room" });
  res.json({ version: room.version, state: publicState(room) });
});

app.post("/api/game/:room/command", (req, res) => {
  const room = store.getRoom(req.params.room);
  if (!room) return res.status(404).json({ error: "no such room" });
  applyCommand(room, req.body?.cmd || {});
  store.persist();
  res.json({ version: room.version, state: publicState(room) });
});

async function start() {
  await loadRulebook();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Oil & Iron rules master listening on http://0.0.0.0:${PORT}`);
    console.log(`Model: ${MODEL} | num_ctx: ${NUM_CTX} | Ollama: ${OLLAMA_URL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
