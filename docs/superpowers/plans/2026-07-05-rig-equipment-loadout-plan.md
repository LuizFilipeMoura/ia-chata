# Rig Equipment & Weapon Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Part 1 (Rig equipment, 5 pieces) of `docs/superpowers/specs/2026-07-05-rig-equipment-loadout-design.md` end-to-end (data, engine wiring, UI), add the weapon-upgrade catalogue from Part 2 as authored/display-only data (per the spec's own "Readiness / phasing" section, combat-engine wiring for the five brand-new upgrade mechanics is future work), and build a multi-step wizard that replaces the flat "Commission a Rig" form so players pick a Rig's equipment (and preview its weapons' fixed upgrades) when creating it.

**Architecture:** `shared/game-state.js` gains an `EQUIPMENT` catalogue and a `WEAPON_UPGRADES` catalogue (pure data, same module as `WEAPONS`). Equipment passives hook into the four places they change existing math (`makeRig`, `runRecovery`, `catastrophicOnZero`, the `repair` action). Equipment actives are new `action` keys handled inside `performAction`, gated to the Rig that owns the matching equipment, spending the existing action-slot budget and heat — no new resource. `shared/combat.js` gains one addition (Harden's −1 to incoming impact rolls). The client gets one new module, `public/js/rig-wizard.js`, following the existing `public/js/attack-wizard.js` scrim/card modal pattern, plus a new stylesheet `public/css/rig-wizard.css` matching the established dieselpunk tokens in `public/css/tokens.css`. `public/js/tracker.js` and `public/js/battle.js` get small, additive changes to open the wizard and to handle the five new active-ability action keys.

**Tech Stack:** Vanilla ES modules (client + `shared/`), Node's built-in `node:test` + `node:assert/strict` for unit tests, Express + `ws` server (unchanged by this plan).

---

## File Structure

| File | Change |
|---|---|
| `shared/game-state.js` | Add `EQUIPMENT`, `EQUIPMENT_ACTIVE_BY_KEY`, `normalizeEquipment`, `WEAPON_UPGRADES`. Extend `makeRig`, `ensureRigShape`, `runRecovery`, `catastrophicOnZero`, `performAction`, the `add` and `activate` verbs in `applyCommand`. |
| `shared/combat.js` | `rollImpacts` subtracts 1 from the impact total when the target is `hardened`. |
| `shared/battle-view.js` | `availableActions` appends the active Rig's equipment-active button (if it has equipment) to the action list. |
| `shared/game-state.test.js` | New tests for every equipment passive and active. |
| `shared/combat.test.js` | New test for the Harden −1 impact modifier. |
| `shared/battle-view.test.js` | New test asserting the equipment-active action appears/is absent correctly. |
| `rules.md` | New `§16 Equipment` section (rules.md is the project's single source of truth; every other rules addition lives there). |
| `public/js/rig-wizard.js` | **New.** Multi-step modal wizard: identity → weapons (+ upgrade preview) → equipment → confirm. Sends one `add` command. |
| `public/css/rig-wizard.css` | **New.** Styles for the wizard modal, matching `tokens.css` variables and the `attack-wizard`/`rig-sheet` visual language. |
| `public/index.html` | Link the new stylesheet; replace the flat "Commission a Rig" input fields with a single button that opens the wizard. |
| `public/js/tracker.js` | Wire the "Commission a Rig" button to `openRigWizard()`; render the Rig's equipment (passive/active) and each equipped weapon's upgrade tags in the accordion body. |
| `public/js/battle.js` | Handle the five new action keys (`harden`, `purge`, `jumpjets`, `overclock`, `emergencypatch`) in `onAction`, including the location prompt for `emergencypatch`. |

---

## Task 1: Equipment and weapon-upgrade data catalogues

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `shared/game-state.test.js` (it already imports `test`, `assert`, and several named exports from `./game-state.js` — add `EQUIPMENT, normalizeEquipment, WEAPON_UPGRADES` to that existing import list):

```javascript
test("EQUIPMENT has the 5 catalogue pieces with passive + active shape", () => {
  const ids = Object.keys(EQUIPMENT).sort();
  assert.deepEqual(ids, ["ablative-plating", "field-repair-suite", "overclock-core", "radiator-array", "servo-actuators"]);
  for (const id of ids) {
    const e = EQUIPMENT[id];
    assert.equal(typeof e.family, "string");
    assert.equal(typeof e.label, "string");
    assert.equal(typeof e.passive, "string");
    assert.equal(typeof e.active.key, "string");
    assert.equal(typeof e.active.heat, "number");
    assert.equal(typeof e.active.text, "string");
  }
});

test("normalizeEquipment is case-insensitive and rejects unknown ids", () => {
  assert.equal(normalizeEquipment("Ablative-Plating"), "ablative-plating");
  assert.equal(normalizeEquipment("nonsense"), null);
  assert.equal(normalizeEquipment(null), null);
});

test("WEAPON_UPGRADES has exactly 2 upgrades for all 12 weapons", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  assert.equal(all.length, 12);
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(Array.isArray(ups), true, `${name} missing upgrades`);
    assert.equal(ups.length, 2, `${name} must have exactly 2 upgrades`);
    for (const u of ups) {
      assert.equal(typeof u.name, "string");
      assert.equal(typeof u.tag, "string");
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `EQUIPMENT is not defined` (or similar import error).

- [ ] **Step 3: Add the catalogues to `shared/game-state.js`**

Insert immediately after the closing `};` of the existing `export const WEAPONS = { ... };` block (i.e. right after line 35, before `export function createRoom`):

```javascript
// Rig equipment loadout (docs/superpowers/specs/2026-07-05-rig-equipment-loadout-design.md,
// Part 1). One slot per Rig. Passives hook into existing systems (see makeRig /
// runRecovery / catastrophicOnZero / performAction below); actives are ordinary
// actions gated to the Rig carrying the matching equipment — unlimited use,
// leashed only by the 5-slot action budget and the heat they generate.
export const EQUIPMENT = {
  "ablative-plating": {
    family: "Armor", label: "Ablative Plating", passive: "+1 max SP to Hull",
    active: { key: "harden", label: "Harden", heat: 1,
      text: "Until this Rig's next activation, all impact rolls against it are at −1." },
  },
  "radiator-array": {
    family: "Cooling", label: "Radiator Array", passive: "Cools 3 heat in Recovery instead of 2",
    active: { key: "purge", label: "Purge", heat: -2, text: "Vent heat on demand." },
  },
  "servo-actuators": {
    family: "Mobility", label: "Servo Actuators", passive: "Sprint costs 1 heat instead of 2",
    active: { key: "jumpjets", label: "Jump Jets", heat: 2,
      text: "Move up to base Speed, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties." },
  },
  "overclock-core": {
    family: "Power", label: "Overclock Core",
    passive: "The first time this Rig's Engine reaches 0 SP, it does not skip its next activation",
    active: { key: "overclock", label: "Overclock", heat: 3, text: "+2 actions this activation (net +1 after the slot)." },
  },
  "field-repair-suite": {
    family: "Utility", label: "Field Repair Suite", passive: "The Repair action restores +1 additional SP",
    active: { key: "emergencypatch", label: "Emergency Patch", heat: 2,
      text: "Guaranteed repair 2 SP to one location, no D12 roll." },
  },
};

// Reverse lookup: active-ability key -> the equipment id that grants it.
export const EQUIPMENT_ACTIVE_BY_KEY = Object.fromEntries(
  Object.entries(EQUIPMENT).map(([id, e]) => [e.active.key, id])
);

export function normalizeEquipment(id) {
  if (!id) return null;
  const ref = String(id).trim().toLowerCase();
  return Object.keys(EQUIPMENT).includes(ref) ? ref : null;
}

// Weapon upgrades (Part 2 of the design) — every weapon's two fixed signature
// upgrades, authored as flavor + a toolkit-effect tag. Combat-engine wiring for
// the brand-new mechanics (Reach, Scatter, Systems Overload, Sunder,
// Reroll-a-miss) is deferred per the design's "Readiness / phasing" section;
// this catalogue lets the wizard preview a weapon's identity today.
export const WEAPON_UPGRADES = {
  "Mini Gun":      [{ name: "Extended Belt", tag: "+2 ROF (dice showing 1 add heat)" }, { name: "Suppressive Fire", tag: "Shock — Speed halved" }],
  "Double MG":     [{ name: "Tracer Rounds", tag: "Incendiary — +1 target heat/hit" }, { name: "Gyro Mount", tag: "Reroll one missed die" }],
  "Autocannon":    [{ name: "AP Shells", tag: "Armour Piercing" }, { name: "Depleted Core", tag: "+STR" }],
  "Arc Gun":       [{ name: "Systems Overload", tag: "Target loses 1 action next activation" }, { name: "Ion Burn", tag: "Incendiary — +1 target heat/hit" }],
  "Mortar":        [{ name: "Airburst Fuze", tag: "Ignores cover" }, { name: "Cluster Shells", tag: "Also chips a 2nd random location" }],
  "Sniper Cannon": [{ name: "Match Barrel", tag: "No far-range penalty" }, { name: "Marksman Optics", tag: "Precision — Aimed Shot loses −2" }],
  "Sword":         [{ name: "Duelist's Balance", tag: "Precision" }, { name: "Keen Edge", tag: "Rend" }],
  "Circular Saw":  [{ name: "Tempered Teeth", tag: "Armour Piercing" }, { name: "Sunder", tag: "−1 max SP to the struck location" }],
  "Chainsaw":      [{ name: "High-Rev Motor", tag: "+STR, but +1 heat per strike" }, { name: "Ripper Teeth", tag: "Rend" }],
  "Claw":          [{ name: "Vice Grip", tag: "Impale — strong hit immobilises" }, { name: "Rending Talons", tag: "Rend" }],
  "Lance":         [{ name: "Couched Reach", tag: "Reach — strike 1\" further / charge bonus" }, { name: "Spearpoint", tag: "Impale" }],
  "Wrecking Ball": [{ name: "Haymaker", tag: "+STR, big" }, { name: "Wrecking Momentum", tag: "Staggering — knock back / pivot" }],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: add rig equipment and weapon-upgrade catalogues"
```

---

## Task 2: `makeRig` accepts equipment; Ablative Plating passive

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("makeRig accepts an equipment id and Ablative Plating grants +1 max/current Hull SP", () => {
  const plain = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(plain.equipment, null);
  assert.equal(plain.hull.max, 7);

  const armored = makeRig(2, "Bastion", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "ablative-plating");
  assert.equal(armored.equipment, "ablative-plating");
  assert.equal(armored.hull.max, 8);
  assert.equal(armored.hull.sp, 8);
});

test("makeRig rejects an invalid equipment id by falling back to no equipment", () => {
  const rig = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "not-a-real-slot");
  assert.equal(rig.equipment, null);
  assert.equal(rig.hull.max, 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `armored.equipment` is `undefined`, `armored.hull.max` is `7` not `8`.

- [ ] **Step 3: Implement**

Replace the `makeRig` function in `shared/game-state.js` (it currently reads `export function makeRig(id, name, cls, owner, weapons = {}) { ... }`) with:

```javascript
export function makeRig(id, name, cls, owner, weapons = {}, equipment = null) {
  const normalizedClass = String(cls || "").trim().toLowerCase();
  if (!SUPPORTED_RIG_CLASSES.includes(normalizedClass)) return null;
  const longRange = normalizeWeapon("longRange", weapons.longRange || weapons.lr);
  const melee = normalizeWeapon("melee", weapons.melee);
  if (!longRange || !melee) return null;

  const weightClass = normalizedClass;
  const d = RIG_DEFAULTS[weightClass];
  const equipmentId = normalizeEquipment(equipment);
  // Ablative Plating (Armor) — passive +1 max SP to Hull, applied once at commission.
  const hullMax = d.hull + (equipmentId === "ablative-plating" ? 1 : 0);
  return {
    id,
    name: String(name || "Rig").trim() || "Rig",
    weightClass,
    owner: owner === "b" ? "b" : "a",
    hull:   { sp: hullMax, max: hullMax, destroyed: false },
    arms:   { sp: d.arms, max: d.arms, destroyed: false },
    legs:   { sp: d.legs, max: d.legs, destroyed: false },
    engine: { sp: d.engine, max: d.engine, destroyed: false, heat: 0 },
    weapons: { longRange, melee },
    equipment: equipmentId,
    prepare: 0,    // Phase 4
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    loaded: { longRange: true, melee: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    hardened: false,
    overclockCoreUsed: false,
    destroyed: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (including the pre-existing `makeRig` tests at the top of the file — they don't pass an equipment arg, so `equipmentId` resolves to `null` and `hullMax` is unchanged for them).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: makeRig accepts equipment; wire Ablative Plating's Hull SP passive"
```

---

## Task 3: Rig shape defaults + the `add` verb passes equipment through

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("add passes equipment through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "servo-actuators" } });
  const rig = findRig(r, "Bastion");
  assert.equal(rig.equipment, "servo-actuators");
});

test("ensureRigShape backfills equipment/hardened/overclockCoreUsed on legacy rig objects", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  const rig = findRig(r, "Bastion");
  delete rig.equipment; delete rig.hardened; delete rig.overclockCoreUsed;
  findRig(r, "Bastion"); // findRig calls ensureGameShape -> ensureRigShape internally
  assert.equal(rig.equipment, null);
  assert.equal(rig.hardened, false);
  assert.equal(rig.overclockCoreUsed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.equipment` is `undefined` after the `add` command (the verb handler doesn't forward `a.equipment` yet), and the backfill test fails the same way.

- [ ] **Step 3: Implement**

In `ensureRigShape`, add three lines (it currently ends with `if (typeof rig.immobilised !== "boolean") rig.immobilised = false; return rig; }`):

```javascript
function ensureRigShape(rig) {
  if (typeof rig.activated !== "boolean") rig.activated = false;
  if (typeof rig.skipNextActivation !== "boolean") rig.skipNextActivation = false;
  if (typeof rig.noCool !== "boolean") rig.noCool = false;
  if (typeof rig.speedHalvedNextRound !== "boolean") rig.speedHalvedNextRound = false;
  if (!rig.loaded || typeof rig.loaded !== "object") rig.loaded = { longRange: true, melee: true };
  if (rig.preparation === undefined) rig.preparation = null;
  if (!Array.isArray(rig.weaponsDestroyed)) rig.weaponsDestroyed = [];
  if (typeof rig.immobilised !== "boolean") rig.immobilised = false;
  if (rig.equipment === undefined) rig.equipment = null;
  if (typeof rig.hardened !== "boolean") rig.hardened = false;
  if (typeof rig.overclockCoreUsed !== "boolean") rig.overclockCoreUsed = false;
  return rig;
}
```

In `applyCommand`, the `add` verb currently reads:

```javascript
  if (verb === "add") {
    if (a.name && !findRig(room, a.name)) {
      const owner = normalizeSide(room, a.owner) || normalizeSide(room, context.side) || "a";
      if (canAddRigForSide(room, owner)) {
        const rig = makeRig(room.nextRigId, a.name, (a.class || "").toLowerCase(), owner, a);
        if (!rig) return room;
```

Change the `makeRig` call to pass `a.equipment`:

```javascript
        const rig = makeRig(room.nextRigId, a.name, (a.class || "").toLowerCase(), owner, a, a.equipment);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: add-command forwards equipment; backfill legacy rig shape"
```

---

## Task 4: Radiator Array — Recovery cools 3 instead of 2

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("Radiator Array cools 3 heat in Recovery instead of the usual 2", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, lr: "Mini Gun", melee: "Sword",
        equipment: owner === "a" && i === 1 ? "radiator-array" : undefined } });
    }
  }
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const cooled = findRig(r, "a1");   // has Radiator Array
  const plain = findRig(r, "a2");    // no equipment
  cooled.engine.heat = 5;
  plain.engine.heat = 5;

  // Drive every rig to its activation and immediately end it so Recovery fires.
  while (r.game.phase === "activation") {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    if (r.game.turn?.activeRigId) applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }

  assert.equal(cooled.engine.heat, 2); // 5 - 3
  assert.equal(plain.engine.heat, 3);  // 5 - 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `cooled.engine.heat` is `3`, not `2` (both rigs cool by the flat 2).

- [ ] **Step 3: Implement**

In `runRecovery`, replace:

```javascript
function runRecovery(room) {
  for (const rig of room.rigs) {
    if (!rig.noCool) {
      const floor = engineHeatFloor(rig);
      rig.engine.heat = Math.max(floor, rig.engine.heat - 2);
    }
```

with:

```javascript
function runRecovery(room) {
  for (const rig of room.rigs) {
    if (!rig.noCool) {
      const floor = engineHeatFloor(rig);
      // Radiator Array (Cooling) — cools 3 heat instead of the usual 2.
      const cooling = rig.equipment === "radiator-array" ? 3 : 2;
      rig.engine.heat = Math.max(floor, rig.engine.heat - cooling);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: wire Radiator Array's Recovery cooling passive"
```

---

## Task 5: Servo Actuators — Sprint costs 1 heat instead of 2

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("Servo Actuators makes Sprint cost 1 heat instead of 2", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword", equipment: "servo-actuators" } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const servo = findRig(r, "A1");
  while (r.game.turn.side !== servo.owner || r.game.activated) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (active === servo) break;
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
  applyCommand(r, { verb: "activate", attrs: { name: "A1" } });
  applyCommand(r, { verb: "action", attrs: { name: "A1", action: "sprint" } });
  assert.equal(servo.engine.heat, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `servo.engine.heat` is `2`.

- [ ] **Step 3: Implement**

In `performAction`, the generic action-heat application currently happens at the bottom via `bumpHeat(rig, def.heat);` after the `fire`/`ram`/`reload`/`repair`/`prepare` branches. Find this block:

```javascript
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
```

Insert a `sprint` branch immediately above it, and adjust the final heat application so a Servo Actuators Rig sprinting only spends 1 heat:

```javascript
  if (act === "sprint" && rig.equipment === "servo-actuators") {
    // Servo Actuators (Mobility) — Sprint costs 1 heat instead of 2.
    t.actionsUsed += 1;
    bumpHeat(rig, 1);
    return true;
  }
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS. (A plain Rig's `sprint` still falls through to the existing generic `bumpHeat(rig, def.heat)` at the end of `performAction`, unchanged at 2 heat.)

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: wire Servo Actuators' cheaper Sprint passive"
```

---

## Task 6: Overclock Core — first Engine-0 doesn't skip the next activation

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

The internal `applyDamage`/`applyOverheat` helpers are exposed for testing via `export const __test = { applyDamage, applyOverheat };` at the bottom of `game-state.js`.

```javascript
test("Overclock Core skips the skip-next-activation penalty the first time Engine hits 0, not after", () => {
  const rig = makeRig(1, "Reactor", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "overclock-core");
  rig.engine.sp = 1;
  __test.applyDamage({ game: { nextResolutionId: 1, resolutions: [] } }, rig, "engine", 1, {});
  assert.equal(rig.engine.sp, 0);
  assert.equal(rig.skipNextActivation, false);   // first time: bypassed
  assert.equal(rig.overclockCoreUsed, true);

  rig.engine.sp = 1; // repaired, then hit again
  __test.applyDamage({ game: { nextResolutionId: 1, resolutions: [] } }, rig, "engine", 1, {});
  assert.equal(rig.skipNextActivation, true);    // second time: normal rule applies
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.skipNextActivation` is `true` after the first hit (Overclock Core isn't checked yet).

- [ ] **Step 3: Implement**

In `catastrophicOnZero`, replace:

```javascript
function catastrophicOnZero(room, rig, loc, opts) {
  if (loc === "engine") { rig.skipNextActivation = true; rig.engine.heat = Math.max(rig.engine.heat, 3); }
```

with:

```javascript
function catastrophicOnZero(room, rig, loc, opts) {
  if (loc === "engine") {
    // Overclock Core (Power) — the first time the Engine hits 0 SP, the Rig
    // does not skip its next activation. Every time after that, normal rules apply.
    if (rig.equipment === "overclock-core" && !rig.overclockCoreUsed) rig.overclockCoreUsed = true;
    else rig.skipNextActivation = true;
    rig.engine.heat = Math.max(rig.engine.heat, 3);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: wire Overclock Core's first-engine-zero passive"
```

---

## Task 7: Field Repair Suite — Repair action restores +1 additional SP

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("Field Repair Suite adds +1 SP to the Repair action only", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Medic", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "field-repair-suite" } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const medic = findRig(r, "Medic");
  medic.hull.sp = 3;
  while (r.game.turn.side !== "a" || r.game.turn.activeRigId != null) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (!active || active === medic) break;
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
  applyCommand(r, { verb: "activate", attrs: { name: "Medic" } });
  applyCommand(r, { verb: "action", attrs: { name: "Medic", action: "repair", loc: "hull", dice: { repair: 10 } } }); // 10+ = 2 SP roll
  assert.equal(medic.hull.sp, 6); // 3 + 2 (roll) + 1 (Field Repair Suite)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `medic.hull.sp` is `5`, not `6`.

- [ ] **Step 3: Implement**

In `performAction`, the `repair` branch currently reads:

```javascript
  } else if (act === "repair") {
    const roll = rollD(12, a.dice?.repair, random);
    const amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
    if (amt > 0) repairRig(rig, loc, amt);
```

Change it to:

```javascript
  } else if (act === "repair") {
    const roll = rollD(12, a.dice?.repair, random);
    let amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    // Field Repair Suite (Utility) — the Repair action restores +1 additional SP.
    if (amt > 0 && rig.equipment === "field-repair-suite") amt += 1;
    const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
    if (amt > 0) repairRig(rig, loc, amt);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: wire Field Repair Suite's +1 SP repair passive"
```

---

## Task 8: Equipment active abilities as gated actions

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
function readyThreeAndThree(r, equipmentByName = {}) {
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      const name = `${owner}${i}`;
      applyCommand(r, { verb: "add", attrs: { name, class: "medium", owner, lr: "Autocannon", melee: "Claw", equipment: equipmentByName[name] } });
    }
  }
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });
}

function activate(r, name) {
  while (r.game.phase === "activation" && r.game.turn.activeRigId == null) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (active.name.toLowerCase() === name.toLowerCase()) { applyCommand(r, { verb: "activate", attrs: { name } }); return; }
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
}

test("harden requires Ablative Plating, costs 1 slot + 1 heat, and sets rig.hardened", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "ablative-plating" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  assert.equal(rig.hardened, true);
  assert.equal(rig.engine.heat, 1);
  assert.equal(r.game.turn.actionsUsed, usedBefore + 1);
});

test("harden is refused without Ablative Plating", () => {
  const r = createRoom("X");
  readyThreeAndThree(r);
  activate(r, "a1");
  const rig = findRig(r, "a1");
  const before = r.version;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  assert.equal(rig.hardened, false);
  assert.equal(r.version, before); // no-op, no version bump
});

test("purge vents 2 heat on demand for Radiator Array", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "radiator-array" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "purge" } });
  assert.equal(rig.engine.heat, 3);
});

