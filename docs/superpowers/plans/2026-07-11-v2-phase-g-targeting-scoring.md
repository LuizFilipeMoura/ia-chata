# V2 Phase G — Targeting, Scoring & Watchers Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Native V2 AttackWizard + VpWizard + `V2WizardContext`, and `useV2BattleWatchers` — isolated tested units on top of Phases E+F. (The app switchover that activates all of E–H happens in Phase H's final task.)

**Architecture:** V2 mirrors V1 `WizardContext` (portals the two wizards) and `useBattleWatchers`. Behavior sources: `client/src/components/wizards/AttackWizard.tsx` (570 lines), `client/src/components/wizards/VpWizard.tsx`, `client/src/hooks/useBattleWatchers.tsx`, `client/src/state/WizardContext.tsx`. V2 deps: `useV2Drawer`, `useV2Roll`, `useV2BattleActions` (Phases E/F).

**Tech Stack:** React+TS, Vite, Vitest. **Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-g-targeting-scoring-design.md`. Branch `frontend/v2-redesign`; `git add client/src/v2` only.

---

## Task 1: V2 VpWizard

**Files:** Create `client/src/v2/overlays/VpWizard.tsx`, `client/src/v2/overlays/VpWizard.test.tsx`; create `client/src/v2/styles/wizards.css`.

Port V1 `VpWizard.tsx` (small). Props `{ onClose }`. Reads `game.objectives`/`recoveryClaims`/`recoveryConflict`; toggles claims; live VP total; sends `sendCommand("vp", { side, claims })`. V2 classes `v2-vpw*` + `v2-aw*` sheet frame.

- [ ] **Step 1** — failing test:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { VpWizard } from "./VpWizard";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

function Seed({ state }: { state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(() => { d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } }); d({ type: "applyServerState", state }); }, [d, state]);
  return null;
}
test("toggling a marker updates the VP total and submits claims", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  const state = { version:1, ownerSide:"a", field:null, rigs:[], game:{ round:6, phase:"recovery", started:true,
    sides:[{id:"a",name:"K",vp:0,ready:true}], objectives:[{x:24,y:18,vp:2},{x:6,y:6,vp:1}] } } as unknown as ServerState;
  render(<AppProviders><Seed state={state} /><VpWizard onClose={vi.fn()} /></AppProviders>);
  await user.click(await screen.findByText(/Centre/i));
  expect(screen.getByText(/You'll score/i)).toHaveTextContent("2");
  await user.click(screen.getByRole("button", { name: /Score 2 VP/i }));
  expect(sendCommand).toHaveBeenCalledWith("vp", { side: "a", claims: [0] });
});
```
- [ ] **Step 2** — run → FAIL. **Step 3** — implement `VpWizard.tsx`. **Step 4** — `.v2-vpw*`/`.v2-aw*` styles in `wizards.css` under `.v2-root`. **Step 5** — run → PASS; `tsc` clean. **Step 6** — commit `feat(v2): native VpWizard`.

---

## Task 2: V2 AttackWizard + V2WizardContext

**Files:** Create `client/src/v2/overlays/AttackWizard.tsx` (port the 570-line V1 — READ it), `client/src/v2/state/V2WizardContext.tsx`, tests `client/src/v2/overlays/AttackWizard.test.tsx`, `client/src/v2/state/V2WizardContext.test.tsx`; append to `wizards.css`.

Port V1 `AttackWizard.tsx` faithfully. Props `{ rig, mode, onClose, target?, react? }`; `export type AttackMode = "fire"|"aimed"|"lock"`. Replace V1 `useBattleActions`→`useV2BattleActions`, `useRoll`→`useV2Roll`; keep `useCommands`/`useMySide`/`useRoomState`. Preserve every field (Target/Weapon/Arc/Cover/Range slider + accuracy tier/Location(aimed)), the dice preview, effective-range gate, spent-ranged rushed-reload cost, manual-dice mode (`promptDice`), return-fire (`react`) mode, lock mode. Command dispatches VERBATIM: fire/aimed → `sendCommand("action", attrs)`; lock → `sendCommand("action", { name, action:"lock", target })`; react mode → `sendReact(attack)`. Render upgrade/tag text as PLAIN text (no GlossaryText; Phase J adds it). V2 classes `v2-aw*`.

`V2WizardContext.tsx`: port V1 `WizardContext` but only `openAttack`/`openScore`/`close` (commission is native/separate). Portals V2 `AttackWizard`/`VpWizard`. `openAttack` guards "no enemies → don't open". `useV2Wizard` hook, error "useV2Wizard outside V2WizardProvider".

