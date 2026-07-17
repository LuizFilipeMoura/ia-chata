# STR Overflow + Swarm Warheads Re-tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert wasted STR past the wound-roll's TN-2 floor into bonus damage (+1 D per 3, cap +2), and nerf Swarm Warheads from +2 ROF to +1.

**Architecture:** One pure function `strOverflowD` in `rules.js`, sharing a private `woundRaw` helper with `woundTarget` so the floor point cannot drift from the clamp it derives from. It is consumed at one seam in `combat.js` (`rollWounds`), threaded as a named rider alongside `rend`/`evisc`, and surfaced in the damage ledger as "Overmatch". The Swarm Warheads change is a one-line data edit.

**Tech Stack:** Plain ES modules. Tests are `node:test` + `node:assert/strict` for `shared/**`. Run the shared suite with `node --test shared/rules.test.js` (single file) or `npm test` (everything).

**Spec:** `docs/superpowers/specs/2026-07-15-str-overflow-design.md`

---

## Background you need

The wound roll is `woundTarget(str, T) = clamp(2, 10, 6 + T - str)` in `shared/rules.js:95`. Rig toughness is T3–T5. So any STR ≥ T+4 pins the target number at its floor of 2, and every additional point of STR is discarded. Six weapons (Siege Maul STR 11, Sniper Cannon / Harpoon / Wrecking Ball / Anchor STR 10, Lance STR 9) sit there permanently, which makes three separate mechanics do literally nothing for them: the arc bonus, `WEIGHT_STR_MOD`, and every +STR upgrade.

Overflow is the wasted amount: `over = 2 - (6 + T - str)`, floored at 0. Equivalently `str - T - 4`. Convert at +1 D per 3 points, capped at +2 D.

**Do not** restate the floor as `T + 4` in the new code. It is the same truth as `woundTarget`'s clamp, and two copies drift. Both must read one helper.

## File Structure

| file | responsibility | change |
|---|---|---|
| `shared/rules.js` | the rule (pure) | add `WOUND_TN_FLOOR`, `OVERFLOW_PER_D`, `OVERFLOW_MAX_D`, private `woundRaw`, public `strOverflowD`; refactor `woundTarget` onto `woundRaw` |
| `shared/combat.js` | apply + report | consume in `rollWounds`; emit the ledger term |
| `shared/glossary.js` | player-facing definition | one entry |
| `shared/game-state.js` | weapon/upgrade data | Swarm Warheads `rof: 2` → `1` |
| `rules.md` | **the live rulebook** | Swarm Warheads `(+2 ROF)` → `(+1 ROF)` |
| `docs/design/light-missile-flamethrower.md` | chassis design note | same magnitude, stale |

> **`rules.md` is not a document — it is a runtime input.** `server/config.js:6`
> sets `RULEBOOK_MD = "rules.md"`, and `server/prompt.js:147-159` bakes the whole
> file into the AI rules master's system prompt as "the single source of truth".
> A stale line there is a lie told to a player who asks what an upgrade does,
> while the engine does something else. This plan originally omitted the file
> entirely and a reviewer caught the result. **Any change to a weapon or upgrade
> magnitude must grep `rules.md`.**

---

### Task 1: The `strOverflowD` rule

**Files:**
- Modify: `shared/rules.js:80-110`
- Test: `shared/rules.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/rules.test.js`. First extend the import on line 4:

```js
import { AIM, WEIGHT_STR_MOD, hitLocation, woundTarget, strOverflowD } from "./rules.js";
```

Then append these tests:

