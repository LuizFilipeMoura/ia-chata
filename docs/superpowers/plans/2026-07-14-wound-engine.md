# Wound Engine Implementation Plan (1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the impact-total damage model with a d10 wound roll — `hit d6 → wound d10 → location d12`, damage = per-weapon D — killing the 69 mathematically-impossible matchups.

**Architecture:** The maths barely moves. Today: `die + STR + mods ≥ direct`. After: `d10 ≥ 6 + T − (STR + mods)`. Both are "effective STR against a threshold" — the modifier sum is *identical*, it just moves from the total's side to STR's side. So `computeStr` is untouched and all fifteen of its STR effects port for free. The real work is `rollImpacts` → `rollWounds`, a toughness grid replacing 48 armour numbers, and five effects that reference severity tiers that no longer exist.

**Tech Stack:** Plain ES modules (`"type": "module"`). Tests are `node:test` + `node:assert/strict`. Run with `node --test shared/<file>.test.js`. No build step for `shared/`.

**Spec:** `docs/superpowers/specs/2026-07-14-hit-wound-location-design.md`

**Scope:** This plan is the engine only (`shared/`). The resolution-ledger UI is Plan 2 — this plan keeps the existing panel *working* (a wound line instead of an impact total) but does not build the full ledger.

---

## Background for the engineer

### The working tree is dirty — this matters

There is **unrelated in-flight work uncommitted** across ~23 files (repair tuning in
`shared/game-state.js`, budget auto-end, V2 client changes). It is not yours. It is green:
the baseline is **593 passing, 0 failing**.

Three rules follow:

1. **Never `git add` a directory.** Not `shared/`, not `client/`, not `.`. Stage only the files you
   edited, by name. A directory add commits someone else's work-in-progress.
2. **`shared/game-state.js` and `shared/game-state.test.js` contain their changes and yours.**
   Staging those files unavoidably includes their work. That is accepted and expected — do not try
   to split it, and do not revert anything you did not write.
3. **Any test failure you see is yours.** The baseline is 0 failures. If something unrelated breaks,
   you broke it — do not "fix" a test you do not understand.

### Three facts about this codebase

**1. `shared/` is imported by both server and client.** `combat.js` is pure — it never imports `game-state.js` (that would be an import cycle). Anything it needs from game-state arrives via an injected `ctx` object or on the unit objects passed in. `combat.js` may import from `rules.js` and `unit-kinds.js` only. **Do not break this.**

**2. The damage pipeline** lives in `shared/combat.js` `resolveAttack` (~line 480):
- `rollToHit` → counts landed hit dice against a d6 target number (`modAim`)
- a d12 picks the location
- `rollImpacts` → rolls one d6 per landed hit, sums `die + STR + modifiers`, grades it against a 3-tier armour row
- `ctx.applyDamage` applies the SP

You are replacing only the third step.

**3. Dice are injectable.** Every roll goes through `rollD(sides, provided, random)` — if `provided` is a number it is used verbatim. Tests pass `opts.dice = { toHit: [...], impacts: [...], location: n }` to force outcomes. This is how you write deterministic tests. **Keep this pattern**; you are renaming `impacts` → `wounds` in that structure.

## Why this rewrite exists

The impact total caps at `6 + STR + arc`. Melee gets no arc bonus at all, so its ceiling is `6 + STR` forever. A light Circular Saw (STR 6, light weight mod −2 → 4) tops out at 10 against a medium hull's `direct: 11`. It cannot deal damage — not rarely, *never*. An exhaustive sweep found 69 such combos.

A wound roll cannot be unwinnable: the target number clamps at 10, so a natural 10 always wounds. All 69 vanish structurally, with no floor rule. **The clamp in `woundTarget` is the single most load-bearing line in this plan.**

## File structure

| File | Responsibility | Change |
|---|---|---|
| `shared/rules.js` | `woundTarget`, `WOUND_DIE`; re-export `toughness` | Add wound roll; **delete** `impactSeverity`, `impactRow` re-export |
| `shared/unit-kinds.js` | Per-kind toughness grids | **Delete** `RIG_IMPACT` + all `armour` tables + `impactRow`; add `TOUGHNESS` + `toughnessOf` |
| `shared/game-state.js` | Weapon stats (STR + D) | Rescale STR, add `d`; convert the Blast branch |
| `shared/combat.js` | `rollWounds`, `arcBonus`, `resolveAttack` | Core rewrite |
| `client/shared.d.ts` | Type mirrors for the client | Swap `impactRow` → `toughnessOf` |

---

## Task 1: The wound roll

**Files:**
- Modify: `shared/rules.js:85-91` (replace `impactSeverity`)
- Test: `shared/rules.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/rules.test.js`:

```js
test("woundTarget — TN is 6 + T - S", () => {
  assert.equal(woundTarget(5, 5), 6);  // even match
  assert.equal(woundTarget(7, 5), 4);  // stronger
  assert.equal(woundTarget(3, 5), 8);  // weaker
});

test("woundTarget — clamps to 2..10 so no matchup is ever hopeless", () => {
  // A natural 10 must ALWAYS wound. This is the guarantee that kills the
  // 69 dead zones of the impact-total model; do not relax it.
  assert.equal(woundTarget(1, 20), 10);
  // A natural 1 must NEVER wound.
  assert.equal(woundTarget(20, 1), 2);
});

test("woundTarget — the original bug case is possible, not impossible", () => {
  // light Circular Saw: STR 5 base, light weight mod -1 => 4. Medium hull T5.
  // Under the old model this was mathematically 0 damage. Now it is 7+ (40%).
  assert.equal(woundTarget(4, 5), 7);
});

test("woundTarget — junk STR coerces (fails safe), junk toughness throws", () => {
  assert.equal(woundTarget(undefined, 5), 10);          // 10% — safe direction
  assert.throws(() => woundTarget(5, undefined), /toughness must be a number/);
});
```

Add `woundTarget` to the existing import at the top of `shared/rules.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/rules.test.js`
Expected: FAIL — `woundTarget is not a function` / `not exported`.

- [ ] **Step 3: Implement**

