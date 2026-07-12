# Support Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support units — Tanks/Walkers that carry a light sidearm plus two role modules (Damage/Repair/Coolant/Recon), introducing the game's first ally-targeting actions (Field Weld, Vent, Paint).

**Architecture:** No new unit *kind*. A support unit is an existing `tank`/`walker` (from `shared/unit-kinds.js`) whose commission includes a `modules` array and a built-in `Sidearm` weapon. Three new action verbs (`fieldweld`/`vent`/`paint`) join the `ACTIONS` catalogue and are dispatched in `performAction`, gated on the acting unit owning the matching module. Paint writes a `painted` flag onto the *enemy* target (like the existing `cracked` status), read during to-hit assembly to cancel cover and add +1 Aim for allied ranged attacks, and swept when the painter next activates.

**Tech Stack:** Plain ES modules (`shared/*.js`), `node:test` + `node:assert/strict` for engine tests, Vitest + React Testing Library for client. Test command: `npm test` (runs both); per-file engine run: `node --test shared/<file>.test.js`.

---

## File Structure

**Engine (shared) — TDD, the risk surface:**
- `shared/unit-kinds.js` — add `MODULES` registry + `normalizeModules()`. (Task 1)
- `shared/game-state.js` — add `Sidearm` to `UNIT_WEAPONS`; extend `makeUnit` for modules; add `fieldweld`/`vent`/`paint` branches to `performAction`; sweep `painted` in the `activate` verb; add `painted: null` to the cold-unit shape; forward `painted` in `resolveFire`; generalize the `seed` handler; export `SUPPORT_UNITS`. (Tasks 1,2,4,5,6,7,9)
- `shared/rules.js` — register 3 action verbs in `ACTIONS`. (Task 3)
- `shared/combat.js` — cancel cover + add +1 Aim when `opts.painted` (ranged only). (Task 7)
- `shared/battle-view.js` — surface the 3 module actions in `availableActions`. (Task 8)

**Client (v2) — concrete edits + preview verification:**
- `client/src/lib/loadout.ts` — extend `Loadout` types + `buildLoadout` for sidearm+modules. (Task 10)
- `client/src/v2/components/LoadoutView.tsx` — render sidearm + module chips. (Task 11)
- `client/src/v2/battle/ActionConsole.tsx` — glyphs + `onAction` routing for the 3 verbs. (Task 12)

**Protocol:**
- `server/prompt.js` — teach the roster-add grammar the support-unit shape. (Task 13)

New test files: `shared/support-units.test.js` (Tasks 1,2,4,5,6,9), assertions added to `shared/combat.test.js` (Task 7) and `shared/battle-view.test.js` (Task 8).

---

### Task 1: Module registry + Sidearm weapon

**Files:**
- Modify: `shared/unit-kinds.js` (after `UNIT_KINDS`, ~line 125)
- Modify: `shared/game-state.js:60-67` (`UNIT_WEAPONS`)
- Test: `shared/support-units.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `shared/support-units.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_IDS, normalizeModules } from "./unit-kinds.js";
import { UNIT_WEAPONS, normalizeUnitWeapon } from "./game-state.js";

test("MODULES lists the four roles, one action verb each (Damage has none)", () => {
  assert.deepEqual([...MODULE_IDS].sort(), ["coolant", "damage", "recon", "repair"]);
  assert.equal(MODULES.damage.action, null);
  assert.equal(MODULES.repair.action, "fieldweld");
  assert.equal(MODULES.coolant.action, "vent");
  assert.equal(MODULES.recon.action, "paint");
});

test("normalizeModules keeps valid distinct ids, drops junk/dupes, lowercases", () => {
  assert.deepEqual(normalizeModules(["Repair", "recon"]), ["repair", "recon"]);
  assert.deepEqual(normalizeModules(["repair", "repair"]), ["repair"]);
  assert.deepEqual(normalizeModules(["repair", "bogus"]), ["repair"]);
  assert.deepEqual(normalizeModules("repair"), []);
  assert.deepEqual(normalizeModules(undefined), []);
});