```js
test("strOverflowD — STR that only just reaches the TN-2 floor wastes nothing", () => {
  // The floor is reached at str = T + 4 (raw 6+T-str == 2). Reaching it is not
  // waste: that point bought the last 10% of wound chance. Only points PAST it
  // are discarded by the clamp, and only those convert.
  assert.equal(strOverflowD(8, 4), 0);   // raw 2 — exactly the floor
  assert.equal(strOverflowD(9, 4), 0);   // raw 1 — 1 wasted, under the 3-point rate
  assert.equal(strOverflowD(10, 4), 0);  // raw 0 — 2 wasted, still under
});

test("strOverflowD — converts at +1 D per 3 wasted points", () => {
  assert.equal(strOverflowD(11, 4), 1);  // 3 wasted
  assert.equal(strOverflowD(13, 4), 1);  // 5 wasted — floors, no partial credit
  assert.equal(strOverflowD(14, 4), 2);  // 6 wasted
});

test("strOverflowD — caps at +2 D", () => {
  // Uncapped, a rear-arc Siege Maul (effStr 16) into an engine (T3) would add
  // +3 to a D5 weapon = D8 against an engine SP pool of 8-11: a one-shot kill,
  // which would make the engine the only rational aim point (see unit-kinds.js:11).
  assert.equal(strOverflowD(17, 4), 2);  // 9 wasted → 3, capped
  assert.equal(strOverflowD(30, 3), 2);  // absurd STR still capped
});

test("strOverflowD — weak weapons never overflow", () => {
  // Rivet Gun STR 3 against every rig toughness in the game.
  for (const t of [3, 4, 5]) assert.equal(strOverflowD(3, t), 0);
});

test("strOverflowD — junk T throws, exactly as woundTarget does", () => {
  // Same guard, same reason, opposite direction of the same hazard: a null T
  // coercing to 0 reads as MAXIMUM overflow here. It must never be guessed at.
  for (const junk of [undefined, null, "", false, [], {}, NaN, Infinity, "5"]) {
    assert.throws(
      () => strOverflowD(10, junk),
      /toughness must be a number/,
      `strOverflowD(10, ${JSON.stringify(junk) ?? String(junk)}) must throw, not guess`,
    );
  }
});

test("strOverflowD — the design's worked examples", () => {
  assert.equal(strOverflowD(10, 4), 0);  // Wrecking Ball, front arc, arms
  assert.equal(strOverflowD(13, 4), 1);  // Wrecking Ball, rear arc (+3), arms
  assert.equal(strOverflowD(16, 3), 2);  // Siege Maul + Reinforced Head, rear, engine (capped from 3)
  assert.equal(strOverflowD(7, 5), 0);   // Autocannon, front, hull — never overflows
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/rules.test.js`
Expected: FAIL — `strOverflowD is not a function` (it is not exported yet).

- [ ] **Step 3: Refactor `woundTarget` onto a shared helper and add the rule**

In `shared/rules.js`, replace the whole `woundTarget` function (lines 95-110, keeping the long comment block above it at lines 82-94 exactly as it is) with:

```js
// The wound roll's floor. Named, not inlined, because `strOverflowD` measures
// distance PAST it: two literal 2s in two functions is one truth written twice,
// and it would drift the first time someone touches the wound formula.
export const WOUND_TN_FLOOR = 2;

// Overflow conversion (§7.5) — STR past the floor is wasted by the clamp, which
// is why arc, WEIGHT_STR_MOD and every +STR upgrade measure as literally dead on
// STR >= 9 weapons. Excess converts to damage instead.
// See docs/superpowers/specs/2026-07-15-str-overflow-design.md.
export const OVERFLOW_PER_D = 3;
export const OVERFLOW_MAX_D = 2;

// The pre-clamp wound value, `6 + T - S`. Private: `woundTarget` clamps it,
// `strOverflowD` measures how far past the floor it went. One expression, so the
// two can never disagree about where the floor is.
//
// `caller` only names the thrower in the error message — a guard that fires
// deserves to say which public function the caller actually used.
function woundRaw(str, toughness, caller) {
  const s = Math.floor(Number(str) || 0);
  // T is NOT coerced, deliberately: a missing T coercing to 0 yields TN 2 (90%),
  // the single most dangerous default in the system. STR may coerce — it fails
  // toward TN 10 (10%) — but T must be real.
  //
  // The check is `typeof`, not `Number.isFinite(Number(t))`: coercing first
  // reopens the exact hole it means to close, because Number(null), Number(""),
  // Number(false) and Number([]) are all 0 — and `null` is precisely what a
  // failed lookup used to hand us. Only a real number may pass.
  if (typeof toughness !== "number" || !Number.isFinite(toughness)) {
    throw new Error(`${caller}: toughness must be a number, got ${toughness}`);
  }
  return 6 + Math.floor(toughness) - s;
}

export function woundTarget(str, toughness) {
  return Math.max(WOUND_TN_FLOOR, Math.min(WOUND_DIE, woundRaw(str, toughness, "woundTarget")));
}

// §7.5 — bonus D from STR the clamp would otherwise discard. Reaching the floor
// wastes nothing (that point bought the last 10% of wound chance); only points
// beyond it convert, at OVERFLOW_PER_D each, capped at OVERFLOW_MAX_D.
export function strOverflowD(str, toughness) {
  const over = Math.max(0, WOUND_TN_FLOOR - woundRaw(str, toughness, "strOverflowD"));
  return Math.min(OVERFLOW_MAX_D, Math.floor(over / OVERFLOW_PER_D));
}
```