In `shared/rules.js`, **delete** `impactSeverity` (lines 84-91, including its `// Impact Roll total vs a location row` comment) and put this in its place:

```js
// §7.5 — the wound roll. A shot's effective STR is compared to the struck
// location's Toughness: roll a d10 against `6 + T - S`.
//
// The clamp is load-bearing. It guarantees a natural 10 always wounds and a
// natural 1 never does, so no weapon/target/location matchup can be
// mathematically hopeless. That was the failure mode of the impact-total model
// this replaces: its total capped at `6 + STR + arc`, leaving 69 combos that
// could never deal damage at any roll. Do not remove the clamp to "let armour
// really matter" — that reintroduces the bug.
//
// Each point of STR is worth exactly 10%, so the roll is readable as a
// percentage with no lookup table.
export const WOUND_DIE = 10;

export function woundTarget(str, toughness) {
  const s = Math.floor(Number(str) || 0);
  // No `|| 0` on toughness, deliberately: a missing T coercing to 0 yields TN 2
  // (a 90% wound), the single most dangerous default in the system. STR may
  // coerce — it fails toward TN 10 (10%) — but T must be real.
  const t = Math.floor(Number(toughness));
  if (!Number.isFinite(t)) throw new Error(`woundTarget: toughness must be a number, got ${toughness}`);
  return Math.max(2, Math.min(WOUND_DIE, 6 + t - s));
}
```

**The asymmetry is the point.** Junk STR fails safe, junk Toughness fails maximally unsafe. An
earlier draft of this plan coerced both and paired it with a `toughnessOf` that returned `null` on a
failed lookup — together they silently made any mislooked-up location the softest thing on the
table, which is the exact class of bug this rewrite exists to kill.

Also delete `impactRow` (lines 80-82) and drop `impactRow as _impactRow` from the `./unit-kinds.js` import on line 4 — Task 2 replaces it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/rules.test.js`
Expected: PASS. Other files will not resolve their imports yet — expected until Task 7 rewires `resolveAttack`.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -m "feat(combat): add the d10 wound roll, drop impactSeverity"
```

---

## Task 2: Toughness grids

**Files:**
- Modify: `shared/unit-kinds.js:6-31` (`RIG_IMPACT`), `:49`, `:75-80`, `:108-113`, `:184-189`
- Test: `shared/unit-kinds.test.js`

**Design note:** the grids below are **designed, not ported.** Deriving them from the old rows (`direct − 6`) gives engine values of T1–T3, which would let every weapon in the game wound an engine on `2+` and make it the only rational aim point on the table. Tank mirrors the heavy ladder and Walker the medium ladder, matching the `Strawman` comments on their old armour tables.

- [ ] **Step 1: Write the failing tests**

Add to `shared/unit-kinds.test.js`:

```js
test("toughnessOf — rig reads the weight-class grid", () => {
  assert.equal(toughnessOf("rig", "hull", "medium"), 5);
  assert.equal(toughnessOf("rig", "engine", "light"), 3);
  assert.equal(toughnessOf("rig", "hull", "colossal"), 7);
});

test("toughnessOf — flat kinds ignore weight class", () => {
  assert.equal(toughnessOf("tank", "hull"), 6);
  assert.equal(toughnessOf("tank", "tracks"), 5);
  assert.equal(toughnessOf("walker", "hull"), 5);
  assert.equal(toughnessOf("walker", "mount"), 4);
});

test("toughnessOf — every part of every kind has a value", () => {
  // A missing T would silently become 0 and make the part unwoundable-adjacent.
  for (const kind of ["tank", "walker"]) {
    for (const p of partNamesOf(kind)) {
      assert.equal(typeof toughnessOf(kind, p), "number", `${kind}/${p}`);
    }
  }
  for (const wc of ["light", "medium", "heavy", "colossal"]) {
    for (const p of partNamesOf("rig")) {
      assert.equal(typeof toughnessOf("rig", p, wc), "number", `rig/${wc}/${p}`);
    }
  }
});

test("toughnessOf — an unresolvable lookup throws, never a silent 0", () => {
  // A sentinel return would coerce to 0 inside woundTarget and yield a 2+ wound
  // (90%) — the failed lookup would make the location the softest on the table.
  assert.throws(() => toughnessOf("nope", "hull", "medium"), /unknown kind/);
  assert.throws(() => toughnessOf("rig", "nope", "medium"), /no T for/);
  assert.throws(() => toughnessOf("rig", "hull"), /no T for/);  // rig needs a weightClass
});
```

Add `toughnessOf` and `partNamesOf` to the imports at the top of `shared/unit-kinds.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/unit-kinds.test.js`
Expected: FAIL — `toughnessOf is not a function`.

- [ ] **Step 3: Implement**

In `shared/unit-kinds.js`, replace `RIG_IMPACT` (lines 6-31) with:

```js
// §7.5 — Toughness per part. Replaces the old 48-number impact grid: a shot's
// effective STR is compared to these via `woundTarget` (rules.js).
//
// Designed, not derived. Converting the old armour rows mechanically
// (`direct - 6`) yields engine values of T1-T3, which would let every weapon in
// the game wound an engine on 2+ and make it the only rational aim point.
//
// Per-location texture is carried TWICE on purpose: a soft T here, and a small
// SP pool in RIG_DEFAULTS (game-state.js). An engine is fragile because it is
// both easier to wound and has less to lose.
const RIG_TOUGHNESS = {
  light:    { hull: 4, arms: 3, legs: 3, engine: 3 },
  medium:   { hull: 5, arms: 4, legs: 4, engine: 3 },
  heavy:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  colossal: { hull: 7, arms: 6, legs: 6, engine: 5 },
};
```

Replace `armour: RIG_IMPACT,` on line 49 with `toughness: RIG_TOUGHNESS,`.

Replace the tank `armour` block (lines 75-80) with — Strawman ⚙, mirrors the heavy Rig ladder:

```js
    toughness: { hull: 6, tracks: 5, turret: 5, engine: 4 },
```

Replace the walker `armour` block (lines 108-113) with — Strawman ⚙, mirrors the medium Rig ladder:

```js
    toughness: { hull: 5, legs: 4, mount: 4, engine: 3 },
```

Replace `impactRow` (lines 184-189) with:

```js
// Toughness for a part. Rig grids are keyed by weight class (`byWeight`);
// Tank/Walker are flat. Throws rather than returning a sentinel: every caller
// feeds this straight into woundTarget, where a non-numeric T would coerce to 0
// and yield a 2+ wound (90%) — a lookup typo would silently make a location the
// softest thing on the table. Fail loud instead.
export function toughnessOf(kindId, partName, weightClass) {
  const kind = UNIT_KINDS[kindId];
  if (!kind?.toughness) throw new Error(`toughnessOf: unknown kind "${kindId}"`);
  const row = kind.byWeight ? kind.toughness[weightClass] : kind.toughness;
  const v = row?.[partName];
  if (typeof v !== "number") {
    throw new Error(`toughnessOf: no T for ${kindId}/${weightClass ?? "flat"}/${partName}`);
  }
  return v;
}
```

Add `byWeight: true` to `UNIT_KINDS.rig` beside `toughness: RIG_TOUGHNESS`; omit it on tank/walker.
**Declare the shape, don't probe for it** — this codebase decides rig-vs-flat explicitly everywhere
else (`weaponMode`, `flatPick`, `hasHeat`), and probing conflates "rig called without a weightClass"
with "unknown part".

- [ ] **Step 4: Run to verify they pass**

Run: `node --test shared/unit-kinds.test.js`
Expected: PASS.

- [ ] **Step 5: Re-export from rules.js**

`combat.js` imports only from `rules.js`, so add the shim beside where `impactRow` used to live in `shared/rules.js`:

```js
export function toughnessOf(kindId, partName, weightClass) {
  return _toughnessOf(kindId, partName, weightClass);
}
```

and update the import on line 4 to `import { hitPart, toughnessOf as _toughnessOf } from "./unit-kinds.js";`.

- [ ] **Step 6: Commit**

```bash
git add shared/unit-kinds.js shared/unit-kinds.test.js shared/rules.js
git commit -m "feat(combat): toughness grids replace the 48-number armour tables"
```

---

## Task 3: Weapon STR rescale + damage stat

**Files:**
- Modify: `shared/game-state.js:34-76`
- Test: `shared/game-state.test.js`

STR rescales 4..13 → 3..11 so it spans the d10 ladder without clamping at either end. `d` is **hand-assigned per weapon** — deriving it from ROF collapses all eleven ROF-1 weapons onto an identical output, which is the exact differentiation failure `d` exists to prevent.

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("every weapon carries a hand-assigned damage stat in range 1..5", () => {
  const all = { ...WEAPONS.longRange, ...WEAPONS.melee, ...UNIT_WEAPONS };
  for (const [name, w] of Object.entries(all)) {
    assert.equal(typeof w.d, "number", `${name} has no d`);
    assert.ok(w.d >= 1 && w.d <= 5, `${name} d=${w.d} out of range`);
  }
});

