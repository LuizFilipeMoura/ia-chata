# V2 Frontend — Phase D Implementation Plan (Chat / Quartermaster + Glossary)

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Wire the Quartermaster chat + glossary into V2, reusing V1's components; remove the last stubbed control (the Rulebook dock button).

**Architecture:** Reuse V1 `ChatProvider` + `ChatPanel` + `GlossaryDialog` (all driven by shared `UiStateContext.chatOpen`/`glossaryOpen` in `AppProviders`). V2 just mounts them and wires triggers.

**Tech Stack:** React+TS, Vite, Vitest + testing-library.

**Reference:** Spec `docs/superpowers/specs/2026-07-11-v2-frontend-phase-d-design.md`. Reused V1: `client/src/components/chat/ChatContext.tsx` (`ChatProvider`), `client/src/components/chat/ChatPanel.tsx` (`ChatPanel`, props `{ onBotMessage: () => void }`, reads `useUi().chatOpen`), `client/src/components/overlays/GlossaryDialog.tsx` (`GlossaryDialog`, props `{ open, onClose }`). Toggle via `useUi()` (`chatOpen/setChatOpen`, `glossaryOpen/setGlossaryOpen`) from `client/src/state/UiStateContext`.

**Test command:** `npx vitest run <path>` from repo root. Branch: `frontend/v2-redesign`. Targeted `git add client/src/v2` only.

---

## Task 1: Wire chat + glossary triggers into Shell

**Files:** Modify `client/src/v2/components/Shell.tsx` and `client/src/v2/components/Shell.test.tsx`.

Add three props: `onRulebook?: () => void`, `onGlossary?: () => void`, `chatUnread?: boolean`.
- **Rulebook dock button:** remove `disabled`; `onClick={() => onRulebook?.()}`; render an unread dot when `chatUnread`.
- **Rules channel button:** set the `rulebook` channel entry `enabled: true`; when clicked, call `onRulebook?.()` (like Forge calls `onForge`). Update the channel onClick to route both `commission`→`onForge` and `rulebook`→`onRulebook`.
- **Glossary ⓘ:** add a small button to the status strip meta area (near the room chip): `<button className="v2-gloss-btn" aria-label="Glossary" onClick={() => onGlossary?.()}>ⓘ</button>`.

- [ ] **Step 1** — update `client/src/v2/components/Shell.test.tsx`: keep existing tests; add:
```tsx
test("Rulebook button and Rules channel and glossary trigger their handlers", async () => {
  const user = userEvent.setup();
  const onRulebook = vi.fn();
  const onGlossary = vi.fn();
  render(<AppProviders><Seed state={baseState} />
    <Shell channel="yard" onRulebook={onRulebook} onGlossary={onGlossary}><div /></Shell>
  </AppProviders>);
  await user.click(await screen.findByRole("button", { name: /Rulebook/i }));
  expect(onRulebook).toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Rules/i }));
  expect(onRulebook).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: /Glossary/i }));
  expect(onGlossary).toHaveBeenCalled();
});
```
Also update the existing "only Yard channel active" test: `Rules` is now **enabled** (assert `toBeEnabled()`); `Verdict` remains disabled.

- [ ] **Step 2** — run `npx vitest run client/src/v2/components/Shell.test.tsx` → FAIL (Rulebook disabled / no Glossary button).
- [ ] **Step 3** — implement the Shell changes: add the three props; enable the Rulebook dock button + unread dot; enable the `rulebook` channel; route channel clicks (`commission`→onForge, `rulebook`→onRulebook); add the `.v2-gloss-btn` ⓘ button in the status-strip meta. Add minimal CSS for `.v2-gloss-btn` and the Rulebook unread dot to `shell.css` (under `.v2-root`).
- [ ] **Step 4** — run → PASS. `npx tsc -p . --noEmit` clean.
- [ ] **Step 5** — commit: `git add client/src/v2 && git commit -m "feat(v2): shell triggers for chat + glossary"`

---

## Task 2: V2ChatMount + mount chat/glossary in V2Terminal

**Files:** Create `client/src/v2/components/V2ChatMount.tsx`, `client/src/v2/components/V2ChatMount.test.tsx`; modify `client/src/v2/V2Terminal.tsx`.

- [ ] **Step 1** — test `client/src/v2/components/V2ChatMount.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2ChatMount } from "./V2ChatMount";

test("renders the Quartermaster chat panel", async () => {
  render(<AppProviders><V2ChatMount /></AppProviders>);
  // ChatPanel seeds a greeting mentioning the rulebook
  expect(await screen.findByText(/rulebook/i)).toBeInTheDocument();
});
```
Run → FAIL.

