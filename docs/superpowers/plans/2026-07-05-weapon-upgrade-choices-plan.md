# Weapon Upgrade Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed weapon-upgrade tags with one selected upgrade per equipped weapon, store that selection on each Rig, and make the selected upgrade alter combat behavior.

**Architecture:** `shared/game-state.js` remains the source for weapon and upgrade catalogues, Rig creation, legacy-state backfill, and battle-state mutation. `shared/combat.js` continues to stay pure by receiving an effective weapon profile through `ctx.profileFor(slot, name, attacker)` and mutating only through injected callbacks. The client wizard sends selected upgrade ids in the existing `add` command, and the tracker renders selected upgrades from authoritative Rig state.

**Tech Stack:** Node.js ESM, built-in `node:test`, browser ES modules, Express/WebSocket server, Markdown rulebook loaded by Gemma.

## Global Constraints

- Do not create branches.
- Use the same HEAD and worktree the user is already using.
- Work directly on the current checkout; if it is not `main`, report that before committing rather than switching branches.
- Commit every significant change so the user can inspect the git history.
- Every rule added to `shared/rules.js` should be reflected in `rules.md`; this plan does not add rule constants to `shared/rules.js`, but it does change gameplay rules and must update `rules.md`.
- Preserve existing Rig creation commands by defaulting missing weapon-upgrade ids to the first valid upgrade for each selected weapon.
- Keep exactly two upgrade options per weapon and exactly one selected upgrade per equipped weapon.
- Do not add a points system, post-commission editing, or automated distance/line-of-sight measurement.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/game-state.js` | Upgrade catalogue ids/effects, upgrade normalization, Rig `weaponUpgrades` storage/backfill, effective profile generation, Systems Overload activation penalty, Sunder max-SP mutation helper exposed through combat context. |
| `shared/game-state.test.js` | Rig data-model tests, add-command pass-through tests, legacy backfill tests, stateful upgrade effect tests. |
| `shared/combat.js` | Consume effective profiles, apply profile-level upgrade effects during aim/to-hit/STR/impact/on-hit resolution. |
| `shared/combat.test.js` | Pure combat tests for ROF/heat, perk-gain, STR, cover, reroll, far-penalty, and range profile effects. |
| `public/js/rig-wizard.js` | Select one upgrade per weapon during commission and include selected ids in the `add` command. |
| `public/css/rig-wizard.css` | Style selectable upgrade cards using the existing wizard visual language. |
| `public/js/tracker.js` | Render selected upgrade names instead of both possible upgrades. |
| `rules.md` | Canonical rulebook text for selectable weapon upgrades and their effects. |

---

### Task 1: Upgrade Catalogue, Normalization, and Rig Storage

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

**Interfaces:**
- Produces: `normalizeWeaponUpgrade(weaponName: string, upgradeId: string | null | undefined): string | null`
- Produces: `upgradeForWeapon(weaponName: string, upgradeId: string | null | undefined): object | null`
- Produces: `defaultWeaponUpgrade(weaponName: string): string | null`
- Produces Rig field: `weaponUpgrades: { longRange: string | null, melee: string | null }`
- Consumes existing: `WEAPON_UPGRADES`, `makeRig`, `applyCommand`, `findRig`

- [ ] **Step 1: Add failing tests for upgrade ids and Rig storage**

Append these tests near the existing `WEAPON_UPGRADES` tests in `shared/game-state.test.js`. Update the import list to include `normalizeWeaponUpgrade`, `upgradeForWeapon`, and `defaultWeaponUpgrade`.

```js
test("WEAPON_UPGRADES has stable ids and effect objects for every option", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(ups.length, 2, `${name} must have exactly 2 upgrades`);
    const ids = new Set();
    for (const u of ups) {
      assert.equal(typeof u.id, "string", `${name} upgrade missing id`);
      assert.equal(u.id.length > 0, true, `${name} upgrade id empty`);
      assert.equal(ids.has(u.id), false, `${name} duplicate upgrade id ${u.id}`);
      ids.add(u.id);
      assert.equal(typeof u.effect, "object", `${name} ${u.id} missing effect`);
      assert.equal(u.effect != null, true, `${name} ${u.id} missing effect`);
    }
  }
});

