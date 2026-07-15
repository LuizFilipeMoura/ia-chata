# Penetration Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the Penetration band to 3–7, delete Overmatch, pay the six heavies' wasted Penetration back into Damage, and surface the result in the roll console.

**Architecture:** Numbers first (they are what must be measured), then the deletion, then the rulebook, then the drama. Every balance task is one commit so the harness can bisect. The drama is `combat.js` only — the client already renders `effects` and the `crit` tone.

**Tech Stack:** Plain ESM JavaScript (`shared/`, `scripts/`), `node --test` + Vitest, two Monte Carlo harnesses under `scripts/balance/`.

**Spec:** `docs/superpowers/specs/2026-07-16-penetration-rework-design.md`

---

## Prerequisites — do not start without these

- [ ] **`2026-07-16-stat-rename.md` has landed.** This plan is written in the renamed vocabulary: the weapon fields are `pen`, `dmg`, `accuracy`; the sum is `effPen`. If `game-state.js` still says `str:` and `d:`, **stop and run the rename plan first.** Landing them together makes the balance measurement unattributable, which is the one thing both specs exist to prevent.
- [ ] **The suite is green at 816 node / 293 vitest.**

```bash
npm test
```

> The baseline moved twice since this plan was written, both times for good reasons:
> the rename added 2 `rules.md` guards (811 → 813), Task 1 of this plan added the
> `dmg`-upgrade test (→ 814), and the **heavy/colossal deletion** (`d8a8d3d`,
> `5aebc26`) added 3 drift guards and removed a redundant one (→ 816).
>
> **Task 1 is already done** (`84ac6f0`). Start at Task 2.
>
> **Re-verified after the deletion, against the exact design in this plan:**
> `47.7% → 15.6%` of matchups pinned (all fieldable units), `55.1% → 25.0%` vs rigs
> only, max Penetration 7, zero weapons pinned above 50%. The figures always came
> off `SUPPORTED_RIG_CLASSES`, so deleting the dead classes moved nothing.

## The invariant for this plan

The rename's invariant was "no number moves". This plan's is the mirror:

> **Every number that moves must be one this plan names, and every one it names must move.**

Task 10 re-measures against committed baselines. If a number moved that no task lists, the measurement is contaminated and you must find it before running the harness.

## Traps

1. **`combat.test.js`'s `applyDamage` is a stub that lies.** `makeCtx()` (`shared/combat.test.js:11-16`) wires `applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); }` — it **floors at 0 and never fires the §8 cascade**. The real `combatCtx()` (`game-state.js:2201`) wires the real one. **Any drama test written against `makeCtx()` will pass while testing nothing.** Tasks 7–9 use `applyCommand` with injected dice instead — the pattern at `game-state.test.js:1938`.
2. **Field is the floor.** `normalizeWeaponUpgrade` returns `upgrades[0].id` for a null id, so `makeRig` cannot build an un-upgraded rig. **Every number in Task 2 is a BASE value chosen so that base + field upgrade lands on the spec's floor value.** Do not read the spec's table into `WEAPONS` directly — Siege Maul's spec line says Pen 7 / Dmg 7, and its base `dmg` is **6**.
3. **The duel must run `arc: "side"`, never `"front"`.** `arcBonus` returns `null` for Raking Fire outside side/rear (`combat.js:401`) — a hard zero **by rule**. Mini Gun and Double MG carry the perk and deal literally 0 at front for ten rounds. The tell: ask whether a zero is a measurement or a rule.
4. **Do not use `sed -i`** — it rewrites CRLF and leaves files dirty with an empty `git diff`.
5. **`git add <file>` stages the whole file.** `package.json` / `package-lock.json` carry the user's in-progress dependency upgrade. Never `git add -A`.
6. **Another agent commits to this branch.** Never trust `HEAD~1`.
7. **`startedRoom()` is not the seed roster, and this plan's test fixtures got it wrong.** It builds six **light** rigs (`a1..a3`, `b1..b3`) all carrying **Mini Gun / Sword** — not `medium-shield-siege` with a Siege Maul, and not a Wrecking Ball. Task 1's fixture as written would have read the Siege Maul catalog entry against a rig whose `weaponUpgrades.longRange` was a *Mini Gun* upgrade id: `upgradeForWeapon` returns null → effect `{}` → **the test fails for the wrong reason, then goes green-for-free once the branch lands, exercising nothing.** Task 1's implementer caught it and used `makeRig(1, "Breaker", "medium", "a", { longRange: "Siege Maul", melee: "Sword" })` instead — the pattern the neighbouring tests already use — and asserted the resolved upgrade id so the fixture proves itself. **Do the same in Tasks 7–9.**
   **Poking `rig.melee = "Wrecking Ball"` does NOT work either:** `weaponUpgrades.melee` still holds the old weapon's upgrade id, `upgradeForWeapon` returns null, and Haymaker never applies — so the rig swings at Damage 7, not 8, and a one-shot test silently proves nothing. Build the rig with `makeRig`, or set BOTH the weapon and its upgrade id.
