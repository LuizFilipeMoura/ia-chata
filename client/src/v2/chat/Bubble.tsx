import { markdownToHtml } from "../../lib/markdown";
import { stripRigTags } from "../../lib/rigTags";
import type { ChatMessage } from "../../components/chat/ChatContext";

// Renders one V2 Quartermaster chat message. Ports V1 chat/Bubble.tsx but with
// v2-qm-* classes. Phase I renders bot text PLAIN (no glossary highlighting —
// Phase J adds it), so plain seed/greeting bubbles and streamed answers both
// use the same markdown/text path.
export function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return <div className="v2-qm-bubble v2-qm-user">{msg.text}</div>;
  }

  // Plain seed/greeting/clear/error bot bubbles: render as text.
  if (msg.plain) {
    return <div className="v2-qm-bubble v2-qm-bot">{msg.text}</div>;
  }

  const html = markdownToHtml(stripRigTags(msg.text));

  return (
    <div className={`v2-qm-bubble v2-qm-bot${msg.pending ? " v2-qm-pending" : ""}`}>
      {msg.thinking ? (
        <details className="v2-qm-think" open={msg.thinkOpen}>
          <summary>▸ Reasoning</summary>
          <div className="v2-qm-think-text">{msg.thinking}</div>
        </details>
      ) : null}
      <div className="v2-qm-answer" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
