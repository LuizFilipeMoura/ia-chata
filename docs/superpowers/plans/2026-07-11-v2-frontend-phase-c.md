# V2 Frontend — Phase C Implementation Plan (Battle System)

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Playable battle in V2 — port the battle chrome (HUD, turn banner, action console, outcome) to V2 styling, reuse V1's shared overlays for dice/drawers/targeting/field as interim.

**Architecture:** All battle actions route through shared providers (`useBattleActions`, `useWizard`, `useCommands`) and pure view fns (`phaseSummary`, `computeFocus`, `availableActions`, `actionBudget`, `outcomeText`). V2 ports chrome + calls `useBattleWatchers()`; reuses V1 `FieldMap`/`FieldControls` and all shared portals.

**Tech Stack:** React+TS, Vite, Vitest + testing-library.

**Reference:** Spec `docs/superpowers/specs/2026-07-11-v2-frontend-phase-c-design.md`. V1 chrome to port: `client/src/components/BattleHud.tsx`, `TurnBanner.tsx`, `battle/ActionConsole.tsx`, `OutcomeBanner.tsx`. Mockup: outcome lines 477–496, action console lines 384–408.

**Verified shared APIs:**
- `phaseSummary(game, rigs)` → `{ label, round, turnSide, turnName, activeName, answerTokens:{a,b} }`.
- `computeFocus(game, rigs, mySide)` → `null | { tone:"act"|…, primary, secondary, icon, cta?:{kind:FocusCtaKind, label} }`; `FocusCtaKind` from `client/src/lib/computeFocus`.
- `availableActions(rig, turn, round)` → `{ key,label,heat,enabled,cost,note }[]`.
- `actionBudget(rig, turn)` → `{ left, max, used, reduced }`.
- `outcomeText(outcome, sides)` → renderable text.
- `useBattleActions()` → `{ openMove, openRepair, openPrepare, resolveBlast, endActivation, rollInitiative, resetBattle }`.
- `useWizard()` → `{ openAttack(rig, mode), openScore() }`; `useBattleWatchers()` from `client/src/hooks/useBattleWatchers`.

**Test command:** `npx vitest run <path>` from repo root. Branch: `frontend/v2-redesign`. Targeted `git add client/src/v2` only.

---

## Task 1: BattleHud + TurnBanner (V2 chrome)

**Files:** Create `client/src/v2/components/BattleHud.tsx`, `client/src/v2/components/TurnBanner.tsx`, `client/src/v2/styles/battle.css`, and tests `client/src/v2/components/BattleHud.test.tsx`, `TurnBanner.test.tsx`.

Port V1 `BattleHud.tsx` and `TurnBanner.tsx` to V2 classes. Differences:
- TurnBanner sets `my-turn-glow` on the nearest `.v2-root` element (via a ref up to `document.querySelector(".v2-root")`) rather than `document.body`, OR simplest: keep it on document.body but add the `.v2-root` glow rule too — to stay scoped, prefer toggling a class on `document.documentElement` and gating the CSS under `.v2-root`. Implementation: keep V1's `computeFocus` logic; for the glow, toggle `document.body.classList` is acceptable but the border rule must live under `.v2-root` — so instead set a state class on the outer `.v2-tb` wrapper and also expose `data-myturn` on it; the full-screen border is drawn by a `.v2-tb[data-myturn="true"]::before` fixed overlay. This keeps everything inside V2.
- Use V2 classes `v2-bh-*` and `v2-tb-*`.

- [ ] **Step 1** — failing test `client/src/v2/components/BattleHud.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { BattleHud } from "./BattleHud";

const rig = (id: number, owner: "a"|"b"): Rig => ({
  id, name: "R"+id, owner, weightClass: "light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
  legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
  equipment:"ablative-plating", activated:false, destroyed:false,
});
function Seed({ state }:{ state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(()=>{ d({type:"setSession",session:{room:"IR",side:"a",name:"K"}}); d({type:"applyServerState",state}); },[d,state]);
  return null;
}
test("renders phase and round when started", async () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[rig(1,"a"),rig(2,"b")],
    game:{ round:2, phase:"activation", started:true,
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 } } };
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  expect(await screen.findByText(/R2/)).toBeInTheDocument();
  expect(screen.getByText("Kostov")).toBeInTheDocument();
});
test("renders nothing pre-battle", () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[] } };
  const { container } = render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  // BattleHud itself renders null; container has only the Seed (null) => no bh element
  expect(container.querySelector(".v2-bh")).toBeNull();
});
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `client/src/v2/components/BattleHud.tsx` (port of V1, V2 classes):
```tsx
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { phaseSummary } from "/shared/battle-view.js";
import "../styles/battle.css";

