# V2 Phase J — Native Glossary Implementation Plan (final)

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native V2 GlossaryDialog + GlossaryTip + GlossaryText + `V2GlossaryTipProvider`. Swap them into `V2Providers`/`V2Terminal`/chat, delete the last V1 component imports, and add the "no V1 component import" guard test. **After this the entire V2 surface is native.**

**Architecture:** V2 rewrites presentation + the tip context; reuses shared glossary data from `/shared/glossary.js`. Behavior sources: `components/overlays/GlossaryDialog.tsx`, `components/overlays/GlossaryTip.tsx`, `components/chat/GlossaryText.tsx`, `state/GlossaryTipContext.tsx` (READ all).

**Tech Stack:** React+TS, Vite, Vitest. **Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-j-glossary-design.md`. Branch `frontend/v2-redesign`; `git add client/src/v2` only.

---

## Task 1: V2 glossary suite + swap-in

**Files:** Create `client/src/v2/state/V2GlossaryTipContext.tsx`, `client/src/v2/overlays/GlossaryDialog.tsx`, `client/src/v2/overlays/GlossaryTip.tsx`, `client/src/v2/chat/GlossaryText.tsx`, `client/src/v2/styles/glossary.css`, tests. Modify `client/src/v2/state/V2Providers.tsx`, `client/src/v2/V2Terminal.tsx`, `client/src/v2/chat/Bubble.tsx` (+ `client/src/v2/overlays/RigTerminal.tsx` loadout tags optionally).

- `V2GlossaryTipContext`: `useV2GlossaryTip()` → `{ showTip(term, anchorEl), hideTip }`; portals the V2 `GlossaryTip`. Port V1 `GlossaryTipContext` logic. Reuse shared glossary data.
- `GlossaryDialog` (props `{ open, onClose }`): V2 modal listing shared glossary entries; close control.
- `GlossaryTip`: positioned tooltip (above/below auto-flip, arrow, outside-click/scroll/esc close) — port V1.
- `GlossaryText`: wraps recognized terms in tappable spans → `useV2GlossaryTip().showTip`.

- [ ] **Step 1** — failing test `client/src/v2/chat/GlossaryText.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { GlossaryText } from "./GlossaryText";

test("wraps a known glossary term in a tappable control", () => {
  render(<V2GlossaryTipProvider><GlossaryText text="Roll to Hit against the target" /></V2GlossaryTipProvider>);
  // At least one recognized term becomes a button/span with a role — assert a term is highlighted.
  // (Pick a term you confirm exists in /shared/glossary.js when porting; adjust the text above to include it.)
  expect(screen.getByText(/Roll to Hit/i)).toBeInTheDocument();
});
```
(When porting, set the sample text to include a real glossary term and assert the highlighted element is interactive.)

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement the four components + context (port from V1; V2 classes `v2-gloss*`).
- [ ] **Step 4** — `glossary.css` under `.v2-root` (dialog list, tip bubble + arrow, term underline).
- [ ] **Step 5** — swap-in:
  - `V2Providers.tsx`: replace `import { GlossaryTipProvider } from "../../state/GlossaryTipContext"` + its use → `import { V2GlossaryTipProvider } from "./V2GlossaryTipContext"` and wrap with it.
  - `V2Terminal.tsx`: replace `import { GlossaryDialog } from "../components/overlays/GlossaryDialog"` → `import { GlossaryDialog } from "./overlays/GlossaryDialog"`.
  - `client/src/v2/chat/Bubble.tsx`: use V2 `GlossaryText` for bot plain bubbles (from Phase I this was plain text).
  - Optionally `RigTerminal.tsx` loadout tags → wrap in V2 `GlossaryText`.
- [ ] **Step 6** — run `npx vitest run client/src/v2` → green. `npx tsc -p . --noEmit` clean.
- [ ] **Step 7** — commit `feat(v2): native glossary (dialog, tip, text)`.

---

## Task 2: "No V1 component import" guard + final verification

**Files:** Create `client/src/v2/no-v1-imports.test.ts`.

- [ ] **Step 1** — test asserting no V2 source file imports a V1 component/overlay/wizard/chat/battle-context:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "node:fs";
import { expect, test } from "vitest";

// Use Vite's import.meta.glob to read all V2 source as raw text (typed, no node fs types needed).
const files = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

test("no V2 source imports a V1 presentation module", () => {
  const banned = /from ["'](\.\.\/)+components\/(overlays|wizards|chat|rig|battle|FieldMap|FieldControls|Drawer)|(\.\.\/)+state\/(DrawerContext|RollContext|WizardContext|BattleActionsContext|GlossaryTipContext)|(\.\.\/)+hooks\/useBattleWatchers/;
  const offenders: string[] = [];
  for (const [path, src] of Object.entries(files)) {
    if (path.includes(".test.")) continue;
    src.split("\n").forEach((line, i) => { if (/^\s*import/.test(line) && banned.test(line)) offenders.push(`${path}:${i + 1} ${line.trim()}`); });
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});
```
Note: V2 legitimately reuses V1 **logic** (`hooks/useChatStream`, `hooks/useSpeech`, `hooks/useCommands`, `hooks/useMySide`, `components/chat/ChatContext`, `lib/*`, `state/RoomStateContext`, `state/UiStateContext`) and `/shared/*` — the banned regex targets only V1 **presentation** modules. Tune it while implementing so it passes on legitimate reuse and fails on any real V1-component import. (`ChatContext` is state/logic — keep it allowed.)

- [ ] **Step 2** — run → it should pass now (Phases E–J removed all V1 presentation imports). If it flags anything, fix that import to the V2 equivalent.
- [ ] **Step 3** — `npx vitest run client/src/v2` + `npm test` + `npx tsc -p . --noEmit` all green.
- [ ] **Step 4** — Browser verify `/?v2`: glossary ⓘ opens native dialog; a highlighted term opens a native tip; chat still works; `/` (V1) still clean. No console errors.
- [ ] **Step 5** — commit `test(v2): guard against V1 presentation imports; native V2 complete`.

---

## Self-Review Notes
- Coverage: glossary suite (T1), the import guard (T2).
- Definition of done for the whole native initiative: the guard test passes → V2 is 100% native under `.v2-root`; V1 untouched.
