# V2 Phase I — Native Quartermaster Chat Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native V2 chat panel + subcomponents, reusing V1 chat **logic** (ChatContext, useChatStream, useSpeech). Swap `V2ChatMount` to the native panel; delete its V1 ChatPanel import.

**Architecture:** V2 rewrites only presentation. Reuses unchanged: `components/chat/ChatContext.tsx` (`ChatProvider`, `useChat`), `hooks/useChatStream.ts`, `hooks/useSpeech.ts`, `lib/markdownToHtml` (or whatever V1 Bubble uses). Behavior sources: `components/chat/ChatPanel.tsx`, `MessageList.tsx`, `Bubble.tsx`, `ChatInput.tsx`, `SuggestedPrompts.tsx` (READ all).

**Tech Stack:** React+TS, Vite, Vitest. **Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-i-chat-design.md`. Branch `frontend/v2-redesign`; `git add client/src/v2` only.

---

## Task 1: V2 chat subcomponents + panel

**Files:** Create `client/src/v2/chat/ChatPanel.tsx`, `MessageList.tsx`, `Bubble.tsx`, `ChatInput.tsx`, `SuggestedPrompts.tsx`, `client/src/v2/styles/chat.css`, and test `client/src/v2/chat/ChatPanel.test.tsx`. Modify `client/src/v2/components/V2ChatMount.tsx`.

Port the V1 chat suite to V2 classes (`v2-qm-*`), matching the mockup's Rulebook design (lines 453–475):
- `ChatPanel`: reads `useUi().chatOpen`; header (📻 The Quartermaster + voice-link lamp), toolbar (🧠 think, 🔊 TTS, PT/EN select, 🧹 clear, ✕ close), `MessageList`, `SuggestedPrompts`, `ChatInput`; seeds the greeting; `onBotMessage` unread flag; uses `useSpeech` + `useChatStream` exactly as V1.
- `Bubble`: user = plain right; bot = markdown left with collapsible "▸ Reasoning" when thinking present. Use the same markdown helper V1 uses. Render bot plain text (glossary highlighting arrives in Phase J — use plain text now).
- `ChatInput`: auto-resizing textarea, 🎙 mic, ▸ send; Enter sends, Shift+Enter newline.
- `SuggestedPrompts`: the 5 V1 starter chips; hidden after the first user message.

- [ ] **Step 1** — failing test `client/src/v2/chat/ChatPanel.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ChatProvider } from "../../components/chat/ChatContext";
import { UiProvider } from "../../state/UiStateContext";
import { RoomProvider } from "../../state/RoomStateContext";
import { ChatPanel } from "./ChatPanel";

test("seeds the Quartermaster greeting", async () => {
  render(<RoomProvider><UiProvider><ChatProvider><ChatPanel onBotMessage={() => {}} /></ChatProvider></UiProvider></RoomProvider>);
  expect(await screen.findByText(/anything about the .+ rulebook/i)).toBeInTheDocument();
});
```
- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement the five components (port from V1; V2 classes; reuse ChatContext/useChatStream/useSpeech/markdown).
- [ ] **Step 4** — `chat.css` under `.v2-root` (port mockup 453–475: header, voice lamp, toolbar chips, bubbles user/bot, reasoning block, suggested chips, input with mic/send).
- [ ] **Step 5** — modify `client/src/v2/components/V2ChatMount.tsx`: change `import { ChatPanel } from "../../components/chat/ChatPanel"` → `import { ChatPanel } from "../chat/ChatPanel"`. Everything else stays.
- [ ] **Step 6** — run `npx vitest run client/src/v2` → green. `npx tsc -p . --noEmit` clean.
- [ ] **Step 7** — Browser verify: `/?v2`, open Rulebook → native panel; greeting shows; type a question → streamed reply (backend up); mic/think/TTS/lang controls present; no console errors.
- [ ] **Step 8** — commit `feat(v2): native Quartermaster chat panel`.

---

## Self-Review Notes
- Coverage: chat panel seed + subcomponents (T1).
- Reuse: ChatContext, useChatStream (incl. `[[RIG]]` board-driving), useSpeech — unchanged.
- After this, the only V1 component imports left in V2 are `GlossaryDialog` + `GlossaryTipProvider` (Phase J).
- Type consistency: `ChatPanel { onBotMessage }`, `V2ChatMount { onUnreadChange? }` unchanged.