test("weapon STR sits on the rescaled 3..11 ladder", () => {
  const all = { ...WEAPONS.longRange, ...WEAPONS.melee, ...UNIT_WEAPONS };
  for (const [name, w] of Object.entries(all)) {
    assert.ok(w.str >= 3 && w.str <= 11, `${name} str=${w.str} off-ladder`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `Mini Gun has no d`.

- [ ] **Step 3: Implement**

Replace `WEAPONS` (lines 34-61) with — note `str` changed on every row and `d` is new:

```js
export const WEAPONS = {
  longRange: {
    "Mini Gun":       { rof: 8, str: 3,  d: 1, sweet: 7,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, perks: ["Raking Fire"], machineGun: true },
    "Double MG":      { rof: 8, str: 5,  d: 1, sweet: 9,  peak: 1, dropoff: 0.25, minRange: 0, maxRange: 20, perks: ["Raking Fire"], machineGun: true },
    "Autocannon":     { rof: 4, str: 7,  d: 2, sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26 },
    "Arc Gun":        { rof: 2, str: 8,  d: 3, sweet: 20, peak: 1, dropoff: 0.18, minRange: 0, maxRange: 32 },
    "Mortar":         { rof: 3, str: 7,  d: 2, sweet: 18, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
    "Sniper Cannon":  { rof: 1, str: 10, d: 4, sweet: 22, peak: 2, dropoff: 0.15, minRange: 0, maxRange: 28 },
    "Siege Maul":     { rof: 1, str: 11, d: 5, sweet: 8,  peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 },
    "Missile Barrage":{ rof: 4, str: 7,  d: 2, sweet: 20, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
    "Harpoon":        { rof: 1, str: 10, d: 3, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 },
    "Rivet Gun":      { rof: 6, str: 3,  d: 1, sweet: 6,  peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 },
    "Crossbow":       { rof: 1, str: 8,  d: 4, sweet: 18, peak: 3, dropoff: 0.25, minRange: 0, maxRange: 24 },
  },
  melee: {
    "Sword":         { rof: 2, str: 5,  d: 3, acc: [0, 0], rng: [2, 2], melee: true },
    "Circular Saw":  { rof: 3, str: 5,  d: 2, acc: [0, 0], rng: [2, 2], melee: true },
    "Chainsaw":      { rof: 3, str: 7,  d: 2, acc: [0, 0], rng: [2, 2], melee: true },
    "Claw":          { rof: 2, str: 7,  d: 3, acc: [1, 1], rng: [2, 2], melee: true },
    "Lance":         { rof: 1, str: 9,  d: 4, acc: [1, 1], rng: [2, 2], melee: true },
    "Wrecking Ball": { rof: 1, str: 10, d: 5, acc: [0, 0], rng: [2, 2], melee: true },
    "Bulwark Shield":{ rof: 1, str: 5,  d: 3, acc: [0, 0], rng: [2, 2], melee: true },
    "Flamethrower":  { rof: 4, str: 6,  d: 2, acc: [1, 0], rng: [2, 2], melee: true },
    "Anchor":        { rof: 1, str: 10, d: 4, acc: [0, 0], rng: [2, 2], melee: true },
    "Pressure Claw": { rof: 2, str: 7,  d: 3, acc: [1, 1], rng: [2, 2], melee: true },
    "Talon":         { rof: 2, str: 6,  d: 3, acc: [1, 1], rng: [2, 2], melee: true },
  },
};
```

Replace `UNIT_WEAPONS` (lines 66-76), keeping every comment already on those rows:

```js
export const UNIT_WEAPONS = {
  "Tank Cannon":      { rof: 1, str: 10, d: 5, sweet: 18, peak: 2, dropoff: 0.16, minRange: 0, maxRange: 28, flatPick: true },
  "Autocannon Mount": { rof: 3, str: 7,  d: 2, sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26, flatPick: true },
  "Coaxial MG":       { rof: 6, str: 4,  d: 1, sweet: 8,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, flatPick: true, machineGun: true },
  "Rocket Pod":       { rof: 2, str: 8,  d: 3, sweet: 20, peak: 1, dropoff: 0.16, minRange: 4, maxRange: 34, flatPick: true },
  "Dozer Blade":      { rof: 1, str: 8,  d: 4, acc: [0, 0],  rng: [2, 2], melee: true, flatPick: true },
  "Ram Spike":        { rof: 1, str: 9,  d: 4, acc: [1, 0],  rng: [2, 2], melee: true, flatPick: true },
  // Built-in weak weapon every support unit carries; replaced by a Damage
  // module. peak 0 + dropoff 0 = a flat ACC 0 at any distance (spec §Sidearm).
  "Sidearm":          { rof: 2, str: 3,  d: 1, sweet: 6,  peak: 0, dropoff: 0,    minRange: 0, maxRange: 12, flatPick: true },
};
```

Compress `WEIGHT_STR_MOD` in `shared/rules.js:64` to match the ×0.8 STR rescale:

```js
export const WEIGHT_STR_MOD = { light: -1, medium: 0, heavy: 1, colossal: 2 };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: the two new tests PASS. Others still fail — Task 8 migrates them.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js shared/rules.js
git commit -m "feat(combat): rescale weapon STR to the d10 ladder, add per-weapon D"
```

---

## Task 4: Melee gains the arc ladder

**Files:**
- Modify: `shared/combat.js:264-274`
- Test: `shared/combat.test.js`

Melee returning 0 from `arcBonus` is the root asymmetry that produced the dead zones: ranged had a +4 ladder to climb into high armour, melee had nothing. It must not survive the rewrite.

- [ ] **Step 1: Write the failing tests**

Add to `shared/combat.test.js`:

```js
test("arcBonus — melee gets the same side/rear ladder as ranged", () => {
  const melee = { melee: true, acc: [0, 0] };
  assert.equal(arcBonus(melee, "front"), 0);
  assert.equal(arcBonus(melee, "side"), 2);
  assert.equal(arcBonus(melee, "rear"), 3);
});

test("arcBonus — Raking Fire still replaces the ladder and auto-fails the front", () => {
  const rake = { perks: ["Raking Fire"] };
  assert.equal(arcBonus(rake, "front"), null);
  assert.equal(arcBonus(rake, "side"), 3);
  assert.equal(arcBonus(rake, "rear"), 6);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js`
Expected: FAIL — melee side returns 0, not 2.

- [ ] **Step 3: Implement**

Replace `arcBonus` (lines 262-274) — values are the old ones × 0.8, matching the STR rescale:

```js
// §7.7 / §13 — arc STR bonus. Raking Fire (machine guns) replaces the standard
// side/rear values and cannot damage the front arc (returns null = auto-fail).
//
// Melee used to return 0 here. That was the root cause of the impact-total
// model's 69 dead zones: ranged had a ladder to climb into heavy armour and
// melee had none, so a melee total was capped at `6 + STR` forever. Melee now
// falls through to the shared ladder. The Raking branch stays FIRST — no melee
// weapon carries the perk, but ordering makes that explicit.
export function arcBonus(profile, arc) {
  if (hasPerk(profile, "Raking Fire")) {
    if (arc === "side") return 3;
    if (arc === "rear") return 6;
    return null;
  }
  if (arc === "side") return 2;
  if (arc === "rear") return 3;
  return 0;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test shared/combat.test.js -t "arcBonus"`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "fix(combat): melee gains the arc ladder it never had"
```

---

## Task 5: `rollImpacts` → `rollWounds`

**Files:**
- Modify: `shared/combat.js:296-374`
- Test: `shared/combat.test.js`

This is the core of the rewrite. Read the whole existing `rollImpacts` before editing.

**What is preserved exactly:** every modifier and its sign. The sum `bonus + braced + hardened + shieldBlunt + cracked + sideRearDock` moves from the *total* to the *effective STR*, which is mathematically the same comparison. Do not re-tune anything here.

**What must stay a hard zero:** `bonus == null` (Raking front-arc) and `shieldNegates`. These short-circuit before any roll today and must keep doing so. The distinction this rewrite exists to preserve: an *armour-row* zero was a bug; an *earned* zero (a raised shield, firing into a rake's blind arc) is a mechanic.

- [ ] **Step 1: Write the failing tests**

Add to `shared/combat.test.js`:

```js
test("rollWounds — a wound deals the weapon's D, not 1", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", {});
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  // STR 10 vs medium hull T5 => TN 2+. A 9 wounds.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [9] }, () => 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].sp, 5); // Wrecking Ball d: 5
});

test("rollWounds — a natural 10 always wounds however hopeless the matchup", () => {
  const attacker = makeRig(1, "A", "light", "a", { melee: "Circular Saw" });
  const target = makeRig(2, "B", "colossal", "b", {});
  const profile = { ...WEAPONS.melee["Circular Saw"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 2); // Circular Saw d: 2 — the old model gave 0, always
});

test("rollWounds — a natural 1 never wounds however lopsided", () => {
  const attacker = makeRig(1, "A", "colossal", "a", { melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "light", "b", {});
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [1] }, () => 0);
  assert.equal(out[0].sp, 0);
});

test("rollWounds — a raised shield still negates on a natural 10 (earned zero)", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { melee: "Bulwark Shield" });
  target.preparation = { type: "raise-shield" };
  const profile = { ...WEAPONS.melee["Sword"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(out[0].negated, true);
});

test("rollWounds — Raking Fire front arc still auto-fails on a natural 10", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun" });
  const target = makeRig(2, "B", "medium", "b", {});
  const profile = { ...WEAPONS.longRange["Mini Gun"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
});

test("rollWounds — defender modifiers reduce effective STR, not the roll", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", {});
  target.preparation = { type: "brace" };
  const profile = { ...WEAPONS.melee["Sword"] };
  // Sword STR 5, medium mod 0, front arc 0, braced -2 => effStr 3 vs T5 => TN 8.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [7] }, () => 0);
  assert.equal(out[0].sp, 0);   // 7 < 8
  assert.equal(out[0].target, 8);
});
```

Add `rollWounds` to the `./combat.js` import at the top of `shared/combat.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "rollWounds"`
Expected: FAIL — `rollWounds is not a function`.

- [ ] **Step 3: Implement**

Rename the function and replace its body. Keep every existing comment block for the modifiers (Kneecapper, Brace, Harden, Reactive Plating, Breach Grip) — they explain *why* each number exists and are still accurate. Replace lines 296-374 with:

```js
export function rollWounds(attacker, target, profile, location, opts, providedDice, random) {
  // Thread the real target rig into computeStr's opts (the caller's `opts`
  // here may carry only a display name at `opts.target` — see resolveAttack)
  // so target-conditional STR upgrades (Cold Bore, Opportunist, §13) work.
  const str = computeStr(attacker, profile, { ...opts, target, location });
  let bonus = arcBonus(profile, opts.arc);
  // Kneecapper — bypasses Raking Fire's front-arc auto-fail (arcBonus
  // returning null) but ONLY when the struck location is a limb on the TARGET.
  if (bonus == null && profile.upgradeEffect?.kneecapper) {
    const role = roleOf(target.kind || "rig", location);
    if (role === "mobility" || role === "weapon") bonus = 2;
  }
  // Brace's front-arc dock is skipped by a Piledriver Protocol guard-break.
  const braced = !opts.guardBreak && target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  // Harden (Ablative Plating active). Depth read from the upgrade's effect tag.
  const hardenDepth = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.hardenImpact ?? 1;
  const hardened = target.hardened ? -hardenDepth : 0;
  // Reactive Plating (Countermeasures) — side/rear attacks lose STR.
  let sideRearDock = 0;
  if (target.equipment === "reactive-plating" && (opts.arc === "side" || opts.arc === "rear")) {
    sideRearDock = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.sideRearStr ?? -1;
  }
  const shield = target.preparation?.type === "raise-shield" ? shieldCoverage(target) : null;
  const shieldNegates = !!shield && shield.negate.includes(opts.arc);
  const shieldBlunt = shield && shield.blunt.includes(opts.arc) ? -3 : 0;
  // Breach Grip (§13, Claw) — a cracked location is easier to wound while the
  // crack is live.
  const crackExpiry = target.cracked?.[location];
  const cracked = crackExpiry != null && opts.round != null && crackExpiry >= opts.round ? 2 : 0;

  const toughness = toughnessOf(target.kind || "rig", location, target.weightClass);
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(WOUND_DIE, providedDice?.wounds?.[i], random);
    // Earned zeroes — a raised shield, or firing into a rake's blind arc. These
    // short-circuit before the roll is compared and stay hard zeroes even on a
    // natural 10. An ARMOUR zero was the bug this rewrite kills; an EARNED zero
    // is a mechanic and must survive.
    if (bonus == null || shieldNegates) {
      out.push({ die, target: null, str: null, toughness, sp: 0, negated: true });
      continue;
    }
    const effStr = str + bonus + braced + hardened + shieldBlunt + cracked + sideRearDock;
    const tn = woundTarget(effStr, toughness);
    // Penetrator Rounds (§13) — every 3rd Autocannon volley skips the wound
    // roll entirely (was: forced Severe against the old armour row).
    let wounded = opts.penetrate || die >= tn;
    // Armour Piercing — reroll a failed wound. Buys frequency, not depth.
    if (!wounded && hasPerk(profile, "Armour Piercing")) {
      const re = rollD(WOUND_DIE, providedDice?.ap?.[i], random);
      wounded = re >= tn;
    }
    let sp = 0;
    if (wounded) {
      // Rend — +1 D per wound. Buys depth, not frequency (cf. AP above).
      const rend = hasPerk(profile, "Rend") ? 1 : 0;
      // Evisceration (§13, Talon) — +1 D against a location already at or below
      // half its max SP (was: forced Critical).
      const evisc = profile.upgradeEffect?.eviscerate && target[location]
        && target[location].sp <= target[location].max / 2 ? 1 : 0;
      sp = (profile.d || 1) + rend + evisc;
    }
    const resolved = applyDefensiveReactions(
      target,
      { die, target: tn, str: effStr, toughness, sp, kind: "wound" },
      { location, spendHeat: opts.spendHeat || (() => {}) },
    );
    out.push(resolved);
  }
  return out;
}
```

Update the `./rules.js` import at the top of `combat.js` (line 5): drop `impactRow` and `impactSeverity`, add `toughnessOf`, `woundTarget`, `WOUND_DIE`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test shared/combat.test.js -t "rollWounds"`
Expected: all six PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): rollImpacts becomes rollWounds on a d10"
```

---

## Task 6: Migrate the defensive-reaction seam

**Files:**
- Modify: `shared/combat.js:394-398` (`ABLATIVE_SOFTEN`), `:425-460`
- Test: `shared/combat.test.js`

`applyDefensiveReactions` is the single seam where a defender may alter an incoming attack. Two of
its branches are built on machinery Task 1 deleted:

- **Reactive Armor** re-derives severity with `impactSeverity(hit.total - 2, ctx.row)` — there is no
  `total`, no `row`, and no `impactSeverity`.
- **Ablative Cascade** softens one step through `ABLATIVE_SOFTEN` (`critical→severe→direct→none`) —
  there are no tiers.

The `"tohit"` branch (Point-Defense) is untouched: it operates before wounds exist.

**Design decisions, from the spec:** Reactive Armor's −2 becomes −2 effective STR, applied like
Harden — so it re-rolls nothing and simply raises the target number. Ablative Cascade **negates one
wound per charge**, which is an *earned* zero and is allowed to zero a wound that landed.

- [ ] **Step 1: Write the failing tests**

```js
test("Reactive Armor — docks 2 effective STR rather than re-deriving a tier", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", {});
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "reactive-armor";
  target.equipState = { reactiveArmorLocs: [] };
  const profile = { ...WEAPONS.melee["Sword"] };
  // Sword STR 5 vs T5 => TN 6. Reactive Armor -2 => effStr 3 => TN 8.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [7] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.ok(target.equipState.reactiveArmorLocs.includes("hull"));
});