test("normalizeWeaponUpgrade resolves valid ids and defaults missing/invalid selections", () => {
  assert.equal(defaultWeaponUpgrade("Mini Gun"), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "suppressive-fire"), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", ""), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "not-real"), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Not A Weapon", "extended-belt"), null);
  assert.equal(upgradeForWeapon("Mini Gun", "suppressive-fire").name, "Suppressive Fire");
});

test("makeRig stores default and explicit selected weapon upgrades", () => {
  const fallback = makeRig(1, "Warden", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  assert.deepEqual(fallback.weaponUpgrades, { longRange: "extended-belt", melee: "duelist-balance" });

  const explicit = makeRig(2, "Reaver", "medium", "a", {
    longRange: "Mini Gun",
    melee: "Sword",
    longRangeUpgrade: "suppressive-fire",
    meleeUpgrade: "keen-edge",
  });
  assert.deepEqual(explicit.weaponUpgrades, { longRange: "suppressive-fire", melee: "keen-edge" });
});

test("add command passes selected weapon upgrades through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: {
    name: "Chooser", class: "medium", owner: "a",
    lr: "Autocannon", melee: "Claw",
    longRangeUpgrade: "depleted-core",
    meleeUpgrade: "rending-talons",
  } });
  const rig = findRig(r, "Chooser");
  assert.deepEqual(rig.weaponUpgrades, { longRange: "depleted-core", melee: "rending-talons" });
});

