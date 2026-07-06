# Shield and Anti-Bunker Cannon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new weapons — the **Bulwark Shield** (defensive Melee weapon with a *Raise Shield* reaction) and the **Siege Maul** (short-range, high-STR anti-bunker Long Range cannon) — to the universal weapon list, expanding it to 7 Long Range + 7 Melee.

**Architecture:** Weapons and upgrades are plain data in `shared/game-state.js` (`WEAPONS`, `WEAPON_UPGRADES`), applied by `effectiveWeaponProfile`. Combat resolves in `shared/combat.js` (`rollImpacts`, `resolveAttack`). Two effects need new engine code: the *Raise Shield* preparation (a per-arc impact modifier, parallel to the existing `brace` and `hardened` modifiers in `rollImpacts`) and *Breaching Round* (a Hull repair-lock, parallel to the existing `sunder` `onDamage` hook). Everything else (Boss Spike → Staggering, Extended Barrel → range) reuses existing effect plumbing. `rules.md` is the human-readable source of truth and is updated alongside the data.

**Tech Stack:** ES modules, Node's built-in test runner (`node --test`) for `shared/**`, Vitest + Testing Library for `client/**`. Deterministic dice are injected via a `random` function and `providedDice` objects in tests.

**Spec:** `docs/superpowers/specs/2026-07-05-shield-and-anti-bunker-cannon-design.md`

**Conventions:**
- Shared tests run with: `node --test shared/<file>.test.js`
- Client tests run with: `npx vitest run <path>`
- Commit after each task. Keep commits scoped to the task's files only (the working tree has unrelated in-progress changes — never `git add -A`).

---

## Task 1: Add the two weapon profiles