8. **A test that passes without exercising the branch is worse than no test.** Mutation-test every green in this plan: revert the line you added, confirm the test goes red, restore. Two implementers on the rename found guards that looked real and weren't.
9. **`effectiveWeaponProfile` is the function; `applyWeaponUpgrade` does not exist.** Earlier drafts of this plan named the latter eight times. It was never real — the upgrade logic is inline in `effectiveWeaponProfile` (`game-state.js:691`). There is no injection seam, which is why Task 1's test mutates `WEAPON_UPGRADES` and restores it.

## File Structure

| file | responsibility in this plan |
|---|---|
| `shared/game-state.js` | `WEAPONS` base stats, `WEAPON_UPGRADES` effects + tags, `effectiveWeaponProfile` gains `dmg` |
| `shared/rules.js` | delete `strOvermatchD`, `OVERMATCH_PER_D`, `OVERMATCH_MAX_D`; possibly inline `woundRaw` |
| `shared/combat.js` | delete the overmatch rider; add the drama effects and the `crit` tone |
| `shared/glossary.js` | delete the `overmatch` entry |
| `rules.md` | **runtime input** — every magnitude this plan moves, plus the Overmatch paragraph |
| `shared/game-state.test.js` | the `dmg` upgrade test and all three drama tests (real ctx) |
| `shared/rules.test.js`, `shared/combat.test.js` | remove the Overmatch tests |
| `docs/superpowers/specs/2026-07-15-opponent-brain-design.md` | dangling `strOvermatchD` reference |

---

### Task 1: `effectiveWeaponProfile` learns `dmg`

**The spec assumes Reinforced Head and Haymaker can grant `+1 Damage`. They cannot — there is no code path.** `effectiveWeaponProfile` handles `rof`, `pen`, `perks`, `range` and `noFarPenalty`, and nothing else. This task adds the path before any upgrade needs it.

