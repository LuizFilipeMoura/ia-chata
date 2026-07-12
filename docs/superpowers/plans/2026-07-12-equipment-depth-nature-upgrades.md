# Equipment Depth — Nature Upgrades + Expanded Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every equipment family a Field/Tuned/Prototype upgrade (mirroring weapons), add 3 new families (Thermal / Fire Control / Countermeasures), fold equipment into the one-Prototype-per-rig cap, and re-author chassis suggestions toward the new families.

**Architecture:** Mirror the existing weapon-upgrade system. A new `EQUIPMENT_UPGRADES` map in `shared/game-state.js` parallels `WEAPON_UPGRADES`; each equipment id carries 3 rows (one per nature). The 8 **Field** rows are one-line modifiers to existing hooks and ship live. The 3 new families ship with their base passive/active wired live. The 16 **Tuned/Prototype** mechanics ship as stubbed `effect: {}` rows (pickable, inert) exactly as weapon Prototypes did, and are implemented later in dedicated follow-on plans. The rig gains one new field, `equipmentUpgrade`, threaded from the wizard through `enforceChassis` to `makeRig`.

**Tech Stack:** Node ESM, `node:test` + `node:assert` (run via `npm test`), React + TypeScript (Vite) for the wizard, plain CSS.

**Scope note (phasing, from the design spec):** This plan is **Phase 1** — the framework, the full 8-family catalog with working base pieces, the cap, the wizard, rules, and content. The conditional **Tuned** (8) and systemic **Prototype** (8) upgrade *mechanics* are explicitly **out of scope here**; they ship as inert data rows now and are implemented one-at-a-time in follow-on plans (see the Deferred Mechanics Backlog at the end). This matches how weapon Prototypes shipped (`effect: {}` + `TODO(mechanics)`).

---

## File Structure

- `shared/game-state.js` — add 3 families to `EQUIPMENT`; add `EQUIPMENT_UPGRADES`; add helpers (`equipmentUpgradeNature`, `firstEquipmentUpgradeId`, `normalizeEquipmentUpgrade`); extend `countPrototypes`; thread `equipmentUpgrade` through `makeRig`/`makeUnit`; wire the 8 Field effects + 3 new base passives/actives.
- `shared/combat.js` — read equipment/upgrade in `rollImpacts` (Reinforced Plating, Reactive Plating) and `computeModifiedAim`/`rollToHit` (Targeting Computer, Lock Sight); thread `targetSmoke` in `resolveAttack`.
- `shared/game-state.test.js`, `shared/combat.test.js` — behavior tests.
- `server/routes/game.js` — `enforceChassis` validates + counts the equipment upgrade.
- `server/chassis.test.js` — suggestion pointing at a new family id.
- `client/src/v2/overlays/CommissionWizard.tsx` — equipment nature sub-picker + cap cross-lock + default + command threading + confirm row.
- `client/src/v2/lib/commissionData.ts` — `firstEquipmentUpgradeId` client helper.
- `client/src/v2/styles/forge.css` — nature picker beside the suggestion highlight.
- `rules.md` — §15 rewrite, §3 clause.
- `content/chassis.json` — re-author suggestions toward new families.

Naming locked (use verbatim across all tasks):
- New EQUIPMENT ids: `blast-furnace-core`, `targeting-computer`, `reactive-plating`.
- New active keys: `heatpurgewave`, `locksight`, `popsmoke`.
- Rig field: `rig.equipmentUpgrade` (string | null).
- Helpers: `equipmentUpgradeNature(equipmentId, upgradeId)`, `firstEquipmentUpgradeId(equipmentId)`, `normalizeEquipmentUpgrade(equipmentId, id)`.
- Extended: `countPrototypes(weapons, upgrades, equipment, equipmentUpgrade)`.

---

## Task 1: Add the 3 new families to `EQUIPMENT`

**Files:**
- Modify: `shared/game-state.js:160-185` (the `EQUIPMENT` object)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
import { EQUIPMENT, EQUIPMENT_ACTIVE_BY_KEY } from "./game-state.js";

test("EQUIPMENT has 8 families including the 3 new ones", () => {
  assert.equal(Object.keys(EQUIPMENT).length, 8);
  for (const id of ["blast-furnace-core", "targeting-computer", "reactive-plating"]) {
    assert.ok(EQUIPMENT[id], `missing ${id}`);
    assert.ok(EQUIPMENT[id].active.key, `${id} needs an active key`);
  }
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["heatpurgewave"], "blast-furnace-core");
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["locksight"], "targeting-computer");
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["popsmoke"], "reactive-plating");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — `Object.keys(EQUIPMENT).length` is 5, not 8.

- [ ] **Step 3: Add the 3 families**

In `shared/game-state.js`, inside `export const EQUIPMENT = { ... }`, after the `field-repair-suite` entry (line 184) and before the closing `};`:

```js
  "blast-furnace-core": {
    family: "Thermal", label: "Blast Furnace Core",
    passive: "Safe up to +1 over Heat Capacity before the overheat roll triggers",
    active: { key: "heatpurgewave", label: "Heat Purge Wave", heat: 0,
      text: "Dump banked heat: vent to Heat Capacity and scald every enemy within 3\" (players adjudicate the AoE)." },
  },
  "targeting-computer": {
    family: "Fire Control", label: "Targeting Computer",
    passive: "The first Fire this activation ignores its cover and engaged accuracy penalties",
    active: { key: "locksight", label: "Lock Sight", heat: 1,
      text: "Your next shot this activation rerolls all its missed to-hit dice." },
  },
  "reactive-plating": {
    family: "Countermeasures", label: "Reactive Plating",
    passive: "Side- and rear-arc attacks against this Rig take −1 STR",
    active: { key: "popsmoke", label: "Pop Smoke", heat: 0,
      text: "Until this Rig's next activation, every attacker is at −2 accuracy against it (and any missile Lock on it is broken)." },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): add Thermal/Fire Control/Countermeasures families"
```

---

## Task 2: Add `EQUIPMENT_UPGRADES` + nature helpers

**Files:**
- Modify: `shared/game-state.js` (after `EQUIPMENT_ACTIVE_BY_KEY`, ~line 190)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { EQUIPMENT_UPGRADES, equipmentUpgradeNature, firstEquipmentUpgradeId } from "./game-state.js";

test("every equipment family has exactly 3 upgrades, one per nature", () => {
  for (const id of Object.keys(EQUIPMENT)) {
    const ups = EQUIPMENT_UPGRADES[id];
    assert.ok(Array.isArray(ups), `${id} has no upgrades`);
    assert.equal(ups.length, 3, `${id} needs 3 upgrades`);
    assert.deepEqual(ups.map((u) => u.nature), ["field", "tuned", "prototype"]);
  }
});

