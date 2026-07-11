# V2 Phase F — Battle Action Flows Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native `V2BattleActionsProvider` with V2 drawer bodies (move/sprint hold, repair, prepare, blast) and a native V2 ReactionPicker — built as isolated tested units on top of Phase E's V2 Drawer + Roll. (Watchers + the app switchover land in Phase G, once the V2 wizard exists for the return-fire path.)

**Architecture:** V2BattleActions mirrors V1 `state/BattleActionsContext.tsx` (READ it — it's the behavior source) but renders V2 bodies via `useV2Drawer` and prompts dice via `useV2Roll`. Same command verbs/attrs. No app wiring yet.

**Tech Stack:** React+TS, Vite, Vitest. **Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-f-battle-flows-design.md`. **Test cmd:** `npx vitest run <path>`. Branch `frontend/v2-redesign`. `git add client/src/v2` only.

**Reused (unchanged):** `useCommands`, `useMySide`, `HEAT_CAPACITY` from `/shared/game-state.js`, `SPEED` map + hold timings (copy the constants from V1 BattleActionsContext), `Rig`/`PrepType` types. **New V2 deps:** `useV2Drawer` (`../state/V2DrawerContext`), `useV2Roll` (`../state/V2RollContext`).

---

## Task 1: V2 ReactionPicker

**Files:** Create `client/src/v2/overlays/ReactionPicker.tsx`, `client/src/v2/overlays/ReactionPicker.test.tsx`; append `.v2-rx*` to `client/src/v2/styles/overlay.css`.

Port V1 `client/src/components/overlays/ReactionPicker.tsx` (48 lines — READ it). Props `{ value, allowShield, onChange }`. Options: Brace / Evasive / Return Fire, plus Raise Shield only when `allowShield`.

- [ ] **Step 1** — failing test:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ReactionPicker from "./ReactionPicker";
test("offers Raise Shield only when allowed", () => {
  const { rerender } = render(<ReactionPicker value="brace" allowShield={false} onChange={vi.fn()} />);
  expect(screen.queryByText(/Raise Shield/i)).toBeNull();
  rerender(<ReactionPicker value="brace" allowShield={true} onChange={vi.fn()} />);
  expect(screen.getByText(/Raise Shield/i)).toBeInTheDocument();
});
```
- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `ReactionPicker.tsx` (default export; port V1 options/labels; V2 `v2-rx*` classes).
- [ ] **Step 4** — append `.v2-rx*` styles to `overlay.css` under `.v2-root`.
- [ ] **Step 5** — run → PASS. `tsc` clean.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): native ReactionPicker"`

---

## Task 2: V2BattleActionsProvider + drawer bodies

**Files:** Create `client/src/v2/state/V2BattleActionsContext.tsx`, `client/src/v2/battle/MoveBody.tsx`, `RepairBody.tsx`, `PrepareBody.tsx`, `BlastBody.tsx`, and test `client/src/v2/state/V2BattleActionsContext.test.tsx`. Append `.v2-dwr-*` body styles to `overlay.css` as needed.

Port V1 `state/BattleActionsContext.tsx`. The provider exposes the SAME API:
`{ openMove, openRepair, openPrepare, resolveBlast, sendReact, endActivation, rollInitiative, resetBattle }`.
Differences: use `useV2Drawer`/`useV2Roll` instead of V1 `useDrawer`/`useRoll`; render the V2 body components + V2 `ReactionPicker`. Copy the `SPEED`, `MOVE_HOLD_MS`, `SPRINT_HOLD_MS`, `HEAT_CAPACITY` usage and command dispatches verbatim (verbs: `action` with move/sprint/repair/emergencypatch/prepare + `engage?`/`loc`/`prep`/`dice`; `blast {targets}`; `react {...,side}`; `endactivation {name, dice?}`; `initiative {dice?}`; `reset`). Bodies:
- `MoveBody`: timed hold (5s move / 8s sprint), distance from `SPEED[weightClass]` (sprint ×1.5 round), heat (+1 move / +2 sprint, +1 sprint w/ servo-actuators), optional engage `<select>` of reachable enemies, Confirm locked until hold elapses. Port V1's `MoveBody` verbatim (structure at BattleActionsContext.tsx:63-147), V2 classes.
- `RepairBody`: location picker (hull/arms/legs/engine) + auto vs manual hint; V2 classes. (Uses a V2 `ChoiceField` — either create a tiny `client/src/v2/overlays/ChoiceField.tsx` ported from V1 `overlays/ChoiceField.tsx`, or inline a segmented control.)
- `PrepareBody`: hint + V2 `ReactionPicker` (allowShield when `weapons?.melee === "Bulwark Shield"`).
- `BlastBody`: checklist of candidate rigs (living, not the wreck), toggling a `picked` Set.

- [ ] **Step 1** — failing test `client/src/v2/state/V2BattleActionsContext.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { RoomProvider } from "../../state/RoomStateContext";
import { V2BattleActionsProvider, useV2BattleActions } from "./V2BattleActionsContext";
import type { Rig } from "../../state/types";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../hooks/useMySide", () => ({ useMySide: () => "a" }));

const rig = { id:1, name:"STALKER", owner:"a", weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  equipment:"ablative-plating", activated:false, destroyed:false } as unknown as Rig;

function Harness() {
  const { openRepair } = useV2BattleActions();
  return <button onClick={() => openRepair(rig, "emergencypatch")}>patch</button>;
}
function wrap(ui: React.ReactNode) {
  return <RoomProvider><V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>{ui}</V2BattleActionsProvider></V2RollProvider></V2DrawerProvider></RoomProvider>;
}
test("emergency patch opens a drawer and dispatches the patch command", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  render(wrap(<Harness />));
  await user.click(screen.getByText("patch"));
  await user.click(await screen.findByRole("button", { name: /Patch/i }));
  expect(sendCommand).toHaveBeenCalledWith("action", { name: "STALKER", loc: "hull", action: "emergencypatch" });
});
```
(Match the exact attr order/shape to what you port from V1 `openRepair`. V1 sends `{ name, action:"emergencypatch", loc }` — adjust the expectation to the real object.)

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement the bodies + `V2BattleActionsContext.tsx` (port V1; V2 drawer/roll; `useV2BattleActions` hook, error "useV2BattleActions outside V2BattleActionsProvider").
- [ ] **Step 4** — styles for bodies (`.v2-dwr-hint`, hold track, engage select, blast list, choice field) under `.v2-root` in `overlay.css`.
- [ ] **Step 5** — run → PASS. `npx vitest run client/src/v2` all green. `tsc` clean.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): V2BattleActions + drawer bodies"`

---

## Self-Review Notes
- Coverage: ReactionPicker (T1), V2BattleActions + bodies (T2).
- Not yet wired into the app (Phase G switchover). Watchers deferred to G (need the V2 wizard for return-fire).
- Command parity with V1 is mandatory — copy verbs/attrs exactly.