**Files:**
- Modify: `shared/game-state.js:704-711`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("a weapon upgrade can add Damage, not just Penetration and ROF", () => {
  // Reinforced Head (+1 Damage) and Haymaker (+1 Damage) depend on this path;
  // before the penetration rework, effectiveWeaponProfile could not apply `dmg` at all.
  const base = { rof: 1, pen: 7, dmg: 6, accuracy: [0, 0], rng: [2, 2], melee: true };
  const profile = applyUpgradeToProfile(base, { dmg: 1 });
  assert.equal(profile.dmg, 7, "effect.dmg must add to the base weapon's Damage");
  assert.equal(profile.pen, 7, "an unrelated stat must not move");
});
```

> This test calls a helper that does not exist yet — `applyUpgradeToProfile`. **Do not create one.** Instead write the test against the real public path, which is `effectiveWeaponProfile(slot, name, rig)`. Replace the body above with:

```js
test("a weapon upgrade can add Damage, not just Penetration and ROF", () => {
  // Reinforced Head grants +1 Damage after the rework; before it, effectiveWeaponProfile
  // had no `dmg` branch at all and the effect silently did nothing.
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.weaponUpgrades.longRange = "reinforced-head";
  const profile = effectiveWeaponProfile("longRange", "Siege Maul", b1);
  const base = WEAPONS.longRange["Siege Maul"];
  assert.equal(profile.dmg, base.dmg + 1, "Reinforced Head must add +1 Damage");
});
```

> Import `effectiveWeaponProfile` and `WEAPONS` from `./game-state.js` if the test file does not already. Check the existing import block first — `WEAPONS` is likely already there.

**This test cannot pass until Task 4 makes Reinforced Head a `dmg` effect.** So for *this* task, assert the mechanism directly with a temporary effect instead:

```js
test("a weapon upgrade can add Damage, not just Penetration and ROF", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  // Siege Maul's field upgrade, stubbed to a Damage effect to prove the path exists.
  // Task 4 makes this the real Reinforced Head.
  const original = WEAPON_UPGRADES["Siege Maul"][0].effect;
  WEAPON_UPGRADES["Siege Maul"][0].effect = { dmg: 1 };
  try {
    b1.weaponUpgrades.longRange = WEAPON_UPGRADES["Siege Maul"][0].id;
    const profile = effectiveWeaponProfile("longRange", "Siege Maul", b1);
    assert.equal(profile.dmg, WEAPONS.longRange["Siege Maul"].dmg + 1);
  } finally {
    WEAPON_UPGRADES["Siege Maul"][0].effect = original;
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test shared/game-state.test.js
```

Expected: **FAIL** — `Expected values to be strictly equal: 5 !== 6` (the base `dmg` came through unchanged because no branch reads `effect.dmg`).

- [ ] **Step 3: Add the branch**

In `shared/game-state.js`, in `effectiveWeaponProfile`'s profile literal:

```js
  const profile = {
    ...base,
    rof: base.rof + (effect.rof || 0),
    pen: base.pen + (effect.pen || 0),
    dmg: base.dmg + (effect.dmg || 0),
    perks: uniquePerks(base.perks, effect.perks),
    upgrade: upgrade || null,
    upgradeEffect: effect,
  };
```

- [ ] **Step 4: Run the test**

```bash
node --test shared/game-state.test.js
```

Expected: **PASS**.

- [ ] **Step 5: Full suite**

```bash
npm test
```

Expected: `293 passed`, `ℹ pass 814 / ℹ fail 0` (813 + this test).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(weapons): weapon upgrades can grant Damage

effectiveWeaponProfile handled rof/pen/perks/range and nothing else, so an
effect: { dmg: N } silently did nothing. The penetration rework needs it for
Reinforced Head and Haymaker."
```

---

### Task 2: the six — base Penetration and Damage

**Every value here is a BASE, derived by subtracting what the field upgrade adds** (trap 2). The spec's table is the **floor**.

| weapon | spec floor Pen/Dmg | field upgrade adds | **base `pen`/`dmg`** |
|---|---|---|---|
| Siege Maul | 7 / 7 | Reinforced Head: +1 Dmg | **7 / 6** |
| Sniper Cannon | 6 / 8 | Marksman Optics: Precision | **6 / 8** |
| Harpoon | 7 / 6 | Barbed Head: Impale | **7 / 6** |
| Wrecking Ball | 6 / 8 | Haymaker: +1 Dmg | **6 / 7** |
| Lance | 6 / 7 | Couched Reach: +2" reach | **6 / 7** |
| Anchor | 7 / 6 | Fluked Head: Armour Piercing | **7 / 6** |

**Files:**
- Modify: `shared/game-state.js:57-73`

- [ ] **Step 1: Rewrite the three ranged entries**

```js
    "Sniper Cannon":  { rof: 1, pen: 6, dmg: 8, sweet: 22, peak: 2, dropoff: 0.15, minRange: 0, maxRange: 28 },
    "Siege Maul":     { rof: 1, pen: 7, dmg: 6, sweet: 8,  peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 },
    "Harpoon":        { rof: 1, pen: 7, dmg: 6, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 },
```

- [ ] **Step 2: Rewrite the three melee entries**

```js
    "Lance":         { rof: 1, pen: 6, dmg: 7, accuracy: [1, 1], rng: [2, 2], melee: true },
    "Wrecking Ball": { rof: 1, pen: 6, dmg: 7, accuracy: [0, 0], rng: [2, 2], melee: true },
    "Anchor":        { rof: 1, pen: 7, dmg: 6, accuracy: [0, 0], rng: [2, 2], melee: true },
```

- [ ] **Step 3: Run the suite and expect failures**

```bash
npm test
```

Expected: **failures** in `shared/combat.test.js` and `shared/game-state.test.js` — fixtures that assert old Penetration/Damage values. **This is correct.** Read each failure and confirm it is an expectation about a number this task moved, not a behaviour change.

- [ ] **Step 4: Update the fixtures**

Recompute each failing expectation from the new stats. **Do not blanket-update to whatever the code now prints** — derive the expected number by hand from `woundTarget(pen, T)` and the new `dmg`, and confirm the code agrees. A fixture updated to match a bug is a bug with a green test.

- [ ] **Step 5: Full suite**

```bash
npm test
```

Expected: `293 passed`, `ℹ pass 814 / ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "balance(weapons): the six heavies compress to Pen 6-7 and pay back in Damage

Base values; field is the floor, so these land on the spec's floor table once
the default upgrade is fitted."
```

---

### Task 3: the four the census missed

**Files:**
- Modify: `shared/game-state.js:54-62,74`

- [ ] **Step 1: Rewrite the entries**

```js
    "Autocannon":     { rof: 4, pen: 6, dmg: 2, sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26 },
    "Arc Gun":        { rof: 2, pen: 7, dmg: 3, sweet: 20, peak: 1, dropoff: 0.18, minRange: 0, maxRange: 32 },
    "Crossbow":       { rof: 1, pen: 7, dmg: 4, sweet: 18, peak: 3, dropoff: 0.25, minRange: 0, maxRange: 24 },
```
```js
    "Talon":         { rof: 2, pen: 5, dmg: 3, accuracy: [1, 1], rng: [2, 2], melee: true },
```

> Autocannon 7 → **6** and Talon 6 → **5** are *base* drops that pair with their field upgrades going +2 → +1 in Task 4. Both land on the same floor they had (Autocannon 7, Talon 6) — but the upgrade becomes a real choice rather than a rubber stamp. Arc Gun and Crossbow have no `pen` field upgrade, so their base **is** their floor.
>
> **Crossbow keeps `dmg: 4`.** It is a deliberate low-alpha utility weapon (`ROF × Damage` 4) and the spec scopes F2-C to the six. Do not "fix" it.

- [ ] **Step 2: Run the suite, update fixtures by hand**

```bash
npm test
```

Same discipline as Task 2 Step 4 — derive, don't accept.

- [ ] **Step 3: Full suite**

Expected: `293 passed`, `ℹ pass 814 / ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "balance(weapons): Autocannon, Arc Gun, Crossbow and Talon come into the 3-7 band

Autocannon defaulted to Pen 9 at ROF 4 (94% of matchups pinned) and was never
in the six. Arc Gun and Crossbow sat at Pen 8 (69%)."
```

---

### Task 4: the five field upgrades stop selling what the band can't carry

**Files:**
- Modify: `shared/game-state.js` — `WEAPON_UPGRADES` entries for Talon, Autocannon, Siege Maul, Wrecking Ball, Anchor

- [ ] **Step 1: Rewrite the five entries**

```js
    { id: "honed-talons", nature: "field", name: "Honed Talons", tag: "+1 Penetration", effect: { pen: 1 } },
```
```js
    { id: "depleted-core", nature: "field", name: "Depleted Core", tag: "+1 Penetration", effect: { pen: 1 } },
```
```js
    { id: "reinforced-head", nature: "field", name: "Reinforced Head", tag: "+1 Damage", effect: { dmg: 1 } },
```
```js
    { id: "haymaker", nature: "field", name: "Haymaker", tag: "+1 Damage", effect: { dmg: 1 } },
```
```js
    { id: "fluked-head", nature: "field", name: "Fluked Head", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
```

> `tag` is rendered **verbatim** by the commission wizard, loadout view, rig terminal and passive badges. Change the words; do not restructure it or add metadata.
>
> `fluked-head` needs no code — `uniquePerks(base.perks, effect.perks)` already merges perks. `reinforced-head` and `haymaker` depend on Task 1.

- [ ] **Step 2: Verify the floors are what the spec says**

```bash
node -e '
const g = await import("./shared/game-state.js");
const want = { "Siege Maul": [7,7], "Sniper Cannon": [6,8], "Harpoon": [7,6],
               "Wrecking Ball": [6,8], "Lance": [6,7], "Anchor": [7,6],
               "Autocannon": [7,2], "Arc Gun": [7,3], "Crossbow": [7,4], "Talon": [6,3] };
for (const [name, [pen, dmg]] of Object.entries(want)) {
  const slot = g.WEAPONS.longRange[name] ? "longRange" : "melee";
  const base = g.WEAPONS[slot][name];
  const eff = g.WEAPON_UPGRADES[name][0].effect;
  const fPen = base.pen + (eff.pen || 0), fDmg = base.dmg + (eff.dmg || 0);
  const ok = fPen === pen && fDmg === dmg;
  console.log((ok ? "ok  " : "FAIL"), name.padEnd(15), `floor ${fPen}/${fDmg}`, ok ? "" : `expected ${pen}/${dmg}`);
}' --input-type=module
```

Expected: **`ok` on all ten rows.** This is the single check that the spec's floor table and the code agree.

- [ ] **Step 3: Full suite, update fixtures by hand**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "balance(upgrades): the heavies' field upgrades stop selling Penetration

All five always-on +Pen upgrades sat on weapons with base Pen >= 6 - the exact
weapons that cannot spend it. Reinforced Head and Haymaker sell Damage, Fluked
Head sells the reroll. Depleted Core and Honed Talons keep Penetration at +1,
which is all a 3-7 band allows."
```

---

### Task 5: delete Overmatch

**Files:**
- Modify: `shared/rules.js`, `shared/combat.js`, `shared/glossary.js`
- Modify: `shared/rules.test.js`, `shared/combat.test.js`

- [ ] **Step 1: Inventory**

```bash
grep -rn 'strOvermatchD\|OVERMATCH_PER_D\|OVERMATCH_MAX_D\|overmatch\|Overmatch' shared/ client/ scripts/ rules.md
```

Expected: **31+** hits.

- [ ] **Step 2: `shared/rules.js` — delete the rule**

Delete `OVERMATCH_PER_D`, `OVERMATCH_MAX_D` and the whole `strOvermatchD` function with its doc comment.

Then **inline `woundRaw`**. It exists only because `woundTarget` and `strOvermatchD` computed the same expression and had to agree about the floor. With `strOvermatchD` gone it has one caller, and the spec permits inlining:

```js
// §7.5 — the wound roll. A shot's effective Penetration is compared to the struck
// location's Toughness: roll a d10 against `6 + T - P`.
//
// The clamp is load-bearing. It guarantees a natural 10 always wounds and a
// natural 1 never does, so no weapon/target/location matchup can be
// mathematically hopeless. That was the failure mode of the impact-total model
// this replaces: its base total capped at `6 + Pen + arc`, leaving 69 combos
// that could never deal damage at any roll. Do not remove the clamp to "let
// armour really matter" — that reintroduces the bug. See
// docs/superpowers/specs/2026-07-14-hit-wound-location-design.md.
//
// Each point of Penetration is worth exactly 10%, so the roll is readable as a
// percentage with no lookup table.
export function woundTarget(pen, toughness) {
  const p = Math.floor(Number(pen) || 0);
  // T is NOT coerced, deliberately: a missing T coercing to 0 yields TN 2 (90%),
  // the single most dangerous default in the system. Penetration may coerce — it
  // fails toward TN 10 (10%) — but T must be real.
  //
  // The check is `typeof`, not `Number.isFinite(Number(t))`: coercing first
  // reopens the exact hole it means to close, because Number(null), Number(""),
  // Number(false) and Number([]) are all 0 — and `null` is precisely what a
  // failed lookup used to hand us. Only a real number may pass.
  if (typeof toughness !== "number" || !Number.isFinite(toughness)) {
    throw new Error(`wound roll: toughness must be a number, got ${toughness}`);
  }
  return Math.max(WOUND_TN_FLOOR, Math.min(WOUND_DIE, 6 + Math.floor(toughness) - p));
}
```

> **`WOUND_TN_FLOOR` stays** — it is still the clamp. The whole `typeof toughness` comment block moves across verbatim; it is load-bearing and unrelated to Overmatch.

- [ ] **Step 3: `shared/combat.js` — delete the rider**

Remove, in `rollWounds`: the `overmatch` computation, its term in the `sp` sum, the `overmatch: 0` on the negated path (`:527`), and the rider push (`:577`). The three lines become:

```js
        dmg: profile.dmg || 1, rend: 0, evisc: 0,
```
```js
      sp = (profile.dmg || 1) + rend + evisc;
```
```js
    out.push({ ...resolved, wounded, dmg: profile.dmg || 1, rend, evisc });
```

Remove the ledger term at `:912`:

```js
      if (rider.rend) dmgTerms.push({ label: "Rend", value: rider.rend });
      if (rider.evisc) dmgTerms.push({ label: "Evisceration", value: rider.evisc });
```

Update the comment above it — it names all three riders — to name only Rend and Evisceration.

- [ ] **Step 4: `shared/glossary.js` — delete the entry**

Remove the `overmatch` entry (`id: "overmatch"`, lines ~89-90) entirely.

- [ ] **Step 5: Delete the tests**

Remove the Overmatch tests from `shared/rules.test.js` and `shared/combat.test.js`. **Do not delete the wound-roll or clamp tests** — they cover `woundTarget`, which survives.

- [ ] **Step 6: Verify nothing but `rules.md` remains**

```bash
grep -rn 'strOvermatchD\|OVERMATCH_\|overmatch\|Overmatch' shared/ client/ scripts/
```

Expected: **no output.** (`rules.md` is Task 6; the specs under `docs/` are Task 9.)

- [ ] **Step 7: Full suite**

```bash
npm test
```

Expected: `293 passed`. Node count **drops** by however many Overmatch tests existed. Record the new number — it is the baseline for the rest of this plan.

- [ ] **Step 8: Commit**

```bash
git add shared/rules.js shared/combat.js shared/glossary.js shared/rules.test.js shared/combat.test.js
git commit -m "balance(rules): delete Overmatch

It was a patch on the clamp, not a mechanic - rules.js carried woundRaw purely
so woundTarget and strOvermatchD could agree about the floor they both computed.
It also coupled Penetration to Damage, which ROF multiplies, handing the benefit
to the high-ROF weapons that were already winning. woundRaw is inlined back."
```

---

### Task 6: `rules.md` — the rulebook the bot teaches from

`rules.md` is baked verbatim into the rules bot's system prompt as "the single source of truth" (`server/config.js:6` → `server/prompt.js`), and the bot is instructed to refuse rather than guess. **Every magnitude this plan moved must move here, or the bot teaches a game that does not exist.**

**Files:**
- Modify: `rules.md`

- [ ] **Step 1: Delete the Overmatch rule**

Remove the **Overmatch** paragraph at `:253` entirely, and its mention in step 8 at `:254`:

```
8. **Apply damage.** Each wound costs the location the weapon's **Damage** stat in SP (§12) — plus any per-wound riders such as **Rend** (§13). A hit that fails to wound does nothing.
```

- [ ] **Step 2: Update the weapon tables**

In §12 (`:359`, `:366`, `:386`), update every row this plan moved: Sniper Cannon, Siege Maul, Harpoon, Autocannon, Arc Gun, Crossbow (ranged); Lance, Wrecking Ball, Anchor, Talon (melee). Cross-check each against `WEAPONS` rather than typing from the spec.

- [ ] **Step 3: Update the upgrade table**

In §13 (`:408-427`):

```
| Autocannon | Depleted Core (+1 Penetration) | AP Shells (Armour Piercing) | Penetrator Rounds |
| Siege Maul | Reinforced Head (+1 Damage) | Breaching Round (Hull no-repair) | Piledriver Protocol |
| Wrecking Ball | Haymaker (+1 Damage) | Momentum Swing (+2 Penetration charge) | Tow Chain |
| Anchor | Fluked Head (Armour Piercing) | Dead Weight (no Disengage next) | Ground Anchor |
| Talon | Honed Talons (+1 Penetration) | Exploit Wound (+3 Penetration vs damaged location) | Evisceration |
```

- [ ] **Step 4: Fix the prose that names a changed weapon**

`:380` — *"The **Siege Maul** is a close-in demolition gun: the highest STR on the board, but the shortest range of any ranged weapon."* **This is now false twice** (it is Penetration, and it is no longer highest — it ties the standard band at 7). Replace:

```
> The **Siege Maul** is a close-in demolition gun: standard Penetration, the heaviest ranged Damage short of the Sniper Cannon, and the shortest range of any ranged weapon.
```

`:382` — *"The **Harpoon** is a heavy line-thrower — a Sniper Cannon–grade STR punch with a shorter, closer sweet spot."* Replace:

```
> The **Harpoon** is a heavy line-thrower — reliable Penetration and a shorter, closer sweet spot than the Sniper Cannon, trading alpha for reach and Impale.
```

- [ ] **Step 5: Verify the rulebook guards still pass**

```bash
node --test shared/rulebook.test.js
```

Expected: **PASS** (both guards, added by the rename plan).

- [ ] **Step 6: Confirm Overmatch is gone from every runtime surface**

```bash
grep -rn 'Overmatch' rules.md shared/ client/ scripts/
```

Expected: **no output.**

- [ ] **Step 7: Full suite, then commit**

```bash
git add rules.md
git commit -m "docs(rules): the rulebook drops Overmatch and teaches the 3-7 band"
```

---

### Task 7: the drama — a wound that guts a location

**Files:**
- Modify: `shared/combat.js:779` (the damage loop) and `:935` (`effects: []`)
- Test: `shared/game-state.test.js`

**Use the real ctx (trap 1).** `combat.test.js`'s stub floors at 0 and never fires §8.

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("a wound that zeroes a location from full says so in the roll console", () => {
  // The RollConsole renders entry.effects as staggered lines with no client change.
  // Uses applyCommand (the real combatCtx) because combat.test.js's makeCtx stubs
  // applyDamage with a clamp that never fires the §8 cascade.
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  a1.legs.sp = a1.legs.max; // full
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6], wounds: [10, 1], location: 8 }, // 8 -> legs
  } });
  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  assert.ok(
    attack.effects.some((e) => /in one blow/.test(e)),
    `expected a one-blow effect line, got ${JSON.stringify(attack.effects)}`,
  );
});
```

> The Sword deals Damage 3 and a light rig's legs are 10–11, so **this test will not trigger on the seed roster as written.** Set `a1.legs.max = 3; a1.legs.sp = 3;` before firing to make the weapon's Damage meet the location's max exactly. That is a legitimate fixture poke — `game-state.test.js:1516` already establishes the precedent (`// Test-only state poke.`).

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test shared/game-state.test.js
```

Expected: **FAIL** — `expected a one-blow effect line, got []`. The attack resolution's `effects` is hard-coded `[]` at `combat.js:935`.

- [ ] **Step 3: Instrument the damage loop**

At `shared/combat.js:779`, replace:

```js
      for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, dmgOpts);
```

with:

```js
      // Drama (§7 spill / §8 kill tier) — the console already renders `effects`
      // and the `crit` tone, so this needs no client change. Read the part BEFORE
      // each wound lands: applyDamage spends SP one point at a time and every
      // point past 0 fires catastrophicAdditional, so "was it full?" and "did the
      // rig die?" are only answerable from outside the call.
      for (const h of impacts) {
        if (h.sp <= 0) continue;
        const part = target[location];
        const before = part?.sp ?? 0;
        const wasFull = part ? before === part.max : false;
        const wasAlive = !target.destroyed;
        ctx.applyDamage(room, target, location, h.sp, dmgOpts);
        const after = target[location]?.sp ?? 0;
        if (wasAlive && target.destroyed) {
          drama.push(`${weaponName} — ${target.name} gutted in a single blow`);
          critWound = h;
        } else if (wasFull && after === 0) {
          drama.push(`${weaponName} — ${location} torn open in one blow`);
          critWound = h;
        } else if (before > 0 && after === 0 && h.sp > before) {
          drama.push(`${weaponName} — through and through (${h.sp - before} SP spilled)`);
        }
      }
```

Declare both before the loop, in the same scope that later builds the resolution:

```js
  const drama = [];
  let critWound = null;
```

- [ ] **Step 4: Attach the effects to the resolution**

At `combat.js:935`, replace `effects: [],` with:

```js
    effects: drama,
```

- [ ] **Step 5: Run the test**

```bash
node --test shared/game-state.test.js
```

Expected: **PASS**.

- [ ] **Step 6: Full suite**

```bash
npm test
```

Expected: `293 passed`, node up by 1.

- [ ] **Step 7: Commit**

```bash
git add shared/combat.js shared/game-state.test.js
git commit -m "feat(combat): the roll console says when a wound guts a location

Three tiers - zeroed from full, spilled through (which already happened and was
silent), and the §8 kill. No client change: RollConsole already renders
entry.effects."
```

---

### Task 8: the `crit` tone on the die that did it

`RollConsole`'s `verdictLabel` prints **`CRIT!`** for a d10 with `tone: "crit"` (`client/src/v2/overlays/RollConsole.tsx:44-48`). Wound rolls are pushed at `combat.js:759-762` with `tone: "ok" | "miss"` — **before** the damage loop, so the upgrade is a post-loop mutation.

**Files:**
- Modify: `shared/combat.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("the wound die that guts a location is marked CRIT in the roll console", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  a1.legs.max = 3; a1.legs.sp = 3; // Sword Damage 3 meets it exactly
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6], wounds: [10, 1], location: 8 },
  } });
  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  const woundRolls = attack.rolls.filter((x) => /^wound /.test(x.label));
  assert.equal(woundRolls[0].tone, "crit", "the wound that gutted the location must read CRIT");
  assert.equal(woundRolls[1].tone, "miss", "the wound that failed must still read miss");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test shared/game-state.test.js