test("equipment upgrade helpers resolve", () => {
  assert.equal(equipmentUpgradeNature("ablative-plating", "reinforced-plating"), "field");
  assert.equal(equipmentUpgradeNature("ablative-plating", "ablative-cascade"), "prototype");
  assert.equal(equipmentUpgradeNature("ablative-plating", "nope"), null);
  assert.equal(firstEquipmentUpgradeId("ablative-plating"), "reinforced-plating");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — `EQUIPMENT_UPGRADES` is undefined.

- [ ] **Step 3: Add the map + helpers**

In `shared/game-state.js`, immediately after the `EQUIPMENT_ACTIVE_BY_KEY` definition (line ~190):

```js
// Equipment upgrades — mirrors WEAPON_UPGRADES. Each family offers one upgrade
// of each nature (Field / Tuned / Prototype), picked at commission. The 8 Field
// rows carry live effect tags (simple modifiers to existing hooks). The Tuned
// and Prototype rows ship inert (`effect: {}`, TODO(mechanics)) and are wired in
// follow-on plans, exactly as the weapon Prototypes did.
export const EQUIPMENT_UPGRADES = {
  "ablative-plating": [
    { id: "reinforced-plating", nature: "field", name: "Reinforced Plating", tag: "Harden gives −2 impact, not −1", effect: { hardenImpact: 2 } },
    { id: "reactive-armor", nature: "tuned", name: "Reactive Armor", tag: "First hit each round hardens that location", effect: {} }, // TODO(mechanics)
    { id: "ablative-cascade", nature: "prototype", name: "Ablative Cascade", tag: "Spend ablative charges to soften incoming hits — each costs heat", effect: {} }, // TODO(mechanics)
  ],
  "radiator-array": [
    { id: "twin-radiators", nature: "field", name: "Twin Radiators", tag: "Purge vents −3, not −2", effect: { purgeHeat: -3 } },
    { id: "coolant-injection", nature: "tuned", name: "Coolant Injection", tag: "−2 heat before the overheat roll when over Capacity", effect: {} }, // TODO(mechanics)
    { id: "cryo-reservoir", nature: "prototype", name: "Cryo Reservoir", tag: "Bank cold; spend for instant cooling + a STR spike", effect: {} }, // TODO(mechanics)
  ],
  "servo-actuators": [
    { id: "reinforced-servos", nature: "field", name: "Reinforced Servos", tag: "Sprint costs 0 heat", effect: { sprintHeat: 0 } },
    { id: "kickstart-pistons", nature: "tuned", name: "Kickstart Pistons", tag: "Charge into contact → first melee after +2 STR", effect: {} }, // TODO(mechanics)
    { id: "grapnel-launcher", nature: "prototype", name: "Grapnel Launcher", tag: "Yank free of a lock or reel an enemy in — heat + cooldown", effect: {} }, // TODO(mechanics)
  ],
  "overclock-core": [
    { id: "redundant-capacitors", nature: "field", name: "Redundant Capacitors", tag: "Overclock costs +2 heat, not +3", effect: { overclockHeat: 2 } },
    { id: "adrenaline-surge", nature: "tuned", name: "Adrenaline Surge", tag: "Below half SP, Overclock grants +3 actions", effect: {} }, // TODO(mechanics)
    { id: "reactor-overdrive", nature: "prototype", name: "Reactor Overdrive", tag: "Overclock also +2 STR — but overheat bonus doubles", effect: {} }, // TODO(mechanics)
  ],
  "field-repair-suite": [
    { id: "master-toolkit", nature: "field", name: "Master Toolkit", tag: "Repair heals +2 SP, not +1", effect: { repairBonus: 2 } },
    { id: "battlefield-triage", nature: "tuned", name: "Battlefield Triage", tag: "Emergency Patch heals 3 SP on a destroyed location", effect: {} }, // TODO(mechanics)
    { id: "nanite-swarm", nature: "prototype", name: "Nanite Swarm", tag: "Seed nanites that heal each Recovery — at a heat-cap cost", effect: {} }, // TODO(mechanics)
  ],
  "blast-furnace-core": [
    { id: "insulated-core", nature: "field", name: "Insulated Core", tag: "Safe up to +2 over Capacity, not +1", effect: { thermalMargin: 2 } },
    { id: "backdraft", nature: "tuned", name: "Backdraft", tag: "Heat Purge Wave +1 STR per 2 heat over Capacity", effect: {} }, // TODO(mechanics)
    { id: "meltdown-protocol", nature: "prototype", name: "Meltdown Protocol", tag: "Bank overheat as charge; spend for STR or a burst", effect: {} }, // TODO(mechanics)
  ],
  "targeting-computer": [
    { id: "ballistic-processor", nature: "field", name: "Ballistic Processor", tag: "+1 accuracy vs a target in your sweet-spot band", effect: { sweetBandAcc: 1 } },
    { id: "predictive-tracking", nature: "tuned", name: "Predictive Tracking", tag: "vs a static/pinned target: +2 accuracy, ignore cover", effect: {} }, // TODO(mechanics)
    { id: "fire-solution-lock", nature: "prototype", name: "Fire Solution Lock", tag: "Hold still and stack a solution → an auto-hit AP volley", effect: {} }, // TODO(mechanics)
  ],
  "reactive-plating": [
    { id: "angled-plates", nature: "field", name: "Angled Plates", tag: "Side/rear attacks −2 STR, not −1", effect: { sideRearStr: -2 } },
    { id: "chaff-burst", nature: "tuned", name: "Chaff Burst", tag: "Under smoke, free half-Speed side-step when targeted", effect: {} }, // TODO(mechanics)
    { id: "point-defense-system", nature: "prototype", name: "Point-Defense System", tag: "Intercept incoming fire; force rerolls — at a heat cost", effect: {} }, // TODO(mechanics)
  ],
};

export function equipmentUpgradeNature(equipmentId, upgradeId) {
  const u = (EQUIPMENT_UPGRADES[equipmentId] || []).find((x) => x.id === upgradeId);
  return u?.nature || null;
}

export function firstEquipmentUpgradeId(equipmentId) {
  return (EQUIPMENT_UPGRADES[equipmentId] || [])[0]?.id || null;
}

export function normalizeEquipmentUpgrade(equipmentId, id) {
  const list = EQUIPMENT_UPGRADES[equipmentId];
  if (!Array.isArray(list) || list.length === 0) return null;
  if (!id) return null;
  const ref = String(id).trim().toLowerCase();
  return list.find((u) => u.id === ref)?.id || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): add EQUIPMENT_UPGRADES catalog + nature helpers"
```

---

## Task 3: Extend `countPrototypes` to include equipment

**Files:**
- Modify: `shared/game-state.js:229-234`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { countPrototypes } from "./game-state.js";

test("countPrototypes counts an equipment Prototype", () => {
  // no prototypes
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "fletched-bolts", melee: "honed-talons" },
    "ablative-plating", "reinforced-plating"), 0);
  // equipment prototype only
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "fletched-bolts", melee: "honed-talons" },
    "ablative-plating", "ablative-cascade"), 1);
  // weapon prototype + equipment prototype = 2
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "pinning-bolt", melee: "honed-talons" },
    "ablative-plating", "ablative-cascade"), 2);
  // omitted equipment args keep old behavior
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "pinning-bolt", melee: "honed-talons" }), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — equipment prototype not counted (returns 1, not 2).