test("ensureRigShape backfills selected weapon upgrades on legacy rig objects", () => {
  const legacy = { code: "L", version: 0, nextRigId: 2, game: { round: 1, started: false },
    rigs: [{ id: 1, name: "Old", weightClass: "light", owner: "a",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      weapons:{longRange:"Double MG",melee:"Chainsaw"}, destroyed:false }] };
  applyCommand(legacy, { verb: "nonsense", attrs: {} });
  assert.deepEqual(legacy.rigs[0].weaponUpgrades, { longRange: "tracer-rounds", melee: "high-rev-motor" });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test shared/game-state.test.js`

Expected: FAIL with missing exports such as `normalizeWeaponUpgrade` or missing `id` / `effect` fields on `WEAPON_UPGRADES`.

- [ ] **Step 3: Add ids/effects and normalization helpers**

In `shared/game-state.js`, replace `WEAPON_UPGRADES` with entries in this exact shape. Keep the existing names and tags where possible.

```js
export const WEAPON_UPGRADES = {
  "Mini Gun": [
    { id: "extended-belt", name: "Extended Belt", tag: "+2 ROF; dice showing 1 add heat", effect: { rof: 2, heatOnOnes: true } },
    { id: "suppressive-fire", name: "Suppressive Fire", tag: "Gains Shock", effect: { perks: ["Shock"] } },
  ],
  "Double MG": [
    { id: "tracer-rounds", name: "Tracer Rounds", tag: "Gains Incendiary", effect: { perks: ["Incendiary"] } },
    { id: "gyro-mount", name: "Gyro Mount", tag: "Reroll one missed to-hit die", effect: { rerollMisses: 1 } },
  ],
  "Autocannon": [
    { id: "ap-shells", name: "AP Shells", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "depleted-core", name: "Depleted Core", tag: "+2 STR", effect: { str: 2 } },
  ],
  "Arc Gun": [
    { id: "systems-overload", name: "Systems Overload", tag: "On hit: target loses 1 action next activation", effect: { onHit: "systems-overload" } },
    { id: "ion-burn", name: "Ion Burn", tag: "Gains Incendiary", effect: { perks: ["Incendiary"] } },
  ],
  "Mortar": [
    { id: "airburst-fuze", name: "Airburst Fuze", tag: "Ignores cover", effect: { ignoreCover: true } },
    { id: "cluster-shells", name: "Cluster Shells", tag: "On hit: 1 SP to a second random location", effect: { onHit: "cluster-shells" } },
  ],
  "Sniper Cannon": [
    { id: "match-barrel", name: "Match Barrel", tag: "No far-range penalty", effect: { noFarPenalty: true } },
    { id: "marksman-optics", name: "Marksman Optics", tag: "Gains Precision", effect: { perks: ["Precision"] } },
  ],
  "Sword": [
    { id: "duelist-balance", name: "Duelist's Balance", tag: "Gains Precision", effect: { perks: ["Precision"] } },
    { id: "keen-edge", name: "Keen Edge", tag: "Gains Rend", effect: { perks: ["Rend"] } },
  ],
  "Circular Saw": [
    { id: "tempered-teeth", name: "Tempered Teeth", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "sunder", name: "Sunder", tag: "On damaging hit: -1 max SP to struck location", effect: { onDamage: "sunder" } },
  ],
  "Chainsaw": [
    { id: "high-rev-motor", name: "High-Rev Motor", tag: "+2 STR; +1 heat per attack", effect: { str: 2, heat: 1 } },
    { id: "ripper-teeth", name: "Ripper Teeth", tag: "Gains Rend", effect: { perks: ["Rend"] } },
  ],
  "Claw": [
    { id: "vice-grip", name: "Vice Grip", tag: "Gains Impale", effect: { perks: ["Impale"] } },
    { id: "rending-talons", name: "Rending Talons", tag: "Gains Rend", effect: { perks: ["Rend"] } },
  ],
  "Lance": [
    { id: "couched-reach", name: "Couched Reach", tag: "+1 inch melee reach", effect: { range: 1 } },
    { id: "spearpoint", name: "Spearpoint", tag: "Gains Impale", effect: { perks: ["Impale"] } },
  ],
  "Wrecking Ball": [
    { id: "haymaker", name: "Haymaker", tag: "+3 STR", effect: { str: 3 } },
    { id: "wrecking-momentum", name: "Wrecking Momentum", tag: "Gains Staggering", effect: { perks: ["Staggering"] } },
  ],
};

export function defaultWeaponUpgrade(weaponName) {
  const upgrades = WEAPON_UPGRADES[weaponName];
  return Array.isArray(upgrades) && upgrades.length ? upgrades[0].id : null;
}

export function normalizeWeaponUpgrade(weaponName, upgradeId) {
  const upgrades = WEAPON_UPGRADES[weaponName];
  if (!Array.isArray(upgrades) || upgrades.length === 0) return null;
  const ref = String(upgradeId || "").trim().toLowerCase();
  return upgrades.find((u) => u.id.toLowerCase() === ref)?.id || upgrades[0].id;
}

export function upgradeForWeapon(weaponName, upgradeId) {
  const normalized = normalizeWeaponUpgrade(weaponName, upgradeId);
  return (WEAPON_UPGRADES[weaponName] || []).find((u) => u.id === normalized) || null;
}
```

- [ ] **Step 4: Store and backfill `weaponUpgrades`**

In `ensureRigShape`, after the existing equipment/hardened defaults, add:

```js
  if (!rig.weaponUpgrades || typeof rig.weaponUpgrades !== "object") rig.weaponUpgrades = {};
  rig.weaponUpgrades.longRange = normalizeWeaponUpgrade(rig.weapons?.longRange, rig.weaponUpgrades.longRange);
  rig.weaponUpgrades.melee = normalizeWeaponUpgrade(rig.weapons?.melee, rig.weaponUpgrades.melee);
```

In `makeRig`, before building the return object, add:

```js
  const weaponUpgrades = {
    longRange: normalizeWeaponUpgrade(longRange, weapons.longRangeUpgrade || weapons.lrUpgrade),
    melee: normalizeWeaponUpgrade(melee, weapons.meleeUpgrade),
  };
```

Then add this field in the returned Rig object immediately after `weapons`:

```js
    weaponUpgrades,
```

In the `add` verb, keep passing `a` to `makeRig`; no new command routing is needed because `makeRig(..., a, a.equipment)` receives `longRangeUpgrade`, `lrUpgrade`, and `meleeUpgrade` from attrs.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `node --test shared/game-state.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add shared/game-state.js shared/game-state.test.js
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "feat: store selected weapon upgrades"
```

---

### Task 2: Effective Weapon Profiles and Pure Combat Modifiers

**Files:**
- Modify: `shared/game-state.js`
- Modify: `shared/combat.js`
- Test: `shared/combat.test.js`

**Interfaces:**
- Consumes: `rig.weaponUpgrades`, `upgradeForWeapon`
- Produces: `effectiveWeaponProfile(slot: "longRange" | "melee", weaponName: string, rig: object): object | null`
- Changes combat context signature: `ctx.profileFor(slot, weaponName, attacker)`
- Effective profile fields: base `rof`, `str`, `acc`, `rng`, `perks`, plus `upgrade`, `upgradeEffect`

- [ ] **Step 1: Add failing pure combat tests for profile-level upgrade effects**

Update the imports in `shared/combat.test.js`:

```js
import { WEAPONS, makeRig, effectiveWeaponProfile } from "./game-state.js";
```

Append these tests:

```js
test("effectiveWeaponProfile applies selected ROF, STR, perk, range, and far-penalty upgrades", () => {
  const mini = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  assert.equal(effectiveWeaponProfile("longRange", "Mini Gun", mini).rof, 10);

  const auto = makeRig(2, "Core", "medium", "a", { longRange: "Autocannon", melee: "Sword", longRangeUpgrade: "depleted-core" });
  assert.equal(computeStr(auto, effectiveWeaponProfile("longRange", "Autocannon", auto), {}), 10);

  const sword = makeRig(3, "Edge", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "keen-edge" });
  assert.equal(effectiveWeaponProfile("melee", "Sword", sword).perks.includes("Rend"), true);

  const lance = makeRig(4, "Reach", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "couched-reach" });
  assert.deepEqual(effectiveWeaponProfile("melee", "Lance", lance).rng, [2.5, 2.5]);

  const sniper = makeRig(5, "Barrel", "medium", "a", { longRange: "Sniper Cannon", melee: "Sword", longRangeUpgrade: "match-barrel" });
  assert.deepEqual(effectiveWeaponProfile("longRange", "Sniper Cannon", sniper).acc, [0, 0]);
});

