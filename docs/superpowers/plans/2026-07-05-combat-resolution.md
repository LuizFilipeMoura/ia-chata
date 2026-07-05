# Full Combat Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve attacks (§7), the Ram action (§5), catastrophic cascades (§8), and Rig destruction (§9) server-side with injectable dice, wired into the round loop from Plan 1 so a Fire / Aimed Shot / Ram action rolls to-hit, hit location, and impact, applies damage through the cascade, and logs each step for animation.

**Architecture:** Combat math lives in a new pure module `shared/combat.js` (weapon math, to-hit, location, impact) that receives a small `ctx` of mutation primitives from `shared/game-state.js`, avoiding a circular import. Cascade-aware damage (`applyDamage`) and destruction live in `game-state.js` next to the existing `damageRig`. Static rulebook tables (weapon profiles, impact tables, STR modifiers) extend `shared/rules.js`.

**Tech Stack:** Node ES modules, `node:test` + `node:assert/strict`, no new dependencies. Requires Plan 1 (round-loop engine) already merged.

**Rules note — §7/§8 contradiction:** The rulebook gives both a generic "overflow to another location" (§7) and specific "additional damage" clauses per component (§8). This plan enforces the **§8 additional-damage clauses** (Hull/Engine → destroyed, Arms → +3 Hull & weapon gone, Legs → immobilised) as the more specific rule; generic §7 overflow is not implemented.

---

## File Structure

- **Modify** `shared/rules.js` — add `WEAPON_PROFILES`, `IMPACT`, `AIM`, `WEIGHT_STR_MOD`, `RAM_STR`, `hitLocation`, `impactSeverity`.
- **Create** `shared/combat.js` — `resolveAttack`, `resolveRam`, `computeModifiedAim`, all pure except through the injected `ctx`.
- **Modify** `shared/game-state.js` — `applyDamage` (cascade + destruction), a `combatCtx`, wire `action` verb `fire`/`aimed`/`ram`, add `blast` verb, replace raw `damageRig` calls in `applyOverheat` with `applyDamage`.
- **Modify** `shared/game-state.test.js`, **create** `shared/combat.test.js` — tests.

---

### Task 1: Combat data tables in `shared/rules.js`

**Files:**
- Modify: `shared/rules.js`
- Test: `shared/rules.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/rules.test.js`:

```js
import {
  WEAPON_PROFILES, IMPACT, AIM, WEIGHT_STR_MOD, RAM_STR, hitLocation, impactSeverity,
} from "./rules.js";

test("weapon profiles cover all twelve weapons with type and perks", () => {
  assert.equal(Object.keys(WEAPON_PROFILES).length, 12);
  assert.equal(WEAPON_PROFILES["Mini Gun"].type, "longRange");
  assert.deepEqual(WEAPON_PROFILES["Mini Gun"].perks, ["Full Auto", "Hot", "Raking Fire"]);
  assert.equal(WEAPON_PROFILES["Sword"].type, "melee");
  assert.equal(WEAPON_PROFILES["Sniper Cannon"].str, 12);
});

test("hitLocation maps the D12 bands (§7)", () => {
  assert.equal(hitLocation(1), "hull");
  assert.equal(hitLocation(4), "hull");
  assert.equal(hitLocation(5), "arms");
  assert.equal(hitLocation(7), "arms");
  assert.equal(hitLocation(8), "legs");
  assert.equal(hitLocation(10), "legs");
  assert.equal(hitLocation(11), "engine");
  assert.equal(hitLocation(12), "engine");
});

test("impactSeverity reads a class/location row (§2)", () => {
  const row = IMPACT.light.engine; // 7-9 / 10-11 / 12+
  assert.equal(impactSeverity(6, row).tier, "none");
  assert.equal(impactSeverity(7, row).sp, 1);
  assert.equal(impactSeverity(10, row).sp, 2);
  assert.equal(impactSeverity(12, row).sp, 3);
  assert.equal(WEIGHT_STR_MOD.light, -2);
  assert.equal(RAM_STR.medium, 9);
  assert.equal(AIM.medium, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/rules.test.js`
Expected: FAIL — exports undefined.

- [ ] **Step 3: Write minimal implementation**

Append to `shared/rules.js`:

```js
// Weight-class STR modifier applied to every Impact Roll (§12); Aim target
// number (§2, roll >= to hit); Ram STR by weight class (§5).
export const WEIGHT_STR_MOD = { light: -2, medium: 0, heavy: 2, colossal: 4 };
export const AIM = { light: 4, medium: 4, heavy: 3, colossal: 3 };
export const RAM_STR = { light: 8, medium: 9, heavy: 10, colossal: 11 };

// Hit-location table (§7): defender's D12 → component.
export function hitLocation(d12) {
  const n = Math.floor(Number(d12) || 0);
  if (n <= 4) return "hull";
  if (n <= 7) return "arms";
  if (n <= 10) return "legs";
  return "engine";
}

// Impact Tables (§2): minimum totals for each severity, per class per location.
export const IMPACT = {
  light: {
    hull:   { direct: 10, severe: 14, critical: 16 },
    arms:   { direct: 10, severe: 12, critical: 14 },
    legs:   { direct: 10, severe: 13, critical: 15 },
    engine: { direct: 7,  severe: 10, critical: 12 },
  },
  medium: {
    hull:   { direct: 11, severe: 14, critical: 17 },
    arms:   { direct: 10, severe: 13, critical: 15 },
    legs:   { direct: 11, severe: 13, critical: 15 },
    engine: { direct: 8,  severe: 10, critical: 12 },
  },
  heavy: {
    hull:   { direct: 13, severe: 15, critical: 17 },
    arms:   { direct: 12, severe: 14, critical: 16 },
    legs:   { direct: 14, severe: 16, critical: 17 },
    engine: { direct: 8,  severe: 11, critical: 13 },
  },
  colossal: {
    hull:   { direct: 13, severe: 16, critical: 17 },
    arms:   { direct: 13, severe: 14, critical: 16 },
    legs:   { direct: 13, severe: 16, critical: 17 },
    engine: { direct: 9,  severe: 11, critical: 14 },
  },
};

// Impact Roll total vs a location row → SP lost and severity tier.
export function impactSeverity(total, row) {
  const n = Math.floor(Number(total) || 0);
  if (n >= row.critical) return { sp: 3, tier: "critical" };
  if (n >= row.severe) return { sp: 2, tier: "severe" };
  if (n >= row.direct) return { sp: 1, tier: "direct" };
  return { sp: 0, tier: "none" };
}

// Weapon profiles (§12). STR is the Medium baseline (apply WEIGHT_STR_MOD).
// acc = [near, far] modifiers to Aim; rng = [near, far] inches.
export const WEAPON_PROFILES = {
  "Mini Gun":      { type: "longRange", rof: 8, str: 4,  acc: [1, -1], rng: [9, 18],  perks: ["Full Auto", "Hot", "Raking Fire"] },
  "Double MG":     { type: "longRange", rof: 8, str: 6,  acc: [1, 0],  rng: [9, 18],  perks: ["Full Auto", "Raking Fire"] },
  "Autocannon":    { type: "longRange", rof: 4, str: 8,  acc: [0, -1], rng: [12, 24], perks: ["Full Auto"] },
  "Arc Gun":       { type: "longRange", rof: 2, str: 10, acc: [0, 1],  rng: [15, 30], perks: ["Charged Shot", "Precision"] },
  "Mortar":        { type: "longRange", rof: 3, str: 9,  acc: [-1, 0], rng: [15, 30], perks: ["Charged Shot", "Incendiary"] },
  "Sniper Cannon": { type: "longRange", rof: 1, str: 12, acc: [0, -1], rng: [12, 24], perks: ["Precision"] },
  "Sword":         { type: "melee", rof: 2, str: 6,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Shock"] },
  "Circular Saw":  { type: "melee", rof: 3, str: 6,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Cleave"] },
  "Chainsaw":      { type: "melee", rof: 3, str: 8,  acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Rend"] },
  "Claw":          { type: "melee", rof: 2, str: 8,  acc: [1, 1], rng: [1.5, 1.5], perks: ["Melee", "Armour Piercing"] },
  "Lance":         { type: "melee", rof: 1, str: 11, acc: [1, 1], rng: [1.5, 1.5], perks: ["Melee", "Impale"] },
  "Wrecking Ball": { type: "melee", rof: 1, str: 12, acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Staggering"] },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/rules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -m "feat: add weapon profiles and impact tables"
```

---

### Task 2: `computeModifiedAim` and to-hit rolling in `shared/combat.js`

**Files:**
- Create: `shared/combat.js`
- Test: `shared/combat.test.js` (new)

The to-hit step (§7.4): modified Aim = base Aim − total ACC, where ACC sums the weapon's near/far value, −cover, the −2 aimed penalty (waived by Precision), and −1 when the attacker's Hull is at 0 SP. Each ROF die that meets/beats the modified Aim hits; a natural 6 always hits.

- [ ] **Step 1: Write the failing test**