- [ ] **Step 3: Extend the function**

Replace `shared/game-state.js:229-234`:

```js
export function countPrototypes(weapons = {}, upgrades = {}, equipment, equipmentUpgrade) {
  let n = 0;
  if (upgradeNature(weapons.longRange, upgrades.longRange) === "prototype") n++;
  if (upgradeNature(weapons.melee, upgrades.melee) === "prototype") n++;
  if (equipment && equipmentUpgradeNature(equipment, equipmentUpgrade) === "prototype") n++;
  return n;
}
```

Also update the comment above it (line 227-228) to read "…across a rig's two weapon upgrades **and its equipment upgrade**."

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): fold equipment upgrade into the Prototype cap count"
```

---

## Task 4: Thread `equipmentUpgrade` into the rig

**Files:**
- Modify: `shared/game-state.js:615-655` (`makeRig`), `:757-765` (`makeUnit`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { makeRig } from "./game-state.js";

test("makeRig stores a normalized equipmentUpgrade", () => {
  const rig = makeRig("r1", "Test", "light", "a",
    { longRange: "Crossbow", melee: "Talon" }, "ablative-plating", "reinforced-plating");
  assert.equal(rig.equipmentUpgrade, "reinforced-plating");
  const bad = makeRig("r2", "Test2", "light", "a",
    { longRange: "Crossbow", melee: "Talon" }, "ablative-plating", "not-real");
  assert.equal(bad.equipmentUpgrade, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — `makeRig` takes 6 args; `equipmentUpgrade` is undefined.

- [ ] **Step 3: Add the parameter**

In `shared/game-state.js`, change the `makeRig` signature (line 615):

```js
export function makeRig(id, name, cls, owner, weapons = {}, equipment = null, equipmentUpgrade = null) {
```

After the `const equipmentId = normalizeEquipment(equipment);` line (~637), add:

```js
  const equipmentUpgradeId = normalizeEquipmentUpgrade(equipmentId, equipmentUpgrade);
```

In the returned rig object (near `equipment: equipmentId,` at ~652), add:

```js
    equipmentUpgrade: equipmentUpgradeId,
```

In `makeUnit` (the rig branch, ~761-764), pass it through — change the `makeRig(...)` call to forward `opts.equipmentUpgrade`:

```js
    return makeRig(opts.id, opts.name, opts.class, opts.owner, {
      longRange: opts.longRange, melee: opts.melee,
      longRangeUpgrade: opts.longRangeUpgrade, meleeUpgrade: opts.meleeUpgrade,
    }, opts.equipment ?? null, opts.equipmentUpgrade ?? null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite (ensure `makeRig`'s new optional arg broke nothing)**

Run: `npm test`
Expected: PASS (all existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): thread equipmentUpgrade through makeRig/makeUnit"
```

---

## Task 5: Server — validate + cap the equipment upgrade in `enforceChassis`

**Files:**
- Modify: `server/routes/game.js:1-2, 9-33`
- Test: `server/chassis.test.js` (the `enforceChassis` block)

- [ ] **Step 1: Write the failing tests**

Add to `server/chassis.test.js`, near the other `enforceChassis` Prototype tests (after line 104):

```js
test("enforceChassis rejects a weapon Prototype + an equipment Prototype", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "vice-grip",
    equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
  } });
  assert.ok(out.error);
});

test("enforceChassis allows a lone equipment Prototype", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "depleted-core", meleeUpgrade: "vice-grip",
    equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
  } });
  assert.equal(out.error, undefined);
});

test("enforceChassis rejects an unknown equipment upgrade id", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    equipment: "ablative-plating", equipmentUpgrade: "not-a-real-upgrade",
  } });
  assert.ok(out.error);
});
```

> Note: `depleted-core` is the Autocannon Field upgrade and `vice-grip` is the Claw Tuned upgrade — neither is a Prototype, so the lone-equipment-Prototype case has exactly one Prototype total.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/chassis.test.js`
Expected: FAIL — equipment upgrade neither validated nor counted.

- [ ] **Step 3: Wire validation + count**

In `server/routes/game.js`, extend the import on line 2:

```js
import { claimSide, applyCommand, publicState, resolveChassis, upgradeNature, countPrototypes, normalizeEquipment, equipmentUpgradeNature } from "../../shared/game-state.js";
```

In `enforceChassis`, after the melee-upgrade validation (line 22) and before the Prototype-count check, add equipment resolution + validation:

```js
  const equipment = normalizeEquipment(a.equipment);
  const equipUp = a.equipmentUpgrade;
  // Unknown equipment upgrade id for the chosen equipment → reject.
  if (equipUp && (!equipment || !equipmentUpgradeNature(equipment, equipUp))) {
    return { error: "unknown equipment upgrade" };
  }
```

Replace the Prototype-count check (lines 23-26) with:

```js
  // At most one Prototype per rig, across both weapons AND the equipment (AGENTS.md).
  if (countPrototypes(
        { longRange: pb.longRange, melee: pb.melee },
        { longRange: lrUp, melee: meleeUp },
        equipment, equipUp) > 1) {
    return { error: "a rig may run at most one Prototype upgrade" };
  }
```

In the returned `attrs` spread (line 30), add `equipmentUpgrade` so it survives to `applyCommand`:

```js
      attrs: { ...a, class: pb.class, longRange: pb.longRange, lr: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp, equipmentUpgrade: equipUp || null },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/chassis.test.js`
Expected: PASS.

- [ ] **Step 5: Confirm the add-command path forwards the field**

Verify `applyCommand`'s `add` handler passes `attrs.equipmentUpgrade` into `makeUnit` (it already spreads attrs into the unit opts). Search:

Run: `grep -n "makeUnit\|equipmentUpgrade" shared/game-state.js`
Expected: the `add` handler builds `makeUnit` opts from `attrs`; `equipmentUpgrade` flows through because Task 4 made `makeUnit` read `opts.equipmentUpgrade`. If the handler enumerates opts explicitly rather than spreading, add `equipmentUpgrade: a.equipmentUpgrade` to that opts object.

- [ ] **Step 6: Commit**

```bash
git add server/routes/game.js server/chassis.test.js
git commit -m "feat(equipment): validate + cap the equipment upgrade server-side"
```