Note the comment that used to sit *inside* `woundTarget` about T-not-coerced moves into `woundRaw` with it — that is where the guard now lives.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/rules.test.js`
Expected: PASS — all tests, including the pre-existing `woundTarget` tests (the refactor must not change its behaviour or its error message, which the existing test at `rules.test.js:113` matches with `/toughness must be a number/`).

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -m "feat(rules): STR past the TN-2 floor converts to damage

woundTarget's clamp discards every point of STR past str = T + 4, which
is why the sweep measures arc, WEIGHT_STR_MOD and six +STR upgrades as
worth exactly +0.00 on STR >= 9 weapons.

strOverflowD converts the waste at +1 D per 3, capped +2. It shares
woundRaw with woundTarget so the floor cannot drift from the clamp."
```

---

### Task 2: Apply overflow in `rollWounds`

**Files:**
- Modify: `shared/combat.js:4-7` (import), `:525-529` (negated path), `:542-556` (compute), `:567` (rider)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/combat.test.js`:

```js
test("rollWounds — overflow converts wasted STR into damage", () => {
  const wb = WEAPONS.melee["Wrecking Ball"]; // STR 10, D5, ROF 1
  const target = { weightClass: "medium", hardened: false, preparation: null };
  // medium arms are T4, so the floor is str 8. STR 10 wastes 2 — under the
  // 3-point rate, so a front-arc hit is still a plain D5.
  const front = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(front[0].str, 10);
  assert.equal(front[0].target, 2);      // clamped to the floor
  assert.equal(front[0].overflow, 0);
  assert.equal(front[0].sp, 5);          // D5, nothing added
});

test("rollWounds — overflow revives the arc bonus on a saturated weapon", () => {
  // THE POINT OF THE WHOLE CHANGE. Before overflow, these two shots were
  // byte-identical: both clamped to TN 2, both dealt exactly D5, so flanking a
  // Wrecking Ball rig was worth literally nothing (sweep: rear/front ratio x1.00).
  const wb = WEAPONS.melee["Wrecking Ball"];
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const front = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const rear = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(rear[0].str, 13);         // 10 + 3 (rear arc)
  assert.equal(front[0].target, rear[0].target); // both STILL clamped to 2...
  assert.equal(rear[0].overflow, 1);             // ...but the arc now buys depth
  assert.equal(rear[0].sp - front[0].sp, 1);
});

test("rollWounds — overflow revives WEIGHT_STR_MOD on a saturated weapon", () => {
  // Sweep measured the light↔medium delta as Δ0.00 for this weapon: both classes
  // clamped to TN 2, so the -1 was discarded entirely.
  //
  // The mod bites where overflow crosses a rate boundary. Siege Maul (STR 11)
  // into medium arms (T4, floor str 8) wastes 3 → +1 D; the light -1 wastes 2 →
  // +0. Same shot, one weight class apart, one point of damage.
  const maul = WEAPONS.longRange["Siege Maul"]; // STR 11, D5
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const med = rollWounds({ weightClass: "medium" }, target, maul, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const light = rollWounds({ weightClass: "light" }, target, maul, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(med[0].str, 11);
  assert.equal(light[0].str, 10);           // WEIGHT_STR_MOD light = -1
  assert.equal(med[0].target, light[0].target); // both STILL clamped to 2...
  assert.equal(med[0].overflow, 1);             // ...but the mod now buys depth
  assert.equal(light[0].overflow, 0);
  assert.equal(med[0].sp - light[0].sp, 1);
});

test("rollWounds — overflow stacks with Rend and respects its own cap", () => {
  // Overflow, Rend and Evisceration all land in `sp`. The cap is on overflow
  // alone, not on the total — a Rend weapon still gets its +1 on top.
  const maul = { ...WEAPONS.longRange["Siege Maul"], perks: ["Rend"] };
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, target, maul, "engine",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].overflow, 2);
  assert.equal(out[0].rend, 1);
  assert.equal(out[0].sp, 8); // D5 + 2 overflow + 1 rend
});