Create `shared/combat.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModifiedAim, rollToHit } from "./combat.js";
import { WEAPON_PROFILES } from "./rules.js";

const attacker = { weightClass: "medium", hull: { sp: 7 } };

test("computeModifiedAim applies weapon ACC, cover, aim and hull penalties", () => {
  const claw = WEAPON_PROFILES["Claw"]; // acc +1
  assert.equal(computeModifiedAim(attacker, claw, { range: "near", cover: 0 }), 3); // 4 - 1
  assert.equal(computeModifiedAim(attacker, claw, { range: "near", cover: 2 }), 5); // 4 - 1 + 2
  // Aimed −2 unless Precision:
  const sniper = WEAPON_PROFILES["Sniper Cannon"]; // Precision
  assert.equal(computeModifiedAim(attacker, sniper, { range: "near", cover: 0, aimed: true }), 4); // waived
  const autocannon = WEAPON_PROFILES["Autocannon"]; // no Precision
  assert.equal(computeModifiedAim(attacker, autocannon, { range: "near", cover: 0, aimed: true }), 6); // 4 + 2
  // Hull at 0 → −1 Aim (target number +1):
  assert.equal(computeModifiedAim({ weightClass: "medium", hull: { sp: 0 } }, claw, { range: "near", cover: 0 }), 4);
});

test("rollToHit counts hits (>= modAim or natural 6) and fire-mode heat", () => {
  const dbl = WEAPON_PROFILES["Double MG"]; // rof 8, Full Auto
  // Provide 10 dice (8 base + 2 full auto). modAim near = 4 - 1 = 3.
  const dice = [1, 2, 3, 4, 5, 6, 1, 1, 6, 2];
  const res = rollToHit(attacker, dbl, { range: "near", cover: 0, fullAuto: true }, dice, () => 0);
  assert.equal(res.rof, 10);
  // hits: >=3 or ==6 -> 3,4,5,6,6 = 5 hits (the two natural 6 count once each already).
  assert.equal(res.hits, 5);
  // Full Auto: each die ==1 adds heat -> three 1s = 3 heat.
  assert.equal(res.fireModeHeat, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `shared/combat.js`:

```js
// Pure combat math (§7). State mutation happens only through the `ctx` the
// caller (game-state.js) injects, so this module has no import cycle and is
// unit-testable in isolation.
import {
  WEAPON_PROFILES, IMPACT, AIM, WEIGHT_STR_MOD, RAM_STR, hitLocation, impactSeverity,
} from "./rules.js";