test("rollToHit uses selected upgrade heat-on-ones and one missed-die reroll", () => {
  const beltRig = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  const belt = effectiveWeaponProfile("longRange", "Mini Gun", beltRig);
  const beltRoll = rollToHit(beltRig, belt, { range: "near", cover: 0 }, [1,1,2,2,3,3,4,4,5,6], () => 0);
  assert.equal(beltRoll.rof, 10);
  assert.equal(beltRoll.fireModeHeat, 2);

  const gyroRig = makeRig(2, "Gyro", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "gyro-mount" });
  const gyro = effectiveWeaponProfile("longRange", "Double MG", gyroRig);
  const gyroRoll = rollToHit(gyroRig, gyro, { range: "near", cover: 0 }, [1,1,1,1,1,1,1,1], () => 1);
  assert.equal(gyroRoll.hits, 1);
});

test("computeModifiedAim ignores cover when Airburst Fuze is selected", () => {
  const mortarRig = makeRig(1, "Airburst", "medium", "a", { longRange: "Mortar", melee: "Sword", longRangeUpgrade: "airburst-fuze" });
  const mortar = effectiveWeaponProfile("longRange", "Mortar", mortarRig);
  assert.equal(computeModifiedAim(mortarRig, mortar, { range: "near", cover: 2 }), 5);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test shared/combat.test.js`

Expected: FAIL because `effectiveWeaponProfile` is not exported or does not apply upgrade effects yet.

- [ ] **Step 3: Add `effectiveWeaponProfile` in `shared/game-state.js`**

Add this helper after `upgradeForWeapon`:

```js
function uniquePerks(base, added = []) {
  return [...new Set([...(base || []), ...(added || [])])];
}

export function effectiveWeaponProfile(slot, weaponName, rig) {
  const base = WEAPONS[slot]?.[weaponName];
  if (!base) return null;
  const upgrade = upgradeForWeapon(weaponName, rig?.weaponUpgrades?.[slot]);
  const effect = upgrade?.effect || {};
  const profile = {
    ...base,
    rof: base.rof + (effect.rof || 0),
    str: base.str + (effect.str || 0),
    acc: [...base.acc],
    rng: [...base.rng],
    perks: uniquePerks(base.perks, effect.perks),
    upgrade: upgrade || null,
    upgradeEffect: effect,
  };
  if (effect.noFarPenalty) profile.acc[1] = Math.max(profile.acc[1] || 0, profile.acc[0] || 0);
  if (effect.range) profile.rng = profile.rng.map((n) => n + effect.range);
  return profile;
}
```

In `combatCtx()`, change `profileFor` to:

```js
    profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker),
```

Add `effectiveWeaponProfile` to the existing `shared/game-state.js` self-import scope directly; no new import is needed because `combatCtx` is in the same file.

- [ ] **Step 4: Update `shared/combat.js` to consume effective profiles**

In `resolveAttack`, change:

```js
  const profile = ctx.profileFor(slot, weaponName);
```

to:

```js
  const profile = ctx.profileFor(slot, weaponName, attacker);
```

In `computeModifiedAim`, replace the `cover` line with:

```js
  const cover = profile.upgradeEffect?.ignoreCover ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
```

In `rollToHit`, replace the fire-mode and loop setup with:

```js
  const fullAuto = opts.fullAuto && profile.perks.includes("Full Auto");
  const rof = profile.rof + (fullAuto ? 2 : 0);
  const charged = opts.charged && profile.perks.includes("Charged Shot");
  const heatOnOnes = fullAuto || charged || profile.upgradeEffect?.heatOnOnes;
  const rerolls = Math.max(0, Math.floor(profile.upgradeEffect?.rerollMisses || 0));
  const dice = [];
  let hits = 0;
  let fireModeHeat = 0;
  let rerollsUsed = 0;
  for (let i = 0; i < rof; i++) {
    let d = rollD(6, providedDice?.[i], random);
    let hit = d >= modAim || d === 6;
    if (!hit && rerollsUsed < rerolls) {
      rerollsUsed += 1;
      d = rollD(6, providedDice?.rerolls?.[rerollsUsed - 1], random);
      hit = d >= modAim || d === 6;
    }
    dice.push(d);
    if (hit) hits += 1;
    if (heatOnOnes && d === 1) fireModeHeat += 1;
  }
  return { modAim, rof, hits, fireModeHeat, dice };
```

Keep the function signature unchanged.

- [ ] **Step 5: Run pure combat tests to verify GREEN**

Run: `node --test shared/combat.test.js`

Expected: PASS.

- [ ] **Step 6: Run game-state tests for regression coverage**

Run: `node --test shared/game-state.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add shared/game-state.js shared/combat.js shared/combat.test.js
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "feat: apply weapon upgrade profile effects"
```

---

### Task 3: Stateful Upgrade Effects in Combat Resolution

**Files:**
- Modify: `shared/game-state.js`
- Modify: `shared/combat.js`
- Test: `shared/game-state.test.js`

**Interfaces:**
- Consumes: effective profile `upgradeEffect.onHit`, `upgradeEffect.onDamage`, `upgradeEffect.heat`
- Produces Rig field: `actionPenaltyNextActivation: number`
- Produces combat context function: `sunderLocation(target, loc)`
- Behavior: Systems Overload sets `target.actionPenaltyNextActivation = Math.max(current, 1)` on hit.
- Behavior: Sunder reduces the struck component's `max` by 1 once per attack if the attack dealt SP, never below 1, and clamps `sp` to `max`.

- [ ] **Step 1: Add failing tests for Systems Overload, Sunder, and upgrade heat**

Append these tests to `shared/game-state.test.js` near existing combat action tests:

```js
test("Systems Overload reduces the target's next activation budget by 1 and then clears", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Arc Gun";
  b1.weaponUpgrades.longRange = "systems-overload";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 1], impacts: [1], location: 1 },
  } });
  assert.equal(findRig(r, "a1").actionPenaltyNextActivation, 1);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.actionsMax, 4);
  assert.equal(findRig(r, "a1").actionPenaltyNextActivation, 0);
});