export function BattleHud() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  if (!game?.started) return null;
  const sum = phaseSummary(game, rigs);
  const tok = sum.answerTokens[mySide] || 0;
  const pr = game.pendingReaction;
  const opponentReacting = Boolean(pr && pr.defender !== mySide);
  return (
    <div className="v2-bh">
      <div className="v2-bh-phase">
        <span className="v2-bh-label">{sum.label}</span>
        <span className="v2-bh-round">R{sum.round}</span>
      </div>
      <div className="v2-bh-turn">
        {sum.turnSide ? (<>Turn: <b className={sum.turnSide === mySide ? "v2-bh-mine" : "v2-bh-foe"}>{sum.turnName}</b>{sum.activeName ? ` — ${sum.activeName}` : ""}</>) : ""}
      </div>
      <div className="v2-bh-tokens">{tok ? `⟡ ${tok} Answer` : ""}</div>
      {opponentReacting && <div className="v2-bh-reacting">↩️ Opponent is reacting…</div>}
    </div>
  );
}
```

- [ ] **Step 4** — failing test `client/src/v2/components/TurnBanner.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { TurnBanner } from "./TurnBanner";

const rig = (id:number, owner:"a"|"b"): Rig => ({ id, name:"R"+id, owner, weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, equipment:"ablative-plating", activated:false, destroyed:false });
function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

test("pre-battle focus prompts to commission and hides nothing weird", async () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[{id:"a",name:"K",vp:0,ready:false},{id:"b",name:"R",vp:0,ready:false}] } };
  render(<AppProviders><Seed state={state}/><TurnBanner/></AppProviders>);
  // computeFocus pre-battle returns a commission/ready focus with a primary line
  expect(await screen.findByText(/commission/i)).toBeInTheDocument();
});
```
(If `computeFocus` text differs, adjust the assertion to match the real pre-battle primary string — read `client/src/lib/computeFocus.ts`.)

- [ ] **Step 5** — run → FAIL.
- [ ] **Step 6** — implement `client/src/v2/components/TurnBanner.tsx` porting V1 `TurnBanner.tsx` exactly (same `computeFocus` + `onCta` switch using `useWizard`/`useBattleActions`/`useCommands`), but: V2 classes `v2-tb*`; render the banner inside a wrapper `<div className="v2-tb" data-myturn={focus.tone==="act"}>`; drop the `document.body` glow toggle and the `--turn-banner-h` measurement (V2 banner is in normal flow at the top of the screen area, not fixed) — keep it simple: just render the card. Keep the `changed` flash effect if easy, else omit. The CTA switch must call: commission→`openCommission`, ready→`sendCommand("ready",{side:mySide})`, initiative→`rollInitiative`, blast→`resolveBlast`, score→`openScore`, endTurn→`endActivation(activeRig)`.

- [ ] **Step 7** — create `client/src/v2/styles/battle.css` (all under `.v2-root`): `.v2-bh*` phase strip (dark bar, oil phase label, round chip, mine=oil/foe=ember turn name, tokens, reacting line) and `.v2-tb*` banner (card with tone-colored left border: act=oil glow, else neutral; icon, primary/secondary text, CTA button) and `.v2-tb[data-myturn="true"]::before { position:fixed; inset:0; border:3px solid var(--v2-oil)... pointer-events:none }` for the my-turn glow. Port accents from mockup where relevant.

- [ ] **Step 8** — run both tests → PASS. `npx tsc -p . --noEmit` clean.
- [ ] **Step 9** — commit: `git add client/src/v2 && git commit -m "feat(v2): battle HUD + turn banner chrome"`

---

## Task 2: ActionConsole (V2) + wire into RigTerminal

**Files:** Create `client/src/v2/battle/ActionConsole.tsx`, `client/src/v2/battle/ActionConsole.test.tsx`; append `.v2-ac*` to `battle.css`; modify `client/src/v2/overlays/RigTerminal.tsx`.

Port V1 `battle/ActionConsole.tsx` to V2, but replace `IronActionTile` (PNG-asset tiles) with plain V2 buttons. Keep: `availableActions`/`actionBudget`, the three GROUPS (Attack/Move/Support), the popover of enabled sub-actions (portal to body), the `onAction` routing (fire/aimed/lock→`openAttack`; move/sprint→`openMove`; repair→`openRepair("repair")`; emergencypatch→`openRepair("emergencypatch")`; prepare→`openPrepare`; else `sendCommand("action",{name,action:key})`), inline notes, and the End-turn button (`endActivation`). Renders empty `<div className="v2-ac"/>` unless this rig is the active one in the activation phase.

- [ ] **Step 1** — failing test `client/src/v2/battle/ActionConsole.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { ActionConsole } from "./ActionConsole";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const stalker: Rig = { id:1, name:"STALKER", owner:"a", weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  weaponUpgrades:{longRange:"field",melee:"field"}, equipment:"ablative-plating", activated:false, destroyed:false, loaded:{longRange:true,melee:true} };

