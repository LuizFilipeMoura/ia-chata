import { useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle, type KeyboardEvent } from "react";

interface MicApi {
  supported: boolean;
  recording: boolean;
  toggle: () => void;
}

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  mic: MicApi;
}

export interface ChatInputHandle {
  focus: () => void;
}

// The V2 input row (mockup 469-473). Controlled textarea auto-resizes to
// min(scrollHeight, 120)px; Enter (no shift) sends, Shift+Enter newlines.
// Preserves V1's ChatInputHandle ref API so ChatPanel can focus on open.
export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  { onSend, disabled, mic },
  ref,
) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), []);

  const autoResize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  useLayoutEffect(autoResize, [value]);

  const send = () => {
    onSend(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="v2-qm-input">
      <button
        className={`v2-qm-mic${mic.recording ? " v2-qm-recording" : ""}`}
        aria-label="Toggle voice input"
        title="Voice input"
        type="button"
        disabled={!mic.supported}
        onClick={mic.toggle}
      >
        🎙
      </button>
      <div className="v2-qm-field">
        <textarea
          rows={1}
          placeholder="Ask a rule or narrate a hit…"
          aria-label="Message"
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <button
        className="v2-qm-send"
        aria-label="Send message"
        title="Send"
        type="button"
        disabled={disabled}
        onClick={send}
      >
        ▸
      </button>
    </div>
  );
});
