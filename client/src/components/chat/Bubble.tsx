import { markdownToHtml } from "../../lib/markdown";
import { stripRigTags } from "../../lib/rigTags";
import { GlossaryText } from "./GlossaryText";
import type { ChatMessage } from "./ChatContext";

// Renders one chat message. Mirrors public/js/chat.js addBubble / addBotResponseBubble.
export function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return <div className="bubble user">{msg.text}</div>;
  }

  // Plain seed/greeting/clear/error bot bubbles: text with glossary highlighting.
  if (msg.plain) {
    return (
      <div className="bubble bot">
        <GlossaryText text={msg.text} />
      </div>
    );
  }

  const html = markdownToHtml(stripRigTags(msg.text));

  return (
    <div className={`bubble bot${msg.pending ? " pending" : ""}`}>
      {msg.thinking ? (
        <details className="think-block" open={msg.thinkOpen}>
          <summary>Reasoning</summary>
          <div className="think-text">{msg.thinking}</div>
        </details>
      ) : null}
      <div className="answer-text" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
