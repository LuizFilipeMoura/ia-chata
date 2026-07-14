# Rig Effects Descriptor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one engine-side `rigEffects(rig)` read-model that pre-resolves every equipment/upgrade modifier, then reroute all five preview surfaces plus two passive-badge surfaces through it so the UI can never drift from what the engine charges.

**Architecture:** `rigEffects` is a pure aggregator in `shared/game-state.js` that *calls* the existing atomic helpers (`equipmentSprintHeat` / `equipmentActiveHeat` / `equipmentRepairBonus`) and reads the passive effect fields. No resolution path changes. Consumers read the descriptor's final values; none recompute. A guard test pins the action-picker heat to the resolution engine's actual charge.

**Tech Stack:** Vanilla ES modules (`shared/`), React + TypeScript (`client/`), Vitest (client tests), `node --test` (shared tests).

**Spec:** `docs/superpowers/specs/2026-07-14-rig-effects-descriptor-design.md`

---

## File Structure

- `shared/game-state.js` — add `rigEffects(rig)` (near the other equipment helpers, ~line 400) + export. One new pure function; no other logic changes.
- `shared/game-state.test.js` — `rigEffects` unit tests.
- `shared/battle-view.js` — `availableActions` reads the descriptor for sprint + active heat.
- `shared/battle-view.test.js` — reroute assertions + drift guard.
- `client/src/lib/loadout.ts` — equipment card active-heat via descriptor + upgrade fields.
- `client/src/lib/loadout.test.ts` — (or existing) upgrade-aware card data.
- `client/src/v2/components/LoadoutView.tsx` — render equipment-upgrade line.
- `client/src/v2/battle/MoveBody.tsx` — read descriptor, drop hardcode.
- `client/src/v2/battle/RepairBody.tsx` — bonused-SP copy via new prop.
- `client/src/v2/state/V2BattleActionsContext.tsx` — `openRepair` passes `bonusSp`.
- `client/src/v2/components/HeatGauge.tsx` — thermal-margin badge on capacity.
- `client/src/v2/components/CompRow.tsx` — Hull `+N` max-SP badge via new prop.
- `client/src/v2/overlays/RigTerminal.tsx` — thread Hull delta into `CompRow`.

**Assumed rig test object:** everywhere below, a "servo rig" means a rig with `equipment: "servo-actuators"` and (unless stated) `equipmentUpgrade: null`. A "reinforced-servos rig" adds `equipmentUpgrade: "reinforced-servos"`.

---

## Task 1: `rigEffects(rig)` descriptor (engine)

**Files:**
- Modify: `shared/game-state.js` (add function after `equipmentRepairBonus`, ~line 400)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
import { rigEffects } from "./game-state.js"; // add to existing import if not present

test("rigEffects: no equipment → base costs, empty modifiers", () => {
  const eff = rigEffects({ weightClass: "light" });
  assert.equal(eff.actionHeat.sprint, 2);
  assert.equal(eff.repair.bonusSp, 0);
  assert.equal(eff.thermalMargin, 0);
  assert.equal(eff.hullMaxBonus, 0);
  assert.equal(eff.recoveryCool, 1);
  assert.deepEqual(eff.modifiers, []);
});

test("rigEffects: Servo Actuators sets sprint 1 and jumpjets heat", () => {
  const eff = rigEffects({ equipment: "servo-actuators" });
  assert.equal(eff.actionHeat.sprint, 1);
  assert.equal(eff.actionHeat.jumpjets, 2);
  assert.equal(eff.modifiers[0].source, "servo-actuators");
});