function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

function started(activeRigId: number|null): ServerState {
  return { version:1, ownerSide:"a", field:null, rigs:[stalker, {...stalker, id:2, owner:"b", name:"FOE"}],
    game:{ round:1, phase:"activation", started:true,
      sides:[{id:"a",name:"K",vp:0,ready:true},{id:"b",name:"R",vp:0,ready:true}],
      turn:{ side:"a", activeRigId, actionsUsed:0, actionsMax:3 } } };
}

test("shows the action budget + End turn when this rig is active", async () => {
  render(<AppProviders><Seed state={started(1)}/><ActionConsole rig={stalker}/></AppProviders>);
  expect(await screen.findByText(/Actions/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /End STALKER/i })).toBeInTheDocument();
});
test("renders empty for a non-active rig", async () => {
  const { container } = render(<AppProviders><Seed state={started(null)}/><ActionConsole rig={stalker}/></AppProviders>);
  await screen.findByText((_,e)=>e?.className==="v2-ac"||false).catch(()=>{});
  expect(container.querySelector(".v2-ac")?.children.length ?? 0).toBe(0);
});
```
(If the empty-state assertion is awkward, simplify to: `expect(screen.queryByText(/Actions/i)).toBeNull()` for the non-active case.)

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `client/src/v2/battle/ActionConsole.tsx` (port; V2 buttons + portal popover). Import shared fns from `/shared/battle-view.js` and `/shared/unit-kinds.js`; contexts from V1. Cold kinds suppress heat tags.
- [ ] **Step 4** — append `.v2-ac*` to `battle.css` (budget row + pips, group buttons row [Attack=ember, Move/Support=gunmetal], popover menu + rows with heat tags, hints, end-turn button). Port accents from mockup lines 384–408. Popover under `.v2-root` — since it portals to `document.body` (outside `.v2-root`), wrap the popover markup in a `<div className="v2-root">` inside the portal so the scoped styles apply.
- [ ] **Step 5** — modify `client/src/v2/overlays/RigTerminal.tsx`: import `ActionConsole`; render `{started && <ActionConsole rig={rig} />}` after the HeatGauge (before/near the actions row). Keep the Activate CTA.
- [ ] **Step 6** — run test → PASS; `npx vitest run client/src/v2` all green; `npx tsc -p . --noEmit` clean.
- [ ] **Step 7** — commit: `git add client/src/v2 && git commit -m "feat(v2): action console wired into rig terminal"`

---

## Task 3: OutcomeBanner + battle view wiring (watchers, field, HUD, turn banner)

**Files:** Create `client/src/v2/overlays/OutcomeBanner.tsx`, `client/src/v2/overlays/OutcomeBanner.test.tsx`; modify `client/src/v2/V2Terminal.tsx` and `client/src/v2/screens/Squadron.tsx`; append `.v2-outcome*` to `battle.css`.

- [ ] **Step 1** — failing test `client/src/v2/overlays/OutcomeBanner.test.tsx`:
```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { OutcomeBanner } from "./OutcomeBanner";

function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

