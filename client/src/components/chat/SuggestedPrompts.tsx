import { useChat } from "./ChatContext";

// Top questions a new player tends to have about the Of Oil and Iron rulebook.
// Tapping a chip sends it as if the player typed it.
const PROMPTS = [
  "How does a turn work?",
  "How do I attack another Rig?",
  "How does movement work?",
  "How are damage and armor calculated?",
  "How do I win the battle?",
];

// Rendered above the input while the chat is still fresh (only the greeting is
// shown, the player hasn't asked anything yet). Disappears after the first
// message so it never crowds an active conversation.
export function SuggestedPrompts({ onSend }: { onSend: (text: string) => void }) {
  const { messages, isStreaming } = useChat();

  const hasUserMessage = messages.some((m) => m.role === "user");
  if (hasUserMessage || isStreaming) return null;

  return (
    <div className="suggested-prompts" role="list" aria-label="Suggested questions">
      {PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          role="listitem"
          className="suggested-prompt"
          onClick={() => onSend(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