test("Sidearm is a weak flat-pick ranged weapon in the unit list", () => {
  assert.equal(normalizeUnitWeapon("sidearm"), "Sidearm");
  const s = UNIT_WEAPONS["Sidearm"];
  assert.equal(s.rof, 2);
  assert.equal(s.str, 4);
  assert.equal(s.flatPick, true);
  assert.equal(s.maxRange, 12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `MODULES`/`normalizeModules` not exported; `Sidearm` undefined.

- [ ] **Step 3: Add the MODULES registry to `shared/unit-kinds.js`**

After the `UNIT_KINDS` object literal closes (`};` at ~line 125), before `export function kindOf`:

```js
// Support-unit role modules (spec: Support Units). A support unit is a Tank or
// Walker carrying exactly TWO distinct modules. Damage grants a real gun from
// UNIT_WEAPONS; the other three grant an ally-targeting action verb.
export const MODULES = {
  damage:  { id: "damage",  label: "Damage",  action: null },
  repair:  { id: "repair",  label: "Repair",  action: "fieldweld" },
  coolant: { id: "coolant", label: "Coolant", action: "vent" },
  recon:   { id: "recon",   label: "Recon",   action: "paint" },
};
export const MODULE_IDS = Object.keys(MODULES);

// Canonicalize a module list: lowercase, keep only known ids, drop duplicates,
// preserve first-seen order. Returns [] for non-arrays.
export function normalizeModules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const id = String(m || "").trim().toLowerCase();
    if (MODULES[id] && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}
```

- [ ] **Step 4: Add `Sidearm` to `UNIT_WEAPONS` in `shared/game-state.js`**

Inside the `UNIT_WEAPONS` object (`shared/game-state.js:60-67`), add a line after `"Ram Spike"` (line 66):

```js
  // Built-in weak weapon every support unit carries; replaced by a Damage
  // module. peak 0 + dropoff 0 = a flat ACC 0 at any distance (spec §Sidearm).
  "Sidearm":          { rof: 2, str: 4,  sweet: 6,  peak: 0, dropoff: 0,    minRange: 0, maxRange: 12, flatPick: true },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test shared/support-units.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/unit-kinds.js shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): module registry + Sidearm weapon for support units"
```

---

### Task 2: Commission support units in `makeUnit`

**Files:**
- Modify: `shared/game-state.js:738-757` (cold-kind branch of `makeUnit`) and its import line (`:6`)
- Test: `shared/support-units.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/support-units.test.js`:

```js
import { makeUnit } from "./game-state.js";

test("Damage module keeps the chosen gun; modules stored canonically", () => {
  const u = makeUnit("tank", 1, "Marksman", "a", { unit: "Tank Cannon", modules: ["damage", "recon"] });
  assert.ok(u);
  assert.equal(u.kind, "tank");
  assert.deepEqual(u.modules, ["damage", "recon"]);
  assert.equal(u.weapons.unit, "Tank Cannon");
  assert.equal(u.painted, null);
});

test("No Damage module falls back to the Sidearm (opts.unit ignored)", () => {
  const u = makeUnit("walker", 2, "Welder", "a", { modules: ["repair", "recon"], unit: "Tank Cannon" });
  assert.ok(u);
  assert.equal(u.weapons.unit, "Sidearm");
  assert.deepEqual(u.modules, ["repair", "recon"]);
});

test("A plain tank (no modules) is unchanged: single flat-pick weapon, empty modules", () => {
  const u = makeUnit("tank", 3, "Line Tank", "b", { unit: "Autocannon Mount" });
  assert.ok(u);
  assert.equal(u.weapons.unit, "Autocannon Mount");
  assert.deepEqual(u.modules, []);
});

test("Support units must carry exactly two distinct modules or fail to build", () => {
  assert.equal(makeUnit("tank", 4, "X", "a", { unit: "Tank Cannon", modules: ["damage"] }), null);
  assert.equal(makeUnit("tank", 5, "X", "a", { unit: "Tank Cannon", modules: ["damage", "repair", "recon"] }), null);
  // A damage-less support unit with a bogus opts.unit still builds — it uses the Sidearm.
  assert.ok(makeUnit("walker", 6, "X", "a", { modules: ["repair", "coolant"], unit: "nonsense" }));
  // A damage support unit with an invalid gun fails (no weapon to fit).
  assert.equal(makeUnit("tank", 7, "X", "a", { modules: ["damage", "recon"], unit: "nonsense" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `u.modules` is `undefined`; Sidearm fallback not implemented.

- [ ] **Step 3: Add `normalizeModules` to the import line**

`shared/game-state.js:6` currently:

```js
import { UNIT_KINDS, kindOf, roleOf, partsByRole, partNamesOf } from "./unit-kinds.js";
```

Change to:

```js
import { UNIT_KINDS, kindOf, roleOf, partsByRole, partNamesOf, normalizeModules } from "./unit-kinds.js";
```

- [ ] **Step 4: Rewrite the weapon-selection lines in the cold-kind branch**

`shared/game-state.js:740-741` currently:

```js
  const weaponName = normalizeUnitWeapon(opts.unit);
  if (!weaponName) return null;
```

Replace with:

```js
  // Support units carry exactly two distinct modules; a bare tank/walker carries
  // none. A Damage module fits the chosen unit-weapon; without one the unit falls
  // back to the built-in Sidearm.
  const modules = normalizeModules(opts.modules);
  if (modules.length > 0 && modules.length !== 2) return null;
  const weaponName = modules.length > 0
    ? (modules.includes("damage") ? normalizeUnitWeapon(opts.unit) : "Sidearm")
    : normalizeUnitWeapon(opts.unit);
  if (!weaponName) return null;
```

- [ ] **Step 5: Store `modules` and `painted` on the unit object**

In the `const unit = { ... }` literal (`shared/game-state.js:751-806`), add two fields next to `weapons: { unit: weaponName },` (line 757):

```js
    weapons: { unit: weaponName },
    modules,
    painted: null,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test shared/support-units.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full engine suite to confirm no regressions**

Run: `node --test shared/game-state.test.js shared/unit-kinds.test.js`
Expected: PASS (existing tank/walker construction still builds `weapons.unit` and now also `modules: []`).

- [ ] **Step 8: Commit**

```bash
git add shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): commission support units with sidearm + two modules"
```

---

### Task 3: Register the three action verbs

**Files:**
- Modify: `shared/rules.js:10-29` (`ACTIONS`)
- Test: `shared/rules.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/rules.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS } from "./rules.js";

test("support module actions are registered, cold (0 heat), 1 slot each", () => {
  for (const key of ["fieldweld", "vent", "paint"]) {
    assert.ok(ACTIONS[key], `${key} registered`);
    assert.equal(ACTIONS[key].heat, 0);
    assert.equal(ACTIONS[key].slot, 1);
  }
});
```

(If `shared/rules.test.js` already imports `test`/`assert`/`ACTIONS`, reuse those imports and add only the `test(...)` block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/rules.test.js`
Expected: FAIL — `ACTIONS.fieldweld` is undefined.

- [ ] **Step 3: Add the three verbs to `ACTIONS`**

In `shared/rules.js`, before the closing `};` of `ACTIONS` (line 29), add:

```js
  // Support-unit module actions (spec: Support Units). Cold — 0 heat — since only
  // Tanks/Walkers carry modules. Each spends one action slot.
  fieldweld:{ label: "Field Weld", heat: 0, slot: 1 },
  vent:     { label: "Vent",       heat: 0, slot: 1 },
  paint:    { label: "Paint",      heat: 0, slot: 1 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/rules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -m "feat(units): register field-weld/vent/paint action verbs"
```

---

### Task 4: Field Weld action (repair an ally)

**Files:**
- Modify: `shared/game-state.js` — add a branch in `performAction` after the `barrage` block (after line 1933, before `if (act === "reload")`)
- Test: `shared/support-units.test.js`

Field Weld reuses the D12 7+/10+ curve of Repair (`shared/game-state.js:1936-1947`) and the `repairRig(target, loc, amt)` helper (`:1237`), but heals a *friendly* target looked up by name via `findRig` (`:838`).

- [ ] **Step 1: Write the failing test**

This test drives the full command pipe. Append to `shared/support-units.test.js`:

```js
import { createRoom, applyCommand } from "./game-state.js";

// Minimal harness: seed a room with two allied units, activate one, run an action.
function twoAllyRoom() {
  const room = createRoom("t");
  room.rigs = [
    makeUnit("walker", 1, "Welder", "a", { modules: ["repair", "recon"] }),
    makeUnit("tank", 2, "Ally", "a", { unit: "Tank Cannon" }),
  ];
  room.nextRigId = 3;
  room.game.started = true;
  room.game.phase = "activation";
  room.game.round = 1;
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0, longRangeShots: 0 };
  return room;
}

test("Field Weld heals an allied unit's chosen location (D12 10+ = 2 SP)", () => {
  const room = twoAllyRoom();
  const ally = room.rigs[1];
  ally.hull.sp = 3; // below max 8
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  applyCommand(room, { verb: "action", name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 11 } }, {});
  assert.equal(ally.hull.sp, 5); // +2
  assert.equal(room.game.turn.actionsUsed, 1);
});

test("Field Weld requires the repair module and an ALLIED target", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["coolant", "recon"]; // no repair module
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  const before = room.rigs[1].hull.sp;
  const changed = applyCommand(room, { verb: "action", name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 11 } }, {});
  assert.equal(room.rigs[1].hull.sp, before); // no heal — module missing
  // Enemy target rejected even with the module:
  room.rigs[0].modules = ["repair", "recon"];
  room.rigs[1].owner = "b";
  room.rigs[1].hull.sp = 3;
  applyCommand(room, { verb: "action", name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 11 } }, {});
  assert.equal(room.rigs[1].hull.sp, 3); // enemy not healed
});
```

> Note: confirm the exact names of the room factory and command entry point while implementing (grep `export function createRoom` / `export function applyCommand` in `shared/game-state.js`). If `createRoom` needs different args, adjust `twoAllyRoom()` accordingly — the assertions are what matter.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `fieldweld` is not handled; ally SP unchanged.

- [ ] **Step 3: Add the Field Weld branch to `performAction`**

In `shared/game-state.js`, immediately after the `barrage` branch's closing `}` (line 1933) and before `if (act === "reload") {` (line 1934), insert:

```js
  if (act === "fieldweld") {
    // Repair module (spec: Support Units) — weld SP onto a friendly unit.
    if (!(rig.modules || []).includes("repair")) return false;
    const target = findRig(room, a.target);
    if (!target || target.owner !== rig.owner) return false;
    const roll = rollD(12, a.dice?.weld, random);
    const amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    const names = partNamesOf(kindOf(target));
    const loc = names.includes(String(a.loc || "").toLowerCase()) ? String(a.loc).toLowerCase() : names[0];
    if (amt > 0) repairRig(target, loc, amt);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "fieldweld", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} field-welds ${target.name} — rolled ${roll} → ${amt} SP to ${loc}`, effects: [],
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/support-units.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): Field Weld — repair a friendly unit"
```

---

### Task 5: Vent action (cool a friendly rig)

**Files:**
- Modify: `shared/game-state.js` — add a `vent` branch right after the `fieldweld` branch from Task 4
- Test: `shared/support-units.test.js`

Vent reuses `bumpHeat(target, -2)` (the same primitive as the Purge equipment active, `shared/game-state.js:1709`). Only Rigs carry heat, so the target must have `hasHeat`.

- [ ] **Step 1: Write the failing test**

Append to `shared/support-units.test.js`:

```js
import { makeRig } from "./game-state.js"; // rig factory, for a heat-bearing ally

test("Vent drops 2 heat off an allied rig; refuses cold targets", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["coolant", "recon"];
  const rig = makeRig(3, "HotRig", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.engine.heat = 5;
  room.rigs.push(rig);
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  applyCommand(room, { verb: "action", name: "Welder", action: "vent", target: "HotRig" }, {});
  assert.equal(rig.engine.heat, 3); // −2
  // Venting the cold tank ally is a no-op (no heat to vent, returns false):
  const changed = applyCommand(room, { verb: "action", name: "Welder", action: "vent", target: "Ally" }, {});
  assert.equal(room.game.turn.actionsUsed, 1); // second vent rejected, budget not spent
});
```

> Confirm `makeRig`'s signature while implementing (grep `export function makeRig` at `shared/game-state.js:587`). Adjust the loadout arg if needed; the heat assertion is the point.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `vent` unhandled; rig heat stays 5.

- [ ] **Step 3: Add the Vent branch**

In `shared/game-state.js`, immediately after the `fieldweld` branch's closing `}`, insert:

```js
  if (act === "vent") {
    // Coolant module (spec: Support Units) — vent 2 heat off a friendly Rig.
    if (!(rig.modules || []).includes("coolant")) return false;
    const target = findRig(room, a.target);
    if (!target || target.owner !== rig.owner) return false;
    if (!UNIT_KINDS[kindOf(target)]?.hasHeat) return false; // only Rigs run hot
    bumpHeat(target, -2);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "vent", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} vents 2 heat off ${target.name}.`, effects: [],
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/support-units.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): Vent — cool a friendly rig"
```

---

### Task 6: Paint action + expiry sweep

**Files:**
- Modify: `shared/game-state.js` — add a `paint` branch after `vent`; add a sweep in the `activate` verb (after line 2245)
- Test: `shared/support-units.test.js`

Paint writes `{ by, painterId }` onto the *enemy* target. The mark is swept when the painter next activates, implementing "until the painter's next activation."

- [ ] **Step 1: Write the failing test**

Append to `shared/support-units.test.js`:

```js
test("Paint marks an enemy; the mark records the painter and clears on the painter's next activation", () => {
  const room = twoAllyRoom();
  const enemy = makeUnit("tank", 3, "Foe", "b", { unit: "Tank Cannon" });
  room.rigs.push(enemy);
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  applyCommand(room, { verb: "action", name: "Welder", action: "paint", target: "Foe" }, {});
  assert.deepEqual(enemy.painted, { by: "a", painterId: 1 });
  assert.equal(room.game.turn.actionsUsed, 1);

  // End Welder's activation, reset the turn, and re-activate it — the mark clears.
  room.rigs[0].activated = false;
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0, longRangeShots: 0 };
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  assert.equal(enemy.painted, null);
});