function rollD(sides, provided, random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// §7.4 — modified Aim (the D6 target number). Higher ACC lowers the number.
export function computeModifiedAim(attacker, profile, opts) {
  const base = AIM[attacker.weightClass] ?? 4;
  const weaponAcc = profile.acc[opts.range === "far" ? 1 : 0] || 0;
  const cover = Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !profile.perks.includes("Precision") ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty;
  return base - accTotal;
}

// §7.4 — roll ROF (+2 for Full Auto) D6, count hits, tally fire-mode heat
// (each 1 rolled under Full Auto / Charged Shot adds 1 heat, §6).
export function rollToHit(attacker, profile, opts, providedDice, random) {
  const modAim = computeModifiedAim(attacker, profile, opts);
  const fullAuto = opts.fullAuto && profile.perks.includes("Full Auto");
  const rof = profile.rof + (fullAuto ? 2 : 0);
  const charged = opts.charged && profile.perks.includes("Charged Shot");
  const dice = [];
  let hits = 0;
  let fireModeHeat = 0;
  for (let i = 0; i < rof; i++) {
    const d = rollD(6, providedDice?.[i], random);
    dice.push(d);
    if (d >= modAim || d === 6) hits += 1;
    if ((fullAuto || charged) && d === 1) fireModeHeat += 1;
  }
  return { modAim, rof, hits, fireModeHeat, dice };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat: to-hit resolution with ACC modifiers and fire-mode heat"
```

---

### Task 3: Impact rolls, arcs, Raking Fire, AP/Rend, Brace → damage intents

**Files:**
- Modify: `shared/combat.js` (`computeStr`, `arcBonus`, `rollImpacts`)
- Test: `shared/combat.test.js`

`rollImpacts` returns the list of `{ die, total, severity, sp }` for each hit against a chosen location — pure, applying no damage yet.

- [ ] **Step 1: Write the failing test**

```js
import { computeStr, arcBonus, rollImpacts } from "./combat.js";

test("computeStr applies weight and Charged Shot", () => {
  assert.equal(computeStr({ weightClass: "light" }, WEAPON_PROFILES["Sniper Cannon"], {}), 10); // 12-2
  assert.equal(computeStr({ weightClass: "medium" }, WEAPON_PROFILES["Arc Gun"], { charged: true }), 12); // 10+0+2
});

test("arcBonus: ranged +0/+2/+4, melee none, Raking Fire overrides", () => {
  const auto = WEAPON_PROFILES["Autocannon"];
  assert.equal(arcBonus(auto, "front"), 0);
  assert.equal(arcBonus(auto, "side"), 2);
  assert.equal(arcBonus(auto, "rear"), 4);
  assert.equal(arcBonus(WEAPON_PROFILES["Sword"], "rear"), 0); // melee
  const mini = WEAPON_PROFILES["Mini Gun"]; // Raking Fire
  assert.equal(arcBonus(mini, "front"), null); // front auto-fails
  assert.equal(arcBonus(mini, "side"), 4);
  assert.equal(arcBonus(mini, "rear"), 8);
});

test("rollImpacts computes per-hit severity and honours Brace on the front arc", () => {
  const target = { weightClass: "medium", preparation: { type: "brace" } };
  const auto = WEAPON_PROFILES["Autocannon"]; // STR 8 medium
  // 2 hits, both d6=5 -> 5 + 8 + 0(front) - 2(brace) = 11 vs medium hull (11/14/17) -> direct(1).
  const out = rollImpacts({ weightClass: "medium" }, target, auto, "hull",
    { arc: "front", hits: 2 }, { impacts: [5, 5] }, () => 0);
  assert.equal(out.length, 2);
  assert.equal(out[0].total, 11);
  assert.equal(out[0].sp, 1);
});

test("Raking Fire against the front arc deals no damage", () => {
  const mini = WEAPON_PROFILES["Mini Gun"];
  const out = rollImpacts({ weightClass: "medium" }, { weightClass: "light" }, mini, "hull",
    { arc: "front", hits: 3 }, { impacts: [6, 6, 6] }, () => 0);
  assert.equal(out.every((h) => h.sp === 0), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — exports missing.

- [ ] **Step 3: Write minimal implementation**

Append to `shared/combat.js`:

```js
// §12/§7 — STR = weapon STR + weight modifier + Charged Shot.
export function computeStr(attacker, profile, opts) {
  const charged = opts.charged && profile.perks.includes("Charged Shot") ? 2 : 0;
  return profile.str + (WEIGHT_STR_MOD[attacker.weightClass] || 0) + charged;
}

// §7.7 / §13 — arc STR bonus. Raking Fire (machine guns) replaces the standard
// side/rear values and cannot damage the front arc (returns null = auto-fail).
export function arcBonus(profile, arc) {
  if (profile.perks.includes("Raking Fire")) {
    if (arc === "side") return 4;
    if (arc === "rear") return 8;
    return null;
  }
  if (profile.perks.includes("Melee")) return 0;
  if (arc === "side") return 2;
  if (arc === "rear") return 4;
  return 0;
}

// §7.7-8 — one Impact Roll per hit. Adds AP (+D3 per raw 6) and Rend (+D3 per
// raw 5-6). Brace subtracts 2 on the target's front arc (§5 preparation).
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat: impact rolls with arcs, raking fire, AP/rend and brace"
```

---

### Task 4: Cascade-aware `applyDamage` (§8) in `game-state.js`

**Files:**
- Modify: `shared/game-state.js` (add `applyDamage`; route `applyOverheat` through it)
- Test: `shared/game-state.test.js`

`applyDamage(room, rig, loc, amount)` applies damage one point at a time and fires §8 effects on the transition to 0 SP and on additional damage to a 0-SP location. Arms-at-0 rolls a weapon and spills 1 Hull + 1 Engine.

- [ ] **Step 1: Write the failing test**

```js
test("applyDamage fires Arms-at-0: destroys a weapon and spills to hull and engine", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1"); // Light: arms 5, hull 6, engine 4
  // Drop arms to exactly 0 with a 5-point hit; the transition rolls the weapon
  // (D12 4 -> left/longRange) and spills 1 hull + 1 engine.
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: "4" } }); // arms 1
  // Use the engine's applyDamage via a fresh overheat-free path: one more manual point.
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: "1" } }); // arms 0 (existing damageRig — no cascade yet)
  assert.equal(b1.arms.sp, 0);
});
```

Note: the existing manual `damage` verb uses `damageRig` (no cascade) — Task 6 re-points it. This task tests `applyDamage` directly via a tiny test hook. Add to the test file:

```js
import { __test } from "./game-state.js";

test("applyDamage cascade: arms 0 rolls weapon + spills; engine 0 sets skip", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  __test.applyDamage(r, b1, "arms", 5, { random: () => 0, dice: { armsWeapon: 4 } });
  assert.equal(b1.arms.sp, 0);
  assert.equal(b1.weaponsDestroyed.length, 1);
  assert.equal(b1.hull.sp, 5); // 6 - 1 spill
  assert.equal(b1.engine.sp, 3); // 4 - 1 spill
  assert.equal(b1.skipNextActivation, true); // engine took a point... only if it hit 0; here 3, so false
});
```

Correct the expectation: engine went 4→3, not 0, so `skipNextActivation` stays false. Replace the last assertion with:

```js
  assert.equal(b1.skipNextActivation, false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `__test`/`applyDamage` undefined.

- [ ] **Step 3: Write minimal implementation**

Add `applyDamage` and the §8 helper to `shared/game-state.js`:

```js
// §8 — effect when a component first reaches 0 SP. May recurse via applyDamage.
function catastrophicOnZero(room, rig, loc, opts) {
  if (loc === "engine") { rig.skipNextActivation = true; rig.engine.heat = Math.max(rig.engine.heat, 3); }
  else if (loc === "arms") {
    const roll = rollD(12, opts?.dice?.armsWeapon, opts?.random);
    const slot = roll <= 6 ? "longRange" : "melee";
    const name = rig.weapons?.[slot];
    if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    applyDamage(room, rig, "hull", 1, opts);
    applyDamage(room, rig, "engine", 1, opts);
  }
  // Legs at 0 (move penalties) and Hull at 0 (−2 actions / −1 Aim) are enforced
  // where they apply (Task 5 activate budget, combat modAim) — no state to set here.
}

// §8 — additional damage to an already 0-SP location.
function catastrophicAdditional(room, rig, loc, opts) {
  if (loc === "hull" || loc === "engine") rig[loc].destroyed = true;
  else if (loc === "legs") rig.immobilised = true;
  else if (loc === "arms") applyDamage(room, rig, "hull", 3, opts);
}

// Cascade-aware damage entry point. Applies `amount` SP one at a time, firing
// §8 clauses, then recomputes destruction (§9 handled in Task 5).
function applyDamage(room, rig, loc, amount, opts) {
  const c = rig[loc];
  if (!c) return;
  let n = Math.max(0, Math.floor(Number(amount) || 0));
  while (n-- > 0) {
    if (c.sp > 0) {
      c.sp -= 1;
      if (c.sp === 0) { recompute(rig); catastrophicOnZero(room, rig, loc, opts); }
    } else {
      catastrophicAdditional(room, rig, loc, opts);
    }
  }
  recompute(rig);
  onRigDamaged(room, rig, opts); // §9 destruction + annihilation (Task 5)
}

// Replaced fully in Task 5.
function onRigDamaged(room, rig, opts) { checkAnnihilation(room); }
```

Route overheat through the cascade — in `applyOverheat`, replace each `damageRig(...)` with `applyDamage(room, rig, ...)`, and thread `opts`:

```js
function applyOverheat(room, rig, total, opts) {
  const row = heatThreshold(total);
  if (row.key === "stall") applyDamage(room, rig, "engine", 1, opts);
  else if (row.key === "detonation") applyDamage(room, rig, "arms", 2, opts);
  else if (row.key === "blowout") { applyDamage(room, rig, "legs", 2, opts); rig.speedHalvedNextRound = true; }
  else if (row.key === "buckling") for (const l of LOCS) applyDamage(room, rig, l, 1, opts);
  else if (row.key === "engine-failure") { applyDamage(room, rig, "engine", 2, opts); rig.noCool = true; }
  else if (row.key === "catastrophic") { for (const l of LOCS) setRigSp(rig, l, 0); rig.noCool = true; }
  return row;
}
```

Update `endActivation`'s call site to pass room + opts: change `const row = applyOverheat(rig, total);` to `const row = applyOverheat(room, rig, total, { random });`.

Add a test hook export at the bottom of the file:

```js
export const __test = { applyDamage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: cascade-aware damage with §8 catastrophic effects"
```

---

### Task 5: §9 destruction, the `blast` verb, and real `onRigDamaged`

**Files:**
- Modify: `shared/game-state.js` (`onRigDamaged` → destruction roll + pending blast; `blast` verb)
- Test: `shared/game-state.test.js`

When a Rig transitions to destroyed, roll 1 D12 → on 4+ its munitions erupt. Positions are unknown to the app, so the destruction roll records a pending blast; the controller then posts `blast` naming the Rigs within 12", each taking a D6 + STR 10 hit.

- [ ] **Step 1: Write the failing test**

```js
test("destruction rolls a D12; 4+ records a pending blast", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } }); // hull past 0 -> destroyed
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.pendingBlast.sourceId, b1.id);
  assert.equal(r.game.pendingBlast.exploded, true);
});

test("blast applies D6 + STR 10 to each named rig and clears the pending blast", () => {
  const r = startedRoom();
  r.game.pendingBlast = { sourceId: findRig(r, "b1").id, exploded: true };
  const a1 = findRig(r, "a1"); // light hull 6
  applyCommand(r, { verb: "blast", attrs: { targets: ["a1"], dice: { impacts: { a1: 6 }, location: { a1: 1 } } } });
  // D6 6 + STR 10 = 16 vs light hull (10/14/16) -> critical (3 SP).
  assert.equal(a1.hull.sp, 3);
  assert.equal(r.game.pendingBlast, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `pendingBlast`/`blast` unhandled.

- [ ] **Step 3: Write minimal implementation**

Add `pendingBlast` to `createRoom`'s `game` literal and `ensureGameShape`:

```js
      pendingBlast: null,
```
```js
  if (room.game.pendingBlast === undefined) room.game.pendingBlast = null;
```

Replace `onRigDamaged`:

```js
// §9 — on the transition to destroyed, roll a D12; 4+ erupts. Record a pending
// blast the controller resolves by naming Rigs within 12" (see the `blast` verb).
function onRigDamaged(room, rig, opts) {
  if (rig.destroyed && !rig._blastRolled) {
    rig._blastRolled = true;
    const roll = rollD(12, opts?.dice?.destruction, opts?.random);
    const exploded = roll >= 4;
    pushResolution(room, {
      kind: "destruction", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} destroyed — ${exploded ? "munitions erupt (mark rigs within 12\")" : "no secondary blast"}`,
      effects: [],
    });
    if (exploded) room.game.pendingBlast = { sourceId: rig.id, exploded: true };
  }
  checkAnnihilation(room);
}
```

Add the `blast` verb branch (STR 10 hit per §9; each affected Rig rolls its own location + impact):

```js
  } else if (verb === "blast") {
    if (room.game.pendingBlast) {
      const names = Array.isArray(a.targets) ? a.targets : [];
      for (const name of names) {
        const t = findRig(room, name);
        if (!t || t.destroyed) continue;
        const loc = hitLocation(rollD(12, a.dice?.location?.[name], options.random));
        const die = rollD(6, a.dice?.impacts?.[name], options.random);
        const total = die + 10; // D6 + STR 10 (§9)
        const sev = impactSeverity(total, IMPACT[t.weightClass][loc]);
        if (sev.sp > 0) applyDamage(room, t, loc, sev.sp, { random: options.random });
        pushResolution(room, {
          kind: "blast", actor: room.game.sides.find((s) => room.rigs.some((x) => x.id === room.game.pendingBlast.sourceId && (x.owner || "a") === s.id))?.id || null,
          rigId: t.id, rolls: [{ sides: 6, value: die, label: "D6" }],
          summary: `Blast hits ${t.name}: ${total} → ${sev.tier} (${sev.sp} SP to ${loc})`, effects: [],
        });
      }
      room.game.pendingBlast = null;
      changed = true;
    }
```

Add the imports at the top of `game-state.js`:

```js
import { ACTIONS, heatThreshold, hitLocation, impactSeverity, IMPACT } from "./rules.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: rig destruction blast and blast resolution verb"
```

---

### Task 6: Wire `resolveAttack` into the Fire and Aimed Shot actions

**Files:**
- Modify: `shared/combat.js` (`resolveAttack` orchestrator), `shared/game-state.js` (`combatCtx`, `performAction` fire/aimed, re-point manual `damage` to cascade)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("fire action resolves an attack, applies damage and consumes the reload", () => {
  const r = startedRoom(); // b acts first
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1"); // Light Mini Gun (Raking Fire) + Sword
  const a1 = findRig(r, "a1"); // Light target
  // Fire the melee Sword (no raking): STR 6-2(light)=4. 2 dice, both 6 -> impacts
  // 6+4+0(front)= 10 vs light hull (10/14/16) -> direct 1 each = 2 SP.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(a1.hull.sp, 4); // 6 - 2
  assert.equal(r.game.turn.actionsUsed, 1);
  assert.equal(r.game.resolutions.at(-1).kind, "attack");
});

test("firing an unloaded ranged weapon is rejected until reloaded", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  const used = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "side", range: "near",
    dice: { toHit: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6], location: 1, impacts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  } });
  assert.equal(r.game.turn.actionsUsed, used); // no-op, weapon not loaded
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — fire action still just adds heat (Plan 1 behaviour).

- [ ] **Step 3: Write minimal implementation**

Append the orchestrator to `shared/combat.js`:

```js
// §7 — full attack. Mutates through ctx.applyDamage / ctx.bumpHeat and returns
// a resolution descriptor (or { ok:false, reason } when the shot can't be made).
export function resolveAttack(room, attacker, target, opts, random, ctx) {
  const slot = opts.weapon === "melee" ? "melee" : "longRange";
  const weaponName = attacker.weapons?.[slot];
  const profile = WEAPON_PROFILES[weaponName];
  if (!profile) return { ok: false, reason: "no-weapon" };
  if (attacker.weaponsDestroyed.includes(weaponName)) return { ok: false, reason: "weapon-destroyed" };
  if (opts.range === "out") return { ok: false, reason: "range" };
  if (profile.type === "longRange" && !attacker.loaded.longRange) return { ok: false, reason: "reload" };

  const th = rollToHit(attacker, profile, opts, opts.dice?.toHit, random);
  let heat = (profile.perks.includes("Hot") ? 1 : 0) + th.fireModeHeat;
  if (profile.type === "longRange") attacker.loaded.longRange = false;

  const rolls = [{ sides: 6, value: th.hits, label: `hits (${th.hits}/${th.rof})` }];
  let impacts = [];
  let location = null;
  if (th.hits > 0) {
    location = opts.aimed ? opts.aimedLoc : hitLocation(rollD(12, opts.dice?.location, random));
    impacts = rollImpacts(attacker, target, profile, location, { arc: opts.arc, hits: th.hits, charged: opts.charged }, opts.dice, random);
    for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, { random, dice: opts.dice });
    applyOnHitPerks(room, attacker, target, profile, opts, random, ctx); // Task 8
  }
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  ctx.pushResolution(room, {
    kind: "attack", actor: attacker.owner, rigId: attacker.id,
    rolls, summary: `${attacker.name} → ${target.name} with ${weaponName}: ${th.hits} hit(s), ${total} SP${location ? ` to ${location}` : ""}`,
    effects: [],
  });
  return { ok: true, hits: th.hits, location, impacts, heat };
}