- [ ] **Step 1** — failing test `client/src/v2/state/V2WizardContext.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { V2BattleActionsProvider } from "./V2BattleActionsContext";
import { V2WizardProvider, useV2Wizard } from "./V2WizardContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const mk = (id:number,owner:"a"|"b"): Rig => ({ id, name:owner==="a"?"MINE":"FOE", owner, weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  weaponUpgrades:{longRange:"field",melee:"field"}, equipment:"ablative-plating", activated:false, destroyed:false, loaded:{longRange:true,melee:true} } as unknown as Rig);

function Seed({ rigs, open }: { rigs: Rig[]; open: (w: ReturnType<typeof useV2Wizard>) => void }) {
  const d = useRoomDispatch(); const w = useV2Wizard();
  useEffect(() => { d({ type:"setSession", session:{room:"IR",side:"a",name:"K"} });
    d({ type:"applyServerState", state:{ version:1, ownerSide:"a", field:null, rigs, game:{ round:1, phase:"activation", started:true, sides:[{id:"a",name:"K",vp:0,ready:true},{id:"b",name:"R",vp:0,ready:true}], turn:{side:"a",activeRigId:rigs[0].id,actionsUsed:0,actionsMax:3} } } as unknown as ServerState });
  }, [d, rigs]);
  return <button onClick={() => open(w)}>attack</button>;
}
function wrap(children: React.ReactNode) {
  return <AppProviders><V2DrawerProvider><V2RollProvider><V2BattleActionsProvider><V2WizardProvider>{children}</V2WizardProvider></V2BattleActionsProvider></V2RollProvider></V2DrawerProvider></AppProviders>;
}
test("openAttack shows the fire control for a rig with enemies", async () => {
  const user = userEvent.setup();
  const rigs = [mk(1,"a"), mk(2,"b")];
  render(wrap(<Seed rigs={rigs} open={(w) => w.openAttack(rigs[0], "fire")} />));
  await user.click(await screen.findByText("attack"));
  expect(await screen.findByText(/TARGET|Target/)).toBeInTheDocument();
});
```
- [ ] **Step 2** — run → FAIL. **Step 3** — implement `AttackWizard.tsx` + `V2WizardContext.tsx`. **Step 4** — an AttackWizard smoke test (`AttackWizard.test.tsx`) rendering it directly with a rig + one enemy in seeded state, asserting the Open Fire button exists and, when clicked in a valid state, calls `sendCommand`/`sendReact` (keep it light — the field math is V1-tested). **Step 5** — `.v2-aw*` fire-control styles in `wizards.css` (port mockup lines 419–451). **Step 6** — run `npx vitest run client/src/v2` → green; `tsc` clean. **Step 7** — commit `feat(v2): native AttackWizard + V2WizardContext`.

---

## Task 3: useV2BattleWatchers

**Files:** Create `client/src/v2/hooks/useV2BattleWatchers.tsx`, test `client/src/v2/hooks/useV2BattleWatchers.test.tsx`.

Port V1 `useBattleWatchers.tsx`: uses `useV2Roll` (playResolution), `useV2Drawer` (openDrawer/closeDrawer), `useV2BattleActions` (sendReact), `useV2Wizard` (openAttack for return-fire). Four watchers: resolution log → playResolution; answer-token gate drawer; reaction-resolution drawer (evasive/return-fire → `openAttack(reactor,"fire",{target,react:true})`); activation-summary recap drawer (auto-fade ~6.5s). Same command sends as V1.

- [ ] **Step 1** — failing test: render a component calling `useV2BattleWatchers()` inside the full V2 provider stack (V2Drawer/Roll/BattleActions/Wizard + AppProviders) with a seeded `pendingAnswer`, and assert the answer-token gate drawer opens (find its title text). Match the title to what you port.
- [ ] **Step 2** — run → FAIL. **Step 3** — implement. **Step 4** — run `npx vitest run client/src/v2` → green; `tsc` clean. **Step 5** — commit `feat(v2): useV2BattleWatchers`.

---

## Self-Review Notes
- Coverage: VpWizard (T1), AttackWizard + wizard context (T2), watchers (T3). No app wiring — Phase H's final task does the switchover.
- Command parity mandatory: `vp`, `action` (fire/aimed/lock), `react`, plus the watcher gate/reaction sends — copy from V1 exactly.
