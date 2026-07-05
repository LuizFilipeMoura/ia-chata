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

