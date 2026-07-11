# V2 Phase H — Battlefield + The Switchover Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native V2 FieldMap + FieldControls, then the **switchover** — assemble `V2Providers`, flip `main.tsx` to a self-contained lazy V2 root, and rewire every V2 battle consumer to the V2 hooks — removing the entire V1 battle-overlay cluster from the V2 experience.

**Tech Stack:** React+TS, Vite, Vitest. **Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-h-battlefield-design.md` + native overview. Branch `frontend/v2-redesign`; `git add client/src/v2` (+ `client/src/main.tsx` in the switchover task) only.

---

## Task 1: V2 FieldMap + FieldControls

**Files:** Create `client/src/v2/battle/FieldMap.tsx`, `client/src/v2/battle/FieldControls.tsx`, tests, `client/src/v2/styles/field.css`.

Port V1 `components/FieldMap.tsx` (171 lines) + `components/FieldControls.tsx` (READ them). FieldMap props `{ field, objectives, mySide, ownerSide }`; reuse `emptyCorners`/`deploymentCorners`/`deployRadius` from `/shared/field.js` and `FIELD_MIN`/`FIELD_MAX`. FieldControls sends `field` commands (`{action:"set",width,height,diagonal?}`, `{action:"reroll"}`, `{action:"lock"}`) and opens the set-field body via **`useV2Drawer`** (not V1 useDrawer). V2 classes `v2-fm*`/`v2-fc*`.

- [ ] **Step 1** — failing test `client/src/v2/battle/FieldControls.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { FieldControls } from "./FieldControls";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

function Seed({ state }: { state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(() => { d({ type:"setSession", session:{room:"IR",side:"a",name:"K"} }); d({ type:"applyServerState", state }); }, [d, state]);
  return null;
}
test("owner sees Set field before lock; non-owner sees the waiting note", async () => {
  const owner = { version:1, ownerSide:"a", field:{width:54,height:36,diagonal:"tlbr",terrain:[],locked:false}, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[] } } as unknown as ServerState;
  const { unmount } = render(<AppProviders><V2DrawerProvider><Seed state={owner} /><FieldControls /></V2DrawerProvider></AppProviders>);
  expect(await screen.findByRole("button", { name: /Set field/i })).toBeInTheDocument();
  unmount();
  const guest = { ...owner, ownerSide:"b" } as unknown as ServerState;
  render(<AppProviders><V2DrawerProvider><Seed state={guest} /><FieldControls /></V2DrawerProvider></AppProviders>);
  expect(await screen.findByText(/Waiting for the owner/i)).toBeInTheDocument();
});
```
- [ ] **Step 2** — run → FAIL. **Step 3** — implement `FieldMap.tsx` + `FieldControls.tsx` (V2 drawer). **Step 4** — `field.css` under `.v2-root` (blueprint grid, deploy sectors, terrain fills, objective markers). **Step 5** — run → PASS; `tsc` clean. **Step 6** — commit `feat(v2): native FieldMap + FieldControls`.

---

## Task 2: The Switchover (assemble V2Providers, flip main.tsx, rewire consumers)

**Files:** Create `client/src/v2/state/V2Providers.tsx`, `client/src/v2/V2Root.tsx`; modify `client/src/main.tsx`, `client/src/v2/battle/ActionConsole.tsx`, `client/src/v2/components/TurnBanner.tsx`, `client/src/v2/overlays/OutcomeBanner.tsx`, `client/src/v2/V2Terminal.tsx`, `client/src/v2/screens/Squadron.tsx`.

- [ ] **Step 1: V2Providers** — `client/src/v2/state/V2Providers.tsx`:
```tsx
import type { ReactNode } from "react";
import { RoomProvider } from "../../state/RoomStateContext";
import { GlossaryTipProvider } from "../../state/GlossaryTipContext"; // V1 until Phase J
import { UiProvider } from "../../state/UiStateContext";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { V2BattleActionsProvider } from "./V2BattleActionsContext";
import { V2WizardProvider } from "./V2WizardContext";