test("overclock grants +2 actions this activation for Overclock Core", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "overclock-core" });
  activate(r, "a1");
  const maxBefore = r.game.turn.actionsMax;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "overclock" } });
  assert.equal(r.game.turn.actionsMax, maxBefore + 2);
  assert.equal(findRig(r, "a1").engine.heat, 3);
});

test("emergencypatch guarantees 2 SP with no roll for Field Repair Suite", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "field-repair-suite" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.arms.sp = 2;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "emergencypatch", loc: "arms" } });
  assert.equal(rig.arms.sp, 4);
  assert.equal(rig.engine.heat, 2);
});

test("jumpjets costs 1 slot + 2 heat for Servo Actuators", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets" } });
  assert.equal(findRig(r, "a1").engine.heat, 2);
});

test("a rig's next activation clears its own Harden", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "ablative-plating" });
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1" } });
  // cycle everyone else, then come back to a1's next activation
  while (findRig(r, "a1").hardened && r.game.phase !== "finished") {
    if (r.game.phase === "recovery") applyCommand(r, { verb: "vp", attrs: { side: "a", points: "0" } }), applyCommand(r, { verb: "vp", attrs: { side: "b", points: "0" } });
    if (r.game.phase === "initiative") applyCommand(r, { verb: "initiative", attrs: {} });
    if (r.game.phase === "activation") {
      const active = r.rigs.find((x) => !x.activated && !x.destroyed && (x.owner || "a") === r.game.turn.side);
      if (!active) break;
      applyCommand(r, { verb: "activate", attrs: { name: active.name } });
      if (active.name === "a1") break;
      applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
    }
  }
  assert.equal(findRig(r, "a1").hardened, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `performAction` doesn't recognize `harden`/`purge`/`jumpjets`/`overclock`/`emergencypatch` as actions yet (they fall through to the generic `else if` chain and do nothing, or throw on the missing `ACTIONS[act]` lookup returning `undefined` for `def`).

- [ ] **Step 3: Implement**

Add an import of `EQUIPMENT` at the top of `performAction`'s containing scope — `EQUIPMENT` is already defined earlier in the same file (Task 1), so no new import is needed. Add this block inside `performAction`, right after the `shutdown` special case and before `const def = ACTIONS[act];`:

```javascript
function performAction(room, rig, act, a, random) {
  const t = room.game.turn;
  if (act === "shutdown") {
    if (t.actionsUsed !== 0) return false;
    rig.engine.heat = engineHeatFloor(rig);
    recompute(rig);
    endActivation(room, rig, null, random);
    return true;
  }
  const equipId = EQUIPMENT_ACTIVE_BY_KEY[act];
  if (equipId) {
    if (rig.equipment !== equipId || t.actionsUsed >= t.actionsMax) return false;
    const active = EQUIPMENT[equipId].active;
    t.actionsUsed += 1;
    if (act === "harden") rig.hardened = true;
    else if (act === "overclock") t.actionsMax += 2;
    else if (act === "emergencypatch") {
      const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
      repairRig(rig, loc, 2);
    }
    // purge / jumpjets need no extra state beyond the heat cost below.
    bumpHeat(rig, active.heat);
    pushResolution(room, {
      kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} uses ${active.label}.`, effects: [active.text],
    });
    return true;
  }
  const def = ACTIONS[act];