test("hidden unless the game is finished", () => {
  const state:ServerState={version:1,ownerSide:"a",field:null,rigs:[],game:{round:1,phase:"activation",started:true,sides:[]}};
  const { container } = render(<AppProviders><Seed state={state}/><OutcomeBanner/></AppProviders>);
  expect(container.querySelector(".v2-outcome")).toBeNull();
});
test("shows New Battle when finished", async () => {
  const state:ServerState={version:1,ownerSide:"a",field:null,rigs:[],
    game:{round:6,phase:"finished",started:true,outcome:{winner:"a"} as any,
      sides:[{id:"a",name:"K",vp:28,ready:true},{id:"b",name:"R",vp:19,ready:true}]}};
  render(<AppProviders><Seed state={state}/><OutcomeBanner/></AppProviders>);
  expect(await screen.findByRole("button", { name: /New Battle/i })).toBeInTheDocument();
});
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `client/src/v2/overlays/OutcomeBanner.tsx` porting V1 `OutcomeBanner.tsx` (guard `phase!=="finished"` → null; render `outcomeText(game.outcome, game.sides)` + New Battle button calling `resetBattle` from `useBattleActions`) with the mockup's victory styling (lines 477–496): big stencil verdict word, VP line, stat tiles, New Battle. Class `.v2-outcome*`.
- [ ] **Step 4** — append `.v2-outcome*` rules to `battle.css` (centered, radial oil glow, huge stencil headline, stat tiles, ghost New Battle button), under `.v2-root`.
- [ ] **Step 5** — modify `client/src/v2/screens/Squadron.tsx`: render `<BattleHud/>` at the top of the `<section className="v2-yard">` (import from `../components/BattleHud`; it self-guards to render only when started). When `started`, also mount the reused V1 field: `import { FieldMap } from "../../components/FieldMap"; import { FieldControls } from "../../components/FieldControls";` and render `{started && <FieldControls/>}` below the roster (FieldControls renders the map + set-field drawer; it is V1-styled interim). NOTE: verify FieldControls renders FieldMap; if not, render `<FieldMap/>` too. Keep the existing ready bar.
- [ ] **Step 6** — modify `client/src/v2/V2Terminal.tsx`: call `useBattleWatchers()` (import from `../hooks/useBattleWatchers`) at the top so reaction/roll/answer-gate/recap overlays work; render `<TurnBanner/>` above `<Squadron/>` (import from `./components/TurnBanner`); render `<OutcomeBanner/>` (import from `./overlays/OutcomeBanner`) inside the Shell. Example additions:
```tsx
import { useBattleWatchers } from "../hooks/useBattleWatchers";
import { TurnBanner } from "./components/TurnBanner";
import { OutcomeBanner } from "./overlays/OutcomeBanner";
// inside V2Terminal, before return:
useBattleWatchers();
// in JSX, inside <Shell ...>:
//   <TurnBanner />
//   <Squadron .../>
//   ...existing overlays...
//   <OutcomeBanner />
```

- [ ] **Step 7** — run `npx vitest run client/src/v2` — all green. `npx tsc -p . --noEmit` clean.
- [ ] **Step 8** — Browser verify (dev server 5173 + backend 8000). Because a full battle needs two sides ready + a locked field, verify what's practical: open `/?v2` in a FRESH browser tab, confirm no console errors, the Yard renders, and (if a started game state is reachable via the existing room) the HUD/turn-banner appear. At minimum confirm: TurnBanner shows a focus prompt pre-battle; opening a rig terminal shows the Activate CTA; no console errors from `useBattleWatchers`. Report what was and wasn't exercised.
- [ ] **Step 9** — commit: `git add client/src/v2 && git commit -m "feat(v2): outcome banner + battle view (watchers, field, hud, turn banner)"`

---

## Self-Review Notes
- Coverage: HUD (T1), TurnBanner + focus CTAs (T1), ActionConsole + routing (T2), OutcomeBanner (T3), watchers/field/HUD/turn-banner wiring (T3).
- Interim reuse (documented): FieldMap/FieldControls, roll console, drawers, attack/VP wizards, reactions — all V1, mounted via shared contexts.
- Type consistency: `ActionConsole { rig }`; chrome components are prop-less (read context); RigTerminal renders `<ActionConsole>` when `started`.