test("Ablative Cascade — a charge negates a wound outright (an earned zero)", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", {});
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "ablative-cascade";
  target.equipState = { ablativeCharges: 2 };
  let heat = 0;
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1, spendHeat: (n) => { heat += n; } }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(target.equipState.ablativeCharges, 1);
  assert.equal(heat, 1);
});

test("Ablative Cascade — spends nothing on a wound that already failed", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", {});
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "ablative-cascade";
  target.equipState = { ablativeCharges: 2 };
  const profile = { ...WEAPONS.melee["Sword"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [1] }, () => 0);
  assert.equal(target.equipState.ablativeCharges, 2);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "Reactive Armor"`
Expected: FAIL — the branch still reads `hit.kind === "impact"`.

- [ ] **Step 3: Implement**

Delete the `ABLATIVE_SOFTEN` map (lines 391-398) entirely — there are no tiers to step through.

Replace the Reactive Armor branch (lines 425-444) with:

```js
  // Reactive Armor (Ablative Plating, Tuned) — the FIRST damaging wound each
  // round to a location hardens THAT location by -2 effective STR (Harden-
  // equivalent) until this rig's next activation; further wounds to a hardened
  // location are docked too. The per-round list is cleared in Recovery
  // (refreshEquipState). Wound-stage only, and only for a wound that actually
  // landed: the seam is reached for every resolved wound including failed ones.
  //
  // The dock is applied in rollWounds alongside Harden (it reads `target.hardened`
  // and the location list); this branch only RECORDS the location. Re-deriving
  // damage here would double-apply it.
  if (hit.kind === "wound" && hit.sp > 0
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.reactiveArmor) {
    const locs = target.equipState?.reactiveArmorLocs;
    if (locs && !locs.includes(ctx.location)) locs.push(ctx.location);
  }
```

Then in `rollWounds` (Task 5), fold the dock into the effective-STR sum. Add beside `hardened`:

```js
  // Reactive Armor — a location already hardened this round docks a further 2.
  const reactive = target.equipState?.reactiveArmorLocs?.includes(location) ? -2 : 0;
```

and add `+ reactive` to the `effStr` sum.

Replace the Ablative Cascade branch with:

```js
  // Ablative Cascade (Ablative Plating, Prototype) — spend one charge to negate
  // a wound outright; each spend runs the defender +1 heat via ctx.spendHeat.
  // Charges refill to 2 each Recovery (game-state refreshEquipState).
  //
  // This is an EARNED zero and is allowed to zero a landed wound — unlike the
  // armour-row zeroes the wound model exists to eliminate, it costs a finite
  // resource. Gate on sp > 0 so a charge is never burnt on a wound that already
  // failed.
  if (hit.kind === "wound" && hit.sp > 0
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.ablativeCascade
      && (target.equipState?.ablativeCharges || 0) > 0) {
    target.equipState.ablativeCharges -= 1;
    ctx.spendHeat(1);
    return { ...hit, sp: 0, negated: true };
  }
```

Update the seam's doc comment (lines 376-390): the second stage is `"wound"`, not `"impact"`, and it carries `{ location }` — there is no `row`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test shared/combat.test.js -t "Reactive Armor|Ablative"`
Expected: all three PASS.

- [ ] **Step 5: Delete the machine-gun crit cap**

It has nothing to cap — there are no tiers, and volume weapons are now bounded by `d: 1`. Confirm it is gone:

Run: `grep -n "machineGun" shared/combat.js`
Expected: no hit inside `rollWounds`. The `machineGun` flag itself stays on the weapons (Raking Fire and other rules read it).

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): migrate the defensive-reaction seam to wounds"
```

---

## Task 7: Rewire `resolveAttack`

**Files:**
- Modify: `shared/combat.js:539-630`
- Test: `shared/combat.test.js`, `shared/rules.test.js`

**Inherited from Task 1 — land the deferred derivation.** `shared/rules.test.js` carries a
`TODO(task-7)` on the bug-case test. It currently hardcodes `woundTarget(4, 5) === 7`, which cannot
detect drift: retune the Saw's STR or the weight ladder and the test still passes while the real
matchup silently goes dead — the exact regression it exists to catch.

It was deferred for a real reason, not laziness. Deriving the operands needs `WEAPONS` from
`game-state.js`, and `game-state.js:5` imports `combat.js`, which imported the symbols Task 1
deleted — so the import chain killed the whole suite at load. **This task is what unblocks it**:
once `combat.js` no longer imports `impactRow`/`impactSeverity`, the chain resolves.

After the `resolveAttack` work below is green, replace that test:

```js
import { WEAPONS } from "./game-state.js";