test("Sunder reduces the struck location max SP once when the selected upgrade deals damage", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Circular Saw";
  b1.weaponUpgrades.melee = "sunder";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6, 6], impacts: [6, 6, 6], location: 1 },
  } });
  assert.equal(a1.hull.max, 5);
  assert.equal(a1.hull.sp <= a1.hull.max, true);
});

test("High-Rev Motor adds attack heat in addition to base fire heat", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Chainsaw";
  b1.weaponUpgrades.melee = "high-rev-motor";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1] },
  } });
  assert.equal(b1.engine.heat, 2);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test shared/game-state.test.js`

Expected: FAIL because `actionPenaltyNextActivation` is not implemented, Sunder does not reduce max SP, and High-Rev Motor heat is not applied.

- [ ] **Step 3: Add state defaults and activation penalty**

In `ensureRigShape`, add:

```js
  if (typeof rig.actionPenaltyNextActivation !== "number") rig.actionPenaltyNextActivation = 0;
```

In `makeRig`, add the field near the other state booleans:

```js
    actionPenaltyNextActivation: 0,
```

In the `activate` verb, replace:

```js
        t.actionsMax = 5 - (rig.hull.sp === 0 ? 2 : 0);
```

with:

```js
        const penalty = Math.max(0, Math.floor(rig.actionPenaltyNextActivation || 0));
        t.actionsMax = Math.max(0, 5 - (rig.hull.sp === 0 ? 2 : 0) - penalty);
        rig.actionPenaltyNextActivation = 0;
