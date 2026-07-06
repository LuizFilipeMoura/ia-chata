import { useUi } from "../../state/UiStateContext";

// The floating launcher button (index.html:87-89, chat.js:22-48).
export function ChatFab({ hasUnread, onClick }: { hasUnread: boolean; onClick: () => void }) {
  const { chatOpen } = useUi();
  return (
    <button
      id="chatFab"
      className={`chat-fab${chatOpen ? " active" : ""}${hasUnread ? " has-unread" : ""}`}
      type="button"
      aria-label="Open rulebook assistant"
      aria-expanded={chatOpen}
      onClick={onClick}
    >
      <span className="chat-fab-ic">🛠</span>
    </button>
  );
}