---

## Task 6: Field effect — Reinforced Plating (Harden −2)

**Files:**
- Modify: `shared/combat.js:261`
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js` (follow the file's existing `rollImpacts` test style — fixed dice, two rigs). Minimal shape:

```js
import { rollImpacts } from "./combat.js";
import { makeRig } from "./game-state.js";

test("Reinforced Plating deepens Harden to −2 impact", () => {
  const attacker = makeRig("a", "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const mkTarget = (up) => {
    const t = makeRig("t", "T", "medium", "b", { longRange: "Autocannon", melee: "Sword" },
      "ablative-plating", up);
    t.hardened = true;
    return t;
  };
  const profile = { str: 8, perks: [], acc: [0] };
  const opts = { arc: "front", hits: 1, target: mkTarget(null) };
  const base = rollImpacts(attacker, opts.target, profile, "hull", opts, { impacts: [4] }, () => 1);
  const up = mkTarget("reinforced-plating");
  const upgraded = rollImpacts(attacker, up, profile, "hull", { ...opts, target: up }, { impacts: [4] }, () => 1);
  // upgraded total is 1 lower than base (−2 vs −1)
  assert.equal(base[0].total - upgraded[0].total, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/combat.test.js`
Expected: FAIL — both totals equal (Reinforced Plating not read).

- [ ] **Step 3: Implement**

In `shared/combat.js`, import `EQUIPMENT_UPGRADES` at the top (add to the existing `game-state.js`/`rules.js` import group — check which file exports it; it's `game-state.js`, but combat.js must avoid an import cycle. `rollImpacts` already receives the `target` rig, so read the tag off the rig without importing the catalog: store the numeric modifier on the rig at commission instead).

Simplest cycle-free approach: read `target.equipmentUpgrade` and the known id directly. Replace line 261:

```js
  // Harden (Ablative Plating active). Reinforced Plating (Field upgrade) deepens
  // it from −1 to −2.
  const hardenDepth = target.equipmentUpgrade === "reinforced-plating" ? 2 : 1;
  const hardened = target.hardened ? -hardenDepth : 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(equipment): Reinforced Plating deepens Harden to -2"
```

---

## Task 7: Field effects — Twin Radiators + Redundant Capacitors (equipment active heat)

**Files:**
- Modify: `shared/game-state.js:1771-1780` (equipment-active block)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

These read heat off the active. Test the effective heat directly via a small helper. Add the helper first (Step 3 defines it), then:

```js
import { equipmentActiveHeat } from "./game-state.js";

test("Field upgrades override equipment active heat", () => {
  // Purge base −2, Twin Radiators −3
  assert.equal(equipmentActiveHeat("radiator-array", null), -2);
  assert.equal(equipmentActiveHeat("radiator-array", "twin-radiators"), -3);
  // Overclock base +3, Redundant Capacitors +2
  assert.equal(equipmentActiveHeat("overclock-core", null), 3);
  assert.equal(equipmentActiveHeat("overclock-core", "redundant-capacitors"), 2);
  // Untouched families keep base
  assert.equal(equipmentActiveHeat("ablative-plating", "reinforced-plating"), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — `equipmentActiveHeat` undefined.

- [ ] **Step 3: Add the helper + use it**

In `shared/game-state.js`, after `firstEquipmentUpgradeId`/`normalizeEquipmentUpgrade` (Task 2), add:

```js
// Effective heat of an equipment's active, after any Field heat-override upgrade.
export function equipmentActiveHeat(equipmentId, equipmentUpgradeId) {
  const base = EQUIPMENT[equipmentId]?.active?.heat ?? 0;
  const up = (EQUIPMENT_UPGRADES[equipmentId] || []).find((u) => u.id === equipmentUpgradeId);
  if (up?.effect?.purgeHeat != null) return up.effect.purgeHeat;
  if (up?.effect?.overclockHeat != null) return up.effect.overclockHeat;
  return base;
}
```

In the equipment-active block, replace the `bumpHeat(rig, active.heat);` line (~1780) with:

```js
    bumpHeat(rig, equipmentActiveHeat(equipId, rig.equipmentUpgrade));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): Twin Radiators / Redundant Capacitors adjust active heat"
```

---

## Task 8: Field effects — Master Toolkit (Repair +2) + Reinforced Servos (Sprint 0 heat)

**Files:**
- Modify: `shared/game-state.js:2066` (repair), `:1884` (sprint heat)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Sprint heat is computed inline at the move path; extract it into a tiny helper for testability. Master Toolkit is the repair bonus. Add:

```js
import { equipmentSprintHeat, equipmentRepairBonus } from "./game-state.js";

test("Reinforced Servos zeroes Sprint heat; base Servo is 1, none is 2", () => {
  assert.equal(equipmentSprintHeat(null, null), 2);
  assert.equal(equipmentSprintHeat("servo-actuators", null), 1);
  assert.equal(equipmentSprintHeat("servo-actuators", "reinforced-servos"), 0);
});

test("Master Toolkit repairs +2, base suite +1, none +0", () => {
  assert.equal(equipmentRepairBonus(null, null), 0);
  assert.equal(equipmentRepairBonus("field-repair-suite", null), 1);
  assert.equal(equipmentRepairBonus("field-repair-suite", "master-toolkit"), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — helpers undefined.

- [ ] **Step 3: Add helpers + use them**

Add near `equipmentActiveHeat`:

```js
// Sprint heat: base 2, Servo Actuators 1, Reinforced Servos 0.
export function equipmentSprintHeat(equipmentId, equipmentUpgradeId, baseHeat = 2) {
  if (equipmentId !== "servo-actuators") return baseHeat;
  return equipmentUpgradeId === "reinforced-servos" ? 0 : 1;
}

// Extra SP a Repair action restores: Field Repair Suite +1, Master Toolkit +2.
export function equipmentRepairBonus(equipmentId, equipmentUpgradeId) {
  if (equipmentId !== "field-repair-suite") return 0;
  return equipmentUpgradeId === "master-toolkit" ? 2 : 1;
}
```

Replace the sprint-heat line (~1884):

```js
    const heat = act === "sprint" ? equipmentSprintHeat(rig.equipment, rig.equipmentUpgrade, def.heat) : def.heat;
```

Replace the repair-bonus line (~2066):

```js
    if (amt > 0) amt += equipmentRepairBonus(rig.equipment, rig.equipmentUpgrade);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): Master Toolkit + Reinforced Servos Field effects"
```

---

## Task 9: New family — Reactive Plating passive + Angled Plates

**Files:**
- Modify: `shared/combat.js` (`rollImpacts`, near line 261)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("Reactive Plating docks side/rear attacker STR; Angled Plates doubles it", () => {
  const attacker = makeRig("a", "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const profile = { str: 8, perks: [], acc: [0] };
  const mk = (up) => makeRig("t", "T", "medium", "b",
    { longRange: "Autocannon", melee: "Sword" }, "reactive-plating", up);
  const plain = makeRig("t0", "T0", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const at = (target) => rollImpacts(attacker, target, profile, "hull",
    { arc: "side", hits: 1, target }, { impacts: [4] }, () => 1)[0].total;
  const none = at(plain);
  assert.equal(none - at(mk(null)), 1);            // −1 STR
  assert.equal(none - at(mk("angled-plates")), 2); // −2 STR
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/combat.test.js`
Expected: FAIL — no STR reduction on side arc.

- [ ] **Step 3: Implement**

In `shared/combat.js` `rollImpacts`, after the `hardened` line (edited in Task 6), add a Countermeasures term:

```js
  // Reactive Plating (Countermeasures) — side/rear attacks lose STR. Angled
  // Plates (Field) doubles the dock to −2. Front arc is unaffected.
  let ctrm = 0;
  if (target.equipment === "reactive-plating" && (opts.arc === "side" || opts.arc === "rear")) {
    ctrm = target.equipmentUpgrade === "angled-plates" ? -2 : -1;
  }
```

Add `ctrm` to the `total` sum (the line that adds `hardened`, `braced`, etc., ~278):

```js
    const total = die + str + bonus + braced + hardened + shieldBlunt + cracked + ctrm + extra;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(equipment): Reactive Plating side/rear STR dock + Angled Plates"
```

---

## Task 10: New family — Pop Smoke active (attacker −2 ACC vs the smoked rig)

**Files:**
- Modify: `shared/game-state.js` (equipment-active block ~1773; activation-start clear ~2384), `shared/combat.js` (`computeModifiedAim` ~51; `resolveAttack` ~348)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { computeModifiedAim } from "./combat.js";

test("Pop Smoke worsens an attacker's modified Aim by 2", () => {
  const attacker = makeRig("a", "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const profile = { str: 8, perks: [], acc: [1], sweet: 12, peak: 1, dropoff: 0.2, minRange: 0, maxRange: 26, melee: false };
  const clear = computeModifiedAim(attacker, profile, { distance: 12, targetSmoke: false });
  const smoked = computeModifiedAim(attacker, profile, { distance: 12, targetSmoke: true });
  assert.equal(smoked - clear, 2); // higher modAim = harder to hit
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/combat.test.js`
Expected: FAIL — `targetSmoke` ignored.

- [ ] **Step 3a: Read smoke in `computeModifiedAim`**

In `shared/combat.js`, inside `computeModifiedAim`, add a smoke penalty and fold it into `accTotal`:

```js
  // Pop Smoke (Countermeasures active) — every attacker is at −2 ACC against a
  // rig hidden in its own smoke, until that rig's next activation.
  const smoke = opts.targetSmoke ? -2 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty + paintBonus + smoke;
```

- [ ] **Step 3b: Thread `targetSmoke` from `resolveAttack`**

In `shared/combat.js` `resolveAttack`, at the `rollToHit(...)` call (~348), add `targetSmoke: !!target.smokeUntilNext` into the opts object:

```js
  const th = rollToHit(attacker, profile, { ...opts, target, autoHit: fireControlLock, guardBreak, targetSmoke: !!target.smokeUntilNext }, opts.dice?.toHit, random);
```

(`rollToHit` calls `computeModifiedAim(attacker, profile, opts)`, so the flag flows through.)

- [ ] **Step 3c: Set the flag on Pop Smoke, clear it at activation start**

In `shared/game-state.js` equipment-active block (~1773), extend the `if (act === "harden")` chain:

```js
    else if (act === "popsmoke") {
      rig.smokeUntilNext = true;
      // Pop Smoke breaks a missile Lock painted on this rig (Fire Control Lock).
      rig.lockedBy = null;
    }
```

> If no `lockedBy` field exists yet, drop that line — the missile Lock lives on the *attacker* as `lockedTarget`; breaking it from the target side is a Phase-2 concern. Keep only `rig.smokeUntilNext = true;` for Phase 1.

In the activation-start block (~2384), beside `rig.hardened = false;`, add:

```js
      rig.smokeUntilNext = false; // Pop Smoke (Reactive Plating) lasts until this Rig's next activation
      rig.fireControlUsed = false; // Targeting Computer first-shot compensator resets each activation
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(equipment): Pop Smoke — attackers -2 ACC vs the smoked rig"
```

---

## Task 11: New family — Blast Furnace Core passive (heat margin) + Insulated Core

**Files:**
- Modify: `shared/game-state.js:858-873` (`heatMeter`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { heatMeter, makeRig } from "./game-state.js";

test("Blast Furnace Core raises the safe heat margin", () => {
  const mk = (equip, up) => {
    const r = makeRig("r", "R", "medium", "a",
      { longRange: "Autocannon", melee: "Sword" }, equip, up);
    r.engine.heat = 6; // Medium cap is 5 → 1 over normally
    return r;
  };
  assert.equal(heatMeter(mk(null, null)).over, 1);                        // 6 vs cap 5
  assert.equal(heatMeter(mk("blast-furnace-core", null)).over, 0);        // margin +1 → cap 6
  const insulated = mk("blast-furnace-core", "insulated-core");
  insulated.engine.heat = 7;
  assert.equal(heatMeter(insulated).over, 0);                            // margin +2 → cap 7
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — `over` is 1 for the Blast Furnace rig.

- [ ] **Step 3: Implement the margin in `heatMeter`**

In `shared/game-state.js` `heatMeter`, after `const cap = HEAT_CAPACITY[...] ?? 5;` (line 862), add the margin and apply it to an effective cap used by `over`/`bonus`/`zone`:

```js
  // Blast Furnace Core (Thermal) — raises the safe threshold before the overheat
  // roll. Base margin +1; Insulated Core (Field) makes it +2.
  let margin = 0;
  if (rig?.equipment === "blast-furnace-core") {
    margin = rig?.equipmentUpgrade === "insulated-core" ? 2 : 1;
  }
  const effCap = cap + margin;
```

Then change `over` and `bonus` to use `effCap`, and keep `cap` as the value returned/displayed as the redline (report the raised redline so the UI matches the safe zone):

```js
  const over = Math.max(0, heat - effCap);
  const bonus = over > 0 ? Math.min(MAX_OVERHEAT_BONUS, 2 * over) : 0;
```

And in the `zone` ladder, compare against `effCap`:

```js
  if (over > 0) zone = "over";
  else if (heat >= effCap) zone = "redline";
  else if (heat > effCap * 0.6) zone = "warm";
  else if (heat > 0) zone = "cool";
  else zone = "cold";
  return { heat, cap: effCap, floor, over, bonus, zone };
```

- [ ] **Step 4: Run test to verify it passes + full suite (heatMeter is widely used)**

Run: `npm test -- shared/game-state.test.js` then `npm test`
Expected: PASS. If any existing heat test asserts `cap` equals the raw class capacity for a *non-Thermal* rig, it stays correct (`margin` is 0 there).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): Blast Furnace Core heat margin + Insulated Core"
```

---

## Task 12: New family — Heat Purge Wave active (vent + narrated AoE)

**Files:**
- Modify: `shared/game-state.js` (equipment-active block ~1773-1784)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("Heat Purge Wave vents the rig to its cap and narrates an AoE", () => {
  const rig = makeRig("r", "R", "medium", "a",
    { longRange: "Autocannon", melee: "Sword" }, "blast-furnace-core", null);
  rig.engine.heat = 9;
  // minimal room + active turn
  const room = { rigs: [rig], resolutions: [], game: { round: 2, turn: { activeRigId: rig.id, actionsUsed: 0, actionsMax: 3, side: "a" } } };
  const ok = performAction(room, { verb: "action", attrs: { name: "R", action: "heatpurgewave" } });
  assert.equal(rig.engine.heat, 5); // vented to Medium cap 5 (margin does not lower the vent floor)
  const res = room.resolutions.at(-1);
  assert.match(res.summary + res.effects.join(" "), /3"/); // narrates the 3" AoE
});
```

> Adjust the `performAction` invocation to match the file's real command shape (check an existing equipment-active test in `shared/game-state.test.js` for the exact `{ verb, attrs }` and room scaffold; reuse it verbatim).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/game-state.test.js`
Expected: FAIL — heat unchanged / no AoE narration.

- [ ] **Step 3: Implement**

In the equipment-active block, add a `heatpurgewave` branch alongside `harden`/`overclock`/`emergencypatch`/`popsmoke`. Vent to the *raw* class cap (not the raised margin), then emit a narrated instruction. Place it before the generic `bumpHeat`/`pushResolution`:

```js
    else if (act === "heatpurgewave") {
      const rawCap = HEAT_CAPACITY[rig.weightClass] ?? 5;
      rig.engine.heat = Math.min(rig.engine.heat, rawCap);
    }
```

The generic `pushResolution` at the end of the block already reports `active.text`, which contains the `3"` AoE instruction authored in Task 1 — so the narration requirement is met without special-casing the summary. Confirm `active.text` for `heatpurgewave` includes `3"` (it does).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(equipment): Heat Purge Wave vents to cap + narrates AoE"
```

---

## Task 13: New family — Targeting Computer passive + Lock Sight + Ballistic Processor

**Files:**
- Modify: `shared/combat.js` (`computeModifiedAim` ~44-52; `rollToHit` rerolls ~98; `resolveAttack` ~348), `shared/game-state.js` (fire path sets/consumes the flags; Lock Sight active)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test("Ballistic Processor: +1 ACC in the sweet band (lower modAim)", () => {
  const attacker = makeRig("a", "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  attacker.equipment = "targeting-computer"; attacker.equipmentUpgrade = "ballistic-processor";
  const profile = { str: 8, perks: [], acc: [1], sweet: 12, peak: 1, dropoff: 0.2, minRange: 0, maxRange: 26, melee: false };
  const inBand = computeModifiedAim(attacker, profile, { distance: 12 });
  attacker.equipmentUpgrade = null;
  const plain = computeModifiedAim(attacker, profile, { distance: 12 });
  assert.equal(plain - inBand, 1);
});

test("Targeting Computer passive: first shot ignores cover + engaged penalties", () => {
  const attacker = makeRig("a", "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  attacker.equipment = "targeting-computer";
  const profile = { str: 8, perks: [], acc: [0], sweet: 12, peak: 0, dropoff: 0, minRange: 0, maxRange: 26, melee: false };
  const penalized = computeModifiedAim(attacker, profile, { distance: 12, cover: 2, engaged: true });
  const compensated = computeModifiedAim(attacker, profile, { distance: 12, cover: 2, engaged: true, fireControlFirst: true });
  assert.ok(compensated < penalized); // penalties cancelled on the first shot
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/combat.test.js`
Expected: FAIL.

- [ ] **Step 3a: `computeModifiedAim` — Ballistic Processor + first-shot compensator**

In `shared/combat.js` `computeModifiedAim`, compute a sweet-band accuracy bonus and let the first-shot compensator zero the positional penalties:

```js
  // Targeting Computer passive — the first Fire this activation ignores cover
  // and the engaged −2 (opts.fireControlFirst is set by the fire path, once).
  const coverEff = opts.fireControlFirst ? 0 : cover;
  const engagedEff = opts.fireControlFirst ? 0 : engagedPenalty;
  // Ballistic Processor (Field) — +1 ACC when the measured distance is in the
  // weapon's sweet band (within its dropoff-zero window: |distance − sweet| ≤ 2).
  const inSweetBand = !profile.melee && opts.distance != null && Math.abs(opts.distance - (profile.sweet ?? 0)) <= 2;
  const ballistic = (attacker.equipment === "targeting-computer" && attacker.equipmentUpgrade === "ballistic-processor" && inSweetBand) ? 1 : 0;
  const accTotal = weaponAcc - coverEff + aimedPenalty + hullPenalty + engagedEff + paintBonus + smoke + ballistic;
```

(Replace the earlier `accTotal` line from Task 10 with this one — it now includes `smoke` and `ballistic` and uses the `*Eff` penalties.)

- [ ] **Step 3b: Lock Sight — reroll all misses on the next shot**

In `shared/combat.js` `rollToHit`, extend the `rerolls` line (~98) to include a full-volley reroll when `opts.lockSight`:

```js
  const rerolls = Math.max(0, Math.floor(profile.upgradeEffect?.rerollMisses || 0)) + (opts.lockSight ? rof : 0);
```

In `resolveAttack`, thread it into the `rollToHit` opts (the same call edited in Task 10):

```js
  const th = rollToHit(attacker, profile, { ...opts, target, autoHit: fireControlLock, guardBreak, targetSmoke: !!target.smokeUntilNext, lockSight: !!attacker.lockSightNext, fireControlFirst: opts.fireControlFirst }, opts.dice?.toHit, random);
```

- [ ] **Step 3c: Set/consume the flags in the fire path (`shared/game-state.js`)**

In the `fire`/`aimed` action handler, before resolving the attack, compute `fireControlFirst` and pass it into the attack opts; after resolving, mark the passive used and consume Lock Sight:

```js
    const fireControlFirst = rig.equipment === "targeting-computer" && !rig.fireControlUsed;
    // ...pass fireControlFirst into the resolveAttack opts object...
    // after the attack resolves:
    if (fireControlFirst) rig.fireControlUsed = true;
    if (rig.lockSightNext) rig.lockSightNext = false;
```

> Find the exact `resolveAttack(...)` call in the fire handler and add `fireControlFirst` to its opts. The `lockSightNext` flag is read inside `resolveAttack` off `attacker`, so only the consume line is needed here.

Add the Lock Sight active branch in the equipment-active block:

```js
    else if (act === "locksight") {
      rig.lockSightNext = true;
    }
```

(`fireControlUsed` / `smokeUntilNext` are already cleared at activation start in Task 10.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/combat.test.js` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(equipment): Targeting Computer passive, Ballistic Processor, Lock Sight"
```

---

## Task 14: Wizard — equipment nature sub-picker + cap cross-lock

**Files:**
- Modify: `client/src/v2/overlays/CommissionWizard.tsx` (state type ~35-37, defaults ~63-65/83-85, imports ~10, step-2 body ~340-378, confirm view ~389-396, command build ~146-148)
- Modify: `client/src/v2/lib/commissionData.ts`
- Modify: `client/src/v2/styles/forge.css`

- [ ] **Step 1: Client helper — `firstEquipmentUpgradeId`**

In `client/src/v2/lib/commissionData.ts`, extend the import and add a helper:

```ts
import { WEAPON_UPGRADES, EQUIPMENT_UPGRADES } from "/shared/game-state.js";

export function firstEquipmentUpgradeId(equipmentId: string): string | null {
  return (EQUIPMENT_UPGRADES[equipmentId] || [])[0]?.id || null;
}
```

- [ ] **Step 2: Wizard state — add `equipmentUpgrade`**

In `CommissionWizard.tsx`:
- Extend the state interface (after `equipment: string;` ~line 37): `equipmentUpgrade: string | null;`
- Import the helpers (line 10 group): add `firstEquipmentUpgradeId` from `../lib/commissionData` and `EQUIPMENT_UPGRADES`, `equipmentUpgradeNature` from `/shared/game-state.js`.
- In the initial state (~65) and `selectChassis` reset (~85): set `equipmentUpgrade: firstEquipmentUpgradeId(<equipment id used there>)`. For the initial default (`equipment: Object.keys(EQUIPMENT)[0]`), use `equipmentUpgrade: firstEquipmentUpgradeId(Object.keys(EQUIPMENT)[0])`.
- Wherever `patch({ equipment: id })` is called (the equipment card `onClick`, ~359, and the suggestion auto-preselect ~109), also reset the upgrade: `patch({ equipment: id, equipmentUpgrade: firstEquipmentUpgradeId(id) })`.

- [ ] **Step 3: Render the nature sub-picker under the selected equipment card**

The step-2 equipment grid (~348-376) renders one `<button>` per family. A button can't nest interactive children, so render the picker as a sibling when the card is selected (mirror the weapon `upgradeBay`). Replace the equipment grid's per-family return with a wrapper:

```tsx
{Object.entries(EQUIPMENT).map(([id, e]) => {
  const suggestion = (content[state.chassis]?.suggestedEquipment || []).find((s) => s.id === id);
  const sel = id === state.equipment;
  // One Prototype per rig — an equipment Prototype locks when a WEAPON already runs one.
  const weaponPrototype =
    upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype" ||
    upgradeNature(state.melee, state.meleeUpgrade) === "prototype";
  return (
    <div key={id} className={"v2-fc-equip-slot" + (sel ? " is-sel" : "")}>
      <button
        type="button"
        className={"v2-fc-equip" + (sel ? " is-sel" : "") + (suggestion ? " is-suggested" : "")}
        onClick={() => patch({ equipment: id, equipmentUpgrade: firstEquipmentUpgradeId(id) })}
      >
        {suggestion && (
          <div className="v2-fc-equip-suggest">
            <span className="v2-fc-equip-suggest-tag v2-eyebrow">◈ Suggested</span>
            <span className="v2-fc-equip-suggest-why">{suggestion.reason}</span>
          </div>
        )}
        <div className="v2-fc-equip-family v2-eyebrow">{e.family}</div>
        <div className="v2-fc-equip-label v2-title">{e.label}</div>
        <div className="v2-fc-equip-passive">Passive · {e.passive}</div>
        <div className="v2-fc-equip-active">
          Active · <b>{e.active.label}</b> ({e.active.heat >= 0 ? "+" : ""}{e.active.heat} heat) — {e.active.text}
        </div>
      </button>
      {sel ? (
        <div className="v2-fc-path v2-grid-3">
          {(EQUIPMENT_UPGRADES[id] || []).map((u, i) => {
            const locked = u.nature === "prototype" && weaponPrototype && u.id !== state.equipmentUpgrade;
            const isSel = u.id === state.equipmentUpgrade;
            return (
              <button
                key={u.id}
                type="button"
                disabled={locked}
                data-nature={u.nature}
                className={"v2-fc-node nat-" + u.nature + (isSel ? " is-sel" : "") + (locked ? " locked" : "")}
                title={locked ? "A rig may run at most one Prototype upgrade" : u.tag}
                onClick={() => !locked && patch({ equipmentUpgrade: u.id })}
              >
                <span className="v2-fc-node-head">
                  <span className="v2-fc-node-mark">{NODE_MARK[i]}</span>
                  <span className="v2-fc-node-name v2-title">{u.name}</span>
                  <em className={"v2-fc-node-nature nat-" + u.nature + " v2-eyebrow"}>{natureLabel(u.nature)}</em>
                </span>
                <small className="v2-fc-node-tag">
                  {u.nature === "prototype" ? <span className="v2-fc-warn">⚠ one per rig</span> : null}
                  {u.tag}
                </small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
})}
```

Also make the **weapon** Prototype nodes lock when the *equipment* runs a Prototype. In `upgradeBay` (~216-230), the two `upgradePath` calls pass `otherIsPrototype`. Widen both to also consider equipment:

```tsx
// long-range path:
upgradeNature(state.melee, state.meleeUpgrade) === "prototype" ||
  equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype",
// melee path:
upgradeNature(state.longRange, state.longRangeUpgrade) === "prototype" ||
  equipmentUpgradeNature(state.equipment, state.equipmentUpgrade) === "prototype",
```

- [ ] **Step 4: Send `equipmentUpgrade` in the add command + confirm row**

In the `sendCommand("add", { ... })` rig payload (~140-149), add:

```tsx
        equipmentUpgrade: state.equipmentUpgrade,
```

In the confirm view (~389-396), add a row showing the equipment upgrade (find the chosen upgrade name):

```tsx
{(() => {
  const eu = (EQUIPMENT_UPGRADES[state.equipment] || []).find((u) => u.id === state.equipmentUpgrade);
  return <div className="v2-fc-confirm-row">◈ {e.label} · {eu?.name || "Upgrade ?"}</div>;
})()}
```

- [ ] **Step 5: Styles**

In `client/src/v2/styles/forge.css`, add layout so the nature path sits under the selected equipment card (reuse the weapon path look). Append:

```css
.v2-fc-equip-slot { display: flex; flex-direction: column; gap: 8px; }
.v2-fc-equip-slot.is-sel .v2-fc-path { margin-top: 4px; }
```

(The `.v2-fc-node`, `.nat-*`, `.v2-fc-warn` classes already exist from the weapon picker and are reused as-is.)

- [ ] **Step 6: Typecheck + build the client**

Run: `npm run build` (or the project's typecheck script — check `package.json`)
Expected: no TS errors. Fix any type mismatch on `equipmentUpgrade` (it is `string | null`).

- [ ] **Step 7: Verify in the running wizard**

Start the dev server via the Browser pane (`preview_start` with the app's launch config), open the Commission Wizard, pick a rig chassis, advance to the Equipment step. Confirm: selecting an equipment reveals a Field/Tuned/Prototype path; picking a weapon Prototype greys the equipment Prototype node (and vice versa); the confirm step shows the equipment upgrade. Screenshot for the user.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/overlays/CommissionWizard.tsx client/src/v2/lib/commissionData.ts client/src/v2/styles/forge.css
git commit -m "feat(equipment): equipment nature sub-picker + 3-way Prototype cap in the wizard"
```

---

## Task 15: rules.md — §15 rewrite + §3 clause

**Files:**
- Modify: `rules.md:120` (§3 Prototype clause), `rules.md:511-523` (§15 Equipment)

- [ ] **Step 1: Update the §3 Prototype clause**

Change line 120's tail from "a Rig may run **at most one Prototype**." to:

> …a Rig may run **at most one Prototype** across its two weapons **and its equipment**.

- [ ] **Step 2: Rewrite §15 Equipment**

Replace the §15 table + intro with: the 8-family table (add Thermal / Fire Control / Countermeasures rows to the existing 5), followed by an **Equipment Upgrades** table matching the §12 weapon-upgrade layout (Family | Field | Tuned | Prototype) using the 24 rows from the design spec, and a note that a Rig picks one upgrade per equipment at commission, folded into the one-Prototype cap. Copy the upgrade names/tags verbatim from `EQUIPMENT_UPGRADES` (Task 2) so rules and engine agree. Mark the Tuned/Prototype mechanics as "implemented incrementally" exactly like the §12 note.

- [ ] **Step 3: Sanity check the doc**

Run: `grep -n "Blast Furnace\|Targeting Computer\|Reactive Plating\|at most one Prototype" rules.md`
Expected: the new families appear in §15; the §3 clause mentions equipment.

- [ ] **Step 4: Commit**

```bash
git add rules.md
git commit -m "docs(rules): §15 equipment upgrades + 3 new families; §3 Prototype cap spans equipment"
```

---

## Task 16: Re-author chassis suggestions toward the new families

**Files:**
- Modify: `content/chassis.json`
- Test: `server/chassis.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/chassis.test.js`, in the `suggestedEquipment` block (after line ~118):

```js
test("a suggestion pointing at a new family id merges + validates", () => {
  const fp = tmpFile("suggest-new.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [{ id: "blast-furnace-core", reason: "runs hot" }] },
  ]));
  const store = makeChassisStore(fp); // match the block's existing store constructor
  const row = store.all().find((c) => c.id === id);
  assert.equal(row.suggestedEquipment[0].id, "blast-furnace-core");
});
```

> Use the exact store/loader helper the surrounding suggestion tests use (read lines ~114-118 first and mirror them).

- [ ] **Step 2: Run test to verify it passes already or fails**

Run: `npm test -- server/chassis.test.js`
Expected: PASS — validation is against the `EQUIPMENT` map, which now includes the new id (Task 1). This test guards the coupling; if it FAILS, `server/chassis.js` imports a stale `EQUIPMENT` — confirm it imports from `../shared/game-state.js` and re-run.

- [ ] **Step 3: Re-author suggestions in `content/chassis.json`**

Update these chassis to point at a new family where it fits the flavour (keep 1–2 entries each; index 0 is the auto-preselect):

| Chassis | New suggestion (index 0 or 1) | Why |
|---|---|---|
| medium-crossbow-talon | `targeting-computer` | Sweet-spot bolt hunter — sharpen the shot. |
| medium-sniper-chainsaw | `targeting-computer` | One shot per activation; make it land. |
| light-missile-flamethrower | `blast-furnace-core` | Already runs hot — weaponize the heat. |
| light-sword-arc | `blast-furnace-core` | Arc gun cooks; turn redline into a threat. |
| light-wreckingball-double | `reactive-plating` | Flanker that gets flanked back — deny side/rear. |
| medium-shield-siege | `reactive-plating` (2nd pick) | Objective anchor — punish flankers. |

Keep the other chassis as-is. For each edited chassis, set the `reason` string to a short in-fiction nudge.

- [ ] **Step 4: Run the chassis tests + start the server to confirm hot-reload validation**

Run: `npm test -- server/chassis.test.js`
Expected: PASS.

- [ ] **Step 5: Verify the suggestions surface in the wizard**

In the running wizard (Browser pane), pick `medium-crossbow-talon`, advance to Equipment: the Targeting Computer card shows the ◈ Suggested badge and is auto-preselected. Screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add content/chassis.json server/chassis.test.js
git commit -m "content(chassis): steer suggestions toward the new equipment families"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — expected: all green.
- [ ] Build the client: `npm run build` — expected: no TS errors.
- [ ] In the Browser pane, commission a rig end-to-end with a new family + a Prototype equipment, confirm the cap greys the weapon Prototypes, and screenshot the finished loadout for the user.

---

## Deferred Mechanics Backlog (follow-on plans — NOT in this plan)

Each ships its own TDD plan later, one row per plan or small batch, mirroring the weapon-mechanic rollout. Data rows already exist (inert `effect: {}`); each plan wires the effect + tests + a rules.md mechanics line.

| Family | Tuned | Prototype |
|---|---|---|
| Armor | Reactive Armor | Ablative Cascade |
| Cooling | Coolant Injection | Cryo Reservoir |
| Mobility | Kickstart Pistons | Grapnel Launcher |
| Power | Adrenaline Surge | Reactor Overdrive |
| Utility | Battlefield Triage | Nanite Swarm |
| Thermal | Backdraft | Meltdown Protocol |
| Fire Control | Predictive Tracking | Fire Solution Lock |
| Countermeasures | Chaff Burst | Point-Defense System |

Spatial Prototypes (Grapnel Launcher, Meltdown burst) emit narrated player instructions per the AGENTS.md convention; the engine tracks state (cooldowns, charges), not board coordinates.
