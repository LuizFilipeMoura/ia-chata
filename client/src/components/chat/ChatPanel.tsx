import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "../../state/UiStateContext";
import { useSpeech } from "../../hooks/useSpeech";
import { useChat } from "./ChatContext";
import { useChatStream } from "../../hooks/useChatStream";
import { MessageList } from "./MessageList";
import { ChatInput, type ChatInputHandle } from "./ChatInput";

const GREETING =
  "Ask me anything about the Of Oil and Iron rulebook — by text or by tapping the mic.";
const CLEARED =
  "Context cleared — your tracked Rigs are kept. Narrate the battle or ask a rules question.";

// The floating assistant panel (index.html:91-113 + chat.js open/close + tools).
// `onBotMessage` fires whenever a bot bubble is appended while the panel is
// closed, so the parent can flag the fab as unread.
export function ChatPanel({ onBotMessage }: { onBotMessage: () => void }) {
  const { chatOpen, setChatOpen } = useUi();
  const chat = useChat();
  const [lang, setLang] = useState("pt-BR");
  const inputRef = useRef<ChatInputHandle>(null);

  const speech = useSpeech({ lang, onTranscript: (t) => send(t), onStatus: (m) => chat.setStatus(m) });
  const { send: rawSend } = useChatStream({ speak: speech.speak, tts: speech.tts });

  const send = useCallback((text: string) => { void rawSend(text); }, [rawSend]);

  // Seed greeting on mount (main.js:31).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    chat.addMessage({ role: "bot", text: GREETING, plain: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flag unread when a bot bubble lands while closed (mirrors flagUnread()).
  const lastCount = useRef(0);
  useEffect(() => {
    const bots = chat.messages.filter((m) => m.role === "bot").length;
    if (bots > lastCount.current && !chatOpen) onBotMessage();
    lastCount.current = bots;
  }, [chat.messages, chatOpen, onBotMessage]);

  // On open: focus the textarea + scroll messages to bottom.
  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  // Escape closes (chat.js:42-44).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chatOpen) setChatOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chatOpen, setChatOpen]);

  const clear = () => {
    if (chat.isStreaming) return;
    window.speechSynthesis?.cancel();
    chat.clear();
    chat.addMessage({ role: "bot", text: CLEARED, plain: true });
    chat.setStatus("Context cleared.");
    setTimeout(() => chat.setStatus(""), 2000);
  };

  const toggleThink = () => chat.setThink(!chat.think);

  return (
    <section
      id="chatPanel"
      className={`chat-panel${chatOpen ? " open" : ""}`}
      aria-hidden={!chatOpen}
      aria-label="Rulebook assistant"
    >
      <div className="chat-grip"></div>
      <div className="chat-head">
        <span className="chat-title">◈ Rulebook Assistant</span>
        <div className="chat-tools" role="toolbar" aria-label="Assistant controls">
          <button
            id="thinkToggle"
            className={`chat-chip${chat.think ? " active" : ""}`}
            aria-pressed={chat.think}
            title="Show the model's reasoning before it answers (slower). Turn off for faster replies."
            type="button"
            onClick={toggleThink}
          >
            🧠
          </button>
          <button
            id="ttsToggle"
            className={`chat-chip${speech.tts ? " active" : ""}`}
            aria-pressed={speech.tts}
            title="Read answers aloud"
            type="button"
            onClick={() => speech.setTts(!speech.tts)}
          >
            🔊
          </button>
          <select
            id="langSelect"
            className="lang-select"
            aria-label="Speech recognition language"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="pt-BR">PT</option>
            <option value="en-US">EN</option>
          </select>
          <button
            id="clearBtn"
            className="chat-chip"
            title="Clear the conversation to free up context. Your tracked Rigs are kept."
            type="button"
            onClick={clear}
          >
            🧹
          </button>
          <button
            id="chatClose"
            className="chat-chip chat-close"
            type="button"
            aria-label="Close assistant"
            onClick={() => setChatOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="status-row" id="statusRow">
        {chat.status}
      </div>
      <MessageList />
      <ChatInput
        ref={inputRef}
        onSend={send}
        disabled={chat.isStreaming}
        mic={{ supported: speech.supported, recording: speech.recording, toggle: speech.toggleMic }}
      />
    </section>
  );
}