test("rigEffects: Reinforced Servos drives sprint to 0", () => {
  const eff = rigEffects({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" });
  assert.equal(eff.actionHeat.sprint, 0);
  assert.equal(eff.modifiers.length, 2); // passive + upgrade
  assert.equal(eff.modifiers[1].kind, "upgrade");
});

test("rigEffects: Twin Radiators sets purge -3; Redundant Capacitors overclock 2", () => {
  const rad = rigEffects({ equipment: "radiator-array", equipmentUpgrade: "twin-radiators" });
  assert.equal(rad.actionHeat.purge, -3);
  const oc = rigEffects({ equipment: "overclock-core", equipmentUpgrade: "redundant-capacitors" });
  assert.equal(oc.actionHeat.overclock, 2);
});

test("rigEffects: Field Repair Suite +1 SP, Master Toolkit +2", () => {
  assert.equal(rigEffects({ equipment: "field-repair-suite" }).repair.bonusSp, 1);
  assert.equal(rigEffects({ equipment: "field-repair-suite", equipmentUpgrade: "master-toolkit" }).repair.bonusSp, 2);
});

test("rigEffects: passive stat mods (ablative hull, thermal margin, radiator cool)", () => {
  assert.equal(rigEffects({ equipment: "ablative-plating" }).hullMaxBonus, 1);
  assert.equal(rigEffects({ equipment: "blast-furnace-core" }).thermalMargin, 1);
  assert.equal(rigEffects({ equipment: "blast-furnace-core", equipmentUpgrade: "insulated-core" }).thermalMargin, 2);
  assert.equal(rigEffects({ equipment: "radiator-array" }).recoveryCool, 2);
});

test("rigEffects: combat deltas carried for follow-on", () => {
  assert.equal(rigEffects({ equipment: "reactive-plating" }).combat.sideRearStr, -1);
  assert.equal(rigEffects({ equipment: "reactive-plating", equipmentUpgrade: "angled-plates" }).combat.sideRearStr, -2);
  assert.equal(rigEffects({ equipment: "targeting-computer", equipmentUpgrade: "ballistic-processor" }).combat.sweetBandAcc, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rigEffects is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Add to `shared/game-state.js` after `equipmentRepairBonus` (~line 400):

```js
// Single read-model of every equipment/upgrade modifier a rig carries, each
// pre-resolved to its FINAL value. Built on the atomic helpers above so it adds
// no resolution logic — consumers (battle-view previews, drawers, loadout card,
// heat gauge, SP badges) render these values and never recompute an effect.
export function rigEffects(rig) {
  const equip = rig?.equipment || null;
  const up = rig?.equipmentUpgrade || null;
  const eqDef = equip ? EQUIPMENT[equip] : null;
  const upDef = equip ? (EQUIPMENT_UPGRADES[equip] || []).find((u) => u.id === up) : null;

  // Final effective heat, keyed by action key. Sprint is always present (base 2
  // when no Servo Actuators); the active's key is present only when equipped.
  const actionHeat = { sprint: equipmentSprintHeat(equip, up) };
  if (eqDef) actionHeat[eqDef.active.key] = equipmentActiveHeat(equip, up);

  const thermalMargin = equip === "blast-furnace-core" ? (upDef?.effect?.thermalMargin ?? 1) : 0;
  const hullMaxBonus = equip === "ablative-plating" ? 1 : 0;
  const recoveryCool = equip === "radiator-array" ? 2 : 1;

  const combat = {
    hardenImpact: equip === "ablative-plating" ? (upDef?.effect?.hardenImpact ?? 1) : 0,
    sweetBandAcc: equip === "targeting-computer" ? (upDef?.effect?.sweetBandAcc ?? 0) : 0,
    sideRearStr: equip === "reactive-plating" ? (upDef?.effect?.sideRearStr ?? -1) : 0,
  };

  const modifiers = [];
  if (eqDef) {
    modifiers.push({ source: equip, kind: "passive", label: eqDef.passive, detail: eqDef.family });
    if (upDef) modifiers.push({ source: upDef.id, kind: "upgrade", label: upDef.tag, detail: upDef.name });
  }

  return { actionHeat, repair: { bonusSp: equipmentRepairBonus(equip, up) }, thermalMargin, hullMaxBonus, recoveryCool, combat, modifiers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all `rigEffects` tests green; existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): add rigEffects read-model aggregating equipment/upgrade modifiers"
```

---

## Task 2: Reroute `availableActions` + drift guard

**Files:**
- Modify: `shared/battle-view.js:4` (import), `:34` (sprint heat), `:71` (active heat)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/battle-view.test.js`:

```js
test("availableActions: sprint chip reflects Servo Actuators and its upgrade", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const servo = availableActions(rig({ equipment: "servo-actuators" }), turn);
  assert.equal(servo.find((a) => a.key === "sprint").heat, 1);
  const reinf = availableActions(rig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" }), turn);
  assert.equal(reinf.find((a) => a.key === "sprint").heat, 0);
  const bare = availableActions(rig(), turn);
  assert.equal(bare.find((a) => a.key === "sprint").heat, 2);
});

test("availableActions: active chip reflects heat-override upgrades", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const rad = availableActions(rig({ equipment: "radiator-array", equipmentUpgrade: "twin-radiators" }), turn);
  assert.equal(rad.find((a) => a.key === "purge").heat, -3);
});

test("drift guard: sprint chip equals the heat the engine actually charges", () => {
  // Preview (availableActions) must match resolution (rigEffects, which the
  // resolution path uses via equipmentSprintHeat). Pin them together.
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  for (const over of [{}, { equipment: "servo-actuators" }, { equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" }]) {
    const r = rig(over);
    const chip = availableActions(r, turn).find((a) => a.key === "sprint").heat;
    assert.equal(chip, rigEffects(r).actionHeat.sprint);
  }
});
```

Add `rigEffects` to the existing `makeRig` import line:
```js
import { makeRig, makeUnit, rigEffects } from "./game-state.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — sprint chip is `2` for the servo rig (still static `def.heat`).

- [ ] **Step 3: Write minimal implementation**

In `shared/battle-view.js`, extend the import at line 4:
```js
import { EQUIPMENT, rigEffects } from "./game-state.js";
```

Inside `availableActions`, right after `const list = ACTION_ORDER` setup (before `.map`), compute the descriptor once. Simplest: add it at the top of the function body (after line 12 `const cfg = ...`):
```js
  const eff = rigEffects(rig);
```

In the `.map` callback, replace line 34 `let heat = def.heat;` with:
```js
      let heat = eff.actionHeat[key] ?? def.heat;
```

In the equipment-active push (line 71), replace `heat: active.heat` with:
```js
      key: active.key, label: active.label, heat: eff.actionHeat[active.key] ?? active.heat,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS (reroute + guard green; the existing "move heat 1" test still passes because `eff.actionHeat.move` is undefined → falls back to `def.heat`).

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "fix(v2): action picker heat chips read rigEffects, pinned to resolution"
```

---

## Task 3: MoveBody drawer reads the descriptor

**Files:**
- Modify: `client/src/v2/battle/MoveBody.tsx:27`
- Test: `client/src/v2/battle/MoveBody.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/battle/MoveBody.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MoveBody from "./MoveBody";
import type { Rig } from "../../state/types";

const baseRig = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "Vela", weightClass: "light", owner: "a", speed: 8,
  hull: { sp: 6, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
  engine: { sp: 4, max: 4, heat: 0 },
  ...(over as object),
}) as Rig;

const noop = () => {};

describe("MoveBody sprint heat", () => {
  it("shows +1 for a Servo Actuators rig", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+1 heat");
  });
  it("shows +0 for a Reinforced Servos rig", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+0 heat");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`
Expected: FAIL — reinforced-servos rig still shows `+1 heat` (hardcode returns 1 for any servo).

- [ ] **Step 3: Write minimal implementation**

In `client/src/v2/battle/MoveBody.tsx`, add the import near the top:
```tsx
import { rigEffects } from "/shared/game-state.js";
```

Replace line 27:
```tsx
  const heat = sprint ? (rig.equipment === "servo-actuators" ? 1 : 2) : 1;
```
with:
```tsx
  // Sprint heat is engine-derived (Servo Actuators → 1, its Reinforced Servos
  // Field upgrade → 0); Move is always +1. Reading rigEffects keeps this drawer
  // identical to the picker chip and to what resolution charges.
  const heat = sprint ? rigEffects(rig).actionHeat.sprint : 1;
```

Update the code comment on line 34-35 to drop the stale "+1 with Servo Actuators" phrasing if desired (optional, no behavior change).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/MoveBody.tsx client/src/v2/battle/MoveBody.test.tsx
git commit -m "fix(v2): Move drawer sprint heat reads rigEffects (Reinforced Servos → 0)"
```

---

## Task 4: RepairBody bonused-SP copy

**Files:**
- Modify: `client/src/v2/battle/RepairBody.tsx`, `client/src/v2/state/V2BattleActionsContext.tsx:178-184`
- Test: `client/src/v2/battle/RepairBody.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/battle/RepairBody.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RepairBody from "./RepairBody";

const noop = () => {};

describe("RepairBody copy reflects repair bonus", () => {
  it("no suite: 2/1 SP roll, 2 SP patch", () => {
    render(<RepairBody isPatch={false} auto bonusSp={0} onChange={noop} />);
    expect(document.body.textContent).toContain("10+ restores 2 SP");
    expect(document.body.textContent).toContain("7–9 restores 1 SP");
  });
  it("+1 suite: 3/2 SP roll", () => {
    render(<RepairBody isPatch={false} auto bonusSp={1} onChange={noop} />);
    expect(document.body.textContent).toContain("10+ restores 3 SP");
    expect(document.body.textContent).toContain("7–9 restores 2 SP");
  });
  it("+1 suite patch: guaranteed 3 SP", () => {
    render(<RepairBody isPatch bonusSp={1} auto={false} onChange={noop} />);
    expect(document.body.textContent).toContain("guaranteed 3 SP");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/battle/RepairBody.test.tsx`
Expected: FAIL — `bonusSp` is not a prop; copy is hardcoded "2 SP"/"1 SP".

- [ ] **Step 3: Write minimal implementation**

Rewrite `client/src/v2/battle/RepairBody.tsx`:

```tsx
import { useState } from "react";
import ChoiceField from "../overlays/ChoiceField";
import { LOC_CHOICES } from "./constants";
import "../styles/overlay.css";

// Location picker for the two repair-family actions (battle.js:430-461). The SP
// figures include any Field Repair Suite bonus (bonusSp), so the drawer promises
// exactly what the engine restores.
export default function RepairBody({
  isPatch, auto, bonusSp, onChange,
}: {
  isPatch: boolean;
  auto: boolean;
  bonusSp: number;
  onChange: (v: string) => void;
}) {
  const [loc, setLoc] = useState("hull");
  const hi = 2 + bonusSp;
  const lo = 1 + bonusSp;
  return (
    <>
      <p className="v2-dwr-hint">
        {isPatch
          ? `Restores a guaranteed ${hi} SP to the chosen location — no dice.`
          : auto
            ? `Rolls a D12: 10+ restores ${hi} SP, 7–9 restores ${lo} SP.`
            : `You'll roll a D12 next: 10+ restores ${hi} SP, 7–9 restores ${lo} SP.`}
      </p>
      <ChoiceField
        label="Location"
        options={LOC_CHOICES}
        value={loc}
        onChange={(v) => {
          setLoc(v);
          onChange(v);
        }}
      />
    </>
  );
}
```

In `client/src/v2/state/V2BattleActionsContext.tsx`, add the import:
```tsx
import { HEAT_CAPACITY, rigEffects } from "/shared/game-state.js";
```
(extend the existing `game-state.js` import on line 9 rather than adding a second import.)

In `openRepair`, replace the `build` function (lines 178-184) with:
```tsx
      const bonusSp = rigEffects(rig).repair.bonusSp;
      const build = () => (
        <RepairBody
          isPatch={isPatch}
          auto={Boolean(auto)}
          bonusSp={bonusSp}
          onChange={(v) => (state.loc = v)}
        />
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/battle/RepairBody.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/RepairBody.tsx client/src/v2/state/V2BattleActionsContext.tsx client/src/v2/battle/RepairBody.test.tsx
git commit -m "fix(v2): Repair drawer copy shows Field Repair Suite bonus SP"
```

---

## Task 5: Loadout card — upgrade-aware active heat + upgrade line

**Files:**
- Modify: `client/src/lib/loadout.ts:23-24,79-81`, `client/src/v2/components/LoadoutView.tsx:77-89`
- Test: `client/src/v2/components/LoadoutView.test.tsx` (existing)

**Note:** the passive PROSE stays the base description (freeform text, not a template — no fragile string surgery). Upgrade accuracy is carried by (a) the active-heat number, now descriptor-sourced, and (b) the new upgrade line.

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/components/LoadoutView.test.tsx` (follow the file's existing render helper; if it builds a `Loadout` object inline, extend it):

```tsx
it("shows upgrade-aware active heat and an equipment-upgrade line", () => {
  const loadout = {
    flat: false, lr: null, melee: null, modules: [],
    equipment: {
      family: "Cooling", label: "Radiator Array", passive: "Cools 2 heat in Recovery instead of 1",
      activeLabel: "Purge", activeHeat: -3, activeText: "Vent heat on demand.",
      upName: "Twin Radiators", upNature: "field", upTag: "Purge vents −3, not −2",
    },
  } as unknown as Loadout;
  render(<LoadoutView loadout={loadout} />);
  expect(document.body.textContent).toContain("-3 heat");
  expect(document.body.textContent).toContain("Twin Radiators");
  expect(document.body.textContent).toContain("Purge vents −3");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/components/LoadoutView.test.tsx`
Expected: FAIL — no upgrade line rendered; `upName`/`upTag` unknown on the equipment type.

- [ ] **Step 3: Write minimal implementation**

In `client/src/lib/loadout.ts`, extend the `LoadoutEquipment` type (lines 23-24):
```ts
  family: string; label: string; passive: string;
  activeLabel: string; activeHeat: number; activeText: string;
  upName?: string; upNature?: string; upTag?: string;
```

Add to the imports from `/shared/game-state.js` (line 2):
```ts
  EQUIPMENT, EQUIPMENT_UPGRADES, WEAPON_UPGRADES, CHASSIS, randomEquipment, rigEffects,
```

Replace the `equipment` object build (lines 79-81) with:
```ts
  const eqUp = eqDef && rig.equipmentUpgrade
    ? (EQUIPMENT_UPGRADES[rig.equipment] || []).find((u) => u.id === rig.equipmentUpgrade)
    : undefined;
  const equipment = eqDef ? {
    family: eqDef.family, label: eqDef.label, passive: eqDef.passive,
    activeLabel: eqDef.active.label,
    activeHeat: rigEffects(rig).actionHeat[eqDef.active.key],
    activeText: eqDef.active.text,
    upName: eqUp?.name, upNature: eqUp?.nature, upTag: eqUp?.tag,
  } : null;
```

In `client/src/v2/components/LoadoutView.tsx`, add the upgrade line inside the `eq &&` block, after the Active line (after line 87, before the closing `</div>` on line 88):
```tsx
          {eq.upName && (
            <div className="v2-rt-lo-up">
              <span className="v2-rt-lo-up-name">⬡ {eq.upName}</span>
              {eq.upNature && <span className="v2-rt-lo-up-nature v2-eyebrow">{natureLabel(eq.upNature)}</span>}
              {eq.upTag && <span className="v2-rt-lo-up-tag">{eq.upTag}</span>}
            </div>
          )}
```

(`natureLabel` is already imported at the top of `LoadoutView.tsx`. The `v2-rt-lo-up*` classes already exist — the weapon block reuses them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/components/LoadoutView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/loadout.ts client/src/v2/components/LoadoutView.tsx client/src/v2/components/LoadoutView.test.tsx
git commit -m "fix(v2): equipment card active heat is upgrade-aware + adds an upgrade line"
```

---

## Task 6: HeatGauge thermal-margin badge

**Files:**
- Modify: `client/src/v2/components/HeatGauge.tsx`
- Test: `client/src/v2/components/HeatGauge.test.tsx` (existing)

**Note:** `heatMeter(rig)` already returns `cap` = base + margin, so the redline position is correct today. The badge is explanatory: display the base capacity with a `+N` mark rather than a bare boosted number.

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/components/HeatGauge.test.tsx` (use the file's existing rig helper; a Blast Furnace medium has base cap 5, margin 1 → effCap 6):

```tsx
it("splits a boosted capacity into base + thermal-margin badge", () => {
  const rig = makeHeatRig({ weightClass: "medium", equipment: "blast-furnace-core" });
  render(<HeatGauge rig={rig} />);
  // Base capacity shown, plus an explicit +1 margin mark (not a bare "6").
  expect(document.body.textContent).toContain("+1");
});
```

If the test file has no `makeHeatRig` helper, build the rig inline with `engine: { sp: 4, max: 4, heat: 0 }`, `weightClass: "medium"`, `equipment: "blast-furnace-core"`, and whatever `kindOf` needs (weapons for a Rig).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/components/HeatGauge.test.tsx`
Expected: FAIL — no `+1` in output; capacity renders as a bare `6`.

- [ ] **Step 3: Write minimal implementation**

In `client/src/v2/components/HeatGauge.tsx`, add the import (extend line 2):
```tsx
import { heatMeter, rigEffects } from "/shared/game-state.js";
```

After `const m = heatMeter(rig);` (line 12) add:
```tsx
  const margin = rigEffects(rig).thermalMargin;
  const baseCap = m.cap - margin;
```

Replace the capacity readout on line 36:
```tsx
        <span className="v2-heat-read"><b>{m.heat}</b>/<InfoTerm id="heat-capacity">{m.cap}</InfoTerm></span>
```
with:
```tsx
        <span className="v2-heat-read">
          <b>{m.heat}</b>/<InfoTerm id="heat-capacity">{baseCap}</InfoTerm>
          {margin > 0 && <span className="v2-rt-delta">+{margin}</span>}
        </span>
```

(`v2-rt-delta` is the existing green "+N" upgrade mark reused from the loadout stats.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/components/HeatGauge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/components/HeatGauge.tsx client/src/v2/components/HeatGauge.test.tsx
git commit -m "feat(v2): heat gauge shows thermal-margin bonus on capacity"
```

---

## Task 7: CompRow Hull max-SP badge

**Files:**
- Modify: `client/src/v2/components/CompRow.tsx:17-19`, `client/src/v2/overlays/RigTerminal.tsx:130-134`
- Test: `client/src/v2/components/CompRow.test.tsx` (existing)

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/components/CompRow.test.tsx` (follow its existing render helper for `comp`/`loc`):

```tsx
it("renders a +N max-SP badge when delta > 0", () => {
  render(<CompRow rigName="Vela" loc="hull" comp={{ sp: 7, max: 7 }} delta={1} onCommand={() => {}} />);
  expect(document.body.textContent).toContain("+1");
});
it("renders no badge when delta is 0", () => {
  const { container } = render(<CompRow rigName="Vela" loc="arms" comp={{ sp: 5, max: 5 }} delta={0} onCommand={() => {}} />);
  expect(container.querySelector(".v2-rt-delta")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/components/CompRow.test.tsx`
Expected: FAIL — `delta` not a prop; no badge rendered.

- [ ] **Step 3: Write minimal implementation**

In `client/src/v2/components/CompRow.tsx`, add `delta` to the `Props` type and the destructure (line 17), defaulting to 0:
```tsx
export function CompRow({ rigName, loc, comp, delta = 0, onCommand }: Props) {
```
Add `delta?: number;` to the `Props` interface.

Render the badge beside the `sp/max` text. Locate the element that shows `text` (the `${comp.sp}/${comp.max}` string, line 19) and append after it:
```tsx
{delta > 0 && <span className="v2-rt-delta">+{delta}</span>}
```

In `client/src/v2/overlays/RigTerminal.tsx`, add the import:
```tsx
import { rigEffects } from "/shared/game-state.js";
```
Before the `locs.map` (near line 129), compute once:
```tsx
              const hullBonus = rigEffects(rig).hullMaxBonus;
```
Update the `CompRow` call (line 133):
```tsx
                return <CompRow key={loc} rigName={rig.name} loc={loc} comp={comp} delta={loc === "hull" ? hullBonus : 0} onCommand={onCommand} />;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/components/CompRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/components/CompRow.tsx client/src/v2/overlays/RigTerminal.tsx client/src/v2/components/CompRow.test.tsx
git commit -m "feat(v2): Hull location shows Ablative +1 max-SP badge"
```

---

## Task 8: Hide Move when Sprint is same-or-cheaper

**Files:**
- Modify: `shared/battle-view.js` (`availableActions`, just before `return list;`)
- Test: `shared/battle-view.test.js`

**Rationale:** with Servo Actuators, Sprint costs 1 heat (0 with Reinforced Servos) for 1½× Speed — same-or-less heat than Move (+1) for more distance, so Move is strictly dominated. Drop it; the Move group tile then fires Sprint directly (the existing single-live-action collapse in `ActionConsole` handles the relabel). Rule is generalized to `sprintHeat <= moveHeat` so any future sprint-discount equipment behaves the same. Cold kinds (no Sprint) are unaffected — the guard requires a live Sprint in the list.

- [ ] **Step 1: Write the failing test**

Add to `shared/battle-view.test.js`:

```js
test("Move is hidden when Sprint costs no more than Move (Servo Actuators)", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const servo = availableActions(rig({ equipment: "servo-actuators" }), turn);
  assert.ok(!servo.some((a) => a.key === "move"), "Move dropped for Servo Actuators");
  assert.ok(servo.some((a) => a.key === "sprint"), "Sprint stays");
  // Base rig keeps both.
  const bare = availableActions(rig(), turn);
  assert.ok(bare.some((a) => a.key === "move"), "Move stays without the discount");
});

test("Move stays for cold kinds (no Sprint to dominate it)", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  // A Tank has no Sprint (filtered by hasHeat); Move must remain.
  const tank = makeUnit({ name: "Bison", kind: "tank", owner: "a" });
  const acts = availableActions(tank, { ...turn, activeRigId: tank.id });
  assert.ok(acts.some((a) => a.key === "move"), "cold kind keeps Move");
});
```

(If `makeUnit`'s signature differs, build the simplest cold-kind object the existing cold-kind tests in this file already use — mirror them. The key assertion is the servo case.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — Move still present for the Servo Actuators rig.

- [ ] **Step 3: Write minimal implementation**

In `shared/battle-view.js`, immediately before `return list;` at the end of `availableActions`:

```js
  // Servo Actuators (and its Reinforced Servos upgrade) drop Sprint's heat to
  // Move's or below. Same-or-less heat for 1½× the distance makes Move strictly
  // dominated, so hide it — the Move group tile then fires Sprint directly.
  const sprintAct = list.find((a) => a.key === "sprint");
  if (sprintAct && sprintAct.heat <= ACTIONS.move.heat) {
    const i = list.findIndex((a) => a.key === "move");
    if (i >= 0) list.splice(i, 1);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(v2): hide Move when Sprint costs no more (Servo Actuators dominates)"
```

---

## Task 9: Full suite + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all Vitest + `node --test` suites green. No resolution test changed (Task 1 added only a new read-model; the atomic helpers and their call sites are untouched).

- [ ] **Step 2: Manual smoke via preview (optional but recommended)**

Start the dev server, open a seeded battle with a Servo Actuators rig carrying Reinforced Servos, and confirm: the Move group's Sprint chip reads `+0 heat`, the MOVE drawer reads `+0 heat`, and the equipment card shows the upgrade line. Spot-check a Radiator Array + Twin Radiators rig: Purge chip and card both read `-3 heat`.

- [ ] **Step 3: Commit (only if smoke revealed a tweak)**

No commit if everything passed on the task commits above.

---

## Self-Review Notes

- **Spec coverage:** descriptor (Task 1) · all 5 preview surfaces — picker (T2), Move (T3), Repair (T4), loadout card active-heat + upgrade line (T5) · both passive badges — thermal margin (T6), Hull SP (T7) · hide-Move-when-Sprint-dominates (T8, added post-spec per user) · guard test (T2) · no resolution change (verified T9). Combat deltas are carried in the descriptor but not rendered — matches the spec's "out of scope: wiring combat previews."
- **Type consistency:** `rigEffects` returns `{ actionHeat, repair:{bonusSp}, thermalMargin, hullMaxBonus, recoveryCool, combat, modifiers }` — every consumer reads only these keys. `RepairBody` gains `bonusSp: number`; `CompRow` gains `delta?: number`; `LoadoutEquipment` gains `upName?/upNature?/upTag?`.
- **Passive prose caveat (T5):** left as base text by design; the upgrade line carries the override. Documented in the task so an out-of-order reader doesn't "fix" it with string surgery.