test("Paint requires the recon module and refuses friendly targets", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["repair", "coolant"]; // no recon
  applyCommand(room, { verb: "activate", name: "Welder" }, {});
  applyCommand(room, { verb: "action", name: "Welder", action: "paint", target: "Ally" }, {});
  assert.equal(room.rigs[1].painted ?? null, null); // no module → no mark
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `paint` unhandled; `enemy.painted` stays null.

- [ ] **Step 3: Add the Paint branch**

In `shared/game-state.js`, immediately after the `vent` branch's closing `}`, insert:

```js
  if (act === "paint") {
    // Recon module (spec: Support Units) — mark an enemy so allied ranged attacks
    // ignore its cover and gain +1 Aim until this unit's next activation.
    if (!(rig.modules || []).includes("recon")) return false;
    const target = findRig(room, a.target);
    if (!target || target.owner === rig.owner) return false; // enemies only
    target.painted = { by: rig.owner, painterId: rig.id };
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "paint", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} paints ${target.name} — allied ranged attacks ignore its cover and gain +1 Aim until ${rig.name}'s next activation.`,
      effects: [],
    });
    return true;
  }
```

- [ ] **Step 4: Add the expiry sweep to the `activate` verb**

In `shared/game-state.js`, at line 2245 (`rig.hardened = false; ...`), directly after that line and before the `if (rig.skipNextActivation)` check, add:

```js
      // Recon paint (spec: Support Units) expires at the painter's next activation:
      // clear every mark this rig placed as it steps up again.
      for (const r of room.rigs) if (r.painted && r.painted.painterId === rig.id) r.painted = null;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test shared/support-units.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): Paint — mark an enemy for the gun line, clears next activation"