```

Expected: **FAIL** — `'ok' !== 'crit'`.

- [ ] **Step 3: Promote the tone after the damage loop**

Immediately after the loop from Task 7:

```js
      // The die that gutted the location earns CRIT. The wound rolls were pushed
      // before damage landed (they cannot know), so promote the tone here — the
      // whole point of the ledger is that the player sees WHICH die did it.
      if (critWound) {
        const i = impacts.indexOf(critWound);
        const roll = rolls.find((x) => x.label === `wound ${i + 1}`);
        if (roll) roll.tone = "crit";
      }
```

> `rolls` and `impacts` are both in scope at `:779`. `rolls` is not pushed to the resolution until `:930`, so mutating it here is safe.

- [ ] **Step 4: Run the test**

Expected: **PASS**.

- [ ] **Step 5: Full suite, commit**

```bash
git add shared/combat.js shared/game-state.test.js
git commit -m "feat(combat): the wound die that guts a location reads CRIT"
```

---

### Task 9: the one-shot kill — a decision, not a render

**This is the open call in the spec's Section 5 and it must not be made silently.**

`applyDamage` spends SP one point at a time; a point landing on a 0-SP `power` or `structural` part fires `catastrophicAdditional`, which sets `destroyed = true`. So **Damage 8 into a full engine of max SP 7 kills the rig outright, in one wound.** Damage 8 into an engine of max SP **8** lands exactly on zero and does not.

Engine SP across every buildable chassis:

```
light-claw-autocannon 9   light-missile-flamethrower 8   light-saw-minigun 9
light-wreckingball-double 8   light-sword-arc 7   light-harpoon-anchor 8
light-rivet-pressureclaw 9    medium-* 9/10/11
```

**`light-sword-arc` ("Zebra") is the only engine-7 rig in the game.** It needs the D12 to roll 11–12 and the wound to land — roughly a **10%** window per attack from a Damage-8 weapon (Sniper Cannon, Wrecking Ball).

- [ ] **Step 1: Prove the behaviour before deciding about it**

```js
test("Damage 8 into a full engine of max SP 7 kills the rig outright", () => {
  // applyDamage spends SP one point at a time; the 8th point lands on a 0-SP
  // power part and catastrophicAdditional (§8) destroys it. This is the ONLY
  // one-shot-from-full window in the game and it exists on exactly one chassis.
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  a1.engine.max = 7; a1.engine.sp = 7;
  const b1 = findRig(r, "b1");
  b1.melee = "Wrecking Ball";
  b1.weaponUpgrades.melee = "haymaker"; // floor Damage 8
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6], wounds: [10], location: 11 }, // 11 -> engine
  } });
  assert.equal(a1.engine.sp, 0);
  assert.equal(a1.destroyed, true, "the 8th point of Damage past a 0-SP engine is an instant kill");
});
```

- [ ] **Step 2: Run it**

```bash
node --test shared/game-state.test.js
```

Expected: **PASS immediately** — this documents existing behaviour, it does not add any. If it **fails**, the spec's Section 5 is wrong again and you must stop and report rather than tune around it.

- [ ] **Step 3: Take the decision to the user**

Three options, from the spec:

1. **Ship it.** One chassis, needs the engine roll; a doom-clock rig dying to a Wrecking Ball is the fiction working.
2. **Raise Zebra's engine 7 → 8** (`CHASSIS`, `light-sword-arc`, `sp.engine`). The window closes completely and every weapon number in the spec survives. **Spec's recommendation.**
3. **Cap Damage at 7.** Undoes the payback; not recommended.

**Do not pick alone.** If (2): change `sp: { hull: 11, arms: 9, legs: 10, engine: 7 }` → `engine: 8` on `light-sword-arc`, and invert the Step 1 test to assert no kill from full.

- [ ] **Step 4: Commit whichever landed**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "balance(chassis): close the Damage-8 one-shot window on Zebra"   # if (2)
```

