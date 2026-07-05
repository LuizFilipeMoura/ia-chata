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

