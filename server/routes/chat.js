import { Router } from "express";
import { MODEL, OLLAMA_URL, NUM_CTX } from "../config.js";
import { getSystemPrompt, TRACKER_PROTOCOL } from "../prompt.js";
import { formatBattleState } from "../../shared/game-state.js";

// POST /api/chat — proxy the conversation to Ollama and stream the reply back
// as newline-delimited { type, text } events. Injects the rulebook system
// prompt, the tracker protocol, and (when a room is given) its battle state.
export function createChatRouter(store) {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const clientMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const think = req.body?.think !== false;
    const room = req.body?.room ? store.getRoom(req.body.room) : null;
    const battle = room ? formatBattleState(room) : "";
    const system = getSystemPrompt() + "\n" + TRACKER_PROTOCOL + "\n" + battle;
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

  return router;
}