---

### Task 10: re-measure

**This is the point of the whole plan.** The spec: *"If they do not improve, the thesis is wrong and you should stop and say so rather than tune around it."*

- [ ] **Step 1: Run the sweep** (~12 min)

```bash
TRIALS=3000 node scripts/balance/weapon-sweep.mjs > full.json 2>progress.txt
DATA=full.json node scripts/balance/report.mjs > report-new.txt
```

- [ ] **Step 2: Run the duel** (~4 min)

```bash
TRIALS=500 node scripts/balance/duel-sim.mjs > duel.json 2>duel-progress.txt
DATA=duel.json node scripts/balance/duel-report.mjs > duel-new.txt
```

- [ ] **Step 3: Diff against the committed baselines**

```bash
diff scripts/balance/report-2026-07-15-overflow.txt report-new.txt | head -60
diff scripts/balance/duel-2026-07-15.txt duel-new.txt | head -60
```

- [ ] **Step 4: Check each bar from the spec**

| question | where | bar |
|---|---|---|
| **reliability revived?** | duel | `penetrator-rounds` (−2.77), `ap-shells` (−1.47), `shaped-charges` (−0.70) move **toward zero or positive**. **The sharpest test of the thesis.** |
| dead levers alive? | sweep | arc ratio, `WEIGHT_PEN_MOD` delta and +Pen uplift stay alive for the six |
| heavies climbed? | duel | ROF 1; `SP/round` rises with the Damage payback |
| Autocannon stopped saturating? | sweep | its arc bonus comes alive (was Pen 9 / 94% pinned at ROF 4) |
| `ROF × Damage` for the six | stat table | all six in 6–8 |