test("woundTarget — the original bug case is possible, not impossible", () => {
  // The light Circular Saw vs a medium hull is the matchup that motivated this
  // rewrite: under the impact-total model it was mathematically 0 damage at any
  // roll. Derived from the live stats, not hardcoded, so a future retune of the
  // Saw or the weight ladder cannot silently send it back to hopeless.
  const str = WEAPONS.melee["Circular Saw"].str + WEIGHT_STR_MOD.light;
  assert.equal(woundTarget(str, 5), 7); // medium hull T5 => 40%
});
```

This holds both before and after the Task 3 rescale (6−2 and 5−1 both give 4) — that invariance is
the point, not a coincidence. Delete the `TODO(task-7)` comment when it lands.

- [ ] **Step 1: Write the failing tests**

```js
test("resolveAttack — wound dice are visible in rolls, one per landed hit", () => {
  // The impact dice were rolled and discarded, which is why a player could not
  // answer "why 0 damage?". A wound die MUST reach the log.
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", {});
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const res = resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", hits: 2, dice: { toHit: [6, 6], wounds: [9, 1], location: 1 } },
    () => 0, makeCtx());
  const wounds = res.rolls.filter((r) => r.label?.startsWith("wound"));
  assert.equal(wounds.length, 2);
  assert.equal(wounds[0].sides, 10);
});