```

- [ ] **Step 4: Add Sunder context function**

In `shared/game-state.js`, add this helper near `repairRig`:

```js
function sunderLocation(target, loc) {
  const c = target?.[loc];
  if (!c || c.max <= 1) return false;
  c.max = Math.max(1, c.max - 1);
  c.sp = Math.min(c.sp, c.max);
  recompute(target);
  return true;
}
```

In `combatCtx()`, add:

```js
    sunderLocation,
```

- [ ] **Step 5: Apply stateful upgrade effects in `shared/combat.js`**

In `resolveAttack`, change the heat line:

```js
  const heat = (profile.perks.includes("Hot") ? 1 : 0) + th.fireModeHeat;
```

to:

```js
  const heat = (profile.perks.includes("Hot") ? 1 : 0) + th.fireModeHeat + (profile.upgradeEffect?.heat || 0);
```

After applying damage from impacts, add:

```js
    if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
      ctx.sunderLocation?.(target, location);
    }
```

In `applyOnHitPerks`, after the existing perk effects and before the `if (effects.length)` block, add:

```js
  const onHit = profile.upgradeEffect?.onHit;
  if (onHit === "systems-overload") {
    target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    effects.push("Systems Overload - target loses 1 action next activation");
  }
  if (onHit === "cluster-shells") {
    const primary = opts.aimed ? opts.aimedLoc : null;
    const locs = ["hull", "arms", "legs", "engine"];
    let loc = hitLocation(rollD(12, opts.dice?.clusterLocation, random));
    if (primary && loc === primary) loc = locs[(locs.indexOf(loc) + 1) % locs.length];
    ctx.applyDamage(room, target, loc, 1, { random, dice: opts.dice });
    effects.push(`Cluster Shells - 1 SP to ${loc}`);
  }
```

- [ ] **Step 6: Run tests to verify GREEN**

Run: `node --test shared/game-state.test.js shared/combat.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add shared/game-state.js shared/combat.js shared/game-state.test.js
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "feat: resolve stateful weapon upgrade effects"
```

---

### Task 4: Commission Wizard Upgrade Choices and Tracker Display

**Files:**
- Modify: `public/js/rig-wizard.js`
- Modify: `public/css/rig-wizard.css`
- Modify: `public/js/tracker.js`

**Interfaces:**
- Consumes: `WEAPON_UPGRADES[weaponName]` entries with `{ id, name, tag }`
- Consumes: Rig `weaponUpgrades.longRange` and `weaponUpgrades.melee`
- Produces add-command attrs: `longRangeUpgrade`, `meleeUpgrade`

- [ ] **Step 1: Replace read-only upgrade tags with selectable cards**

In `public/js/rig-wizard.js`, replace `upgradeTags(name)` with:

```js
function firstUpgradeId(name) {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}

function upgradeChoices(name, selected, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "rw-upgrade-choices";
  for (const u of WEAPON_UPGRADES[name] || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rw-upgrade-choice" + (u.id === selected ? " sel" : "");
    btn.title = u.tag;
    btn.innerHTML = `<span>${u.name}</span><small>${u.tag}</small>`;
    btn.addEventListener("click", () => onSelect(u.id));
    wrap.appendChild(btn);
  }
  return wrap;
}
```

In `openRigWizard`, add selected-upgrade defaults to `state`:

```js
    longRangeUpgrade: firstUpgradeId(Object.keys(WEAPONS.longRange)[0]),
    meleeUpgrade: firstUpgradeId(Object.keys(WEAPONS.melee)[0]),
```

In `stepWeapons`, replace the Long Range selector block with:

```js
  body.appendChild(field("Long range weapon",
    select(Object.keys(WEAPONS.longRange), state.longRange, (v) => {
      state.longRange = v;
      state.longRangeUpgrade = firstUpgradeId(v);
      render(card, state);
    })));
  body.appendChild(upgradeChoices(state.longRange, state.longRangeUpgrade, (id) => {
    state.longRangeUpgrade = id;
    render(card, state);
  }));
```

Replace the Melee selector block with:

```js
  body.appendChild(field("Melee weapon",
    select(Object.keys(WEAPONS.melee), state.melee, (v) => {
      state.melee = v;
      state.meleeUpgrade = firstUpgradeId(v);
      render(card, state);
    })));
  body.appendChild(upgradeChoices(state.melee, state.meleeUpgrade, (id) => {
    state.meleeUpgrade = id;
    render(card, state);
  }));
