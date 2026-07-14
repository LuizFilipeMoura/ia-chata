# Equipment Mechanics — Plan 0: Read-Model Refactor & Shared Plumbing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `EQUIPMENT_UPGRADES` a single live source of truth read the same way everywhere, and scaffold the per-rig tracked-state block the mechanic plans (Groups 2-4) fill in.

**Architecture:** Relocate `EQUIPMENT_UPGRADES` + a pure `equipmentUpgradeEffectOf(equipmentId, upgradeId)` lookup into `shared/rules.js` — the leaf module both `game-state.js` and `combat.js` already import — then delete the commission-time `equipmentUpgradeEffect` stamp and route every consumer through the lookup. Add an `equipState` block on the rig plus a `refreshEquipState(rig)` Recovery hook, both empty of mechanic logic here.

**Tech Stack:** Node ESM modules, `node:test` + `node:assert` (run with `node --test`).

**Pinned interfaces (every later plan depends on these exact names):**

```js
// shared/rules.js
export const EQUIPMENT_UPGRADES = { /* the 24 rows, moved verbatim */ };
export function equipmentUpgradeEffectOf(equipmentId, upgradeId) { /* → effect object or {} */ }

// shared/game-state.js — per-rig tracked state, initialised in makeRig, backfilled in ensureRigShape
rig.equipState = {
  ablativeCharges: 0,                       // Ablative Cascade  — Group 3
  cryo: 0,                                   // Cryo Reservoir    — Group 3
  naniteStacks: [],                         // Nanite Swarm      — Group 3, items { loc, sp }
  interceptors: 0,                          // Point-Defense     — Group 3
  meltdownCharge: 0,                        // Meltdown Protocol — Group 3
  solution: { targetId: null, count: 0 },   // Fire Solution Lock— Group 3
  reactiveArmorLocs: [],                    // Reactive Armor    — Group 2
  grapnelCooldown: 0,                       // Grapnel Launcher  — Group 4
};
export function refreshEquipState(rig) { /* per-round refill/tick; empty until groups fill it */ }
```

---

### Task 1: Relocate the catalog into rules.js

**Files:**
- Modify: `shared/rules.js` (append `EQUIPMENT_UPGRADES` + `equipmentUpgradeEffectOf`)
- Modify: `shared/game-state.js:324-365` (remove the local `EQUIPMENT_UPGRADES` definition), and its export site
- Test: `shared/rules.test.js` (create if absent) / `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js` (imports already pull from `./game-state.js`):

```js
test("equipmentUpgradeEffectOf resolves from the catalog by id", () => {
  assert.deepEqual(
    equipmentUpgradeEffectOf("ablative-plating", "reinforced-plating"),
    { hardenImpact: 2 },
  );
  assert.deepEqual(equipmentUpgradeEffectOf("ablative-plating", "reactive-armor"), {}); // inert row → {}
  assert.deepEqual(equipmentUpgradeEffectOf("servo-actuators", "unknown"), {});         // unknown id → {}
  assert.deepEqual(equipmentUpgradeEffectOf(null, null), {});                            // no equipment → {}
});
```

Add `equipmentUpgradeEffectOf` to the import list at the top of `game-state.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `equipmentUpgradeEffectOf is not a function` / not exported.

- [ ] **Step 3: Move the data and add the lookup**

In `shared/rules.js`, after the existing exports, paste the entire
`EQUIPMENT_UPGRADES` object currently at `game-state.js:324-365` **verbatim**
(all 8 keys × 3 rows), then add:

```js
// Single source for every equipment-upgrade effect tag. Both game-state.js and
// combat.js import this; combat.js may not import game-state.js (cycle), so the
// catalog lives here in the shared leaf.
export function equipmentUpgradeEffectOf(equipmentId, upgradeId) {
  if (!equipmentId || !upgradeId) return {};
  const row = (EQUIPMENT_UPGRADES[equipmentId] || []).find((u) => u.id === upgradeId);
  return row?.effect || {};
}
```

In `shared/game-state.js`: delete the local `export const EQUIPMENT_UPGRADES = {…}`
block (lines 324-365) and re-export both symbols beside the existing
`shieldCoverage` re-export (game-state.js:476):

```js
export { EQUIPMENT_UPGRADES, equipmentUpgradeEffectOf } from "./rules.js";
```

Confirm `game-state.js` still imports whatever else it needs from `rules.js`
(the existing `import { … } from "./rules.js"` line) — leave it, the re-export is
a separate statement.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — including the existing `EQUIPMENT_UPGRADES` shape tests
(`game-state.test.js:1907+`), which resolve through the re-export unchanged.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "refactor(v2): relocate EQUIPMENT_UPGRADES to rules.js + add equipmentUpgradeEffectOf"
```

