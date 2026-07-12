import { useCallback, useEffect, useRef, useState } from "react";
import { useUi } from "../../state/UiStateContext";
import { useSpeech } from "../../hooks/useSpeech";
import { useChat } from "../../components/chat/ChatContext";
import { useChatStream } from "../../hooks/useChatStream";
import { MessageList } from "./MessageList";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import "../styles/chat.css";

const GREETING =
  "Ask me anything about the Of Oil and Iron rulebook — by text or by tapping the mic.";
const CLEARED =
  "Context cleared — your tracked Rigs are kept. Narrate the battle or ask a rules question.";

// The native V2 Quartermaster panel. Reuses V1 chat LOGIC (ChatContext,
// useChatStream, useSpeech) unchanged — only the presentation is rewritten to
// the dieselpunk terminal look (mockup oil-iron-terminal.html:453-475).
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

  // Seed greeting on mount (same GREETING text as V1).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    chat.addMessage({ role: "bot", text: GREETING, plain: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flag unread when a bot bubble lands while closed.
  const lastCount = useRef(0);
  useEffect(() => {
    const bots = chat.messages.filter((m) => m.role === "bot").length;
    if (bots > lastCount.current && !chatOpen) onBotMessage();
    lastCount.current = bots;
  }, [chat.messages, chatOpen, onBotMessage]);

  // On open: focus the textarea.
  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  // Escape closes.
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
      className={`v2-qm-panel${chatOpen ? " v2-qm-open" : ""}`}
      aria-hidden={!chatOpen}
      aria-label="The Quartermaster"
    >
      <header className="v2-qm-head">
        <div className="v2-qm-badge v2-badge" aria-hidden>📻</div>
        <div className="v2-qm-titles">
          <div className="v2-qm-title">THE QUARTERMASTER</div>
          <div className="v2-qm-sub v2-eyebrow">RULES MASTER · VOICE LINK OPEN</div>
        </div>
        <span className="v2-qm-lamp v2-lamp v2-lamp--ok" aria-hidden />
        <div className="v2-qm-tools" role="toolbar" aria-label="Assistant controls">
          <button
            className={`v2-qm-chip${chat.think ? " is-sel" : ""}`}
            aria-pressed={chat.think}
            title="Show the model's reasoning before it answers (slower). Turn off for faster replies."
            type="button"
            onClick={toggleThink}
          >
            🧠
          </button>
          <button
            className={`v2-qm-chip${speech.tts ? " is-sel" : ""}`}
            aria-pressed={speech.tts}
            title="Read answers aloud"
            type="button"
            onClick={() => speech.setTts(!speech.tts)}
          >
            🔊
          </button>
          <select
            className="v2-qm-lang"
            aria-label="Speech recognition language"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="pt-BR">PT</option>
            <option value="en-US">EN</option>
          </select>
          <button
            className="v2-qm-chip"
            title="Clear the conversation to free up context. Your tracked Rigs are kept."
            type="button"
            onClick={clear}
          >
            🧹
          </button>
          <button
            className="v2-qm-chip v2-qm-x"
            type="button"
            aria-label="Close assistant"
            onClick={() => setChatOpen(false)}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="v2-qm-status" aria-live="polite">
        {chat.status}
      </div>
      <MessageList />
      <SuggestedPrompts onSend={send} />
      <ChatInput
        ref={inputRef}
        onSend={send}
        disabled={chat.isStreaming}
        mic={{ supported: speech.supported, recording: speech.recording, toggle: speech.toggleMic }}
      />
    </section>
  );
}