- [ ] **Step 2** — implement `client/src/v2/components/V2ChatMount.tsx` (reuse V1 chat, expose unread + toggle to the parent via a render-prop-free approach: it owns `hasUnread` and reads/writes `useUi().chatOpen`). Because Shell needs the unread flag and the toggle, keep this component simple and let V2Terminal own the wiring: this component just mounts the provider + panel and calls an `onUnreadChange` callback.
```tsx
import { useCallback, useState, useEffect } from "react";
import { ChatProvider } from "../../components/chat/ChatContext";
import { ChatPanel } from "../../components/chat/ChatPanel";

export function V2ChatMount({ onUnreadChange }: { onUnreadChange?: (v: boolean) => void }) {
  const [hasUnread, setHasUnread] = useState(false);
  useEffect(() => { onUnreadChange?.(hasUnread); }, [hasUnread, onUnreadChange]);
  const flagUnread = useCallback(() => setHasUnread(true), []);
  return (
    <ChatProvider>
      <ChatPanel onBotMessage={flagUnread} />
    </ChatProvider>
  );
}
```
Note: clearing unread on open is handled by V2Terminal's toggle (see Step 3). Since `hasUnread` lives here, expose a reset by keying off `chatOpen`: add `import { useUi } from "../../state/UiStateContext";` and `const { chatOpen } = useUi(); useEffect(() => { if (chatOpen) setHasUnread(false); }, [chatOpen]);`.

- [ ] **Step 3** — modify `client/src/v2/V2Terminal.tsx`:
  - Add state `const [chatUnread, setChatUnread] = useState(false);` and `const { setChatOpen, chatOpen, glossaryOpen, setGlossaryOpen } = useUi();` (import `useUi` from `../state/UiStateContext`).
  - Import `V2ChatMount` and the reused `GlossaryDialog` from `../components/overlays/GlossaryDialog` (path: `../../components/...` → from `client/src/v2/`, it's `../components/overlays/GlossaryDialog`). Actually the correct import from `client/src/v2/V2Terminal.tsx` is `../components/overlays/GlossaryDialog` resolves to `client/src/v2/components/...` — WRONG. Use `../../components/overlays/GlossaryDialog`? No: `V2Terminal.tsx` is at `client/src/v2/`, so V1 components are at `../components/...` = `client/src/components/...`. Use `import { GlossaryDialog } from "../components/overlays/GlossaryDialog";` — WAIT that resolves to `client/src/v2/components/...`. Correct path from `client/src/v2/V2Terminal.tsx` to `client/src/components/overlays/GlossaryDialog.tsx` is `../../components/overlays/GlossaryDialog`. VERIFY by checking how V2Terminal already imports V1 things (it imports `../hooks/useBattleWatchers` = `client/src/hooks` — so `../` from `client/src/v2/` reaches `client/src/`). Therefore the V1 component path is `../components/overlays/GlossaryDialog`. Use that.
  - Pass to Shell: `onRulebook={() => setChatOpen(!chatOpen)}`, `onGlossary={() => setGlossaryOpen(true)}`, `chatUnread={chatUnread}`.
  - Inside Shell, render `<GlossaryDialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />` and `<V2ChatMount onUnreadChange={setChatUnread} />` as children (alongside the existing overlays).

- [ ] **Step 4** — run `npx vitest run client/src/v2` → all green. `npx tsc -p . --noEmit` clean.
- [ ] **Step 5** — Browser verify: fresh `/?v2` tab, join, click the **Rulebook** dock button → the Quartermaster chat panel opens (V1-styled interim); the greeting shows; type a question and confirm a streamed reply (backend must be up). Click the ⓘ glossary button → glossary dialog opens. Click the **Rules** channel → also opens chat. Confirm no console errors.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): mount Quartermaster chat + glossary in V2"`

---

## Self-Review Notes
- Coverage: Shell triggers (T1), chat mount + glossary wiring (T2).
- Interim reuse (documented): the V1 ChatPanel + GlossaryDialog styling.
- Type consistency: `Shell { channel, onForge?, onRulebook?, onGlossary?, chatUnread?, children }`; `V2ChatMount { onUnreadChange? }`.
- Import-path caution: from `client/src/v2/V2Terminal.tsx`, V1 components are `../components/...` and V1 hooks `../hooks/...` (one level up from `v2/`). Verify each import resolves before finishing.
