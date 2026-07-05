import { useEffect, useRef } from "react";
import { Bubble } from "./Bubble";
import { useChat } from "./ChatContext";

export function MessageList() {
  const { messages } = useChat();
  const ref = useRef<HTMLElement>(null);

  // Auto-scroll to bottom as messages grow / stream (chat.js:31,55,90,158).
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <main id="messages" aria-live="polite" ref={ref}>
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
    </main>
  );
}