```

Replace the hint text with:

```js
  hint.textContent = "Choose one upgrade for each weapon. The selected upgrade changes how that weapon works.";
```

In `stepConfirm`, replace the weapon row with:

```js
  const lrUpgrade = (WEAPON_UPGRADES[state.longRange] || []).find((u) => u.id === state.longRangeUpgrade);
  const meleeUpgrade = (WEAPON_UPGRADES[state.melee] || []).find((u) => u.id === state.meleeUpgrade);
  body.insertAdjacentHTML("beforeend", `
    <div class="rw-confirm-row">${state.longRange} - ${lrUpgrade?.name || "Upgrade ?"}</div>
    <div class="rw-confirm-row">${state.melee} - ${meleeUpgrade?.name || "Upgrade ?"}</div>
    <div class="rw-confirm-row">${e.label} - ${e.passive}</div>
  `);
```

In `submit`, include the selected ids:

```js
    longRangeUpgrade: state.longRangeUpgrade,
    meleeUpgrade: state.meleeUpgrade,
```

- [ ] **Step 2: Update wizard CSS**

In `public/css/rig-wizard.css`, replace `.rw-upgrades` and `.rw-upgrade-tag` rules with:

```css
.rw-upgrade-choices { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; margin-top: -.25rem; }
.rw-upgrade-choice {
  text-align: left; border: 1px solid var(--line); border-radius: 10px;
  background: var(--iron-800); color: var(--txt); padding: .5rem .55rem;
  cursor: pointer; min-height: 4.1rem;
}
.rw-upgrade-choice:hover { border-color: var(--rivet); }
.rw-upgrade-choice.sel {
  border-color: var(--oil); background: rgba(231,154,61,.08);
  box-shadow: 0 0 0 1px rgba(231,154,61,.35);
}
.rw-upgrade-choice span {
  display: block; font-family: var(--font-display); font-weight: 700; font-size: .86rem;
}
.rw-upgrade-choice small {
  display: block; margin-top: .22rem; font-size: .68rem; line-height: 1.25; color: var(--txt-dim);
}
```

- [ ] **Step 3: Render selected upgrades in tracker**

In `public/js/tracker.js`, replace:

```js
    const lrUpgrades = (WEAPON_UPGRADES[rig.weapons.longRange] || []).map((u) => u.name).join(", ");
    const meleeUpgrades = (WEAPON_UPGRADES[rig.weapons.melee] || []).map((u) => u.name).join(", ");
    weapons.textContent = `${rig.weapons.longRange || "Long Range ?"} (${lrUpgrades}) / ${rig.weapons.melee || "Melee ?"} (${meleeUpgrades})`;
```

with:

```js
    const lrUpgrade = (WEAPON_UPGRADES[rig.weapons.longRange] || []).find((u) => u.id === rig.weaponUpgrades?.longRange);
    const meleeUpgrade = (WEAPON_UPGRADES[rig.weapons.melee] || []).find((u) => u.id === rig.weaponUpgrades?.melee);
    weapons.textContent = `${rig.weapons.longRange || "Long Range ?"} (${lrUpgrade?.name || "Upgrade ?"}) / ${rig.weapons.melee || "Melee ?"} (${meleeUpgrade?.name || "Upgrade ?"})`;
```

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`

Expected: server starts and prints the local URL.

Open the app, commission a Rig, and verify:

- Weapons step shows two selectable upgrade cards under each weapon.
- Changing Long Range resets only `state.longRangeUpgrade`.
- Changing Melee resets only `state.meleeUpgrade`.
- Confirm step lists one selected upgrade per weapon.
- After commissioning, the Rig accordion shows one selected upgrade per weapon.

- [ ] **Step 5: Commit Task 4**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add public/js/rig-wizard.js public/css/rig-wizard.css public/js/tracker.js
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "feat: choose weapon upgrades in commission wizard"
```

---

### Task 5: Rulebook Sync

**Files:**
- Modify: `rules.md`

**Interfaces:**
- Consumes: upgrade ids/effects from `shared/game-state.js`
- Produces: Gemma-readable rulebook text for selectable weapon upgrades

- [ ] **Step 1: Update Building a Squadron text**

In `rules.md` section `3. Building a Squadron`, after the bullet that says every Rig must carry one Long Range and one Melee weapon, add:

```markdown
   - Each equipped weapon has **two upgrade options**. Choose **one** upgrade for the Long Range weapon and **one** upgrade for the Melee weapon when the Rig is commissioned. A selected upgrade modifies only that weapon.