```

---

### Task 7: Paint affects allied ranged to-hit

**Files:**
- Modify: `shared/game-state.js:1539-1546` (`resolveFire` — build `opts.painted`)
- Modify: `shared/combat.js:38-49` (`computeModifiedAim` — cancel cover + +1 Aim)
- Test: `shared/combat.test.js`

A painted enemy is easier for its painter's allies to hit: cover is cancelled and Aim improves by 1, for **ranged** weapons only.

- [ ] **Step 1: Write the failing test**

Append to `shared/combat.test.js` (reuse its existing `test`/`assert`/`computeModifiedAim` imports; if absent, add `import { computeModifiedAim } from "./combat.js";`):

```js
test("painted target cancels cover and grants +1 Aim for ranged attacks", () => {
  const attacker = { weightClass: "medium", hull: { sp: 8 } };
  const ranged = { peak: 0, dropoff: 0, sweet: 6 }; // flat ACC 0
  const plain   = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2 });
  const painted = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2, painted: true });
  // cover 2 removed (+2 to accTotal) AND +1 Aim ⇒ modAim drops by 3.
  assert.equal(plain - painted, 3);
});

test("painted does not help melee weapons", () => {
  const attacker = { weightClass: "medium", hull: { sp: 8 } };
  const melee = { melee: true, acc: [0, 0] };
  const a = computeModifiedAim(attacker, melee, { distance: 2, cover: 0 });
  const b = computeModifiedAim(attacker, melee, { distance: 2, cover: 0, painted: true });
  assert.equal(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `painted` ignored; `plain - painted === 0`.

- [ ] **Step 3: Fold `painted` into `computeModifiedAim`**

`shared/combat.js:43` (cover line) — add `painted` to the bypass condition:

```js
  const cover = (profile.upgradeEffect?.ignoreCover || opts.guardBreak || (opts.painted && !profile.melee)) ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
```

Then, replace the `accTotal` line (`shared/combat.js:48`) with a paint-bonus version:

```js
  // Recon paint (spec: Support Units) — allied ranged fire on a marked enemy
  // gains +1 Aim on top of the cover cancel above.
  const paintBonus = (opts.painted && !profile.melee) ? 1 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty + paintBonus;
```

- [ ] **Step 4: Forward the flag from `resolveFire`**

`shared/game-state.js:1539-1546` — inside the `resolveAttack(room, rig, target, { ... }, ...)` opts literal, add a `painted` field (e.g. after the `engaged:` line at 1541):

```js
    engaged: rig.engagedWith != null,
    painted: !!(target.painted && target.painted.by === rig.owner),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/combat.test.js shared/support-units.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(units): painted enemies take +1 Aim and no cover from allied guns"
```

---

### Task 8: Surface module actions in the battle view-model

**Files:**
- Modify: `shared/battle-view.js` — in `availableActions`, after the Fire Control Lock block (after line 112, before `return list;`)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/battle-view.test.js` (reuse existing imports; else `import { availableActions } from "./battle-view.js";`):

```js
test("module actions appear only for units carrying the matching module", () => {
  const turn = { actionsUsed: 0, actionsMax: 3 };
  const welder = { kind: "walker", modules: ["repair", "recon"], loaded: { unit: true }, weapons: { unit: "Sidearm" } };
  const keys = availableActions(welder, turn, 1).map((a) => a.key);
  assert.ok(keys.includes("fieldweld"));
  assert.ok(keys.includes("paint"));
  assert.ok(!keys.includes("vent")); // no coolant module

  const plainTank = { kind: "tank", modules: [], loaded: { unit: true }, weapons: { unit: "Tank Cannon" } };
  const tankKeys = availableActions(plainTank, { actionsUsed: 0, actionsMax: 2 }, 1).map((a) => a.key);
  assert.ok(!tankKeys.includes("fieldweld") && !tankKeys.includes("vent") && !tankKeys.includes("paint"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — module keys absent.

- [ ] **Step 3: Push the module actions in `availableActions`**

In `shared/battle-view.js`, after the `hasFireControl` block closes (after line 112) and before `return list;` (line 113), add:

```js
  // Support-unit module actions (spec: Support Units) — surfaced per module held.
  const modules = rig.modules || [];
  if (modules.includes("repair")) {
    list.push({ key: "fieldweld", label: ACTIONS.fieldweld.label, heat: ACTIONS.fieldweld.heat,
      enabled: left > 0, cost: ACTIONS.fieldweld.slot, note: "" });
  }
  if (modules.includes("coolant")) {
    list.push({ key: "vent", label: ACTIONS.vent.label, heat: ACTIONS.vent.heat,
      enabled: left > 0, cost: ACTIONS.vent.slot, note: "" });
  }
  if (modules.includes("recon")) {
    list.push({ key: "paint", label: ACTIONS.paint.label, heat: ACTIONS.paint.heat,
      enabled: left > 0, cost: ACTIONS.paint.slot, note: "" });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "feat(units): surface module actions in the battle view-model"
```

---

### Task 9: Ship the four exemplars + generalize the seed handler

**Files:**
- Modify: `shared/game-state.js` — add `SUPPORT_UNITS` export (near `SEED_ROSTER`, ~line 105); generalize the `seed` verb loop (`:2173-2184`)
- Test: `shared/support-units.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/support-units.test.js`:

```js
import { SUPPORT_UNITS } from "./game-state.js";

test("SUPPORT_UNITS defines the four shipped exemplars", () => {
  const byName = Object.fromEntries(SUPPORT_UNITS.map((u) => [u.name, u]));
  assert.deepEqual(byName["Marksman Tank"].modules, ["damage", "recon"]);
  assert.equal(byName["Marksman Tank"].kind, "tank");
  assert.equal(byName["Marksman Tank"].unit, "Tank Cannon");
  assert.deepEqual(byName["Field Welder"].modules, ["repair", "recon"]);
  assert.equal(byName["Field Welder"].unit, undefined); // sidearm-only
});

test("seed builds support units from a custom roster with kind + modules", () => {
  const room = createRoom("seedtest");
  applyCommand(room, { verb: "seed", first: "a", roster: [
    { name: "Marksman Tank", owner: "a", kind: "tank", unit: "Tank Cannon", modules: ["damage", "recon"] },
    { name: "Depot Tank", owner: "b", kind: "tank", modules: ["repair", "coolant"] },
  ] }, {});
  const marks = room.rigs.find((r) => r.name === "Marksman Tank");
  const depot = room.rigs.find((r) => r.name === "Depot Tank");
  assert.equal(marks.weapons.unit, "Tank Cannon");
  assert.deepEqual(marks.modules, ["damage", "recon"]);
  assert.equal(depot.weapons.unit, "Sidearm");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/support-units.test.js`
Expected: FAIL — `SUPPORT_UNITS` undefined; seed handler forces `makeUnit("rig", …)` and drops non-rig entries.

- [ ] **Step 3: Export `SUPPORT_UNITS`**

In `shared/game-state.js`, after the `SEED_ROSTER` array (line 105), add:

```js
// The four shipped support-unit exemplars (spec: Support Units). Sidearm-only
// entries omit `unit` — makeUnit fits the Sidearm automatically.
export const SUPPORT_UNITS = [
  { name: "Marksman Tank",  owner: "a", kind: "tank",   unit: "Tank Cannon", modules: ["damage", "recon"] },
  { name: "Radiator Walker", owner: "a", kind: "walker", unit: "Coaxial MG",  modules: ["damage", "coolant"] },
  { name: "Field Welder",   owner: "b", kind: "walker", modules: ["repair", "recon"] },
  { name: "Depot Tank",     owner: "b", kind: "tank",   modules: ["repair", "coolant"] },
];
```

- [ ] **Step 4: Generalize the seed loop**

`shared/game-state.js:2173-2184` currently builds only rigs. Replace the `for (const entry of roster) { ... }` body with a kind-aware version:

```js
    for (const entry of roster) {
      const owner = normalizeSide(room, entry.owner) || "a";
      let unit;
      if (entry.kind === "tank" || entry.kind === "walker") {
        unit = makeUnit(entry.kind, room.nextRigId, entry.name, owner, {
          unit: entry.unit, modules: entry.modules,
        });
      } else {
        const pb = resolveChassis({ chassis: entry.chassis });
        if (!pb) continue;
        unit = makeUnit("rig", room.nextRigId, entry.name, owner, {
          weightClass: pb.class, longRange: pb.longRange, melee: pb.melee,
          chassis: pb.id, sp: pb.sp,
        });
      }
      if (!unit) continue;
      room.nextRigId++;
      room.rigs.push(unit);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/support-units.test.js shared/game-state.test.js`
Expected: PASS (default rig seed still works; custom rosters can seed support units).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/support-units.test.js
git commit -m "feat(units): ship four support exemplars + kind-aware seed"
```

---

### Task 10: Client loadout view-model

**Files:**
- Modify: `client/src/lib/loadout.ts` — `Loadout` interface (~lines 9-33) + `buildLoadout` (~line 74)
- Test: none new (typed helper; verified via LoadoutView in Task 11's preview)

- [ ] **Step 1: Read the current shapes**

Read `client/src/lib/loadout.ts:9-95` to see `Loadout`, `LoadoutWeapon`, and the `buildLoadout` flat/rig branch.

- [ ] **Step 2: Add `modules` + a sidearm marker to the `Loadout` interface**

In the `Loadout` interface, add:

```ts
  modules?: string[];   // support-unit role modules (spec: Support Units)
  isSidearm?: boolean;  // true when the single weapon is the built-in Sidearm
```

- [ ] **Step 3: Populate them in `buildLoadout`**

In the flat-pick branch of `buildLoadout` (where `rig.weapons.unit` is read), set:

```ts
    modules: Array.isArray(rig.modules) ? rig.modules : [],
    isSidearm: rig.weapons?.unit === "Sidearm",
```

(Keep the existing `flat`/`unit` weapon fields; these two are additive.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p client`
Expected: no new type errors from `loadout.ts`.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/loadout.ts
git commit -m "feat(units): expose modules + sidearm flag in client loadout"
```

---

### Task 11: Render sidearm + modules in LoadoutView

**Files:**
- Modify: `client/src/v2/components/LoadoutView.tsx` (~line 48, the `flat` branch)
- Verify: browser preview

- [ ] **Step 1: Read the component**

Read `client/src/v2/components/LoadoutView.tsx:1-80` — note `WeaponBlock` (line 15) and the `loadout.flat` branch (line 52).

- [ ] **Step 2: Render a modules row and label the sidearm**

In the `loadout.flat` branch, below the single `WeaponBlock`, add a modules line when present:

```tsx
{loadout.modules && loadout.modules.length > 0 && (
  <div className="loadout-modules">
    <span className="loadout-modules__label">Modules</span>
    {loadout.modules.map((m) => (
      <span key={m} className="loadout-module-chip">{m}</span>
    ))}
  </div>
)}
```

And, where the weapon name/title renders inside `WeaponBlock` for a flat unit, append a `(Sidearm)` hint when `loadout.isSidearm` — or pass `isSidearm` into `WeaponBlock` and render a small muted tag. Keep styling consistent with the existing loadout chips (reuse an existing chip class if one exists rather than inventing new CSS).

- [ ] **Step 3: Verify in the browser**

Use `preview_start` with the dev server (`.claude/launch.json`, or create it with `npm run dev` / the client port), seed a battle including support units (Task 9 roster via the seed hook), open a support unit's Loadout tab, and confirm the modules row + sidearm tag render. Take a screenshot.

If issues: read console via `read_console_messages`, fix `LoadoutView.tsx`, re-check.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/components/LoadoutView.tsx
git commit -m "feat(units): show sidearm + module chips in the loadout view"
```

---

### Task 12: Wire the three action buttons in ActionConsole

**Files:**
- Modify: `client/src/v2/battle/ActionConsole.tsx` — `ACTION_GLYPH` (~line 44), `onAction` routing (~lines 153-176)
- Verify: browser preview

The Support group (`⚙`, line 39) already catches unknown keys, so `fieldweld`/`vent`/`paint` render as buttons automatically once `availableActions` emits them (Task 8). This task adds glyphs and the click→command routing. `fieldweld`/`vent` need a friendly target; `paint` needs an enemy target.

- [ ] **Step 1: Read the routing**

Read `client/src/v2/battle/ActionConsole.tsx:139-200` — see how `onAction(key)` maps existing keys (esp. how `fire`/`lock` pick a target) to `send("action", { … })`.

- [ ] **Step 2: Add glyphs**

In `ACTION_GLYPH` add entries, e.g.:

```ts
  fieldweld: "🔧",
  vent: "❄️",
  paint: "🎯",
```

- [ ] **Step 3: Route the three keys in `onAction`**

Follow the same target-selection pattern the `fire`/`lock` cases use. For `fieldweld` and `vent`, open the target picker filtered to **friendly** units (same `side`); for `paint`, filter to **enemy** units. On confirm, dispatch:

```ts
send("action", { name: activeName, action: key, target: chosenTargetName, ...(key === "fieldweld" ? { loc: chosenLoc } : {}) });
```

Reuse the existing target-picker component/wizard the fire flow uses rather than building a new one; if the fire flow's picker can't filter by side, add a `side`/`ownerFilter` prop to it. `fieldweld` also needs a location choice — reuse the location picker the `aimed`/`repair` flows use.

- [ ] **Step 4: Verify in the browser**

With the dev server running and a support-unit battle seeded: activate the Field Welder, click **Field Weld**, pick a damaged ally + location, confirm SP rises. Click **Paint** on the Radiator Walker's target list, confirm an enemy gets a "painted" status chip (Task 8's `rigModifiers` may need a chip — see note) and that an allied ranged attack on it shows improved odds. Screenshot each.

> Optional polish: add a `painted` chip in `rigModifiers` (`shared/battle-view.js:126`) so the mark is visible on the target. Small, additive; include it here if the status isn't otherwise visible.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/ActionConsole.tsx shared/battle-view.js
git commit -m "feat(units): wire Field Weld / Vent / Paint action buttons"
```

---

### Task 13: Teach the roster-add protocol the support shape

**Files:**
- Modify: `server/prompt.js` — `TRACKER_PROTOCOL` add grammar (~lines 27-54) and `PLAYER_START_GUIDE` (~line 77)
- Test: none (prompt text); sanity-check the server boots

- [ ] **Step 1: Read the protocol**

Read `server/prompt.js:18-90` — the `kind="tank"`/`kind="walker"` add tags (lines 27-29) and the `UNIT_WEAPONS` vocabulary injection (line 53).

- [ ] **Step 2: Extend the add grammar**

Update the tank/walker add-tag description to document the optional `modules="damage,recon"` attribute (2 distinct of damage/repair/coolant/recon) and that omitting a Damage module means the unit carries the Sidearm. Add a one-line description of the three module actions (`field-weld`, `vent`, `paint`) so the narrator can describe them. Keep the wording terse and consistent with the surrounding protocol lines.

- [ ] **Step 3: Sanity-check the server starts**

Run: `node -e "import('./server/prompt.js').then(()=>console.log('ok'))"`
Expected: prints `ok` (module parses, no syntax error).

- [ ] **Step 4: Commit**

```bash
git add server/prompt.js
git commit -m "docs(units): teach the add protocol the support-unit shape"
```

---

### Task 14: Full suite + wrap-up

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — Vitest (client) + `node --test` (all `shared/**` and `server/**`), including the new `shared/support-units.test.js` and the added assertions in `combat`/`rules`/`battle-view`.

- [ ] **Step 2: If anything fails, fix at the source and re-run**

Do not edit tests to pass — diagnose the engine/client change. Re-run the failing file with `node --test shared/<file>.test.js` until green, then `npm test` again.

- [ ] **Step 3: Update `rules.md` §17 with the support-unit rules**

Add a "Support Units" subsection under §17 documenting: the sidearm profile, the four modules, the two-distinct-modules rule, and the four exemplars. This keeps the single-source-of-truth ruleset in sync with the engine. Commit:

```bash
git add rules.md
git commit -m "docs: rules §17 — support units (sidearm + modules)"
```

---

## Notes for the implementer

- **Geometry is player-adjudicated.** The engine simulates no board position — `arc`, `cover`, `distance`, and "within 2\"" reach are all caller-supplied inputs (see `resolveFire`). Field Weld / Vent therefore do **not** verify adjacency; the players are trusted to only weld/vent a unit that is actually in reach, exactly as the existing melee/attack flows trust `a.arc`/`a.distance`.
- **`painted` on the defender vs. the attacker.** The existing Fire Control Lock stores its paint on the *attacker* and keys one weapon. The Recon mark must benefit *any* allied attacker, so it lives on the *defender* (like `cracked`), storing the painting side (`by`) and the painter's id (`painterId`) for expiry.
- **Cold units and heat.** `bumpHeat(rig, 0)` on a tank/walker is a safe no-op (the cold-kind power part carries `heat: 0`); the three verbs are registered `heat: 0` so they never touch the overheat path.
- **Regression net.** The existing `shared/*.test.js` suite is the guard that the Rig and plain Tank/Walker behavior is byte-for-byte unchanged — run it after every engine task.
