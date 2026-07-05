import { useCallback } from "react";
import { useChat } from "../components/chat/ChatContext";
import { useCommands } from "./useCommands";
import { useRoomState } from "../state/RoomStateContext";
import { parseRigCommands, stripRigTags } from "../lib/rigTags";

interface Opts {
  speak: (text: string) => void;
  tts: boolean;
}

// Port of public/js/chat.js sendMessage (chat.js:95-181).
export function useChatStream({ speak, tts }: Opts) {
  const chat = useChat();
  const sendCommand = useCommands();
  const { session } = useRoomState();

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chat.isStreaming) return;

      chat.addMessage({ role: "user", text: trimmed });
      chat.pushHistory({ role: "user", content: trimmed });

      const botId = chat.addMessage({ role: "bot", text: "", pending: true, thinkOpen: true });
      chat.setStreaming(true);
      chat.setStatus(chat.think ? "Reasoning…" : "Thinking…");

      let answer = "";
      let thinking = "";

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chat.history.current,
            think: chat.think,
            room: session?.room,
            side: session?.side,
          }),
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`Server responded ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;

            let evt: { type?: string; text?: string };
            try {
              evt = JSON.parse(t);
            } catch {
              continue;
            }

            if (evt.type === "thinking") {
              thinking += evt.text ?? "";
              chat.updateMessage(botId, { thinking, showThink: true });
            } else if (evt.type === "content") {
              if (!answer) {
                chat.updateMessage(botId, { thinkOpen: false });
                chat.setStatus("Answering…");
              }
              answer += evt.text ?? "";
              chat.updateMessage(botId, { text: answer });
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        chat.updateMessage(botId, { text: `${stripRigTags(answer)}\n\n[Error: ${message}]` });
        chat.setStatus("Error contacting the server.");
      } finally {
        chat.updateMessage(botId, { pending: false });
        chat.setStreaming(false);
        chat.setStatus("");
      }

      if (answer) {
        parseRigCommands(answer).forEach((c) => sendCommand(c.verb, c.attrs));
        const spoken = stripRigTags(answer);
        chat.pushHistory({ role: "assistant", content: spoken });
        if (tts) speak(spoken);
      }
    },
    [chat, sendCommand, session?.room, session?.side, speak, tts],
  );

  return { send };
}