**Read the duel report's caveat block first — it is printed first for a reason.** The numbers are censored three ways (arm-loss, early-wreck, horizon `†` rows). And the duel prices a prototype's **cost**, not its benefit: `greedySafe` makes no choices, so Fire Control Lock, Enfilade, Barrage and the spatial effects read 0.00 because they *cannot be exercised*.

**`UNIT_WEAPONS` is excluded from every bar** — Tank Cannon is still Pen 10 / 100% pinned by design, deferred to its own spec. Do not read that gap as a regression.

- [ ] **Step 5: Commit the new baselines**

```bash
git add scripts/balance/report-new.txt scripts/balance/duel-new.txt
git commit -m "chore(balance): baselines after the penetration rework"
```

- [ ] **Step 6: If reliability did not move, stop**

Report it. Do not tune. The thesis is falsifiable and this is the falsifier.

---

### Task 11: the dangling spec references

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-opponent-brain-design.md`

- [ ] **Step 1: Fix the dead function reference**

`:129` says *"`D` is the weapon's damage dice **plus `strOvermatchD(effStr, toughness)`**"*. That function no longer exists, and the doc points **forward** at unbuilt work — whoever implements the bot will grep it and find nothing. Commit `29952da` deferred the damage term but left the reference. Replace with the weapon's `dmg` plus Rend/Evisceration.

- [ ] **Step 2: Fix the stale F2-B reasoning**

`:87`, `:116` and `:374` cite *"F2-B — price ROF in heat is the live next step"* and reason from it. **F2-B is shelved** (`2026-07-15-rof-heat-design.md`: taxing ROF measured *worse*, spread 3.0× → 3.9×). Mark it shelved wherever it is cited as live.

- [ ] **Step 3: Leave the historical docs alone**

`2026-07-15-str-overflow-design.md`, `2026-07-15-weapon-balance-findings.md` and the plans are the record of why this was done. **Rewriting them destroys the reasoning trail.** The str-overflow spec is already marked SUPERSEDED; do not gut it.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-opponent-brain-design.md
git commit -m "docs(bot): the opponent brain cited a function this branch deleted"
```