// Replaced with real perks in Task 8; a no-op keeps Task 6 green.
function applyOnHitPerks() {}
```

In `game-state.js`, import the combat orchestrator and build the ctx:

```js
import { resolveAttack, resolveRam } from "./combat.js";
```
```js
function combatCtx() {
  return { applyDamage, bumpHeat, pushResolution };
}
```

Extend `performAction` to handle `fire`/`aimed` (replace the "nothing extra" comment for those verbs). Insert before `bumpHeat(rig, def.heat)`:

```js
  if (act === "fire" || act === "aimed") {
    const target = findRig(room, a.target);
    if (!target) return false;
    const res = resolveAttack(room, rig, target, {
      weapon: a.weapon, target: a.target, arc: a.arc, range: a.range, cover: a.cover,
      aimed: act === "aimed", aimedLoc: String(a.loc || "hull").toLowerCase(),
      fullAuto: a.fullAuto === true || a.fullAuto === "true",
      charged: a.charged === true || a.charged === "true",
      dice: a.dice,
    }, random, combatCtx());
    if (!res.ok) return false;         // invalid shot — no budget spent
    t.actionsUsed += 1;
    bumpHeat(rig, def.heat);           // base 1 (Hot / fire-mode heat added inside resolveAttack)
    return true;
  }
