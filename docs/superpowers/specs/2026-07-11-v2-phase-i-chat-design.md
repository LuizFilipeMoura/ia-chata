# V2 Phase I — Quartermaster Chat (native panel)

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** A–D; Phase J glossary for term highlighting (can land after with a plain-text fallback). See overview.

## Goal

Native V2 Quartermaster chat panel matching the mockup's Rulebook design (lines 453–475), reusing the
V1 chat **logic** (message store + streaming + speech) and rewriting only the presentation.

## Replaces

`components/chat/ChatPanel.tsx` + `MessageList.tsx` + `Bubble.tsx` + `ChatInput.tsx` +
`SuggestedPrompts.tsx` — for V2. **Reuses unchanged:** `chat/ChatContext.tsx` (`ChatProvider`,
`useChat`), `hooks/useChatStream.ts` (streams `/api/chat`, parses `[[RIG …]]` tags → real commands),
`hooks/useSpeech.ts` (mic + TTS).

## Architecture / components

```
client/src/v2/
  chat/ChatPanel.tsx        V2 panel: header (📻 The Quartermaster, voice-link lamp), toolbar (🧠 think
                            toggle, 🔊 TTS, PT/EN select, 🧹 clear, ✕ close), message list, suggested
                            prompts, input; seeds greeting; flags unread when closed. Reads useUi().chatOpen.
  chat/MessageList.tsx      V2 message list
  chat/Bubble.tsx           user = plain right bubble (oil); bot = markdown left bubble with a collapsible
                            "▸ Reasoning" block when thinking present
  chat/ChatInput.tsx        auto-resizing textarea, 🎙 mic, ▸ send (Enter sends, Shift+Enter newline)
  chat/SuggestedPrompts.tsx 5 starter chips (turn/attack/movement/damage&armor/how-to-win); hidden after first user msg
  styles/chat.css           .v2-root-scoped chat styles (port mockup 453–475)
```

- `V2ChatMount` (Phase D) swaps its `ChatPanel` import from V1 to `../chat/ChatPanel`; everything else
  (ChatProvider, unread flagging) stays.
- Bot markdown via the existing `markdownToHtml`; bot plain seed bubbles use V2 `GlossaryText`
  (Phase J) for term highlighting — until J lands, render plain text.

## Behavior

Identical to V1: streaming replies with optional reasoning; the AI can drive the board via `[[RIG …]]`
tags (unchanged `useChatStream`); mic dictation + TTS via `useSpeech`; PT/EN speech language; clear
keeps tracked rigs; unread dot on the dock button when closed (Phase D wiring).

## Testing

- Panel seeds the greeting; suggested prompts render and hide after the first user message.
- Sending a message calls the stream `send`; a bot bubble with `thinking` shows a collapsible Reasoning
  block; user bubbles render plain.
- Think/TTS/lang toggles update their state; clear empties the visible list.

## Done when

No V2 code imports the V1 `chat/ChatPanel`/`MessageList`/`Bubble`/`ChatInput`/`SuggestedPrompts`; the
chat panel is native under `.v2-root` (logic hooks still reused).