export function V2Providers({ children }: { children: ReactNode }) {
  return (
    <RoomProvider><GlossaryTipProvider><UiProvider>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider><V2WizardProvider>
        {children}
      </V2WizardProvider></V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </UiProvider></GlossaryTipProvider></RoomProvider>
  );
}
```

- [ ] **Step 2: V2Root** — `client/src/v2/V2Root.tsx` (one lazy chunk; V1 users never load it):
```tsx
import { V2Providers } from "./state/V2Providers";
import V2App from "./V2App";
export default function V2Root() { return <V2Providers><V2App /></V2Providers>; }
```

- [ ] **Step 3: main.tsx** — the V2 branch becomes a self-contained lazy root (no more `AppProviders` for V2):
```tsx
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProviders } from "./AppProviders";
import { shouldUseV2 } from "./v2/shouldUseV2";
// ...keep the V1 style imports above...
const V2Root = lazy(() => import("./v2/V2Root"));
const useV2 = shouldUseV2(window.location.search);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {useV2
      ? <Suspense fallback={null}><V2Root /></Suspense>
      : <AppProviders><App /></AppProviders>}
  </StrictMode>,
);
```
(V2App keeps its own `import "./styles/tokens.css"`. V2Root provides all V2 providers. `App` keeps `AppProviders`.)

- [ ] **Step 4: rewire consumers to V2 hooks**
  - `client/src/v2/battle/ActionConsole.tsx`: replace `import { useBattleActions } from "../../state/BattleActionsContext"` → `import { useV2BattleActions } from "../state/V2BattleActionsContext"` (use it); `import { useWizard } from "../../state/WizardContext"` → `import { useV2Wizard } from "../state/V2WizardContext"`; and the `AttackMode` type import → `import type { AttackMode } from "../overlays/AttackWizard"`. Update the hook calls (`useV2BattleActions()`, `useV2Wizard()`).
  - `client/src/v2/components/TurnBanner.tsx`: `useWizard`→`useV2Wizard` (for `openScore`); `useBattleActions`→`useV2BattleActions` (initiative/blast/endActivation). The **commission** CTA can no longer use a wizard context — add an `onCommission?: () => void` prop to TurnBanner and call it for the `commission` CTA kind (V2Terminal passes it).
  - `client/src/v2/overlays/OutcomeBanner.tsx`: `useBattleActions`→`useV2BattleActions` (resetBattle).
  - `client/src/v2/V2Terminal.tsx`: `import { useBattleWatchers }` → `import { useV2BattleWatchers } from "./hooks/useV2BattleWatchers"` and call it; pass `onCommission={() => setCommissionOpen(true)}` to `<TurnBanner/>`.
  - `client/src/v2/screens/Squadron.tsx`: swap `import { FieldControls } from "../../components/FieldControls"` → `import { FieldControls } from "../battle/FieldControls"`. **Fix the gating:** render `<FieldControls/>` **unconditionally** (remove the `{started && …}` guard) so the owner can set/lock the field pre-battle (required to ready up), matching V1.

- [ ] **Step 5** — run `npx vitest run client/src/v2` → all green (update any test that rendered these consumers expecting the old hooks; the ActionConsole/TurnBanner/OutcomeBanner tests use `AppProviders` which still has V1 providers — but the components now call V2 hooks, so those tests must wrap in the V2 providers too. Update them: wrap in `<V2DrawerProvider><V2RollProvider><V2BattleActionsProvider><V2WizardProvider>` inside `AppProviders`, or better, render under `<V2Providers>`+seed). `npx tsc -p . --noEmit` clean.
- [ ] **Step 6** — commit `feat(v2): switchover to native V2 provider stack (drop V1 battle overlays)`.

- [ ] **Step 7: Browser verify (critical).** Fresh `/?v2` tab: join, open a rig terminal, confirm the field map renders (native), the Set-field flow works pre-battle, and no console errors (esp. "useV2… outside provider"). Confirm `/` (V1) still loads clean. Report what was exercised.

---

## Self-Review Notes
- After this phase, `grep -rn "state/BattleActionsContext\|state/WizardContext\|state/RollContext\|state/DrawerContext\|hooks/useBattleWatchers\|components/FieldControls\|components/FieldMap" client/src/v2 --include=*.tsx | grep -v "\.test\."` returns nothing (V2 no longer imports V1 battle overlays/field).
- Remaining V1 imports in V2 (Phases I/J): `GlossaryDialog`, `ChatProvider`/`ChatPanel`, `GlossaryTipProvider`.
- Type consistency: `TurnBanner { onCommission? }`; consumers use `useV2*` hooks.