---

## Self-Review

**Spec coverage:**

| spec requirement | task |
|---|---|
| band 3–7, six at Pen 6–7 | 2 |
| Damage payback, `ROF × Damage` in 6–8 | 2 |
| design at the field floor | 2 (base values), 4 step 2 (the floor assertion) |
| Arc Gun / Crossbow / Autocannon / Talon | 3 |
| the five field upgrades | 4 (+ 1 for the missing `dmg` path) |
| delete Overmatch, inline `woundRaw` | 5 |
| `rules.md` is a runtime input | 6 |
| drama tiers 1 and 2 | 7 |
| the `crit` tone | 8 |
| the one-shot kill / Zebra call | 9 |
| re-measure both harnesses | 10 |
| dangling opponent-brain references | 11 |
| `UNIT_WEAPONS` deferred, excluded from the bar | 10 step 4 |
| Crossbow / Bulwark Shield stay out of F2-C | 3 step 1 |

**Beyond the spec:** Task 1 exists because the spec assumes a `dmg` upgrade path that `effectiveWeaponProfile` does not have — found by reading it, not by reasoning about it.

**Type consistency:** `pen` / `dmg` / `accuracy` / `effPen` throughout, matching the rename plan's targets. `effect.dmg` (Task 1) is the key Task 4 writes. `drama` and `critWound` are declared in Task 7 and read in Task 8.

**Known gap:** Task 2 and Task 3 say "update the fixtures by hand" without listing them, because the failing set depends on the rename's outcome. The discipline is stated instead — derive each expectation from `woundTarget(pen, T)` and the new `dmg`, never accept what the code prints. That is the one place this plan trades enumeration for a rule, and it does so deliberately: a stale list would be worse than none.