```

Re-point the manual `damage` verb to the cascade so late-battle manual edits also enforce §8/§9. In the fallback verb group change:

```js
      if (verb === "damage") { applyDamage(room, rig, (a.loc || "").toLowerCase(), a.amount, { random: options.random }); changed = true; }
```

(Remove the now-redundant separate `checkAnnihilation` call there — `applyDamage` calls it via `onRigDamaged`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js` then `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/combat.js shared/game-state.test.js
git commit -m "feat: wire fire and aimed-shot actions to attack resolution"
```

---

### Task 7: Ram action (§5)

**Files:**
- Modify: `shared/combat.js` (`resolveRam`), `shared/game-state.js` (`performAction` ram)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("ram deals a D6 + ram-STR hit to both rigs", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1"); // Light ram STR 8
  const a1 = findRig(r, "a1"); // Light ram STR 8
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "ram", target: "a1",
    dice: { self: { location: 1, impact: 6 }, target: { location: 1, impact: 6 } },
  } });
  // Each: D6 6 + STR 8 = 14 vs light hull (10/14/16) -> severe (2 SP).
  assert.equal(a1.hull.sp, 4);
  assert.equal(b1.hull.sp, 4);
  assert.equal(r.game.turn.actionsUsed, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — ram still just adds heat.

- [ ] **Step 3: Write minimal implementation**

Append `resolveRam` to `shared/combat.js`:

```js
// §5 Ram — both Rigs take one D6 + their own weight-class ram STR hit.
export function resolveRam(room, attacker, target, opts, random, ctx) {
  for (const [rig, who] of [[attacker, "self"], [target, "target"]]) {
    const d = opts.dice?.[who] || {};
    const loc = hitLocation(rollD(12, d.location, random));
    const die = rollD(6, d.impact, random);
    const total = die + (RAM_STR[rig.weightClass] || 9);
    const sev = impactSeverity(total, IMPACT[rig.weightClass][loc]);
    if (sev.sp > 0) ctx.applyDamage(room, rig, loc, sev.sp, { random });
    ctx.pushResolution(room, {
      kind: "ram", actor: attacker.owner, rigId: rig.id,
      rolls: [{ sides: 6, value: die, label: "D6" }],
      summary: `Ram hits ${rig.name}: ${total} → ${sev.tier} (${sev.sp} SP to ${loc})`, effects: [],
    });
  }
  return { ok: true };
}
```

In `performAction`, handle `ram` before the base `bumpHeat`:

```js
  if (act === "ram") {
    const target = findRig(room, a.target);
    if (!target) return false;
    resolveRam(room, rig, target, { dice: a.dice }, random, combatCtx());
    t.actionsUsed += 1;
    bumpHeat(rig, def.heat);
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/combat.js shared/game-state.test.js
git commit -m "feat: ram action resolution"
```

---

### Task 8: On-hit perks — Incendiary, Shock, Impale, Staggering, Cleave

**Files:**
- Modify: `shared/combat.js` (real `applyOnHitPerks`)
- Test: `shared/combat.test.js`, `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/game-state.test.js`:

```js
test("Incendiary adds target heat; Shock halves target speed next round", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const heatBefore = a1.engine.heat;
  // Fire the Sword (Shock) — melee, 2 hits guaranteed.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(a1.speedHalvedNextRound, true);
  assert.equal(a1.engine.heat, heatBefore); // Sword is not Incendiary
});

test("Impale immobilises on a D12 of 8+", () => {
  const r = startedRoom();
  // Give b1 a Lance by swapping its melee weapon for this test.
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Lance";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1, impale: 9 },
  } });
  assert.equal(a1.immobilised, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — perks are a no-op.

- [ ] **Step 3: Write minimal implementation**

Replace the `applyOnHitPerks` stub in `shared/combat.js`:

```js
// §13 — post-hit perk effects (only reached when at least one hit landed).
function applyOnHitPerks(room, attacker, target, profile, opts, random, ctx) {
  const perks = profile.perks;
  const effects = [];
  if (perks.includes("Incendiary")) { ctx.bumpHeat(target, 1); effects.push("Incendiary +1 heat"); }
  if (perks.includes("Shock")) { target.speedHalvedNextRound = true; effects.push("Shock — speed halved"); }
  if (perks.includes("Impale")) {
    const roll = rollD(12, opts.dice?.impale, random);
    if (roll >= 8) { target.immobilised = true; effects.push(`Impale ${roll} — immobilised`); }
  }
  if (perks.includes("Staggering")) {
    const roll = rollD(6, opts.dice?.stagger, random);
    effects.push(`Staggering ${roll} — ${roll <= 2 ? "pivot left" : roll <= 4 ? "pushed 3\"" : "pivot right"} (positional)`);
  }
  if (perks.includes("Cleave") && opts.cleaveTarget) {
    const extra = room.rigs.find((x) => x.name.toLowerCase() === String(opts.cleaveTarget).toLowerCase());
    if (extra && !extra.destroyed) {
      const loc = hitLocation(rollD(12, opts.dice?.cleaveLocation, random));
      const [hit] = rollImpacts(attacker, extra, profile, loc, { arc: "front", hits: 1, charged: opts.charged }, { impacts: [opts.dice?.cleaveImpact] }, random);
      if (hit.sp > 0) ctx.applyDamage(room, extra, loc, hit.sp, { random });
      effects.push(`Cleave → ${extra.name}`);
    }
  }
  if (effects.length) ctx.pushResolution(room, {
    kind: "perk", actor: attacker.owner, rigId: target.id, rolls: [], summary: effects.join("; "), effects,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js` then `node --test shared/combat.test.js`
Expected: PASS. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/game-state.test.js shared/combat.test.js
git commit -m "feat: on-hit perks — incendiary, shock, impale, staggering, cleave"
```

---

## Self-Review

**Spec coverage (combat scope):**
- Weapon profiles + impact/location tables + STR/aim/ram data → Task 1. ✓
- To-hit with ACC/cover/aimed/hull, natural-6, fire-mode heat → Task 2. ✓
- Impact rolls, arcs, Raking Fire, AP/Rend, Brace → Task 3. ✓
- §8 cascade (Arms weapon+spill, additional-damage destroy/immobilise, engine skip, heat floor) → Task 4. ✓
- §9 destruction blast + `blast` verb + annihilation via `onRigDamaged` → Task 5. ✓
- Fire / Aimed Shot wired with reload gating, Hot/fire-mode heat → Task 6. ✓
- Ram → Task 7. ✓
- On-hit perks (Incendiary/Shock/Impale/Staggering/Cleave) → Task 8. ✓
- Hull-0 −2 actions / engine-0 skip already enforced in Plan 1 (Task 5); Hull-0 −1 Aim enforced in `computeModifiedAim` (Task 2). ✓
- **Positional facts** (arc, range, cover, cleave/blast targets, Evasive) remain player-supplied via command attrs — the app cannot see the table. Staggering/Legs-move penalties are surfaced as reminders, not auto-moved.

**Placeholder scan:** `applyOnHitPerks` (Task 6) and `onRigDamaged` (Task 4) are intentional forward-declarations, each replaced in a named later task (8 and 5) whose test fails until replaced. No other placeholders.

**Type consistency:** attack opts `{ weapon, target, arc, range, cover, aimed, aimedLoc, fullAuto, charged, dice }`, impact entries `{ die, total, tier, sp }`, `resolveAttack` return `{ ok, hits, location, impacts, heat }` (or `{ ok:false, reason }`), ctx `{ applyDamage, bumpHeat, pushResolution }`, `game.pendingBlast = { sourceId, exploded }`. Verbs added: `blast`; `action` now dispatches `fire`/`aimed`/`ram`. `applyDamage(room, rig, loc, amount, opts)` signature is used consistently, with `opts` carrying `{ random, dice }`.