---

### Task 2: Route rigEffects and heatModel through the lookup

**Files:**
- Modify: `shared/game-state.js:416-451` (`rigEffects`), `game-state.js:1199` (`heatModel`)
- Test: `shared/game-state.test.js:4766-4793`

- [ ] **Step 1: Rewrite the failing tests to the id-derived model**

Replace the inline-`equipmentUpgradeEffect` fixtures at `game-state.test.js:4781-4793`
with id-only rigs (the effect must now come from the catalog, not the fixture):

```js
test("rigEffects derives combat/thermal tags from the catalog, not a stamp", () => {
  assert.equal(rigEffects({ equipment: "blast-furnace-core", equipmentUpgrade: "insulated-core" }).thermalMargin, 2);
  assert.equal(rigEffects({ equipment: "reactive-plating", equipmentUpgrade: "angled-plates" }).combat.sideRearStr, -2);
  assert.equal(rigEffects({ equipment: "targeting-computer", equipmentUpgrade: "ballistic-processor" }).combat.sweetBandAcc, 1);
  assert.equal(rigEffects({ equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating" }).combat.hardenImpact, 2);
  // family default when the upgrade carries no such tag
  assert.equal(rigEffects({ equipment: "ablative-plating", equipmentUpgrade: "reactive-armor" }).combat.hardenImpact, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rigEffects` still reads `rig.equipmentUpgradeEffect`, now absent → returns the default, not 2.

- [ ] **Step 3: Implement**

In `rigEffects` (game-state.js:416), after resolving `equip`/`upId`, add:

```js
const eff = equipmentUpgradeEffectOf(equip, upId);
```

Then change the four reads:

```js
const thermalMargin = equip === "blast-furnace-core" ? (eff.thermalMargin ?? 1) : 0;
// …
combat = {
  hardenImpact: equip === "ablative-plating" ? (eff.hardenImpact ?? 1) : 0,
  sweetBandAcc: equip === "targeting-computer" ? (eff.sweetBandAcc ?? 0) : 0,
  sideRearStr: equip === "reactive-plating" ? (eff.sideRearStr ?? -1) : 0,
};
```

In `heatModel` (game-state.js:1199), change:

```js
? (equipmentUpgradeEffectOf(rig?.equipment, rig?.equipmentUpgrade)?.thermalMargin ?? 1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(v2): rigEffects/heatModel read equipment tags via catalog lookup"
```

---

### Task 3: Route combat.js through the lookup

**Files:**
- Modify: `shared/combat.js:4-7` (import), `combat.js:66, 283, 292`
- Test: `shared/combat.test.js:122, 137, 400-411`

- [ ] **Step 1: Rewrite the failing tests to id-only fixtures**

In `shared/combat.test.js`, drop the inline `equipmentUpgradeEffect` from the
fixtures and rely on `equipment` + `equipmentUpgrade` ids:

```js
// line ~122
const reinforced = { weightClass: "medium", hardened: true, preparation: null, equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating" };
// line ~137
const angled = { weightClass: "medium", hardened: false, preparation: null, equipment: "reactive-plating", equipmentUpgrade: "angled-plates" };
// line ~400
const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "ballistic-processor" };
// the "plain" variants: equipmentUpgrade: null (drop equipmentUpgradeEffect)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — reads of `attacker.equipmentUpgradeEffect` are now `undefined` → bonus 0 where 1/2 expected.

- [ ] **Step 3: Implement**

In `shared/combat.js`, extend the `rules.js` import (line 4-6) with
`equipmentUpgradeEffectOf`:

```js
import {
  impactRow, AIM, WEIGHT_STR_MOD, hitLocation, impactSeverity, shieldCoverage, HEAT_CAPACITY,
  equipmentUpgradeEffectOf,
} from "./rules.js";
```

Line 66 (`computeModifiedAim`):

```js
const ballistic = (attacker.equipment === "targeting-computer" && inSweetBand) ? (equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.sweetBandAcc ?? 0) : 0;
```

Line 283:

```js
const hardenDepth = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.hardenImpact ?? 1;
```

Line 292:

```js
sideRearDock = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.sideRearStr ?? -1;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "refactor(v2): combat.js reads equipment tags via rules.js lookup"
```

---

### Task 4: Remove the stamp

**Files:**
- Modify: `shared/game-state.js:787` (ensureRigShape backfill), `951-955` (makeRig compute), `972` (makeRig field), `1139` (makeUnit field)
- Modify: `client/src/state/types.ts` (drop `equipmentUpgradeEffect`)
- Test: `shared/game-state.test.js:135-144, 2122-2131`

- [ ] **Step 1: Rewrite the stamp tests**

Delete the test "makeRig stamps equipmentUpgradeEffect…" (game-state.test.js:135-144)
and its assertions in the ensureRigShape backfill test (2122-2131) that reference
`equipmentUpgradeEffect`. Replace the first with a positive assertion that the
effect is *not* persisted:

```js
test("makeRig does not persist equipmentUpgradeEffect (catalog is the source)", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "ablative-plating", "reinforced-plating");
  assert.equal("equipmentUpgradeEffect" in rig, false);
  assert.deepEqual(equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade), { hardenImpact: 2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `equipmentUpgradeEffect` is still assigned in `makeRig`, so `in` is true.

- [ ] **Step 3: Implement**

- `game-state.js:951-955` — delete the `equipmentUpgradeRow` / `equipmentUpgradeEffect` locals.
- `game-state.js:972` — delete the `equipmentUpgradeEffect,` field from the rig literal.
- `game-state.js:1139` — delete the `equipmentUpgradeEffect: {},` field from `makeUnit`.
- `game-state.js:787` — delete the `if (rig.equipmentUpgradeEffect === undefined) rig.equipmentUpgradeEffect = {};` backfill line.
- `client/src/state/types.ts` — delete the `equipmentUpgradeEffect?: …` field.

- [ ] **Step 4: Run the full shared suite**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js client/src/state/types.ts shared/game-state.test.js
git commit -m "refactor(v2): drop the commission-time equipmentUpgradeEffect stamp"
```

---

### Task 5: Scaffold the equipState block + Recovery hook

**Files:**
- Modify: `shared/game-state.js` (makeRig literal ~958-999, ensureRigShape ~787, `runRecovery` 1835)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test("makeRig initialises the equipState tracked-state block", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.deepEqual(rig.equipState, {
    ablativeCharges: 0, cryo: 0, naniteStacks: [], interceptors: 0,
    meltdownCharge: 0, solution: { targetId: null, count: 0 },
    reactiveArmorLocs: [], grapnelCooldown: 0,
  });
});

test("ensureRigShape backfills equipState on a legacy rig", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  delete rig.equipState;
  ensureRigShape(rig);
  assert.equal(rig.equipState.ablativeCharges, 0);
  assert.deepEqual(rig.equipState.solution, { targetId: null, count: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.equipState` is undefined.

- [ ] **Step 3: Implement**

Add a `freshEquipState()` factory near `makeRig` (a factory so each rig gets its
own arrays/objects, never a shared reference):

```js
function freshEquipState() {
  return {
    ablativeCharges: 0, cryo: 0, naniteStacks: [], interceptors: 0,
    meltdownCharge: 0, solution: { targetId: null, count: 0 },
    reactiveArmorLocs: [], grapnelCooldown: 0,
  };
}
```

- In the `makeRig` rig literal, add `equipState: freshEquipState(),`.
- In `ensureRigShape` (near line 787), add:
  `if (rig.equipState == null) rig.equipState = freshEquipState();`
- Add the empty per-round hook and call it from `runRecovery`. Define near
  `runRecovery`:

```js
// Per-round equipment tracked-state upkeep (charges refill, banks/stacks tick,
// per-round flags clear). Mechanic plans (Groups 2-4) fill in their branches;
// the guard keeps legacy rigs safe.
function refreshEquipState(rig) {
  const s = rig.equipState;
  if (!s) return;
  // (branches added by Group 2/3/4)
}
```

  Then inside `runRecovery`'s per-rig loop (after `tickBreach(rig);`, before
  `recompute(rig);`), add `refreshEquipState(rig);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): scaffold equipState block + refreshEquipState Recovery hook"
```

---

## Self-review notes

- Reactive on-incoming-hit seam is **not** scaffolded here (YAGNI); Group 2 adds
  it in `combat.js` as its first consumer, with the signature
  `applyDefensiveReactions(target, hit, ctx)`. Later plans must use that exact
  name. Group 2 installs it at **both** the `hit.kind === "tohit"` (in
  `rollToHit`) and `hit.kind === "impact"` (in `rollImpacts`) stages, with
  `ctx = { location, row, spendHeat }` — see the spec's "Reactive on-incoming-hit
  hook" for the authoritative two-stage contract. Groups 3-4 add branches only.
- After this plan, `grep -rn equipmentUpgradeEffect shared/ client/` must return
  zero hits outside test history. Run it as a final check before closing the plan.