test("rollWounds — a weak weapon never overflows", () => {
  const rivet = WEAPONS.longRange["Rivet Gun"]; // STR 3, D1
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, target, rivet, "engine",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].overflow, 0);
  assert.equal(out[0].sp, 1); // D1, untouched
});

test("rollWounds — the negated path carries overflow: 0", () => {
  // Shape parity with rend/evisc. A shield-negated shot resolves no overflow,
  // but the rider must still expose the field the ledger reads.
  const wb = WEAPONS.melee["Wrecking Ball"];
  const shielded = {
    weightClass: "medium", hardened: false,
    preparation: { type: "raise-shield" },
    weaponUpgrades: {},
  };
  const out = rollWounds({ weightClass: "medium" }, shielded, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].negated, true);
  assert.equal(out[0].overflow, 0);
  assert.equal(out[0].sp, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `overflow` is `undefined`, so `assert.equal(front[0].overflow, 0)` fails with `undefined !== 0`.

- [ ] **Step 3: Wire it in**

3a. Extend the `rules.js` import at `shared/combat.js:4-7`:

```js
import {
  AIM, WEIGHT_STR_MOD, hitLocation, shieldCoverage, HEAT_CAPACITY,
  equipmentUpgradeEffectOf, toughnessOf, woundTarget, WOUND_DIE, strOverflowD,
} from "./rules.js";
```

3b. At `shared/combat.js:527`, add `overflow: 0` to the negated push:

```js
        d: profile.d || 1, rend: 0, evisc: 0, overflow: 0,
```

3c. Replace `shared/combat.js:542-557` (from `let sp = 0;` through the closing brace of the `if (wounded)` block) with:

```js
    let sp = 0;
    // Rend / Evisceration / Overmatch are threaded out per wound, not just folded
    // into `sp`: the ledger's damage step names them, and re-deriving Evisceration
    // there is impossible anyway — it reads the location's SP BEFORE this
    // volley's damage was applied.
    let rend = 0;
    let evisc = 0;
    let overflow = 0;
    if (wounded) {
      // Rend — +1 D per wound. Buys depth, not frequency (cf. AP above).
      rend = hasPerk(profile, "Rend") ? 1 : 0;
      // Evisceration (§13, Talon) — +1 D against a location already at or below
      // half its max SP (was: forced Critical).
      evisc = profile.upgradeEffect?.eviscerate && target[location]
        && target[location].sp <= target[location].max / 2 ? 1 : 0;
      // Overmatch (§7.5) — STR the wound clamp discarded, converted to depth.
      // Reads `effStr`, NOT the nominal STR: that is what makes one rule revive
      // the arc bonus, WEIGHT_STR_MOD and every +STR upgrade at once, since all
      // of them are already summed into it above.
      overflow = strOverflowD(effStr, toughness);
      sp = (profile.d || 1) + rend + evisc + overflow;
    }
```

3d. At `shared/combat.js:567`, add `overflow` to the rider:

```js
    out.push({ ...resolved, wounded, d: profile.d || 1, rend, evisc, overflow, terms: woundTerms });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS, including every pre-existing test. If `rollWounds is byte-unchanged by the wound seam for a plain target` (`combat.test.js:241`) fails, that is correct behaviour being caught: Autocannon is STR 7 vs T5 hull → overflow 0 → `sp` stays 2. It must still pass untouched.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): apply Overmatch in the wound step

Overflow rides effStr, so it inherits arc, weight class, Haymaker, Brace
and shield blunt from the sum at combat.js:532 — one rule reconnects
every lever the clamp had killed. Threaded as a named rider beside
rend/evisc, per the ledger rule at combat.js:543."
```

---

### Task 3: The "Overmatch" ledger term

**Files:**
- Modify: `shared/combat.js:883-890`
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

> **Corrected after implementation.** The values first written here were wrong,
> both for the same reason: they used base STR, and **no legal rig has base STR**
> (`normalizeWeaponUpgrade` returns `upgrades[0].id` for a null id, so `makeRig`
> always fits the field upgrade). Wrecking Ball's field upgrade is Haymaker (+3),
> so effStr is 13 before arc, not 10. The first test expected `Overmatch: 1` when
> the real answer is 2; the second used a front-arc Wrecking Ball expecting no
> Overmatch, which overflows to +1 and would have **failed outright**. The
> implementer caught both. See "Those examples use base STR" in the spec.

```js
test("ledger — Overmatch is named in the damage step when it fires", () => {
  // A crushing hit rendering "weapon D 5" with an unexplained +2 in the total is
  // exactly the readability failure this ledger exists to close.
  //
  // Haymaker is pinned explicitly rather than left to the field-upgrade default:
  // this is a RENDERING test, and it should not break if WEAPON_UPGRADES is
  // reordered. Wrecking Ball STR 10 + Haymaker 3 + rear arc 3 = effStr 16 into
  // medium arms (T4) → 8 past the floor → capped at +2.
  const attacker = makeRig(1, "A", "medium", "a",
    { longRange: "Double MG", melee: "Wrecking Ball", meleeUpgrade: "haymaker" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "rear", range: "near", cover: 0,
      dice: { toHit: [6], location: 5, wounds: [10] } }, // location 5 → arms
    () => 0, ctx);
  const dmg = ctx.resolutions.find((r) => r.kind === "attack")
    .breakdown.steps.find((s) => s.kind === "damage");
  // The literal 2 is deliberate. Computing it via strOverflowD(16, 4) would make
  // the assertion self-referential — it would pass even if strOverflowD returned
  // garbage, since both sides would move together. The rate and cap behind the 2
  // are rules.test.js's to pin; this test owns only the wiring and the label.
  assert.deepEqual(dmg.terms, [
    { label: "wounds", value: 1 },
    { label: "weapon D", value: 5 },
    { label: "Overmatch", value: 2 },
  ]);
});

test("ledger — Overmatch is absent when it did not fire", () => {
  // A term worth 0 must push nothing (same rule as strBreakdown) or the entries
  // that decided the shot get buried.
  //
  // Sword, not Wrecking Ball: it is STR 5 and its field upgrade (Duelist's
  // Balance) grants Precision rather than STR, so it genuinely cannot overflow.
  // Every STR >= 9 weapon overflows on some arc once its field upgrade lands.
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Double MG", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", range: "near", cover: 0,
      dice: { toHit: [6], location: 5, wounds: [10] } },
    () => 0, ctx);
  const dmg = ctx.resolutions.find((r) => r.kind === "attack")
    .breakdown.steps.find((s) => s.kind === "damage");
  // deepEqual, not .some(): this also catches an accidental EXTRA term, which is
  // a live risk in a step that now pushes conditionally from three sources.
  // The wound genuinely lands (wounds: [10] forces it), so this is not vacuous.
  assert.deepEqual(dmg.terms, [
    { label: "wounds", value: 1 },
    { label: "weapon D", value: 3 },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — the first test's `dmg.terms` is missing the `Overmatch` entry.

- [ ] **Step 3: Emit the term**

At `shared/combat.js:888-889`, after the Evisceration line, add:

```js
      if (rider.rend) dmgTerms.push({ label: "Rend", value: rider.rend });
      if (rider.evisc) dmgTerms.push({ label: "Evisceration", value: rider.evisc });
      if (rider.overflow) dmgTerms.push({ label: "Overmatch", value: rider.overflow });
```

Also update the comment at `combat.js:885-886` so it names all three riders.

> **Corrected after implementation.** This plan originally suggested "report the
> ones that actually fired on a wound that dealt damage" — which is false in the
> `|| first` branch, where the rider is sourced from a wound that dealt nothing.
> A reviewer proved it by execution: against a target with Ablative Cascade, the
> ledger renders `wounds 0, weapon D 5, Overmatch 2` next to `0 SP → arms`. The
> comment must describe **both** branches of the `||`, and lead with the reason
> the `find` exists at all — which the original omitted entirely: a wound that
> failed its roll carries all three riders as 0 (they are only assigned inside
> `if (wounded)`), so `impacts[0]` alone would silently drop the terms whenever
> the first die missed.
>
> This same defect class — a comment asserting a rule the code does not hold to —
> shipped in all three code tasks of this plan and was caught in review each time.
> The plan text was the upstream source every time. Write the comment against the
> code's actual branches, not against the rule you wish it followed.

```js
      // Rend/Evisceration/Overmatch are per-wound riders. Prefer a wound that
      // actually dealt damage — a wound that failed its roll carries all three
      // as 0 and would under-report. When none dealt damage (every wound zeroed
      // by Ablative Cascade), `first` still reports what the shot WOULD have
      // added, matching the negated path's `weapon D`. A rider worth 0 pushes
      // nothing (same rule as the wound step's terms).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): name Overmatch in the damage ledger"
```

---

### Task 4: The glossary entry

**Files:**
- Modify: `shared/glossary.js:172-175`
- Test: `shared/glossary.test.js`

`shared/glossary.test.js` asserts structural invariants over the whole `GLOSSARY` array — unique ids, and that every id named in its `REQUIRED` list resolves. A new entry is covered by the uniqueness check automatically, and "Overmatch" is not a terminal token, so it does not belong in `REQUIRED`. No new test is needed here; the entry is data.

- [ ] **Step 1: Add the entry**

In `shared/glossary.js`, immediately after the `rend` entry (which ends at line 175), insert:

```js
  {
    id: "overmatch", term: "Overmatch", match: ["Overmatch"],
    def: "STR beyond what a location's Toughness can resist is not wasted: every 3 points past the point where you wound on 2+ adds +1 Damage, up to +2 (§7.5).",
  },
```

- [ ] **Step 2: Run the suite**

Run: `node --test shared/glossary.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add shared/glossary.js
git commit -m "docs(glossary): define Overmatch"
```

---

### Task 5: Swarm Warheads +2 ROF → +1

**Files:**
- Modify: `shared/game-state.js:571`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("Swarm Warheads is +1 ROF, and its tag says so", () => {
  // Measured at +2.31 SP, the strongest upgrade in the game, putting Missile
  // Barrage alone at the top (6.92) and making its own tuned/prototype tiers
  // read as downgrades. The tier is right (+ROF is a raw stat, which is what
  // Field means); the magnitude was the outlier.
  const swarm = WEAPON_UPGRADES["Missile Barrage"].find((u) => u.id === "swarm-warheads");
  assert.equal(swarm.effect.rof, 1);
  // `tag` is rendered verbatim by the commission wizard and the loadout view —
  // it must move with the effect or the UI lies about what the upgrade does.
  assert.equal(swarm.tag, "+1 ROF");
  const rig = makeRig(1, "A", "light", "a", {
    longRange: "Missile Barrage", melee: "Flamethrower", longRangeUpgrade: "swarm-warheads",
  });
  assert.equal(effectiveWeaponProfile("longRange", "Missile Barrage", rig).rof, 5); // 4 base + 1
});
```

`WEAPON_UPGRADES`, `makeRig` and `effectiveWeaponProfile` are already imported at the top of `shared/game-state.test.js` — no import change needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `effect.rof` is 2, tag is `"+2 ROF"`, profile rof is 6.

- [ ] **Step 3: Make the change**

At `shared/game-state.js:571`:

```js
    { id: "swarm-warheads", nature: "field", name: "Swarm Warheads", tag: "+1 ROF", effect: { rof: 1 } },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS. Then run the full suite — other tests may pin the old ROF 6:

Run: `npm test`
Expected: PASS. Any failure asserting `rof === 6` for a swarm-warheads Missile Barrage is this change being caught correctly; update that assertion to 5.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "balance(weapons): Swarm Warheads +2 ROF -> +1

The strongest upgrade measured (+2.31 SP), it put Missile Barrage alone
at the top of the board at 6.92 and made its own tuned (5.22) and
prototype (4.61) tiers read as downgrades.

Nerfed in place rather than re-tiered: +2 ROF is a pure raw stat, which
is exactly what the Field nature means. The magnitude was the outlier,
not the tier."
```

---

### Task 6: Re-measure

**Files:**
- Run: `scripts/balance/weapon-sweep.mjs`, `scripts/balance/report.mjs`
- Create: `scripts/balance/report-2026-07-15-overflow.txt`

This task is a measurement, not a code change. It has no tests — the correctness of the rule was settled in Tasks 1-3, deterministically and for free. The sweep answers only what unit tests cannot: did the ranking move, and roughly how far.

- [ ] **Step 1: Confirm the whole suite is green first**

Run: `npm test`
Expected: PASS. Do not measure against a broken tree.

- [ ] **Step 2: Run the sweep at 500 trials**

```bash
TRIALS=500 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt   # ~40s
DATA=full.json node scripts/balance/report.mjs > scripts/balance/report-2026-07-15-overflow.txt
cat scripts/balance/report-2026-07-15-overflow.txt
```

The harness asserts its own tier ladder on startup. If it throws, stop — that is the field-is-the-floor trap (`normalizeWeaponUpgrade` at `game-state.js:651` returns `upgrades[0].id` for an unknown id, so `makeRig` cannot build an un-upgraded rig) and any numbers produced past it are garbage.

- [ ] **Step 3: Compare against the baseline**

Baseline: `scripts/balance/report-2026-07-15.txt` (3000 trials).

| question | bar |
|---|---|
| arc bonus reconnected? | rear/front ratio for Siege Maul / Sniper / Harpoon / Wrecking Ball / Anchor moves off ×1.00 |
| weight class reconnected? | light↔medium delta for those six moves off Δ0.00, but stays **small** — the per-3 rate means a ±1 mod only bites at rate boundaries (see "Known limit of the per-3 rate" in the spec). A small delta is the expected result, not a failure. |
| +STR upgrades reconnected? | haymaker / reinforced-head / cold-bore / full-tilt move off +0.00 |
| Missile Barrage off the top? | ~6.9 → ~5.5–6.0 |
| ROF-1 heavies climbed? | Wrecking Ball ~2.25 → ~2.8–3.2 |
| spread narrowed? | directional only, was 6.2× |

**Do not re-tune off this run.** At 500 trials ratio noise is roughly ±0.045 — enough to see the structural zeros move, not enough to justify adjusting numbers. If the spread still looks wrong, that is the trigger to spend 12 minutes on `TRIALS=3000`, not to start tuning against noise. This is the findings doc's step 2: measure before tuning.

- [ ] **Step 4: Commit the report**

```bash
rm -f full.json progress.txt
git add scripts/balance/report-2026-07-15-overflow.txt
git commit -m "chore(balance): post-overflow sweep at 500 trials"
```

- [ ] **Step 5: Amend the findings doc**

Two corrections in `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md`:

1. The "Bug found and fixed during this work" section says the `combat.js:728` hit-location fix is **"Uncommitted, in the working tree."** That is stale — it is committed, with its regression test in `combat.test.js`. Change that line to say it landed.
2. Under "Suggested order of work", mark steps 1-3 done and point at the new report.

```bash
git add docs/superpowers/specs/2026-07-15-weapon-balance-findings.md
git commit -m "docs(balance): findings steps 1-3 landed; fix stale bug-status note"
```

---

## Definition of done

- `npm test` green.
- `strOverflowD` pinned in `rules.test.js`: floor boundary, rate, cap, junk-T guard, weak weapons.
- `rollWounds` proves the arc bonus now changes the damage of a Wrecking Ball shot — the single fact the whole change exists to produce.
- "Overmatch" appears in the damage ledger only when it fired, and in the glossary.
- Swarm Warheads is `+1 ROF` in **three** places: `effect`, `tag`, and `rules.md`.
  The first two are the coupling rule; the third is the one this plan forgot, and
  it is the only one a player actually reads.
- A 500-trial report is committed next to the 3000-trial baseline.

## Lessons from executing this plan

Recorded because they are about the plan, not the code, and the next plan in this
repo will hit them.

1. **A comment asserting a rule the code doesn't hold to shipped in every code
   task** — three tasks, four separate instances, caught in review every time. The
   plan text was the upstream source each time: implementers transcribed my
   comments faithfully. Write comments against the code's real branches, not the
   rule you wish it followed. The `|| first` fallback is the canonical example: the
   comment said "source from a wound that dealt damage" while the fallback does the
   exact opposite.
2. **Two tests didn't test what their names claimed**, and both were found by
   *mutation*, not by reading: the cap test stayed green with the cap raised, and
   the `find` stayed green when deleted entirely. If a test's name asserts a
   mechanism, break the mechanism and watch it fail — otherwise the name is a
   guess.
3. **"Field is the floor" bites every calculation.** `normalizeWeaponUpgrade`
   returns `upgrades[0].id` for a null id, so no legal rig has base stats. Every
   worked example in this plan that used base STR was wrong. The findings doc says
   this trap silently ruined its first sweep run; it then silently ruined two of
   this plan's test fixtures.
4. **Grep for the magnitude, not just the field.** A stat lives in `effect`, in
   the display `tag`, in `rules.md`, and in design docs. This plan's File Structure
   table listed one of the four.