test("resolveAttack — breakdown reports effective STR and toughness", () => {
  const attacker = makeRig(1, "A", "medium", "a", { melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", {});
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const res = resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [9], location: 1 } },
    () => 0, makeCtx());
  assert.equal(res.breakdown.toughness, 5);
  assert.equal(res.breakdown.str, 5);
  assert.equal(res.breakdown.target, 6);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test shared/combat.test.js -t "resolveAttack"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `resolveAttack`, rename the `rollImpacts(...)` call at line 558 to `rollWounds(...)` and rename the local `impacts` to `wounds` throughout (lines 543, 558, 570, 576-606, 615). The `opts.dice` key changes from `impacts` to `wounds`.

Push the wound dice into `rolls` immediately after the `rollWounds` call:

```js
      for (let i = 0; i < wounds.length; i++) {
        rolls.push({
          sides: WOUND_DIE, value: wounds[i].die, label: `wound ${i + 1}`,
          tone: wounds[i].sp > 0 ? "ok" : "miss",
        });
      }
```

Replace the `pushResolution` breakdown (lines 620-627) with:

```js
    breakdown: {
      actor: attacker.name, weapon: weaponName, target: target.name,
      terms: [
        { value: th.hits, label: "hits", tone: "die" },
        { value: str, label: "weapon STR", op: "·", tone: "mod" },
      ],
      // Plan 2 replaces this flat shape with a full per-step ledger. Until then
      // these three fields are what let a player answer "why 0 damage?".
      str: wounds[0]?.str ?? str,
      toughness: wounds[0]?.toughness ?? null,
      target: wounds[0]?.target ?? null,
      sp: total, location,
    },
```

Update the summary string on line 619 to name the wound roll:

```js
    summary: `${attacker.name} → ${target.name} with ${weaponName} (STR ${str}): ${th.hits} hit(s), ${wounds.filter((w) => w.sp > 0).length} wound(s) = ${total} SP${location ? ` to ${location}` : ""}`,
```

- [ ] **Step 4: Run the whole combat suite**

Run: `node --test shared/combat.test.js`
Expected: the new tests PASS. **Pre-existing tests will fail** — that is expected and Task 8 handles them. Do not patch them here.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): resolveAttack rolls wounds and logs the dice"
```

---

## Task 8: Migrate the existing test suite

**Files:**
- Modify: `shared/combat.test.js`, `shared/game-state.test.js`

These tests encode the old model. They must be **rewritten, not patched** — a test asserting a severity tier is asserting a rule that no longer exists.

- [ ] **Step 1: Inventory the failures**

Run: `node --test shared/combat.test.js shared/game-state.test.js 2>&1 | grep "not ok"`

Expect roughly these classes:
- `impacts:` in a `dice` fixture → rename to `wounds:`, and revalue (d6 faces → d10 faces; a `1` still fails, a `6` may no longer pass — use `10` to force a wound and `1` to force a failure)
- `meleeLand` / `meleeMiss` fixtures (`game-state.test.js:4291-4292`) → `{ toHit: [6, 6], wounds: [10, 10], location: 1 }` and `{ toHit: [1, 1], wounds: [1, 1], location: 1 }`
- assertions on `.tier` / `direct` / `severe` / `critical` → delete; assert `.sp` instead
- `impactSeverity` unit tests in `rules.test.js` → delete (Task 1 replaced them)
- the `resolveAttack emits a per-die roll for each hit-die plus a location d12` test (`combat.test.js:364`) → there are wound dice now; update the expected count
- `breakdown.terms[1].label === "weapon STR"` (`combat.test.js:416`) → still valid, `terms` order is unchanged

- [ ] **Step 2: Rewrite them**

Work file by file. For each failure ask: *is this testing a rule that still exists?* If yes, fix the fixture. If no, delete the test.

- [ ] **Step 3: Run the full shared suite**

Run: `node --test "shared/**/*.test.js"`
Expected: PASS, no skips.

- [ ] **Step 4: Commit**

```bash
git add shared/combat.test.js shared/game-state.test.js shared/rules.test.js shared/unit-kinds.test.js
git commit -m "test(combat): migrate the suite to the wound model"
```

**Never `git add shared/` or any directory.** The working tree carries unrelated in-flight work
(repair tuning, budget auto-end). Stage only files you edited, by name.

---

## Task 9: Convert the Blast branch

**Files:**
- Modify: `shared/game-state.js:3431-3439`
- Test: `shared/game-state.test.js`

Blast is the last caller of the old model (`D6 + STR 10` vs an armour row).

- [ ] **Step 1: Write the failing test**

There is no blast helper in the suite — build the room from the existing `makeRoom`/`makeRig`
helpers already used in `game-state.test.js`, and grep an existing blast test first to copy its
setup shape:

Run: `grep -n "pendingBlast" shared/game-state.test.js`

```js
test("blast wounds on a d10 against the struck location's toughness", () => {
  // Blast is a flat STR 8 shot on the rescaled ladder. vs a medium hull (T5)
  // that is TN 3+, so a 2 fails and a 3 wounds for D2.
  const room = makeRoom();                       // copy the shape from the existing blast test
  const t = room.rigs.find((r) => r.name === "B");
  room.game.pendingBlast = { sourceId: room.rigs[0].id };
  applyAction(room, { verb: "blast", targets: ["B"], dice: { location: { B: 1 }, wounds: { B: 2 } } }, { random: () => 0 });
  assert.equal(t.hull.sp, t.hull.max);           // 2 < 3 => no wound

  room.game.pendingBlast = { sourceId: room.rigs[0].id };
  applyAction(room, { verb: "blast", targets: ["B"], dice: { location: { B: 1 }, wounds: { B: 3 } } }, { random: () => 0 });
  assert.equal(t.hull.sp, t.hull.max - 2);       // 3 >= 3 => D2
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js -t "blast"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace lines 3431-3439:

```js
        const loc = hitLocation(t.kind || "rig", rollD(12, a.dice?.location?.[name], options.random));
        // §9 — Blast is a flat STR 8 shot (rescaled with the weapon ladder) at
        // D2, wounding on a d10 like any other attack.
        const die = rollD(WOUND_DIE, a.dice?.wounds?.[name], options.random);
        const tough = toughnessOf(t.kind || "rig", loc, t.weightClass);
        const tn = woundTarget(8, tough);
        const sp = die >= tn ? 2 : 0;
        if (sp > 0) applyDamage(room, t, loc, sp, { random: options.random });
        pushResolution(room, {
          kind: "blast", actor, rigId: t.id,
          rolls: [{ sides: WOUND_DIE, value: die, label: "wound", tone: sp > 0 ? "ok" : "miss" }],
          summary: `Blast hits ${t.name}: ${die} vs ${tn}+ (T${tough}) → ${sp} SP to ${loc}`, effects: [],
        });
```

Update the `./rules.js` import on `game-state.js:2`: drop `impactSeverity`, `impactRow`; add `toughnessOf`, `woundTarget`, `WOUND_DIE`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test shared/game-state.test.js -t "blast"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(combat): blast resolves on the wound roll"
```

---

## Task 10: The no-dead-zone regression sweep

**Files:**
- Test: `shared/combat.test.js`

**This is the most important test in the plan.** It is the executable statement of why the rewrite happened, and it must fail against the old model.

- [ ] **Step 1: Write it**

```js
test("no dead zones — every weapon can wound every location of every class", () => {
  // The impact-total model had 69 combos that could NEVER deal damage at any
  // roll: its total capped at `6 + STR + arc` and melee had no arc ladder. The
  // wound roll's TN clamps at 10, so a natural 10 always wounds. If this test
  // ever fails, that guarantee has been broken — check woundTarget's clamp.
  const all = { ...WEAPONS.longRange, ...WEAPONS.melee, ...UNIT_WEAPONS };
  const classes = ["light", "medium", "heavy", "colossal"];
  const dead = [];
  for (const [name, w] of Object.entries(all)) {
    for (const aw of classes) {
      const str = w.str + (w.flatPick ? 0 : WEIGHT_STR_MOD[aw]);
      for (const tw of classes) {
        for (const loc of partNamesOf("rig")) {
          const t = toughnessOf("rig", loc, tw);
          // Best arc available to this weapon; Raking cannot use the front.
          const arc = hasPerk(w, "Raking Fire") ? 6 : 3;
          if (woundTarget(str + arc, t) > 10) dead.push(`${name}/${aw} vs ${tw}/${loc}`);
        }
      }
    }
  }
  assert.deepEqual(dead, []);
});

test("no dead zones — the light saw vs a medium hull, the case that started this", () => {
  const w = WEAPONS.melee["Circular Saw"];
  const str = w.str + WEIGHT_STR_MOD.light;          // 5 - 1 = 4
  const t = toughnessOf("rig", "hull", "medium");    // 5
  assert.equal(woundTarget(str, t), 7);              // 40%, front arc, no upgrades
});
```

- [ ] **Step 2: Run**

Run: `node --test shared/combat.test.js -t "no dead zones"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add shared/combat.test.js
git commit -m "test(combat): assert no weapon/target matchup is ever hopeless"
```

---

## Task 11: Client type mirrors and stat mirrors

**Files:**
- Modify: `client/shared.d.ts:116-120`
- Modify: `content/chassis.json`, `client/src/v2/lib/commissionData.ts`

The client mirrors weapon stats for the commission wizard. If they drift, the wizard shows pre-rewrite numbers.

- [ ] **Step 1: Find the drift**

Run: `grep -rn "str" client/src/v2/lib/commissionData.ts | head -20`
Run: `grep -rn '"str"' content/chassis.json | head -20`

- [ ] **Step 2: Update `client/shared.d.ts`**

Replace the `impactRow` declaration (lines 116-120):

```ts
  export function toughnessOf(
    kindId: string,
    partName: string,
    weightClass?: string,
  ): number | null;
```

- [ ] **Step 3: Mirror the new STR and D values**

Apply the Task 3 table to any weapon stats duplicated in `content/chassis.json` and `client/src/v2/lib/commissionData.ts`.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS — both vitest and the node suite.

- [ ] **Step 5: Commit**

```bash
git add client/shared.d.ts content/chassis.json client/src/v2/lib/commissionData.ts
git commit -m "chore(combat): mirror the wound-model weapon stats client-side"
```

**Never `git add client/`.** The working tree carries ~15 unrelated modified client files. Stage
only the three files above, and only if you edited them.

---

## Task 12: Full verification

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: PASS, no skips.

- [ ] **Step 2: Drive the app**

Use the `verify` skill, or: start the dev server, commission a light Rig with a Circular Saw, attack a medium Rig's hull, and confirm the panel shows a wound die and can deal damage. **This is the bug from the original report** — it must now be possible.

- [ ] **Step 3: Confirm no stale references**

Run: `grep -rn "impactSeverity\|impactRow\|RIG_IMPACT\|\.tier\b" shared/ client/src server/ --include=*.js --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: only `client/src/v2/overlays/RollConsole.tsx` (Plan 2 removes the tier badge) and `docs/`.

---

## Notes for Plan 2 (the resolution ledger)

Plan 1 deliberately leaves the panel minimal: `breakdown.str`, `.toughness`, `.target`. Plan 2 replaces the flat `ResolutionBreakdown` with an ordered `steps[]`, surfaces the eleven inputs `computeModifiedAim` currently hides, prompts for wound dice in `autoResolve: false` mode, and removes the `tier`/`total` render paths. See the UI section of the spec.
