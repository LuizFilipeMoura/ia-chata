# Long-Range Sweet Spot & Accuracy Falloff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each ranged weapon a per-weapon sweet-spot distance where accuracy peaks and falls off with distance from it, so long-range weapons are bad up close and melee becomes relatively better — with no melee stat change.

**Architecture:** Ranged weapon profiles drop the `acc[]`/`rng[]` band pair for `{ sweet, peak, dropoff, minRange, maxRange }`. A new `weaponAccAt(profile, distance)` in `shared/combat.js` computes accuracy = `peak − round(dropoff·|distance − sweet|)`; out-of-range is `distance < minRange || distance > maxRange`. The AttackWizard threads the measured inches (`distance`) through the attack command; when `distance` is absent (legacy/tests) accuracy falls back to `peak` and the range check is skipped. Melee weapons keep their existing shape and code path unchanged.

**Tech Stack:** Plain ES modules (`shared/*.js`), React + TypeScript client, `node --test` for shared, `vitest` for client.

**Test commands:**
- Shared: `node --test shared/combat.test.js` / `node --test shared/game-state.test.js`
- Client: `npx vitest run client/src/components/wizards/AttackWizard.test.tsx`
- Full: `npm test`

---

## File Structure

- `shared/game-state.js` — ranged weapon data (`WEAPONS.longRange`, `UNIT_WEAPONS`) reshaped; melee data unchanged; `effectiveWeaponProfile` upgrade remap; `resolveFire` + return-fire thread `distance`.
- `shared/combat.js` — `weaponAccAt`; `computeModifiedAim` uses it; distance-based out-of-range check in `resolveAttack`.
- `shared/glossary.js` — RNG glossary entry text.
- `client/shared.d.ts` — declare `/shared/combat.js` (`weaponAccAt`); widen `UNIT_WEAPONS` type.
- `client/src/components/wizards/AttackWizard.tsx` — distance-driven accuracy, sweet-spot slider init, dropoff/efficiency readout, send `distance`.
- `client/src/styles/battle.css` — `data-band` accuracy-tier variants.
- Tests: `shared/combat.test.js`, `shared/game-state.test.js`, `client/src/components/wizards/AttackWizard.test.tsx`.

---

## Task 1: Reshape ranged weapon data

**Files:**
- Modify: `shared/game-state.js:25-58` (WEAPONS.longRange, UNIT_WEAPONS)
- Test: `shared/game-state.test.js:62-87`, `:1813-1826`

- [ ] **Step 1: Update the weapon-shape tests to the new fields**

In `shared/game-state.test.js`, replace lines 65-68 (inside `"WEAPONS carries full combat profiles…"`) with:

```js
  assert.equal(WEAPONS.longRange["Mini Gun"].rof, 8);
  assert.equal(WEAPONS.longRange["Mini Gun"].str, 4);
  assert.equal(WEAPONS.longRange["Mini Gun"].sweet, 7);
  assert.equal(WEAPONS.longRange["Mini Gun"].peak, 2);
  assert.equal(WEAPONS.longRange["Mini Gun"].dropoff, 0.35);
  assert.equal(WEAPONS.longRange["Mini Gun"].minRange, 0);
  assert.equal(WEAPONS.longRange["Mini Gun"].maxRange, 18);
  assert.equal(WEAPONS.longRange["Mini Gun"].acc, undefined);
  assert.equal(WEAPONS.longRange["Mini Gun"].rng, undefined);
```

Replace the Siege Maul deepEqual at line 79 with:

```js
  assert.deepEqual(maul, { rof: 1, str: 13, sweet: 8, peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 });
```

In `"UNIT_WEAPONS holds the strawman flat catalogue"` (line 1818-1825), replace the per-weapon shape loop body with a melee/ranged branch:

```js
  for (const [name, w] of Object.entries(UNIT_WEAPONS)) {
    assert.equal(typeof w.rof, "number");
    assert.equal(typeof w.str, "number");
    if (w.melee) {
      assert.ok(Array.isArray(w.acc), `${name} melee keeps acc[]`);
      assert.ok(Array.isArray(w.rng), `${name} melee keeps rng[]`);
    } else {
      assert.equal(typeof w.sweet, "number", `${name} has sweet`);
      assert.equal(typeof w.peak, "number", `${name} has peak`);
      assert.equal(typeof w.dropoff, "number", `${name} has dropoff`);
      assert.equal(typeof w.minRange, "number", `${name} has minRange`);
      assert.equal(typeof w.maxRange, "number", `${name} has maxRange`);
    }
    assert.equal(w.perks, undefined, `${name} is stat-only, no perks`);
    assert.equal(w.flatPick, true, `${name} carries flatPick marker`);
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `WEAPONS.longRange["Mini Gun"].sweet` is `undefined`, etc.

- [ ] **Step 3: Reshape the ranged weapon data**

In `shared/game-state.js`, replace the `longRange` block (lines 27-34) with:

```js
    "Mini Gun":       { rof: 8, str: 4,  sweet: 7,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18 },
    "Double MG":      { rof: 8, str: 6,  sweet: 9,  peak: 1, dropoff: 0.25, minRange: 0, maxRange: 20 },
    "Autocannon":     { rof: 4, str: 8,  sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26 },
    "Arc Gun":        { rof: 2, str: 10, sweet: 20, peak: 1, dropoff: 0.18, minRange: 0, maxRange: 32 },
    "Mortar":         { rof: 3, str: 9,  sweet: 18, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
    "Sniper Cannon":  { rof: 1, str: 12, sweet: 22, peak: 2, dropoff: 0.15, minRange: 0, maxRange: 28 },
    "Siege Maul":     { rof: 1, str: 13, sweet: 8,  peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 },
    "Missile Barrage":{ rof: 4, str: 9,  sweet: 20, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
```

Leave the `melee` block (lines 37-44) unchanged.

Replace the four ranged `UNIT_WEAPONS` entries (lines 52-55) with:

```js
  "Tank Cannon":      { rof: 1, str: 12, sweet: 18, peak: 2, dropoff: 0.16, minRange: 0, maxRange: 28, flatPick: true },
  "Autocannon Mount": { rof: 3, str: 8,  sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26, flatPick: true },
  "Coaxial MG":       { rof: 6, str: 5,  sweet: 8,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, flatPick: true },
  "Rocket Pod":       { rof: 2, str: 10, sweet: 20, peak: 1, dropoff: 0.16, minRange: 4, maxRange: 34, flatPick: true },
```

Leave `Dozer Blade` / `Ram Spike` (lines 56-57) unchanged (melee).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: the two shape tests PASS. Other tests in the file may still fail — those are fixed in Tasks 3-4. That is expected at this checkpoint.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(weapons): reshape ranged profiles to sweet-spot falloff fields"
```

---

## Task 2: `weaponAccAt` + accuracy from distance in combat.js

**Files:**
- Modify: `shared/combat.js:25-34` (computeModifiedAim), add `weaponAccAt`
- Test: `shared/combat.test.js:23-40`

- [ ] **Step 1: Write the failing tests**

In `shared/combat.test.js`, add `weaponAccAt` to the import on line 3:

```js
import { computeModifiedAim, weaponAccAt, rollToHit, computeStr, arcBonus, rollImpacts, resolveAttack } from "./combat.js";
```

Replace the whole `"range band selects the weapon's near vs far ACC column (§7.4)"` test (lines 35-40) with:

```js
test("weaponAccAt peaks at the sweet spot and falls off with distance", () => {
  const mg = WEAPONS.longRange["Mini Gun"]; // sweet 7, peak 2, dropoff 0.35
  assert.equal(weaponAccAt(mg, 7), 2);                 // at sweet spot
  assert.equal(weaponAccAt(mg, 2), 0);                 // |2-7|*0.35 = 1.75 -> 2 penalty
  assert.equal(weaponAccAt(mg, 18), -2);               // |18-7|*0.35 = 3.85 -> 4 penalty
  assert.equal(weaponAccAt(mg, undefined), 2);         // no distance -> peak (legacy fallback)
  const claw = WEAPONS.melee["Claw"];                  // melee: scalar acc, distance-independent
  assert.equal(weaponAccAt(claw, 99), 1);
});

test("computeModifiedAim uses distance-based accuracy for ranged weapons", () => {
  const mg = WEAPONS.longRange["Mini Gun"];
  assert.equal(computeModifiedAim(attacker, mg, { distance: 7, cover: 0 }), 2);  // 4 - 2
  assert.equal(computeModifiedAim(attacker, mg, { distance: 2, cover: 0 }), 4);  // 4 - 0
  assert.equal(computeModifiedAim(attacker, mg, { distance: 18, cover: 0 }), 6); // 4 - (-2)
});
```

Update the two accuracy assertions inside `"computeModifiedAim applies weapon ACC, cover, aim and hull penalties"`:
- Line 29 (sniper, aimed, Precision-injected): `sweet 22 / peak 2`, aimed penalty waived by Precision → `4 - 2 = 2`:

```js
  assert.equal(computeModifiedAim(attacker, sniper, { distance: 22, cover: 0, aimed: true }), 2); // peak waived-penalty
```

- Line 31 (autocannon, aimed, no Precision): `peak 1`, aimed −2 → `4 − (1 − 2) = 5`:

```js
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, cover: 0, aimed: true }), 5); // 4 - (1 - 2)
```

Leave the two `claw` (melee) assertions on lines 25-26 and 32 unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `weaponAccAt is not exported` / assertion mismatches.

- [ ] **Step 3: Implement `weaponAccAt` and use it in `computeModifiedAim`**

In `shared/combat.js`, add above `computeModifiedAim` (before line 25):

```js
// §7.4 — ranged accuracy as a function of measured distance: peak at the sweet
// spot, falling off by `dropoff` per inch away from it. Melee weapons have a
// fixed reach and keep their scalar `acc`. A missing distance (legacy callers /
// tests) yields the peak — i.e. "at the sweet spot, in range".
export function weaponAccAt(profile, distance) {
  if (profile.melee) return profile.acc?.[0] || 0;
  const d = Number(distance);
  if (!Number.isFinite(d)) return profile.peak || 0;
  const penalty = Math.round((profile.dropoff || 0) * Math.abs(d - profile.sweet));
  return (profile.peak || 0) - penalty;
}
```

Then replace line 28 (`const weaponAcc = profile.acc[...] || 0;`) with:

```js
  const weaponAcc = weaponAccAt(profile, opts.distance);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: the new/updated accuracy tests PASS. `"effectiveWeaponProfile applies … far-penalty upgrades"` (line 161) and `"computeModifiedAim ignores cover when Airburst Fuze…"` (line 191) may still fail — fixed in Tasks 3-4.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): distance-based weapon accuracy via weaponAccAt"
```

---

## Task 3: `effectiveWeaponProfile` upgrade remap

**Files:**
- Modify: `shared/game-state.js:254-266`
- Test: `shared/combat.test.js:161-176`, `shared/game-state.test.js:89-96`

Two upgrades touched the old band fields and must remap onto the new ones:
- **Extended Barrel** (Siege Maul, `effect.range: 4`) → `maxRange += 4`, `sweet += round(4/2)=2`.
- **Match Barrel** (Sniper Cannon, `effect.noFarPenalty: true`) → `dropoff × 0.5`.
- **Couched Reach** (Lance, melee, `effect.range: 1`) → melee `rng` unchanged behavior.

- [ ] **Step 1: Update the upgrade tests**

In `shared/combat.test.js`, replace line 175 (Match Barrel expectation) with:

```js
  assert.equal(effectiveWeaponProfile("longRange", "Sniper Cannon", sniper).dropoff, 0.075); // Match Barrel halves dropoff
```

Leave line 172 (Lance `rng` `[3,3]`) unchanged.

In `shared/game-state.test.js`, replace the Extended Barrel assertion (line 93-96). Note the makeRig upgrade key in this test is `lrUpgrade`; keep it as written:

```js
  // Extended Barrel: +4 maxRange (16 -> 20) and +2 sweet (8 -> 10), reusing effect.range.
  const barrel = makeRig(1, "Breaker", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "extended-barrel" });
  const barrelProfile = effectiveWeaponProfile("longRange", "Siege Maul", barrel);
  assert.equal(barrelProfile.maxRange, 20);
  assert.equal(barrelProfile.sweet, 10);
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: FAIL — `dropoff` is `0.15`, `maxRange`/`sweet` unchanged.

- [ ] **Step 3: Rewrite the profile builder's band handling**

In `shared/game-state.js`, replace lines 254-266 (the `const profile = {…}` through the two `if (effect…)` lines and `return profile;`) with:

```js
  const profile = {
    ...base,
    rof: base.rof + (effect.rof || 0),
    str: base.str + (effect.str || 0),
    perks: uniquePerks(base.perks, effect.perks),
    upgrade: upgrade || null,
    upgradeEffect: effect,
  };
  if (base.melee) {
    profile.acc = [...base.acc];
    profile.rng = [...base.rng];
    if (effect.range) profile.rng = profile.rng.map((n) => n + effect.range);
  } else {
    // Ranged: `...base` already copied sweet/peak/dropoff/minRange/maxRange.
    if (effect.range) {
      profile.maxRange = base.maxRange + effect.range;
      profile.sweet = base.sweet + Math.round(effect.range / 2);
    }
    if (effect.noFarPenalty) profile.dropoff = base.dropoff * 0.5;
  }
  return profile;
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: the upgrade tests PASS. `"computeModifiedAim ignores cover when Airburst Fuze…"` still fails — Task 4.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "feat(weapons): remap range/far-penalty upgrades onto sweet-spot fields"
```

---

## Task 4: Thread `distance` through the fire commands + fix remaining shared tests

**Files:**
- Modify: `shared/combat.js:124` (out-of-range check), `shared/game-state.js:896-897`, `:1379-1381`
- Test: `shared/combat.test.js:191-195`

- [ ] **Step 1: Update the mortar/Airburst test to the new model**

In `shared/combat.test.js`, replace line 194 with (Mortar `sweet 18 / peak 1`, cover ignored by Airburst → `4 − 1 = 3`):

```js
  assert.equal(computeModifiedAim(mortarRig, mortar, { distance: 18, cover: 2 }), 3);
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/combat.test.js`
Expected: FAIL — returns old value.

- [ ] **Step 3: Distance-based out-of-range check**

In `shared/combat.js`, replace line 124 (`if (opts.range === "out") return { ok: false, reason: "range" };`) with:

```js
  // Out of range is now distance-driven for ranged weapons; melee keeps the
  // legacy band flag. A missing distance (older callers) is treated as in range.
  if (!profile.melee) {
    const d = Number(opts.distance);
    if (Number.isFinite(d) && (d < profile.minRange || d > profile.maxRange))
      return { ok: false, reason: "range" };
  } else if (opts.range === "out") {
    return { ok: false, reason: "range" };
  }
```

- [ ] **Step 4: Pass `distance` through the two attack call sites**

In `shared/game-state.js`, in `resolveFire`, add `distance` to the opts object (line 897 area):

```js
    weapon: a.weapon, target: a.target, arc: a.arc, range: a.range, distance: a.distance, cover: a.cover,
```

In the return-fire branch (line 1380-1381), add `distance`:

```js
            weapon: a.attack.weapon, target: attacker.name,
            arc: a.attack.arc, range: a.attack.range, distance: a.attack.distance, cover: a.attack.cover,
```

- [ ] **Step 5: Run the full shared suite and reconcile any drift**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: PASS. Integration fires in `game-state.test.js` send `range: "near"` with no `distance`, so accuracy falls back to `peak` and range checks are skipped — those tests use forgiving dice (natural 6s hit regardless) and should pass unchanged. If any assertion on an exact hit count fails, its modified Aim shifted because the weapon's `peak` differs from its old near `acc[0]`; recompute `modAim = AIM.medium(4) − peak` for that weapon (Mini Gun peak 2 → 2; Double MG/Autocannon/Mortar/etc peak 1 → 3; Sniper/Tank Cannon/Coaxial/Mini peak 2 → 2) and adjust the expected hit count for the provided dice. Do not weaken assertions — recompute them.

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(combat): distance-driven out-of-range; thread distance through fire"
```

---

## Task 5: Client type declarations

**Files:**
- Modify: `client/shared.d.ts:3-8`, add `/shared/combat.js` module

- [ ] **Step 1: Widen the `UNIT_WEAPONS` type and declare combat.js**

In `client/shared.d.ts`, replace line 8 with a shape that covers both ranged and melee unit weapons:

```js
  export const UNIT_WEAPONS: Record<string, {
    rof: number; str: number;
    acc?: number[]; rng?: number[];
    sweet?: number; peak?: number; dropoff?: number; minRange?: number; maxRange?: number;
    melee?: boolean; perks?: string[]; flatPick?: boolean;
  }>;
```

After the `/shared/game-state.js` module block (after its closing `}` near line 28), add:

```js
declare module "/shared/combat.js" {
  export function weaponAccAt(
    profile: { melee?: boolean; acc?: number[]; peak?: number; sweet?: number; dropoff?: number },
    distance: number | undefined,
  ): number;
}
```

- [ ] **Step 2: Verify the client typechecks**

Run: `npx tsc -p client --noEmit` (or `npx vitest run` which will surface type errors in the touched file)
Expected: no new errors from these declarations.

- [ ] **Step 3: Commit**

```bash
git add client/shared.d.ts
git commit -m "chore(types): declare weaponAccAt and widen UNIT_WEAPONS type"
```

---

## Task 6: AttackWizard — distance-driven accuracy, sweet-spot init, dropoff readout

**Files:**
- Modify: `client/src/components/wizards/AttackWizard.tsx` (imports, lines 231-243, 315, 331-344, 439-458, submit payloads 257 & 277)

- [ ] **Step 1: Import `weaponAccAt`**

Add to the imports at the top of the file (near the other `/shared/*` imports):

```tsx
import { weaponAccAt } from "/shared/combat.js";
```

- [ ] **Step 2: Replace the band derivation with distance-driven accuracy (lines 231-243)**

Replace the block from the `// Range band is derived…` comment through the closing of its `useEffect` (lines 231-243) with:

```tsx
  // Accuracy is a continuous function of the measured distance: it peaks at the
  // weapon's `sweet` and falls off by `dropoff` per inch. minRange/maxRange gate
  // "out". Melee has a fixed reach and no falloff.
  const rangeProfile = profileOf(state.weapon) as
    | { sweet?: number; peak?: number; dropoff?: number; minRange?: number; maxRange?: number; rng?: number[] }
    | null;
  const sweet = rangeProfile?.sweet ?? 8;
  const peak = rangeProfile?.peak ?? 0;
  const minRange = rangeProfile?.minRange ?? 0;
  const maxRange = rangeProfile?.maxRange ?? 12;
  const sliderMax = maxRange + 4; // headroom so the player can drag into "out"
  const accHere = rangeProfile ? weaponAccAt(rangeProfile as never, state.inches) : 0;
  const penalty = peak - accHere;
  const inRange = state.inches >= minRange && state.inches <= maxRange;
  const accTier = !inRange ? "out" : penalty <= 0 ? "sweet" : penalty <= 2 ? "good" : "poor";

  // Seed the slider to the weapon's sweet spot whenever the selected weapon
  // changes (melee seeds to its reach). Keeps "open at the best range" intent.
  useEffect(() => {
    if (isMelee) {
      const reach = rangeProfile?.rng?.[0] ?? 2;
      patch({ inches: reach });
    } else {
      patch({ inches: sweet });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.weapon, isMelee]);
```

Note: this replaces the old `outOfRange = state.range === "out"` semantics. Update line 315 (`const outOfRange = state.range === "out";`) to:

```tsx
    const outOfRange = !isMelee && !inRange;
```

- [ ] **Step 3: Rewrite the ranged effective-range readout (lines 331-344)**

Replace the `} else if (profile) {` branch body (lines 331-344) with a sweet-spot + falloff readout:

```tsx
    } else if (profile) {
      const accLabel =
        penalty <= 0 ? `Sweet spot +${peak}` : `${accHere >= 0 ? "+" : ""}${accHere} · falloff`;
      const gate =
        state.inches < minRange
          ? <span className="aw-range-warn">Too close — out of range</span>
          : state.inches > maxRange
            ? <span className="aw-range-warn">Target is out of range — this shot will fail</span>
            : spent
              ? <span className="aw-range-note">Weapon spent — a rushed reload folds into this shot (2 actions)</span>
              : null;
      rangeHtml = (
        <>
          <span className="aw-range-ic">📏</span>
          Sweet spot <b>{sweet}"</b> · usable <b>{minRange}"–{maxRange}"</b> · at {state.inches}": <b>{accLabel}</b>
          {gate}
        </>
      );
      rangeState = outOfRange ? "bad" : spent ? "warn" : "ok";
    }
```

- [ ] **Step 4: Rewrite the slider UI block (lines 439-458)**

Replace the slider markup inside the `!isMelee` range field (the `<div className="aw-range-slider"…>` through its closing `</div>` at lines 440-459) with:

```tsx
                <div className="aw-range-slider" data-band={accTier}>
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={1}
                    value={state.inches}
                    aria-label="Distance to target in inches"
                    onChange={(e) => patch({ inches: Number(e.target.value) })}
                  />
                  <div className="aw-range-readout">
                    <b className="aw-range-inches">{state.inches}"</b>
                    <span className="aw-range-band" data-band={accTier}>
                      {accTier === "sweet" ? "🎯 sweet spot"
                        : accTier === "out" ? "🚫 out of range"
                        : `${accHere >= 0 ? "+" : ""}${accHere} falloff`}
                    </span>
                  </div>
                  <div className="aw-range-ticks">
                    Sweet {sweet}" · usable {minRange}"–{maxRange}"
                  </div>
                </div>
```

- [ ] **Step 5: Send `distance` in both attack payloads**

In `submit`, add `distance: state.inches` to the `attack` object (line 256-258) and the `attrs` object (line 276-278):

```tsx
      const attack: Record<string, unknown> = {
        weapon: slotSel, arc: state.arc, range: state.range, distance: state.inches, cover: state.cover,
      };
```

```tsx
    const attrs: Record<string, unknown> = {
      name: rig.name, action: mode, target: state.target,
      weapon: slotSel, arc: state.arc, range: state.range, distance: state.inches, cover: state.cover,
    };
```

- [ ] **Step 6: Typecheck + run existing wizard tests**

Run: `npx vitest run client/src/components/wizards/AttackWizard.test.tsx`
Expected: existing tests may reference the old range readout text ("Effective range — Near") — those assertions are updated in Task 7. At this step, confirm the file compiles (no TS errors) and the suite runs.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/wizards/AttackWizard.tsx
git commit -m "feat(wizard): sweet-spot slider init and distance falloff readout"
```

---

## Task 7: AttackWizard tests for sweet-spot init + falloff

**Files:**
- Modify: `client/src/components/wizards/AttackWizard.test.tsx`

- [ ] **Step 1: Read the existing test to match its render/helpers**

Run: open `client/src/components/wizards/AttackWizard.test.tsx` and note how it mounts the wizard (providers, the rig fixture, and any range-readout assertions using the old "Effective range — Near" / "Far ≤" text).

- [ ] **Step 2: Update stale range-text assertions and add sweet-spot tests**

Replace any assertion matching the old readout strings (`/Effective range/`, `/Near ≤/`, `/Far ≤/`) with the new copy, and add these two tests (adapt the mount helper name to whatever the file already uses, e.g. `renderWizard`):

```tsx
test("slider opens at the weapon's sweet-spot distance", async () => {
  // Mini Gun sweet spot is 7". Mount a Fire wizard on a rig carrying it.
  renderWizard({ longRange: "Mini Gun", melee: "Sword" }, { mode: "fire" });
  const slider = await screen.findByLabelText("Distance to target in inches") as HTMLInputElement;
  expect(slider.value).toBe("7");
  expect(screen.getByText(/sweet spot/i)).toBeInTheDocument();
});

test("dragging off the sweet spot shows the accuracy falloff", async () => {
  renderWizard({ longRange: "Mini Gun", melee: "Sword" }, { mode: "fire" });
  const slider = await screen.findByLabelText("Distance to target in inches") as HTMLInputElement;
  fireEvent.change(slider, { target: { value: "18" } }); // |18-7|*0.35 = 3.85 -> -2 acc
  expect(screen.getByText(/-2 falloff/)).toBeInTheDocument();
});
```

If the file has no `renderWizard` helper, mirror the mount used by the existing tests (same providers + rig fixture) and pass a rig whose `weapons.longRange` is `"Mini Gun"`.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run client/src/components/wizards/AttackWizard.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/wizards/AttackWizard.test.tsx
git commit -m "test(wizard): sweet-spot init and falloff readout"
```

---

## Task 8: CSS accuracy-tier styling + glossary

**Files:**
- Modify: `client/src/styles/battle.css:361-374`
- Modify: `shared/glossary.js:73-75`

- [ ] **Step 1: Add the accuracy-tier `data-band` variants**

In `client/src/styles/battle.css`, replace the three `data-band` rules (lines 361-363) and the `.aw-range-band` out rule (line 374) with:

```css
.aw-range-slider[data-band="sweet"] { border-left-color: var(--hp-ok-a); }
.aw-range-slider[data-band="good"]  { border-left-color: var(--oil); }
.aw-range-slider[data-band="poor"]  { border-left-color: var(--ember); }
.aw-range-slider[data-band="out"]   { border-left-color: var(--ember); }
```

```css
.aw-range-slider[data-band="out"] .aw-range-band { color: var(--ember-hi); }
.aw-range-slider[data-band="sweet"] .aw-range-band { color: var(--hp-ok-a); }
```

- [ ] **Step 2: Update the RNG glossary entry**

In `shared/glossary.js`, replace the `rng` def (line 74) with:

```js
    def: "A weapon's sweet-spot distance (peak accuracy) and usable min–max range in inches. Accuracy falls off the farther the target is from the sweet spot; outside min–max the attack fails (§12).",
```

- [ ] **Step 3: Verify glossary tests still pass**

Run: `node --test shared/glossary.test.js` (if present) or `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/battle.css shared/glossary.js
git commit -m "feat(ui): accuracy-tier slider colours; update RNG glossary"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all shared (`node --test`) and client (`vitest`) tests PASS. If anything fails, it is numeric drift from `peak ≠ old acc[0]` — recompute per the guidance in Task 4 Step 5; never weaken an assertion.

- [ ] **Step 2: Manual smoke test in the app**

Start the app (`npm run dev`), open a battle, and open the Fire wizard for a rig with a long-range weapon. Confirm:
- The distance slider opens at the weapon's sweet-spot inches.
- Dragging toward point-blank shows a growing negative "falloff" and, below `minRange` (e.g. Mortar), "Too close — out of range" with the Fire button disabled.
- Dragging past `maxRange` disables Fire with the out-of-range warning.
- A melee weapon still shows "Reach 2" and no falloff.

- [ ] **Step 3: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore: long-range sweet-spot falloff — final verification"
```

---

## Self-Review Notes

- **Spec coverage:** falloff model (Task 2), per-weapon params (Task 1), min/max out-of-range (Task 4), upgrade remap (Task 3), slider sweet-spot init + dropoff readout (Tasks 6-7), glossary/CSS (Task 8), melee untouched (verified in Tasks 1, 2, 4). ✓
- **Type consistency:** `weaponAccAt(profile, distance)`, fields `sweet/peak/dropoff/minRange/maxRange` used identically across combat.js, game-state.js data, shared.d.ts, and AttackWizard. `accTier` values `sweet|good|poor|out` match the CSS `data-band` selectors in Task 8. ✓
- **Fallback:** `distance` omitted → `peak` + range check skipped — keeps legacy integration tests green without weakening them.
