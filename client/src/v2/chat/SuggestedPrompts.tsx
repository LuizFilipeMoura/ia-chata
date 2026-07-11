import { useChat } from "../../components/chat/ChatContext";

// The 5 V1 starter chips, ported unchanged. Rendered above the input while the
// chat is fresh; disappears after the first user message so it never crowds an
// active conversation.
const PROMPTS = [
  "How does a turn work?",
  "How do I attack another Rig?",
  "How does movement work?",
  "How are damage and armor calculated?",
  "How do I win the battle?",
];

export function SuggestedPrompts({ onSend }: { onSend: (text: string) => void }) {
  const { messages, isStreaming } = useChat();

  const hasUserMessage = messages.some((m) => m.role === "user");
  if (hasUserMessage || isStreaming) return null;

  return (
    <div className="v2-qm-prompts" role="list" aria-label="Suggested questions">
      {PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          role="listitem"
          className="v2-qm-prompt"
          onClick={() => onSend(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
