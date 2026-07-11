import { useEffect, useRef } from "react";
import { Bubble } from "./Bubble";
import { useChat } from "../../components/chat/ChatContext";

// Scrolling transcript. Ports V1 chat/MessageList.tsx with a v2-qm-* class.
export function MessageList() {
  const { messages } = useChat();
  const ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as messages grow / stream.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="v2-qm-messages" aria-live="polite" ref={ref}>
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