```

Then, clear `hardened` at the start of a Rig's own next activation. In `applyCommand`'s `activate` verb, find:

```javascript
  } else if (verb === "activate") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
      if (rig.skipNextActivation) {
```

and add `rig.hardened = false;` right after the `if (rig && t && ...)` guard opens, before the `skipNextActivation` check:

```javascript
  } else if (verb === "activate") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
      rig.hardened = false; // Harden (Ablative Plating) lasts only until this Rig's next activation
      if (rig.skipNextActivation) {
```

Finally, apply Harden's −1 during impact resolution. This spans into `shared/combat.js` — see Task 9 below (do that task next; the two are one logical change but kept separate because they touch different files/tests).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS for every test except none — all of Task 8's tests only assert engine/state/action-budget effects, which are fully covered by this step (Harden's actual impact-roll effect is verified in Task 9's `combat.test.js`, not here).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: wire the 5 equipment active abilities as gated actions"
```

---

## Task 9: Harden — −1 to incoming impact rolls

**Files:**
- Modify: `shared/combat.js`
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

```javascript
test("rollImpacts applies Harden's -1 alongside Brace, stacking", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const hardened = { weightClass: "medium", hardened: true, preparation: null };
  // 1 hit, d6=5 -> 5 + 8 + 0(front) - 1(harden) = 12 vs medium hull (11/14/17) -> direct(1), not the 11 it'd be unhardened.
  const out = rollImpacts({ weightClass: "medium" }, hardened, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 12);

  const both = { weightClass: "medium", hardened: true, preparation: { type: "brace" } };
  const out2 = rollImpacts({ weightClass: "medium" }, both, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out2[0].total, 10); // 5 + 8 - 2(brace) - 1(harden)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `out[0].total` is `13` (Harden not applied yet).

- [ ] **Step 3: Implement**

In `shared/combat.js`, `rollImpacts` currently reads:

```javascript
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  const str = computeStr(attacker, profile, opts);
  const bonus = arcBonus(profile, opts.arc);
  const braced = target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const row = IMPACT[target.weightClass][location];
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (profile.perks.includes("Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (profile.perks.includes("Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}
```

Change the `braced` line and the `total` computation to include Harden (Ablative Plating's active ability, `docs/superpowers/specs/2026-07-05-rig-equipment-loadout-design.md` Part 1):

```javascript
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  const str = computeStr(attacker, profile, opts);
  const bonus = arcBonus(profile, opts.arc);
  const braced = target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const hardened = target.hardened ? -1 : 0; // Harden (Ablative Plating active)
  const row = IMPACT[target.weightClass][location];
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (profile.perks.includes("Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (profile.perks.includes("Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + hardened + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full shared test suite to check for regressions**

Run: `node --test shared/`
Expected: PASS — every file under `shared/` (`rules.test.js`, `game-state.test.js`, `combat.test.js`, `battle-view.test.js`) passes.

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat: Harden reduces incoming impact rolls by 1"
```

---

## Task 10: Action console lists the active Rig's equipment ability

**Files:**
- Modify: `shared/battle-view.js`
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/battle-view.test.js` (it already has a `rig(over = {})` helper — reuse it):

```javascript
test("availableActions appends the Rig's equipment active, gated by budget", () => {
  const turn = { activeRigId: 1, actionsUsed: 0, actionsMax: 5 };
  const plain = availableActions(rig(), turn);
  assert.equal(plain.some((a) => a.key === "harden"), false);

  const armored = availableActions(rig({ equipment: "ablative-plating" }), turn);
  const harden = armored.find((a) => a.key === "harden");
  assert.equal(harden.label, "Harden");
  assert.equal(harden.heat, 1);
  assert.equal(harden.enabled, true);

  const capped = availableActions(rig({ equipment: "ablative-plating" }), { activeRigId: 1, actionsUsed: 5, actionsMax: 5 });
  assert.equal(capped.find((a) => a.key === "harden").enabled, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — `armored.find((a) => a.key === "harden")` is `undefined`.

- [ ] **Step 3: Implement**

At the top of `shared/battle-view.js`, change the import to pull in `EQUIPMENT`:

```javascript
import { ACTIONS } from "./rules.js";
import { EQUIPMENT } from "./game-state.js";
```

Then change `availableActions`:

```javascript
export function availableActions(rig, turn) {
  const left = turn.actionsMax - turn.actionsUsed;
  const list = ACTION_ORDER.map((key) => {
    const def = ACTIONS[key];
    let enabled = left > 0;
    if (key === "shutdown") enabled = turn.actionsUsed === 0; // declared before any action
    return { key, label: def.label, heat: def.heat, enabled };
  });
  if (rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    list.push({ key: active.key, label: active.label, heat: active.heat, enabled: left > 0 });
  }
  return list;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full shared test suite**

Run: `node --test shared/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat: surface the active Rig's equipment ability in the action console"
```

---

## Task 11: Document equipment in `rules.md`

**Files:**
- Modify: `rules.md`

- [ ] **Step 1: Add a new `§16 Equipment` section**

`rules.md`'s table of contents currently ends at `15. Design Notes & Open Items`. Add a new entry after `14. Factions` and renumber `15` to `16`:

```markdown
14. [Factions](#14-factions)
15. [Equipment](#15-equipment)
16. [Design Notes & Open Items](#16-design-notes--open-items)
```

Insert a new `## 15. Equipment` section between the existing `## 14. Factions` section and `## 15. Design Notes & Open Items` (which becomes `## 16.`):

```markdown
## 15. Equipment

Every Rig has **one** equipment slot, chosen at commission. Each piece is a **passive** (always on) plus a **1-slot active** — the active costs one of the Rig's 5 action-slots per activation (−2 if Hull is at 0) plus the listed heat, with no charges or cooldowns; the action budget and the overheat table are the only limiters.

| Family | Equipment | Passive (always on) | Active — *costs 1 slot* |
|---|---|---|---|
| **Armor** | **Ablative Plating** | +1 max SP to Hull | **Harden** (+1 heat): until this Rig's next activation, all impact rolls against it are at −1 |
| **Cooling** | **Radiator Array** | Cools **3** heat in Recovery instead of 2 | **Purge** (−2 heat): vent on demand |
| **Mobility** | **Servo Actuators** | Sprint costs 1 heat instead of 2 | **Jump Jets** (+2 heat): move up to **base Speed**, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties |
| **Power** | **Overclock Core** | The first time this Rig's Engine reaches 0 SP, it does **not** skip its next activation | **Overclock** (+3 heat): +2 actions this activation (net +1 after the slot) |
| **Utility** | **Field Repair Suite** | The **Repair action** restores +1 additional SP | **Emergency Patch** (+2 heat): guaranteed repair 2 SP to one location, no D12 roll |

> Weapon customization (fixed signature upgrades per weapon) is documented in `docs/superpowers/specs/2026-07-05-rig-equipment-loadout-design.md` Part 2. The upgrade catalogue is authored there; combat-engine wiring for its five new mechanics (Reach, Scatter, Systems Overload, Sunder, Reroll-a-miss) is future work.
```

- [ ] **Step 2: Commit**

```bash
git add rules.md
git commit -m "docs: add §15 Equipment to the rulebook"
```

---

## Task 12: `rig-wizard.js` — the equipment/weapon-upgrade wizard module

**Files:**
- Create: `public/js/rig-wizard.js`
- Create: `public/css/rig-wizard.css`
- Modify: `public/index.html`

- [ ] **Step 1: Create the wizard module**

Write `public/js/rig-wizard.js`:

```javascript
import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { WEAPONS, EQUIPMENT, canAddRigForSide } from "/shared/game-state.js";
import { WEAPON_UPGRADES } from "/shared/game-state.js";

// Multi-step "Commission a Rig" wizard: identity -> weapons (+ fixed upgrade
// preview) -> equipment (the one build decision, §15) -> confirm. Mirrors the
// attack-wizard.js scrim/card modal pattern already used for combat actions.
let scrim = null;
let onDone = () => {};

export function openRigWizard() {
  close();
  const mySide = S.session?.side || "a";
  const state = {
    step: 0,
    name: "", cls: "medium", owner: mySide,
    longRange: Object.keys(WEAPONS.longRange)[0],
    melee: Object.keys(WEAPONS.melee)[0],
    equipment: Object.keys(EQUIPMENT)[0],
  };

  scrim = document.createElement("div");
  scrim.className = "rw-scrim";
  const card = document.createElement("div");
  card.className = "rw-card";
  scrim.appendChild(card);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  render(card, state);
  void scrim.offsetWidth;
  scrim.classList.add("show");
}

const STEPS = ["Identity", "Weapons", "Equipment", "Confirm"];

function render(card, state) {
  card.innerHTML = "";
  card.appendChild(header(state));
  if (state.step === 0) card.appendChild(stepIdentity(state, card));
  else if (state.step === 1) card.appendChild(stepWeapons(state, card));
  else if (state.step === 2) card.appendChild(stepEquipment(state, card));
  else card.appendChild(stepConfirm(state, card));
  card.appendChild(nav(state, card));
}

function header(state) {
  const wrap = document.createElement("div");
  wrap.className = "rw-head";
  wrap.innerHTML = `<div class="rw-title">◈ Commission a Rig</div>`;
  const dots = document.createElement("div");
  dots.className = "rw-dots";
  STEPS.forEach((label, i) => {
    const dot = document.createElement("span");
    dot.className = "rw-dot" + (i === state.step ? " on" : i < state.step ? " done" : "");
    dot.textContent = label;
    dots.appendChild(dot);
  });
  wrap.appendChild(dots);
  return wrap;
}

function field(label, input) {
  const wrap = document.createElement("div");
  wrap.className = "rw-field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(input);
  return wrap;
}

function select(options, selected, onChange) {
  const sel = document.createElement("select");
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt; o.textContent = opt;
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function stepIdentity(state) {
  const body = document.createElement("div");
  body.className = "rw-body";
  const nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.placeholder = "Rig name"; nameInput.value = state.name;
  nameInput.className = "rw-name";
  nameInput.addEventListener("input", () => (state.name = nameInput.value));
  body.appendChild(field("Name", nameInput));
  body.appendChild(field("Weight class", select(["light", "medium"], state.cls, (v) => (state.cls = v))));
  const mySide = S.session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";
  const ownerSel = select([mySide, enemySide], state.owner, (v) => (state.owner = v));
  ownerSel.querySelector(`option[value="${mySide}"]`).textContent = "You";
  ownerSel.querySelector(`option[value="${enemySide}"]`).textContent = "Enemy";
  body.appendChild(field("Side", ownerSel));
  return body;
}

function upgradeTags(name) {
  const wrap = document.createElement("div");
  wrap.className = "rw-upgrades";
  for (const u of WEAPON_UPGRADES[name] || []) {
    const tag = document.createElement("span");
    tag.className = "rw-upgrade-tag";
    tag.title = u.tag;
    tag.textContent = u.name;
    wrap.appendChild(tag);
  }
  return wrap;
}

function stepWeapons(state, card) {
  const body = document.createElement("div");
  body.className = "rw-body";
  body.appendChild(field("Long range weapon",
    select(Object.keys(WEAPONS.longRange), state.longRange, (v) => { state.longRange = v; render(card, state); })));
  body.appendChild(upgradeTags(state.longRange));
  body.appendChild(field("Melee weapon",
    select(Object.keys(WEAPONS.melee), state.melee, (v) => { state.melee = v; render(card, state); })));
  body.appendChild(upgradeTags(state.melee));
  const hint = document.createElement("div");
  hint.className = "rw-hint";
  hint.textContent = "Every weapon carries two fixed signature upgrades — they are its identity, not a choice.";
  body.appendChild(hint);
  return body;
}

function stepEquipment(state, card) {
  const body = document.createElement("div");
  body.className = "rw-body";
  const grid = document.createElement("div");
  grid.className = "rw-equip-grid";
  for (const [id, e] of Object.entries(EQUIPMENT)) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "rw-equip-card" + (id === state.equipment ? " sel" : "");
    opt.innerHTML = `
      <div class="rw-equip-family">${e.family}</div>
      <div class="rw-equip-label">${e.label}</div>
      <div class="rw-equip-passive">${e.passive}</div>
      <div class="rw-equip-active"><b>${e.active.label}</b> (${e.active.heat >= 0 ? "+" : ""}${e.active.heat} heat) — ${e.active.text}</div>
    `;
    opt.addEventListener("click", () => { state.equipment = id; render(card, state); });
    grid.appendChild(opt);
  }
  body.appendChild(grid);
  return body;
}

function stepConfirm(state) {
  const body = document.createElement("div");
  body.className = "rw-body rw-confirm";
  const e = EQUIPMENT[state.equipment];
  body.innerHTML = `
    <div class="rw-confirm-name">${state.name || "(unnamed)"} — ${state.cls}</div>
    <div class="rw-confirm-row">${state.longRange} / ${state.melee}</div>
    <div class="rw-confirm-row">${e.label} — ${e.passive}</div>
  `;
  return body;
}

function nav(state, card) {
  const wrap = document.createElement("div");
  wrap.className = "rw-nav";
  if (state.step > 0) {
    const back = document.createElement("button");
    back.type = "button"; back.className = "rw-btn ghost"; back.textContent = "Back";
    back.addEventListener("click", () => { state.step -= 1; render(card, state); });
    wrap.appendChild(back);
  }
  const canAdd = canAddRigForSide(S, state.owner);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "rw-btn";
  const atName = state.step === 0 && !state.name.trim();
  if (state.step < STEPS.length - 1) {
    next.textContent = "Next";
    next.disabled = atName;
    next.addEventListener("click", () => { state.step += 1; render(card, state); });
  } else {
    next.textContent = canAdd ? "Commission" : "Roster full";
    next.disabled = !canAdd;
    next.addEventListener("click", () => submit(state));
  }
  wrap.appendChild(next);
  return wrap;
}

function submit(state) {
  sendCommand("add", {
    name: state.name.trim(),
    class: state.cls,
    owner: state.owner,
    lr: state.longRange,
    melee: state.melee,
    equipment: state.equipment,
  });
  onDone();
  close();
}

export function onRigWizardDone(fn) { onDone = fn; }

function close() {
  if (!scrim) return;
  const el = scrim;
  scrim = null;
  el.classList.remove("show");
  setTimeout(() => el.remove(), 250);
}
```

- [ ] **Step 2: Create the stylesheet**

Write `public/css/rig-wizard.css`:

```css
/* ---- Commission-a-Rig wizard: full-screen scrim + centered card ---- */
.rw-scrim {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(6, 8, 11, 0);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
  transition: background .25s ease;
}
.rw-scrim.show { background: rgba(6, 8, 11, .72); }
.rw-card {
  width: min(420px, 100%); max-height: 88vh; overflow-y: auto;
  background: linear-gradient(180deg, var(--iron-850), var(--iron-900));
  border: 1px solid var(--rivet); border-radius: 14px;
  padding: 1.1rem 1.1rem 1rem; box-shadow: 0 20px 60px rgba(0,0,0,.55);
  transform: translateY(10px) scale(.98); opacity: 0;
  transition: transform .25s cubic-bezier(.2,.85,.25,1), opacity .2s ease;
}
.rw-scrim.show .rw-card { transform: none; opacity: 1; }

.rw-head { margin-bottom: .9rem; }
.rw-title {
  font-family: var(--font-mono); font-size: .68rem; letter-spacing: .2em;
  text-transform: uppercase; color: var(--oil); margin-bottom: .55rem;
}
.rw-dots { display: flex; gap: .35rem; }
.rw-dot {
  flex: 1; text-align: center; font-family: var(--font-mono); font-size: .52rem;
  letter-spacing: .06em; text-transform: uppercase; color: var(--txt-faint);
  padding: .3rem .2rem; border-radius: 6px; border: 1px solid var(--line);
  background: var(--iron-950); white-space: nowrap; overflow: hidden;
}
.rw-dot.on { color: #241606; background: linear-gradient(180deg, var(--oil-hi), var(--oil)); border-color: var(--oil-deep); }
.rw-dot.done { color: var(--oil-hi); border-color: rgba(231,154,61,.5); }

.rw-body { display: flex; flex-direction: column; gap: .7rem; min-height: 12rem; }
.rw-field { display: flex; flex-direction: column; gap: .3rem; }
.rw-field label {
  font-family: var(--font-mono); font-size: .6rem; letter-spacing: .1em;
  text-transform: uppercase; color: var(--txt-dim);
}
.rw-field select, .rw-name {
  background: var(--iron-800); color: var(--txt); border: 1px solid var(--line);
  border-radius: 10px; padding: .55rem .6rem; font-family: var(--font-display); font-size: .92rem;
}
.rw-name:focus, .rw-field select:focus { outline: none; border-color: var(--oil); box-shadow: 0 0 0 1px var(--oil); }

.rw-upgrades { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: -.3rem; }
.rw-upgrade-tag {
  font-family: var(--font-mono); font-size: .58rem; letter-spacing: .04em;
  color: var(--oil-hi); border: 1px solid rgba(231,154,61,.35); background: rgba(231,154,61,.08);
  border-radius: 999px; padding: .2rem .55rem; cursor: help;
}
.rw-hint { font-size: .74rem; color: var(--txt-faint); line-height: 1.4; }

.rw-equip-grid { display: flex; flex-direction: column; gap: .5rem; }
.rw-equip-card {
  text-align: left; border: 1px solid var(--line); border-radius: 10px;
  background: var(--iron-800); padding: .6rem .7rem; cursor: pointer;
  transition: border-color .16s, box-shadow .16s, background .16s;
}
.rw-equip-card:hover { border-color: var(--rivet); }
.rw-equip-card.sel {
  border-color: var(--oil); background: rgba(231,154,61,.08);
  box-shadow: 0 0 0 1px rgba(231,154,61,.35);
}
.rw-equip-family {
  font-family: var(--font-mono); font-size: .56rem; letter-spacing: .16em;
  text-transform: uppercase; color: var(--txt-faint);
}
.rw-equip-label { font-family: var(--font-display); font-weight: 700; font-size: 1rem; margin: .1rem 0 .25rem; }
.rw-equip-passive { font-size: .78rem; color: var(--txt-dim); line-height: 1.35; }
.rw-equip-active {
  margin-top: .35rem; font-size: .74rem; color: var(--oil-hi); line-height: 1.4;
  border-top: 1px dashed var(--line); padding-top: .35rem;
}

.rw-confirm { justify-content: center; text-align: center; }
.rw-confirm-name { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; }
.rw-confirm-row { font-family: var(--font-mono); font-size: .78rem; color: var(--txt-dim); }

.rw-nav { display: flex; gap: .5rem; margin-top: 1rem; }
.rw-btn {
  flex: 1; background: linear-gradient(180deg, var(--oil-hi), var(--oil));
  color: #241606; border-radius: 10px; padding: .6rem 1rem;
  font-weight: 700; font-family: var(--font-display); letter-spacing: .04em; font-size: .9rem;
}
.rw-btn:disabled { background: var(--iron-800); color: var(--txt-faint); border: 1px solid var(--line); }
.rw-btn.ghost { background: var(--iron-750); color: var(--txt); flex: 0 0 auto; padding-left: 1.2rem; padding-right: 1.2rem; }
```

- [ ] **Step 3: Link the stylesheet in `public/index.html`**

`public/index.html` currently has (around line 15):

```html
<link rel="stylesheet" href="/css/glossary.css" />
```

Add the new stylesheet link right after it:

```html
<link rel="stylesheet" href="/css/glossary.css" />
<link rel="stylesheet" href="/css/rig-wizard.css" />
```

- [ ] **Step 4: Commit**

```bash
git add public/js/rig-wizard.js public/css/rig-wizard.css public/index.html
git commit -m "feat: add the Commission-a-Rig equipment/weapon wizard module"
```

---

## Task 13: Wire the wizard into the Commission-a-Rig card

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Replace the flat form with a single trigger button**

In `public/index.html`, the current `#rigAddScreen` block is:

```html
      <div id="rigAddScreen" class="rig-add-card">
        <div class="rig-add">
          <div class="rig-add-title">◈ Commission a Rig</div>
          <div class="rig-add-hint">Name it, pick Light or Medium, and choose one long-range and one melee weapon.</div>
          <input id="rigName" type="text" placeholder="Rig name" aria-label="New rig name" />
          <div class="rig-add-row">
            <select id="rigClass" aria-label="New rig weight class">
              <option value="light">Light</option>
              <option value="medium" selected>Medium</option>
            </select>
            <select id="rigOwner" aria-label="New rig side">
              <option value="a">You</option>
              <option value="b">Enemy</option>
            </select>
          </div>
          <div class="rig-add-row">
            <select id="rigLongRange" aria-label="New rig long range weapon"></select>
            <select id="rigMelee" aria-label="New rig melee weapon"></select>
          </div>
          <div class="rig-add-row">
            <button id="rigAddBtn" class="rig-add-btn" type="button">+ Add</button>
          </div>
        </div>
      </div>
```

Replace it with:

```html
      <div id="rigAddScreen" class="rig-add-card">
        <div class="rig-add">
          <div class="rig-add-title">◈ Commission a Rig</div>
          <div class="rig-add-hint">Name it, pick a weight class and weapons, then choose its equipment.</div>
          <div class="rig-add-row">
            <button id="rigAddBtn" class="rig-add-btn" type="button">+ Commission</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Rewrite `tracker.js`'s Commission-a-Rig wiring**

`public/js/tracker.js` currently imports weapon lists and DOM refs it no longer needs, and drives the flat form. At the top of the file, change:

```javascript
import { S, LOCS, findRig } from "./state.js";
import { sendCommand } from "./api.js";
import { setStatus } from "./status.js";
import { MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL, WEAPONS, canAddRigForSide, heatMeter } from "/shared/game-state.js";
import { rigModifiers } from "/shared/battle-view.js";
import { buildActionConsole } from "./battle.js";

const rigList = document.getElementById("rigList");
const rigNameInput = document.getElementById("rigName");
const rigClassSelect = document.getElementById("rigClass");
const rigOwnerSelect = document.getElementById("rigOwner");
const rigLongRangeSelect = document.getElementById("rigLongRange");
const rigMeleeSelect = document.getElementById("rigMelee");
const rigAddBtn = document.getElementById("rigAddBtn");
const rigAddScreen = document.getElementById("rigAddScreen");
```

to:

```javascript
import { S, LOCS, findRig } from "./state.js";
import { setStatus } from "./status.js";
import { MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL, EQUIPMENT, WEAPON_UPGRADES, canAddRigForSide, heatMeter } from "/shared/game-state.js";
import { rigModifiers } from "/shared/battle-view.js";
import { buildActionConsole } from "./battle.js";
import { openRigWizard, onRigWizardDone } from "./rig-wizard.js";

const rigList = document.getElementById("rigList");
const rigAddBtn = document.getElementById("rigAddBtn");
const rigAddScreen = document.getElementById("rigAddScreen");
```

Delete the now-obsolete `populateWeaponSelect` function and its two call sites:

```javascript
function populateWeaponSelect(select, weapons) {
  select.innerHTML = "";
  for (const weapon of weapons) {
    const option = document.createElement("option");
    option.value = weapon;
    option.textContent = weapon;
    select.appendChild(option);
  }
}

populateWeaponSelect(rigLongRangeSelect, Object.keys(WEAPONS.longRange));
populateWeaponSelect(rigMeleeSelect, Object.keys(WEAPONS.melee));
```

(simply delete these lines — nothing replaces them, the wizard module owns its own selects).

Delete `syncOwnerOptions` (no longer used — it referenced `rigOwnerSelect`, which no longer exists):

```javascript
function ownerLabel(owner) {
  return (owner || "a") === (S.session?.side || "a") ? "Your Squadron" : "Enemy";
}

function syncOwnerOptions() {
  const mySide = S.session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";
  const myOption = rigOwnerSelect.querySelector(`option[value="${mySide}"]`);
  const enemyOption = rigOwnerSelect.querySelector(`option[value="${enemySide}"]`);
  if (myOption) myOption.textContent = "You";
  if (enemyOption) enemyOption.textContent = "Enemy";
  rigOwnerSelect.value = mySide;
}
```

Keep `ownerLabel` (still used elsewhere to group the accordion) — delete only `syncOwnerOptions`. Search the rest of `tracker.js` for `syncOwnerOptions()` call sites and remove them too (there is a call inside the render pipeline — remove that single call line wherever it appears; it has no other side effect).

Replace `updateAddRigAvailability` (currently disables 5 form fields) with a version that only concerns the single button:

```javascript
function updateAddRigAvailability() {
  const owner = S.session?.side || "a";
  const canAdd = canAddRigForSide(S, owner);
  const message = addLimitMessage(owner);
  rigAddBtn.disabled = !canAdd;
  rigAddBtn.textContent = canAdd ? "+ Commission" : "Full";
  rigAddBtn.title = message;
  rigAddScreen.classList.toggle("rig-add-locked", !canAdd);
  const hint = rigAddScreen.querySelector(".rig-add-hint");
  if (hint) hint.textContent = message || "Name it, pick a weight class and weapons, then choose its equipment.";
}
```

Replace `addRigFromForm` and its listeners:

```javascript
function addRigFromForm() {
  if (!canAddRigForSide(S, rigOwnerSelect.value)) {
    setStatus(addLimitMessage(rigOwnerSelect.value));
    updateAddRigAvailability();
    return;
  }
  const name = rigNameInput.value.trim();
  if (!name) { rigNameInput.focus(); return; }
  if (findRig(name)) { setStatus(`A rig named "${name}" already exists.`); return; }
  sendCommand("add", {
    name,
    class: rigClassSelect.value,
    owner: rigOwnerSelect.value,
    lr: rigLongRangeSelect.value,
    melee: rigMeleeSelect.value,
  });
  rigNameInput.value = "";
}

rigAddBtn.addEventListener("click", addRigFromForm);
rigOwnerSelect.addEventListener("change", updateAddRigAvailability);
rigNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addRigFromForm(); }
});
```

with:

```javascript
rigAddBtn.addEventListener("click", () => {
  const owner = S.session?.side || "a";
  if (!canAddRigForSide(S, owner)) { setStatus(addLimitMessage(owner)); updateAddRigAvailability(); return; }
  openRigWizard();
});
onRigWizardDone(() => setStatus(""));
```

`findRig` duplicate-name checking now happens implicitly server-side (`applyCommand`'s `add` verb already no-ops when `findRig(room, a.name)` already exists) — no client-side check is lost, only its pre-emptive early exit, which was a minor UX nicety, not a correctness guard.

- [ ] **Step 3: Show equipment and weapon upgrades in the accordion body**

Find the weapons line in `tracker.js` (it currently reads):

```javascript
  if (rig.weapons) {
    const weapons = document.createElement("div");
    weapons.className = "rig-weapons";
    weapons.textContent = `${rig.weapons.longRange || "Long Range ?"} / ${rig.weapons.melee || "Melee ?"}`;
    inner.appendChild(weapons);
```

Change it to also list each weapon's fixed upgrades, and append an equipment line right after:

```javascript
  if (rig.weapons) {
    const weapons = document.createElement("div");
    weapons.className = "rig-weapons";
    const lrUpgrades = (WEAPON_UPGRADES[rig.weapons.longRange] || []).map((u) => u.name).join(", ");
    const meleeUpgrades = (WEAPON_UPGRADES[rig.weapons.melee] || []).map((u) => u.name).join(", ");
    weapons.textContent = `${rig.weapons.longRange || "Long Range ?"} (${lrUpgrades}) / ${rig.weapons.melee || "Melee ?"} (${meleeUpgrades})`;
    inner.appendChild(weapons);
    if (rig.equipment && EQUIPMENT[rig.equipment]) {
      const eq = EQUIPMENT[rig.equipment];
      const equipEl = document.createElement("div");
      equipEl.className = "rig-equipment";
      equipEl.innerHTML = `<b>${eq.label}</b> — ${eq.passive}`;
      inner.appendChild(equipEl);
    }
```

(the rest of that `if (rig.weapons)` block — closing brace and whatever followed — is unchanged).

- [ ] **Step 4: Add the `.rig-equipment` style**

Append to `public/css/rig-sheet.css`, right after the existing `.rig-weapons` rule:

```css
.rig-equipment {
  font-family: var(--font-mono); font-size: .64rem; color: var(--oil-hi);
  margin: -.4rem 0 .65rem; line-height: 1.35;
}
```

- [ ] **Step 5: Manual verification**

This step touches DOM structure the automated `shared/` test suite doesn't cover — verify by hand:

1. Start the dev server with the `preview_start` tool (see the project's `.claude/launch.json`; if it doesn't exist yet, create it with `{"configurations":[{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":<the app's configured port>}]}` — check `package.json`'s `scripts` block and `server/index.js`/`.env` for the actual port before writing this).
2. Open the preview, join a room, click "+ Commission".
3. Confirm the wizard opens, steps through Identity → Weapons (upgrade tags visible and change when you switch weapons) → Equipment (5 selectable cards, one highlighted) → Confirm, and clicking "Commission" adds the Rig and closes the modal.
4. Expand the new Rig's accordion row and confirm the equipment line and weapon-upgrade tags render.
5. Use `preview_console_logs` to confirm no errors were thrown.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/tracker.js public/css/rig-sheet.css
git commit -m "feat: wire the Commission-a-Rig wizard into the tracker UI"
```

---

## Task 14: Battle-console handling for the 5 equipment actions

**Files:**
- Modify: `public/js/battle.js`

- [ ] **Step 1: Handle the new action keys in `onAction`**

`public/js/battle.js`'s `onAction` currently reads:

```javascript
function onAction(rig, key) {
  const auto = S.game.autoResolve;
  if (key === "fire" || key === "aimed" || key === "ram") { openAttackWizard(rig, key); return; }
  if (key === "repair") {
    const loc = window.prompt("Repair which location? (hull/arms/legs/engine)", "hull");
    if (!loc) return;
    if (auto) sendCommand("action", { name: rig.name, action: "repair", loc });
    else promptOneDie("Repair D12", (d) => sendCommand("action", { name: rig.name, action: "repair", loc, dice: { repair: d } }));
    return;
  }
  sendCommand("action", { name: rig.name, action: key });
}
```

Add an `emergencypatch` branch (it needs a location, like `repair`, but is a guaranteed no-roll heal so it never needs a dice prompt) right before the final fallback:

```javascript
function onAction(rig, key) {
  const auto = S.game.autoResolve;
  if (key === "fire" || key === "aimed" || key === "ram") { openAttackWizard(rig, key); return; }
  if (key === "repair") {
    const loc = window.prompt("Repair which location? (hull/arms/legs/engine)", "hull");
    if (!loc) return;
    if (auto) sendCommand("action", { name: rig.name, action: "repair", loc });
    else promptOneDie("Repair D12", (d) => sendCommand("action", { name: rig.name, action: "repair", loc, dice: { repair: d } }));
    return;
  }
  if (key === "emergencypatch") {
    const loc = window.prompt("Emergency Patch which location? (hull/arms/legs/engine)", "hull");
    if (!loc) return;
    sendCommand("action", { name: rig.name, action: "emergencypatch", loc });
    return;
  }
  sendCommand("action", { name: rig.name, action: key });
}
```

`harden`, `purge`, `jumpjets`, and `overclock` need no extra client-side input — they fall through to the existing generic `sendCommand("action", { name: rig.name, action: key })` at the bottom, exactly like `move` or `reload` do today.

- [ ] **Step 2: Manual verification**

1. With the preview server running (see Task 13 Step 5), commission a Rig with each of the 5 equipment pieces in turn (across a few test rooms, or edit one Rig's equipment via a fresh commission), start a battle, and activate it.
2. Confirm the action console (`buildActionConsole` in `public/js/battle.js`) shows the matching active-ability button (e.g. "Harden +1 heat" for Ablative Plating) alongside the standard actions.
3. Click it and confirm heat/action-budget/state changes appear in the tracker (e.g. Overclock increases the total pip count; Emergency Patch prompts for a location and heals 2 SP with no dice roll).
4. Use `preview_console_logs` to confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add public/js/battle.js
git commit -m "feat: handle equipment active-ability actions in the battle console"
```

---

## Task 15: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire shared test suite**

Run: `node --test shared/`
Expected: PASS — every test file (`rules.test.js`, `game-state.test.js`, `combat.test.js`, `battle-view.test.js`) passes with no failures.

- [ ] **Step 2: Run the server test suite**

Run: `node --test server/`
Expected: PASS — `server/ws.test.js`, `server/prompt.test.js`, `server/store.test.js` are unaffected by this plan's changes (equipment flows entirely through `applyCommand`'s existing `add`/`action` verbs, which those tests don't stub differently), so they should pass unchanged. If any fail, investigate before proceeding — do not silence failures.

- [ ] **Step 3: Manual end-to-end smoke test in the browser**

Using the `preview_*` tools: join a room as side A in one tab-equivalent session and side B in another (or drive both sides from one client, as the existing UI allows), commission 3 Rigs per side (mixing all 5 equipment pieces across the 6 Rigs), Ready both sides, and play through Initiative → a few activations using at least 2 different equipment actives → Recovery, confirming no console errors and that the equipment effects visibly change engine heat / action budget / SP as expected.

- [ ] **Step 4: Commit (only if Step 3 surfaced fixes)**

If manual testing found and fixed any issues, commit them individually with a `fix:` message describing exactly what was wrong. If everything passed as implemented, there is nothing to commit for this task.

---

## Self-Review Notes

- **Spec coverage:** Part 1 (all 5 equipment pieces: passive + active) is fully implemented and tested (Tasks 1–10). Part 2 (weapon upgrades) is delivered as the authored catalogue the spec's own "Readiness / phasing" section describes as the correct scope today (`WEAPON_UPGRADES`, previewed in the wizard and the Rig accordion) — the five brand-new combat mechanics it lists (Reach, Scatter, Systems Overload, Sunder, Reroll-a-miss) are explicitly called out in this plan and in the new `rules.md` §15 as future work, not silently dropped. The "Two families that were cut" and "Overlap notes" sections of the spec are pure design rationale with nothing further to implement.
- **Wizard requirement:** Task 12 + 13 deliver the multi-step "pick equipment" wizard the user asked for, opened from the existing Commission-a-Rig card. Weapon upgrades are previewed (read-only tags), not "picked," because the spec is explicit that upgrades are fixed per weapon, not a player choice — Task 12's UI copy states this directly so it isn't mistaken for a missing feature.
- **No placeholders:** every step has literal file contents or literal shell commands; nothing says "TBD" or "add appropriate handling."
- **Type/name consistency check:** `EQUIPMENT`, `EQUIPMENT_ACTIVE_BY_KEY`, `normalizeEquipment`, `WEAPON_UPGRADES` are defined once in Task 1 and referenced with those exact names in every later task (`shared/battle-view.js`, `public/js/rig-wizard.js`, `public/js/tracker.js`). The rig fields `equipment`, `hardened`, `overclockCoreUsed` are introduced in Task 2/3 and used with those exact names in Tasks 4–10. Action keys `harden`, `purge`, `jumpjets`, `overclock`, `emergencypatch` are defined once (as `EQUIPMENT[...].active.key`) and referenced identically in `performAction` (Task 8), `battle-view.js` (Task 10), and `battle.js` (Task 14).