**Files:**
- Modify: `shared/game-state.js` (the `WEAPONS` object, ~lines 21-38)
- Test: `shared/game-state.test.js`
- Modify: `rules.md` (§12 weapon tables)

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("new weapons: Siege Maul and Bulwark Shield are in the universal list", () => {
  const maul = WEAPONS.longRange["Siege Maul"];
  assert.deepEqual(maul, { rof: 1, str: 13, acc: [0, -1], rng: [8, 16], perks: ["Armour Piercing", "Hot"] });

  const shield = WEAPONS.melee["Bulwark Shield"];
  assert.deepEqual(shield, { rof: 1, str: 6, acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Bulwark"] });

  // The list is now 7 + 7.
  assert.equal(Object.keys(WEAPONS.longRange).length, 7);
  assert.equal(Object.keys(WEAPONS.melee).length, 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `Siege Maul` is `undefined`, so `assert.deepEqual` throws.

- [ ] **Step 3: Add the two profiles**

In `shared/game-state.js`, add the Siege Maul as the last entry of `WEAPONS.longRange` (after `"Sniper Cannon"`):

```js
    "Sniper Cannon": { rof: 1, str: 12, acc: [0, -1], rng: [12, 24], perks: ["Precision"] },
    "Siege Maul":    { rof: 1, str: 13, acc: [0, -1], rng: [8, 16],  perks: ["Armour Piercing", "Hot"] },
```

And the Bulwark Shield as the last entry of `WEAPONS.melee` (after `"Wrecking Ball"`):

```js
    "Wrecking Ball": { rof: 1, str: 12, acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Staggering"] },
    "Bulwark Shield":{ rof: 1, str: 6,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Bulwark"] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Update rules.md profile tables**

In `rules.md`, under **### Long Range Weapons → Cannons & Artillery** table, add a row after the Sniper Cannon row:

```markdown
| Siege Maul | 1 | 13 | – / −1 | 8 / 16 | Armour Piercing, Hot |
```

Under **### Melee Weapons**, add a row after the Wrecking Ball row:

```markdown
| Bulwark Shield | 1 | 6 | – | 1.5 | Melee, Bulwark |
```

Add one sentence of flavour under the Cannons table (after the existing table) so the short range reads as intentional:

```markdown
> The **Siege Maul** is a close-in demolition gun: the highest STR on the board and Armour Piercing, but the shortest range of any ranged weapon and it runs Hot — you must get dangerously close to fire it.
```

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js rules.md
git commit -m "feat(weapons): add Siege Maul and Bulwark Shield profiles"
```

---

## Task 2: Add the four weapon upgrades

Boss Spike and Extended Barrel reuse existing effect plumbing (`perks`, `range`); Tower Shield and Breaching Round carry effect markers (`shieldArc`, `onDamage`) consumed by later tasks.

**Files:**
- Modify: `shared/game-state.js` (the `WEAPON_UPGRADES` object, ~lines 92-141)
- Test: `shared/game-state.test.js`
- Modify: `rules.md` (§12 upgrade table, §12/§16 count references)

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("new weapon upgrades resolve through effectiveWeaponProfile", () => {
  // Every weapon must expose exactly two upgrades.
  assert.equal(WEAPON_UPGRADES["Siege Maul"].length, 2);
  assert.equal(WEAPON_UPGRADES["Bulwark Shield"].length, 2);

  // Extended Barrel shifts both range bands by +4 (8/16 -> 12/24), reusing effect.range.
  const barrel = makeRig(1, "Breaker", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "extended-barrel" });
  assert.deepEqual(effectiveWeaponProfile("longRange", "Siege Maul", barrel).rng, [12, 24]);

  // Breaching Round is the default (first) Siege Maul upgrade and marks onDamage.
  const breach = makeRig(2, "Breaker2", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword" });
  assert.equal(breach.weaponUpgrades.longRange, "breaching-round");
  assert.equal(effectiveWeaponProfile("longRange", "Siege Maul", breach).upgradeEffect.onDamage, "breaching-round");

  // Boss Spike grants Staggering; Tower Shield is the default shield upgrade.
  const spike = makeRig(3, "Guard", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: "boss-spike" });
  assert.equal(effectiveWeaponProfile("melee", "Bulwark Shield", spike).perks.includes("Staggering"), true);
  assert.equal(makeRig(4, "Guard2", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield" }).weaponUpgrades.melee, "tower-shield");
});
```

Ensure the test file's import (top of `shared/game-state.test.js`) includes `effectiveWeaponProfile`. It currently is NOT imported there. Add it:

```js
import {
  createRoom, makeRig, claimSide, applyCommand, findRig,
  normalizeWeapon, WEAPONS, formatBattleState, publicState, __test,
  EQUIPMENT, normalizeEquipment, WEAPON_UPGRADES,
  normalizeWeaponUpgrade, upgradeForWeapon, defaultWeaponUpgrade,
  effectiveWeaponProfile,
} from "./game-state.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `WEAPON_UPGRADES["Siege Maul"]` is `undefined`.

- [ ] **Step 3: Add the upgrade entries**

In `shared/game-state.js`, add these two keys to `WEAPON_UPGRADES` (place them after the `"Wrecking Ball"` entry so the ordering mirrors the profile tables). Note: `makeRig`/`normalizeWeaponUpgrade` default to the FIRST entry, so put the "signature" upgrade first (Breaching Round; Tower Shield):

```js
  "Siege Maul": [
    { id: "breaching-round", name: "Breaching Round", tag: "Hull SP it strips can't be repaired until end of next round", effect: { onDamage: "breaching-round" } },
    { id: "extended-barrel", name: "Extended Barrel", tag: "Range bands become 12 / 24", effect: { range: 4 } },
  ],
  "Bulwark Shield": [
    { id: "tower-shield", name: "Tower Shield", tag: "Raise Shield also negates side-arc attacks", effect: { shieldArc: "front-side" } },
    { id: "boss-spike", name: "Boss Spike", tag: "Gains Staggering", effect: { perks: ["Staggering"] } },
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Update rules.md upgrade table and counts**

In `rules.md`, add two rows to the **Weapon Upgrades** table (§12), after the Wrecking Ball row:

```markdown
| Siege Maul | **Breaching Round:** SP this weapon strips from a target's Hull cannot be repaired until the end of the next round | **Extended Barrel:** range bands become 12 / 24 |
| Bulwark Shield | **Tower Shield:** while Raise Shield is active, front *and side* attacks are negated (rear at −4) | **Boss Spike:** gains Staggering |
```

Change the count line in §12 (the profiles intro) from:

```markdown
There are **six weapons of each type**.
```
to:
```markdown
There are **seven weapons of each type**.
```

Change the §16 Design Notes line from `one shared list of 6 Long Range + 6 Melee` to `one shared list of 7 Long Range + 7 Melee`.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js rules.md
git commit -m "feat(weapons): add Siege Maul and Bulwark Shield upgrades"
```

---

## Task 3: Shield helpers, prep gating, and reveal labels

Add the pure helpers and the gated `normalizePrep`, plus the human-readable labels for the new `raise-shield` preparation. No wiring yet (Task 5 threads the rig into the call sites).

**Files:**
- Modify: `shared/game-state.js` (`PREP_TYPES`/`normalizePrep` ~lines 77-82; `prepName`/`prepEffectLine` ~lines 423-432)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js` (and add `hasBulwarkShield, shieldCoverage, normalizePrep` to the import block from Task 2):

```js
test("normalizePrep gates raise-shield to Bulwark Shield rigs", () => {
  const shieldRig = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "tower-shield" } };
  const swordRig = { weapons: { melee: "Sword" } };

  assert.equal(normalizePrep("raise-shield", shieldRig), "raise-shield");
  assert.equal(normalizePrep("raise-shield", swordRig), "brace"); // not allowed -> fallback
  assert.equal(normalizePrep("raise-shield"), "brace");           // no rig -> fallback
  assert.equal(normalizePrep("brace", shieldRig), "brace");       // existing preps unaffected
  assert.equal(normalizePrep("bogus", shieldRig), "brace");
});

test("shieldCoverage depends on the Tower Shield upgrade", () => {
  const base = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "boss-spike" } };
  const tower = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "tower-shield" } };

  assert.deepEqual(shieldCoverage(base), { negate: ["front"], blunt: ["side", "rear"] });
  assert.deepEqual(shieldCoverage(tower), { negate: ["front", "side"], blunt: ["rear"] });
  assert.equal(hasBulwarkShield(base), true);
  assert.equal(hasBulwarkShield({ weapons: { melee: "Sword" } }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `normalizePrep is not a function` / `shieldCoverage is not defined` (they aren't exported/created yet).

- [ ] **Step 3: Add helpers and gate normalizePrep**

In `shared/game-state.js`, replace the existing `PREP_TYPES`/`normalizePrep` block (~lines 77-82):

```js
// The three §5 preparation reactions. Unknown/missing input falls back to brace.
export const PREP_TYPES = ["brace", "evasive", "return"];
export function normalizePrep(type) {
  const ref = String(type || "").trim().toLowerCase();
  return PREP_TYPES.includes(ref) ? ref : "brace";
}
```

with:

```js
// The three universal §5 preparation reactions. "raise-shield" is a fourth,
// gated reaction available only to Rigs carrying a Bulwark Shield (§13 Bulwark).
export const PREP_TYPES = ["brace", "evasive", "return"];

export function hasBulwarkShield(rig) {
  return rig?.weapons?.melee === "Bulwark Shield";
}

// Which arcs a Raise Shield covers. Base: negate the front, blunt (−4) side/rear.
// Tower Shield upgrade: negation extends to the side arc; only the rear is blunted.
export function shieldCoverage(rig) {
  const tower = rig?.weaponUpgrades?.melee === "tower-shield";
  return tower
    ? { negate: ["front", "side"], blunt: ["rear"] }
    : { negate: ["front"], blunt: ["side", "rear"] };
}

export function normalizePrep(type, rig) {
  const ref = String(type || "").trim().toLowerCase();
  if (ref === "raise-shield") return hasBulwarkShield(rig) ? "raise-shield" : "brace";
  return PREP_TYPES.includes(ref) ? ref : "brace";
}
```

- [ ] **Step 4: Add reveal labels**

In `shared/game-state.js`, update `prepName` and `prepEffectLine` (~lines 423-432) to name the new prep:

```js
function prepName(type) {
  if (type === "evasive") return "Evasive Manoeuvre";
  if (type === "return") return "Return Fire";
  if (type === "raise-shield") return "Raise Shield";
  return "Brace for Incoming Fire";
}
function prepEffectLine(type) {
  if (type === "evasive") return "Defender may move ½ Speed — the attack can miss entirely.";
  if (type === "return") return "Defender answers with a counter-attack.";
  if (type === "raise-shield") return "Front-arc attack negated; side/rear impacts suffer −4.";
  return "Front-arc impacts suffer −2.";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(shield): add Bulwark helpers, raise-shield prep gating and labels"
```

---

## Task 4: Raise Shield impact block in rollImpacts

Add the per-arc negate/blunt logic to `rollImpacts`, mirroring the existing `braced` and `hardened` modifiers.

**Files:**
- Modify: `shared/combat.js` (import line ~5; `rollImpacts` ~lines 77-95)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

```js
test("Raise Shield negates the front arc and blunts side/rear by 4", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const base = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "boss-spike" }, // base coverage
    preparation: { type: "raise-shield" },
  };

  // Front: fully negated regardless of the roll.
  const front = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 2 }, { impacts: [6, 6] }, () => 0);
  assert.equal(front.every((h) => h.sp === 0), true);

  // Side: 5 + 8 + 2(side) - 4(shield) = 11 vs medium hull (11/14/17) -> direct(1).
  const side = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(side[0].total, 11);
  assert.equal(side[0].sp, 1);
});

test("Tower Shield extends Raise Shield negation to the side arc", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const tower = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "tower-shield" },
    preparation: { type: "raise-shield" },
  };
  // Side negated; rear only blunted: 5 + 8 + 4(rear) - 4 = 13 -> direct on medium hull.
  const side = rollImpacts({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(side[0].sp, 0);
  const rear = rollImpacts({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(rear[0].total, 13);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — no shield handling yet, so the front hits deal damage / totals are unblunted.

- [ ] **Step 3: Import the helper**

In `shared/combat.js`, add `shieldCoverage` to the existing import from `./game-state.js` (line ~5):

```js
import {
  IMPACT, AIM, WEIGHT_STR_MOD, RAM_STR, hitLocation, impactSeverity,
  shieldCoverage,
} from "./game-state.js";
```

(Preserve any other names already on that import line; just add `shieldCoverage`.)

- [ ] **Step 4: Add the shield modifier to rollImpacts**

In `shared/combat.js`, replace the body of `rollImpacts` (~lines 77-95) with:

```js
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  const str = computeStr(attacker, profile, opts);
  const bonus = arcBonus(profile, opts.arc);
  const braced = target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const hardened = target.hardened ? -1 : 0; // Harden (Ablative Plating active)
  // Raise Shield (§13 Bulwark): fully negate covered arcs, blunt the rest by −4.
  const shield = target.preparation?.type === "raise-shield" ? shieldCoverage(target) : null;
  const shieldNegates = !!shield && shield.negate.includes(opts.arc);
  const shieldBlunt = shield && shield.blunt.includes(opts.arc) ? -4 : 0;
  const row = IMPACT[target.weightClass][location];
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null || shieldNegates) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (profile.perks.includes("Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (profile.perks.includes("Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + hardened + shieldBlunt + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full shared suite (guard against regressions)**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: PASS (existing brace/harden/raking tests still green).

- [ ] **Step 7: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(shield): Raise Shield negates/blunts impacts by arc in rollImpacts"
```

---

## Task 5: Wire raise-shield into the two prep-arming call sites

Thread the acting rig into `normalizePrep` so a shield Rig can actually arm Raise Shield via the Prepare action and via an Answer token. Because `resolveFire` already reads `target.preparation.type` in `rollImpacts`, no change to the reveal path is needed — Raise Shield resolves through the same generic (non-evasive, non-return) branch as Brace.

**Files:**
- Modify: `shared/game-state.js` (prepare action ~line 812; answer-token arming ~line 1084)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("a Bulwark Shield rig can arm Raise Shield; others fall back to brace", () => {
  const r = createRoom("SHLD");
  applyCommand(r, { verb: "add", attrs: { name: "Guard", class: "medium", owner: "a", longRange: "Autocannon", melee: "Bulwark Shield" } });
  applyCommand(r, { verb: "add", attrs: { name: "Grunt", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });

  // Answer-token arming path (poke a token in; no full activation needed).
  r.game.answerTokens.a = 2;
  applyCommand(r, { verb: "answer", attrs: { name: "Guard", prep: "raise-shield", side: "a" } });
  assert.equal(findRig(r, "Guard").preparation.type, "raise-shield");

  applyCommand(r, { verb: "answer", attrs: { name: "Grunt", prep: "raise-shield", side: "a" } });
  assert.equal(findRig(r, "Grunt").preparation.type, "brace"); // gated -> fallback
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `Guard.preparation.type` is `"brace"` because `normalizePrep(a.prep)` is called without the rig, so raise-shield falls back.

- [ ] **Step 3: Pass the rig into both call sites**

In `shared/game-state.js`, the Prepare action (~line 812):

```js
  } else if (act === "prepare") {
    rig.preparation = { type: normalizePrep(a.prep, rig), source: "action", faceUp: false };
  }
```

And the Answer-token arming (~line 1084):

```js
      rig.preparation = { type: normalizePrep(a.prep, rig), source: "answer", faceUp: false };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(shield): arm Raise Shield via Prepare action and Answer token"
```

---

## Task 6: Breaching Round Hull repair-lock

When a Siege Maul with the Breaching Round upgrade damages a target's Hull, lock Hull repairs for the current round and the next. Model the lock as a countdown (`hullRepairLock`) that ticks down each Recovery Phase; centralize the guard in `repairRig` so both the Repair action and Emergency Patch respect it.

**Files:**
- Modify: `shared/game-state.js` — `ensureRigShape` (~line 221), `makeRig` return (~line 306), `repairRig` (~line 567), `runRecovery` (~line 625), `combatCtx` (~line 686), `reset` verb (~line 896)
- Modify: `shared/combat.js` — `resolveAttack` `onDamage` handling (~line 128)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

The test file already imports `__test` at the top (see the import block in Task 2). Task 6 Step 3 adds `breachHull`, `tickBreach`, and `repairRig` to that existing bag, so the test uses the top-level `__test` binding directly — no dynamic import, no `async`:

```js
test("Breaching Round locks Hull repair for two Recovery Phases", () => {
  const rig = makeRig(1, "Fort", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  rig.hull.sp = 3;

  // Simulate a breach: the countdown is set to 2 (this round + next).
  __test.breachHull(rig);
  assert.equal(rig.hullRepairLock, 2);

  // Repair action / Emergency Patch cannot restore the Hull while locked.
  __test.repairRig(rig, "hull", 2);
  assert.equal(rig.hull.sp, 3); // unchanged

  // Non-hull repairs still work while the Hull is locked.
  rig.legs.sp = 2;
  __test.repairRig(rig, "legs", 1);
  assert.equal(rig.legs.sp, 3);

  // Each Recovery Phase ticks the lock down; after two it clears.
  __test.tickBreach(rig); assert.equal(rig.hullRepairLock, 1);
  __test.repairRig(rig, "hull", 2); assert.equal(rig.hull.sp, 3); // still locked at 1
  __test.tickBreach(rig); assert.equal(rig.hullRepairLock, 0);
  __test.repairRig(rig, "hull", 2); assert.equal(rig.hull.sp, 5); // now repairs
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `breachHull` is undefined.

- [ ] **Step 3: Add the lock state, breach/tick helpers, and repair guard**

In `shared/game-state.js`:

**(a)** In `ensureRigShape` (~line 234, near the other numeric defaults), add:

```js
  if (typeof rig.hullRepairLock !== "number") rig.hullRepairLock = 0;
```

**(b)** In the `makeRig` return object (near `actionPenaltyNextActivation: 0`), add:

```js
    hullRepairLock: 0,
```

**(c)** Guard `repairRig` (~line 567):

```js
function repairRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  // Breaching Round (§12) — a breached Hull can't be repaired until the lock clears.
  if (loc === "hull" && (rig.hullRepairLock || 0) > 0) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  c.sp = Math.min(c.max, c.sp + n);
  if (c.sp > 0) c.destroyed = false;
  recompute(rig);
}
```

**(d)** Add the breach + tick helpers next to `repairRig`:

```js
// Breaching Round — deny Hull repair for this round and the next (two Recovery
// ticks). Called from combat when a Siege Maul with the upgrade damages the Hull.
function breachHull(rig) {
  if (rig) rig.hullRepairLock = 2;
}
function tickBreach(rig) {
  if (rig && rig.hullRepairLock > 0) rig.hullRepairLock -= 1;
}
```

**(e)** Tick it in `runRecovery` (~line 633, inside the per-rig loop):

```js
    rig.activated = false;
    rig.speedHalvedNextRound = false;
    rig.preparation = null;
    tickBreach(rig);
    recompute(rig);
```

**(f)** Expose `breachHull` on `combatCtx` (~line 686) so combat can trigger it:

```js
function combatCtx() {
  return {
    applyDamage,
    bumpHeat,
    pushResolution,
    sunderLocation,
    breachHull,
    profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker),
  };
}
```

**(g)** Reset it in the `reset` verb (~line 911, near `rig.actionPenaltyNextActivation = 0`):

```js
      rig.actionPenaltyNextActivation = 0;
      rig.hullRepairLock = 0;
```

**(h)** Extend the existing `__test` export bag (currently `export const __test = { applyDamage, applyOverheat };` near the bottom of the file, ~line 1226) to expose the three helpers the test drives:

```js
export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig };
```

- [ ] **Step 4: Trigger the breach in combat**

In `shared/combat.js`, in `resolveAttack`, right after the existing `sunder` block (~line 128-130):

```js
    if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
      ctx.sunderLocation?.(target, location);
    }
    if (profile.upgradeEffect?.onDamage === "breaching-round" && location === "hull" && impacts.some((h) => h.sp > 0)) {
      ctx.breachHull?.(target);
    }
```

- [ ] **Step 5: Add an integration test for the combat trigger**

Add to `shared/combat.test.js` (uses `makeRig` + a minimal ctx like other resolveAttack tests — mirror the existing resolveAttack test setup in that file for `room`, `ctx`, and forced dice):

```js
test("Siege Maul with Breaching Round locks the target Hull on a Hull hit", () => {
  const attacker = makeRig(1, "Breaker", "medium", "a", { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "breaching-round" });
  const target = makeRig(2, "Fort", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const room = { rigs: [attacker, target] };
  let hullBreached = null;
  const ctx = {
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
    bumpHeat: () => {},
    pushResolution: () => {},
    sunderLocation: () => {},
    breachHull: (t) => { hullBreached = t; t.hullRepairLock = 2; },
    profileFor: (slot, name, rig) => effectiveWeaponProfile(slot, name, rig),
  };
  // Force: to-hit die 6 (hits), location die 1 (hull), impact die 6.
  const res = resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [6], ap: [1] } }, () => 0, ctx);
  assert.equal(res.location, "hull");
  assert.equal(hullBreached, target);
  assert.equal(target.hullRepairLock, 2);
});
```

Ensure `shared/combat.test.js` imports `makeRig` and `effectiveWeaponProfile` (it already imports `WEAPONS, makeRig, effectiveWeaponProfile` per line 4 — confirm and add any missing name).

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/combat.js shared/game-state.test.js shared/combat.test.js
git commit -m "feat(weapons): Breaching Round locks Hull repair for two rounds"
```

---

## Task 7: Surface Raise Shield in the client ReactionPicker

Add `raise-shield` to the client `PrepType` union and the reaction chooser, shown only for Rigs carrying a Bulwark Shield.

**Files:**
- Modify: `client/src/state/types.ts` (`PrepType`, ~line 12)
- Modify: `client/src/components/overlays/ReactionPicker.tsx`
- Test: `client/src/components/overlays/ReactionPicker.test.tsx`

- [ ] **Step 1: Read the current picker consumers**

Run (to see who renders `<ReactionPicker>` and whether the acting rig is in scope so you can pass `allowShield`):

```bash
grep -rn "ReactionPicker\|REACTIONS" client/src
```

Expected: usages in `ActionConsole.tsx` (Prepare action) and the Answer-token flow. Note the prop each passes; you'll add `allowShield={hasBulwarkShield(rig)}` at those call sites, deriving it from the selected rig's `weapons.melee === "Bulwark Shield"`.

- [ ] **Step 2: Write the failing test**

In `client/src/components/overlays/ReactionPicker.test.tsx`, add:

```tsx
import { render, screen } from "@testing-library/react";
import ReactionPicker from "./ReactionPicker";

test("Raise Shield only appears when allowShield is set", () => {
  const { rerender } = render(<ReactionPicker value="brace" onChange={() => {}} />);
  expect(screen.queryByText("Raise Shield")).toBeNull();

  rerender(<ReactionPicker value="brace" onChange={() => {}} allowShield />);
  expect(screen.getByText("Raise Shield")).toBeTruthy();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run client/src/components/overlays/ReactionPicker.test.tsx`
Expected: FAIL — `allowShield` isn't a prop and Raise Shield isn't rendered.

- [ ] **Step 4: Extend the PrepType union**

In `client/src/state/types.ts` (~line 12):

```ts
export type PrepType = "brace" | "evasive" | "return" | "raise-shield";
```

- [ ] **Step 5: Add the gated option to the picker**

Replace `client/src/components/overlays/ReactionPicker.tsx` with:

```tsx
import type { PrepType } from "../../state/types";

const BASE_REACTIONS: { value: PrepType; icon: string; label: string; rule: string }[] = [
  { value: "brace", icon: "🛡️", label: "Brace for Incoming Fire",
    rule: "Front-arc attacks against this Rig take −2 to their Impact Rolls until next round." },
  { value: "evasive", icon: "💨", label: "Evasive Manoeuvre",
    rule: "Before the attack resolves, move up to ½ Speed. Break line of sight or range and the attack fails." },
  { value: "return", icon: "↩️", label: "Return Fire",
    rule: "After the enemy attacks, answer with one weapon against that enemy." },
];

const SHIELD_REACTION = {
  value: "raise-shield" as PrepType, icon: "🛡", label: "Raise Shield",
  rule: "Negates the next front-arc attack; side/rear impacts take −4 (Tower Shield also negates the side).",
};

// Exported for tests / call sites that need the full list.
export const REACTIONS = BASE_REACTIONS;

interface Props {
  value: PrepType;
  onChange: (v: PrepType) => void;
  allowShield?: boolean; // true when the acting Rig carries a Bulwark Shield
}

// The shared reaction chooser used by both the Answer-token gate and the
// Prepare action. Presentational only — parents own the send.
export default function ReactionPicker({ value, onChange, allowShield = false }: Props) {
  const options = allowShield ? [...BASE_REACTIONS, SHIELD_REACTION] : BASE_REACTIONS;
  return (
    <div className="rx-picker">
      {options.map((r) => (
        <button
          key={r.value}
          type="button"
          className={"rx-choice" + (r.value === value ? " sel" : "")}
          onClick={() => onChange(r.value)}
        >
          <span className="rx-choice-ic" aria-hidden="true">{r.icon}</span>
          <span className="rx-choice-body">
            <span className="rx-choice-label">{r.label}</span>
            <span className="rx-choice-rule">{r.rule}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Pass allowShield at the call sites**

At each `<ReactionPicker ... />` usage found in Step 1, add `allowShield={selectedRig?.weapons?.melee === "Bulwark Shield"}` (use whatever variable names that component already has for the acting/selected Rig). Do NOT invent new state — read the rig object already in scope.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run client/src/components/overlays/ReactionPicker.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/state/types.ts client/src/components/overlays/ReactionPicker.tsx client/src/components/overlays/ReactionPicker.test.tsx
git commit -m "feat(shield): offer Raise Shield in the reaction picker for shield rigs"
```

---

## Task 8: Full suite + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: Vitest client tests PASS and `node --test` shared/server tests PASS. If anything fails, fix before proceeding — a common miss is a call site from Task 5 or 7 that still passes the old arity.

- [ ] **Step 2: Sanity-check the rules doc**

Confirm `rules.md` shows: Siege Maul in the Cannons table, Bulwark Shield in the Melee table, both upgrade rows in the Weapon Upgrades table, "seven weapons of each type", and a §13 **Bulwark** perk entry (add it now if Task 1 didn't — see Step 3).

- [ ] **Step 3: Add the Bulwark perk to §13 (if not already present)**

In `rules.md` §13 Weapon Perks, add (alphabetically, after "Armour Piercing"):

```markdown
- **Bulwark** — the Rig may arm a fourth preparation, **Raise Shield** (Prepare [1 heat], §5). When attacked while it is active: a **front-arc** attack is negated (all Impact Rolls fail); a **side/rear-arc** attack has every Impact Roll at **−4**. Protects regardless of the attacker's range. An Answer token may place Raise Shield only on a Bulwark-Shield Rig.
```

- [ ] **Step 4: Commit any doc fixes**

```bash
git add rules.md
git commit -m "docs(rules): document the Bulwark perk"
```

---

## Notes / Out of Scope

- **Glossary tooltips** (`shared/glossary.js`, `client/src/components/overlays/GlossaryTip.tsx`) are not covered here. If the glossary is keyed by perk/weapon name, add entries for "Bulwark", "Bulwark Shield", and "Siege Maul" mirroring existing entries — but that is a cosmetic follow-up, not required for the mechanics to work.
- **Staggering / Extended Barrel** need no new engine code — they ride existing `perks` and `range` effect handling (verified in Task 2).
- **Design decision carried from the spec:** a front-arc Raise Shield negates *damage* but the shot still "hits", so hit-only effects (Incendiary heat, Shock) still apply — this matches the existing Raking Fire precedent and needs no special handling.