```

- [ ] **Step 2: Add weapon-upgrade table after Melee Weapons**

In `rules.md`, after the Melee Weapons table in section 12, add:

```markdown
### Weapon Upgrades

Each weapon has **two upgrade options**. When a Rig is commissioned, choose **one** upgrade for each equipped weapon. The selected upgrade changes only that weapon.

| Weapon | Upgrade Option A | Upgrade Option B |
|---|---|---|
| Mini Gun | **Extended Belt:** +2 ROF; attack dice showing 1 add 1 heat | **Suppressive Fire:** gains Shock |
| Double MG | **Tracer Rounds:** gains Incendiary | **Gyro Mount:** reroll one missed to-hit die |
| Autocannon | **AP Shells:** gains Armour Piercing | **Depleted Core:** +2 STR |
| Arc Gun | **Systems Overload:** on hit, target loses 1 action on its next activation | **Ion Burn:** gains Incendiary |
| Mortar | **Airburst Fuze:** ignores cover | **Cluster Shells:** on hit, deal 1 SP to a second random location on the target |
| Sniper Cannon | **Match Barrel:** no far-range ACC penalty | **Marksman Optics:** gains Precision |
| Sword | **Duelist's Balance:** gains Precision | **Keen Edge:** gains Rend |
| Circular Saw | **Tempered Teeth:** gains Armour Piercing | **Sunder:** once per damaging attack, the struck location's max SP is reduced by 1, to a minimum of 1 |
| Chainsaw | **High-Rev Motor:** +2 STR; attacking adds +1 heat | **Ripper Teeth:** gains Rend |
| Claw | **Vice Grip:** gains Impale | **Rending Talons:** gains Rend |
| Lance | **Couched Reach:** melee range increases by 1" | **Spearpoint:** gains Impale |
| Wrecking Ball | **Haymaker:** +3 STR | **Wrecking Momentum:** gains Staggering |
```

- [ ] **Step 3: Remove obsolete fixed-upgrade note**

In section `15. Equipment`, delete the blockquote that begins with `Weapon customization (fixed signature upgrades per weapon)` and describes the old display-only catalogue.

- [ ] **Step 4: Commit Task 5**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add rules.md
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "docs: document selectable weapon upgrades"
```

---

### Task 6: Full Verification and Cleanup

**Files:**
- Verify only unless failures require fixes in files touched by Tasks 1-5.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified branch/worktree status and no unstaged changes from this feature.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`

Expected: PASS with all `node:test` suites passing.

- [ ] **Step 2: Run targeted tests one more time if full suite fails**

If `npm test` fails, run:

```powershell
node --test shared/game-state.test.js shared/combat.test.js
```

Expected: the same failing test names as the full suite. Fix only the code relevant to those failures, then rerun `npm test`.

- [ ] **Step 3: Check feature diff scope**

Run: `git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha status --short`

Expected: no unstaged or staged changes from this feature. Pre-existing unrelated changes may still appear; do not revert them.

- [ ] **Step 4: Final commit only if verification fixes were needed**

If Step 2 required code fixes after the previous commits, commit them:

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add shared/game-state.js shared/game-state.test.js shared/combat.js shared/combat.test.js public/js/rig-wizard.js public/css/rig-wizard.css public/js/tracker.js rules.md
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "fix: stabilize selectable weapon upgrades"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

**Spec coverage:** Task 1 covers selected upgrade storage, validation, and backfill. Task 2 covers effective profile derivation and profile-level effects. Task 3 covers Systems Overload, Sunder, cluster chip, and heat effects. Task 4 covers wizard selection and tracker display. Task 5 covers `rules.md` as Gemma's prompt source. Task 6 covers final verification.

**Placeholder scan:** This plan contains no placeholder markers and no deferred implementation language for the scoped feature.

**Type consistency:** The plan consistently uses `weaponUpgrades.longRange`, `weaponUpgrades.melee`, `longRangeUpgrade`, `meleeUpgrade`, `normalizeWeaponUpgrade`, `upgradeForWeapon`, `defaultWeaponUpgrade`, and `effectiveWeaponProfile`.
