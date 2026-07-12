# Crossbow · Talon Chassis (Shrike) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the prebuilt medium chassis `medium-crossbow-talon` — two new globally-unique weapons (Crossbow long-range, Talon melee) with 6 Field/Tuned/Prototype upgrades — themed as a pin-and-dismantle raptor hunter.

**Architecture:** Weapons + upgrades + chassis are data in `shared/game-state.js`; four new engine behaviors (`steadyAim`, `vsWoundedLoc`, `eviscerate`, `pinningBolt`) hook the existing attack path in `shared/combat.js`. Two of them require threading the measured `distance` and the struck `location` into `computeStr` (neither is available there today). No new player actions, no new UI chips (the Pinning Bolt reuses the existing `immobilised` chip).

**Tech Stack:** Node ESM, `node:test` (shared engine), Vitest (client), `tsc` typecheck. Follows the "Adding a new chassis" procedure in [AGENTS.md](../../AGENTS.md). Spec: [docs/superpowers/specs/2026-07-12-crossbow-talon-chassis-design.md](../specs/2026-07-12-crossbow-talon-chassis-design.md).

**Design decisions locked in this plan (differ slightly from spec prose):**
- Pinning Bolt's **+2 self-heat** fires on a **damaging hit** (tied to the pin landing), not on every shot — implemented in the same `resolveAttack` hook that sets `immobilised`.
- Pinning Bolt's "one pin at a time" guard is **deferred** (a Rig rarely fires the ROF-1 Crossbow twice per activation). v1 just sets `immobilised`, reusing the Impale immobilise lifecycle. Noted as tunable.

**Work directly on the current branch; one commit per task (AGENTS.md git workflow — no branches/worktrees).**

---

## File map

- `shared/game-state.js` — `WEAPONS.longRange` += Crossbow, `WEAPONS.melee` += Talon; `WEAPON_UPGRADES` += 6 entries; `CHASSIS` += `medium-crossbow-talon`.
- `shared/game-state.test.js` — bump the weapon-count asserts (10 → 11; the `all.length` 20 → 22).
- `shared/combat.js` — thread `distance` + `location` into `computeStr`; add `steadyAim` / `vsWoundedLoc` / `eviscerate` STR branches; `eviscerate` forced-Critical in `rollImpacts`; `pinningBolt` hook in `resolveAttack`.
- `shared/combat.test.js` — new tests per behavior.
- `content/chassis.json` — flavor entry (the **Shrike** text).
- `rules.md` — §12 weapon tables + §12 upgrade table + a glossary/notes line for each new mechanic.
- `docs/design/medium-crossbow-talon.md` — the design record.

---

## Task 1: Weapons, upgrades, and chassis registry (data)

Pure data. Two upgrades work immediately (Fletched Bolts = existing Precision perk; Honed Talons = `{ str: 2 }` merged by `effectiveWeaponProfile`). The other four carry inert effect flags until Tasks 3–6 wire them.

**Files:**
- Modify: `shared/game-state.js` (`WEAPONS` ~line 34/46, `WEAPON_UPGRADES` ~line 237, `CHASSIS` ~line 88)
- Modify: `shared/game-state.test.js` (asserts at lines 60,61,65,66,138,139,151,152 and 1729)
- Modify: `content/chassis.json`

- [ ] **Step 1: Add the two weapons.** In `shared/game-state.js`, add to `WEAPONS.longRange` (after `"Rivet Gun"`, line 44):

```js
    "Crossbow":       { rof: 1, str: 10, sweet: 18, peak: 3, dropoff: 0.25, minRange: 0, maxRange: 24 },
```

and to `WEAPONS.melee` (after `"Pressure Claw"`, line 56):

```js
    "Talon":         { rof: 2, str: 7,  acc: [1, 1], rng: [2, 2], melee: true },
```

- [ ] **Step 2: Add the six upgrade entries.** In `shared/game-state.js` `WEAPON_UPGRADES` (the object opened at line 237), add two new keys (place near the other long-range / melee blocks):

```js
  "Crossbow": [
    { id: "fletched-bolts", nature: "field", name: "Fletched Bolts", tag: "Aimed shots ignore the aim penalty", effect: { perks: ["Precision"] } },
    { id: "steady-aim", nature: "tuned", name: "Steady Aim", tag: "+3 STR when firing from the sweet spot (±2\")", effect: { steadyAim: true } },
    { id: "pinning-bolt", nature: "prototype", name: "Pinning Bolt", tag: "Pin a rig in place until your next turn — runs +2 heat", effect: { pinningBolt: true } },
  ],
  "Talon": [
    { id: "honed-talons", nature: "field", name: "Honed Talons", tag: "+2 STR", effect: { str: 2 } },
    { id: "exploit-wound", nature: "tuned", name: "Exploit Wound", tag: "+3 STR vs an already-damaged location", effect: { vsWoundedLoc: true } },
    { id: "evisceration", nature: "prototype", name: "Evisceration", tag: "Gut a half-dead location — every hit is Critical (but weak on fresh armour)", effect: { eviscerate: true } },
  ],
```

- [ ] **Step 3: Add the chassis entry.** In `shared/game-state.js` `CHASSIS` (after the medium entries, ~line 98):

```js
  { id: "medium-crossbow-talon",     label: "Crossbow · Talon",            class: "medium", longRange: "Crossbow",        melee: "Talon",         sp: { hull: 12, arms: 11, legs: 12, engine: 9 } },
```

- [ ] **Step 4: Bump the weapon-count asserts.** In `shared/game-state.test.js`, change every `Object.keys(WEAPONS.longRange).length` / `...melee...` assertion from `10` to `11` (lines 60, 61, 65, 66, 138, 139, 151, 152), and the `all.length` assertion at line 1729 from `20` to `22`.

- [ ] **Step 5: Add the flavor content.** In `content/chassis.json`, add this object to the array:

```json
  {
    "id": "medium-crossbow-talon",
    "label": "Crossbow · Talon",
    "class": "medium",
    "longRange": "Crossbow",
    "melee": "Talon",
    "description": "The Shrike — a butcher-bird hunter. It cracks one enemy location with a surgical bolt, pounces in, and tears that same wound open with its talon.",
    "focus": "Pin & dismantle: soften a single location at range, lock in, and gut it. Weak on fresh armour by design — it must play the hunt, not brawl.",
    "balance": "Highest Peak ACC on the board (+3) but steep falloff and only STR 10 at 24\" reach; the Talon is STR 7 and punishing on undamaged targets. Rewards range discipline and follow-through, not trading blows.",
    "personality": "Patient, predatory, precise. Marks its prey, waits for the band, then finishes what the bolt started."
  }
```

- [ ] **Step 6: Add a chassis-resolves test.** In `shared/game-state.test.js`, add:

```js
test("medium-crossbow-talon chassis resolves and carries its weapons", () => {
  const entry = CHASSIS.find((c) => c.id === "medium-crossbow-talon");
  assert.ok(entry, "chassis entry present");
  assert.equal(entry.longRange, "Crossbow");
  assert.equal(entry.melee, "Talon");
  assert.ok(WEAPONS.longRange["Crossbow"], "Crossbow weapon present");
  assert.ok(WEAPONS.melee["Talon"], "Talon weapon present");
  assert.equal(WEAPON_UPGRADES["Crossbow"].length, 3);
  assert.equal(WEAPON_UPGRADES["Talon"].length, 3);
});
```

(Confirm `CHASSIS` is imported in the test file; it is used by neighbouring tests. Add it to the import if missing.)

- [ ] **Step 7: Run the shared suite.**

Run: `node --test shared/`
Expected: PASS — the count asserts now expect 11/22, the natures test (`shared/game-state.test.js:190`) passes because each new weapon has one field/tuned/prototype, and the new chassis test passes.

- [ ] **Step 8: Commit.**

```bash
git add shared/game-state.js shared/game-state.test.js content/chassis.json
git commit -m "feat(chassis): add Crossbow + Talon weapons and medium-crossbow-talon registry entry"
```

---

## Task 2: Thread `distance` and `location` into `computeStr`

Plumbing only — no behavior change yet. Both values already exist in the attack flow but aren't passed to `computeStr`.

**Files:**
- Modify: `shared/combat.js` (`rollImpacts` ~line 225; `resolveAttack` rollImpacts call ~line 350 and summary `computeStr` ~line 400)

- [ ] **Step 1: Pass the struck `location` into the impact-time `computeStr`.** In `shared/combat.js`, at line 225, change:

```js
  const str = computeStr(attacker, profile, { ...opts, target });
```

to:

```js
  const str = computeStr(attacker, profile, { ...opts, target, location });
```

(`location` is already a parameter of `rollImpacts`.)

- [ ] **Step 2: Pass the measured `distance` into `rollImpacts`.** In `resolveAttack`, in the options object built for the `rollImpacts` call (~line 350), add `distance: opts.distance` — the object currently reads:

```js
        { arc: opts.arc, hits: th.hits, charged: opts.charged, strOverride: opts.strOverride, penetrate: th.penetratorShot, round: room?.game?.round || 0, momentum: piledriverSpend, guardBreak },
```

change to:

```js
        { arc: opts.arc, hits: th.hits, charged: opts.charged, strOverride: opts.strOverride, penetrate: th.penetratorShot, round: room?.game?.round || 0, momentum: piledriverSpend, guardBreak, distance: opts.distance },
```

- [ ] **Step 3: Keep the resolution-summary STR consistent.** At the summary `computeStr` (~line 400), change:

```js
  const str = computeStr(attacker, profile, { ...opts, target, momentum: piledriverSpend });
```

to:

```js
  const str = computeStr(attacker, profile, { ...opts, target, location, momentum: piledriverSpend });
```

(`opts` here is `resolveAttack`'s, so `opts.distance` already flows through the spread; `location` is `resolveAttack`'s local.)

- [ ] **Step 4: Run the suites to confirm no regression.**

Run: `node --test shared/`
Expected: PASS — no existing behavior reads `distance`/`location` in `computeStr` yet, so all current tests are unchanged.

- [ ] **Step 5: Commit.**

```bash
git add shared/combat.js
git commit -m "refactor(combat): thread distance and struck location into computeStr"
```

---

## Task 3: Steady Aim (`steadyAim`) — +3 STR in the sweet band

**Files:**
- Modify: `shared/combat.js` (`computeStr`, after the `vsPinned` block ~line 164)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test.** In `shared/combat.test.js`, add:

```js
test("Steady Aim grants +3 STR within 2\" of the sweet spot, nothing off-band", () => {
  const rig = makeRig("r1", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "steady-aim", melee: "honed-talons" };
  const prof = effectiveWeaponProfile("longRange", "Crossbow", rig); // base STR 10, sweet 18
  assert.equal(computeStr(rig, prof, { distance: 18 }), 13); // at sweet: 10 + 3
  assert.equal(computeStr(rig, prof, { distance: 20 }), 13); // +2" edge: still in band
  assert.equal(computeStr(rig, prof, { distance: 16 }), 13); // -2" edge: still in band
  assert.equal(computeStr(rig, prof, { distance: 21 }), 10); // off-band: no bonus
  assert.equal(computeStr(rig, prof, {}), 10);               // no distance: no bonus
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `computeStr` returns 10 at distance 18 (no `steadyAim` branch yet).

- [ ] **Step 3: Implement the branch.** In `shared/combat.js` `computeStr`, immediately after the Taut Cable / `vsPinned` block (ends ~line 164), add:

```js
  // Steady Aim (§13, Crossbow) — +3 STR when the measured firing distance is
  // within 2" of the weapon's sweet spot. Needs the distance threaded in via opts.
  if (profile.upgradeEffect?.steadyAim && opts.distance != null
      && Math.abs(opts.distance - profile.sweet) <= 2) {
    bonus += 3;
  }
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): Steady Aim — +3 STR firing from the Crossbow sweet spot"
```

---

## Task 4: Exploit Wound (`vsWoundedLoc`) — +3 STR vs a damaged location

**Files:**
- Modify: `shared/combat.js` (`computeStr`, after the Steady Aim block)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test.**

```js
test("Exploit Wound grants +3 STR only against an already-damaged struck location", () => {
  const rig = makeRig("r2", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "exploit-wound" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base STR 7
  const wounded = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  assert.equal(computeStr(rig, prof, { target: wounded, location: "hull" }), 10); // 7 + 3
  assert.equal(computeStr(rig, prof, { target: fresh, location: "hull" }), 7);    // no bonus
  assert.equal(computeStr(rig, prof, { target: wounded }), 7);                    // no location: no bonus
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `node --test shared/combat.test.js`
Expected: FAIL — returns 7 against the wounded location.

- [ ] **Step 3: Implement the branch.** In `computeStr`, after the Steady Aim block, add:

```js
  // Exploit Wound (§13, Talon) — +3 STR against a struck location already below
  // its max SP. Needs the struck location threaded in via opts.location.
  if (profile.upgradeEffect?.vsWoundedLoc && opts.target && opts.location) {
    const p = opts.target[opts.location];
    if (p && p.sp < p.max) bonus += 3;
  }
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): Exploit Wound — +3 STR vs an already-damaged location"
```

---

## Task 5: Evisceration (`eviscerate`) — forced Critical on a half-dead location, −1 vs fresh

Two parts: the forced-Critical severity override in `rollImpacts`, and the −1 STR downside in `computeStr`.

**Files:**
- Modify: `shared/combat.js` (`computeStr` downside; `rollImpacts` severity override ~line 264)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
test("Evisceration forces Critical on a location at or below half max SP", () => {
  const rig = makeRig("r3", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig);
  // Hull at 3/7 -> 3 <= 3.5, half-dead. Even a d6=1 (tiny total) is forced Critical.
  const halfDead = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const out = rollImpacts(rig, halfDead, prof, "hull", { arc: "front", hits: 1 }, { impacts: [1] }, () => 0);
  assert.equal(out[0].tier, "critical");
  assert.equal(out[0].sp, 3);
  // Hull at 4/7 -> 4 > 3.5, NOT half-dead: a d6=1 total glances off (no forced crit).
  const above = { weightClass: "medium", hull: { sp: 4, max: 7 } };
  const out2 = rollImpacts(rig, above, prof, "hull", { arc: "front", hits: 1 }, { impacts: [1] }, () => 0);
  assert.notEqual(out2[0].tier, "critical");
});

test("Evisceration downside: -1 STR against a fully-undamaged struck location", () => {
  const rig = makeRig("r4", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base STR 7
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  const hurt = { weightClass: "medium", hull: { sp: 5, max: 7 } };
  assert.equal(computeStr(rig, prof, { target: fresh, location: "hull" }), 6); // 7 - 1
  assert.equal(computeStr(rig, prof, { target: hurt, location: "hull" }), 7);  // damaged: no downside
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `node --test shared/combat.test.js`
Expected: FAIL — no forced-Critical logic, no downside branch.

- [ ] **Step 3a: Implement the forced-Critical override.** In `shared/combat.js` `rollImpacts`, replace the severity line (line 264):

```js
    const sev = opts.penetrate ? { tier: "severe", sp: 2 } : impactSeverity(total, row);
```

with:

```js
    // Evisceration (§13, Talon) — a hit on a location at or below half its max SP
    // is forced to Critical, regardless of the impact roll (mirrors penetrate).
    const evisc = profile.upgradeEffect?.eviscerate && target[location]
      && target[location].sp <= target[location].max / 2;
    const sev = opts.penetrate ? { tier: "severe", sp: 2 }
      : evisc ? { tier: "critical", sp: 3 }
      : impactSeverity(total, row);
```

- [ ] **Step 3b: Implement the −1 STR downside.** In `computeStr`, after the Exploit Wound block, add:

```js
  // Evisceration downside (§13, Talon) — the talon needs a wound to grip: -1 STR
  // against a struck location that is still fully undamaged.
  if (profile.upgradeEffect?.eviscerate && opts.target && opts.location) {
    const p = opts.target[opts.location];
    if (p && p.sp === p.max) bonus -= 1;
  }
```

- [ ] **Step 4: Run to verify they pass.**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): Evisceration — force Critical on a half-dead location, -1 STR on fresh"
```

---

## Task 6: Pinning Bolt (`pinningBolt`) — guaranteed immobilise + 2 self-heat

Hooks `resolveAttack` (which owns `ctx`), not the pure `rollImpacts`.

**Files:**
- Modify: `shared/combat.js` (`resolveAttack`, in the post-impact effect hooks ~line 373, after the Breach Grip block)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test.** Add a recording ctx and drive a guaranteed damaging Crossbow hit:

```js
test("Pinning Bolt immobilises the target and adds +2 self-heat on a damaging hit", () => {
  const heatBumps = [];
  const ctx = {
    pushResolution() {},
    applyDamage() {},
    bumpHeat(rig, n) { heatBumps.push([rig.id, n]); },
    engage() {},
    profileFor: (slot, name, rig) => effectiveWeaponProfile(slot, name, rig),
  };
  const shrike = makeRig("atk", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  shrike.weaponUpgrades = { longRange: "pinning-bolt", melee: "honed-talons" };
  shrike.loaded.longRange = true;
  const prey = makeRig("def", "Prey", "medium", "B", { longRange: "Autocannon", melee: "Sword" });
  const room = { rigs: [shrike, prey], game: { round: 1 } };
  // toHit d6=6 (natural hit), location d12=1 (hull), impact d6=6 -> 6 + STR10 = 16 => severe (sp 2) => damaging.
  const res = resolveAttack(room, shrike, prey, {
    weapon: "longRange", arc: "front", distance: 18, aimed: false,
    dice: { toHit: [6], location: [1], impacts: [6] },
  }, () => 0, ctx);
  assert.equal(res.ok, true);
  assert.equal(prey.immobilised, true);
  assert.deepEqual(heatBumps, [["atk", 2]]); // only the pinning heat (base fire heat is 0 here)
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `prey.immobilised` is `undefined`/false and no heat bump recorded.

- [ ] **Step 3: Implement the hook.** In `shared/combat.js` `resolveAttack`, after the Breach Grip block (the `if (profile.upgradeEffect?.breachGrip ...)` at ~line 373), add:

```js
      // Pinning Bolt (§13, Crossbow) — a damaging bolt immobilises the target
      // until this Rig's next activation (reusing the Impale immobilise
      // lifecycle) and runs the attacker +2 heat. Guaranteed, no roll.
      if (profile.upgradeEffect?.pinningBolt && impacts.some((h) => h.sp > 0)) {
        target.immobilised = true;
        ctx.bumpHeat(attacker, 2);
      }
```

- [ ] **Step 4: Run to verify it passes.**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full shared suite** to be sure nothing regressed.

Run: `node --test shared/`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(combat): Pinning Bolt — guaranteed immobilise + 2 self-heat on a damaging bolt"
```

---

## Task 7: Docs (rules.md, design record) + full verification

**Files:**
- Modify: `rules.md` (§12 weapon tables + §12 upgrade table; a mechanics line each in the §12 "Tuned / Prototype Upgrade Mechanics" list)
- Create: `docs/design/medium-crossbow-talon.md`

- [ ] **Step 1: Add the weapons to the §12 tables.** In `rules.md`, add a **Crossbow** row to the "Cannons & Artillery" Long Range table:

```
| Crossbow | 1 | 10 | 18" | +3 | −0.25 | 0–24" |
```

and a **Talon** row to the Melee Weapons table:

```
| Talon | 2 | 7 | +1 | 2 |
```

- [ ] **Step 2: Add the upgrade rows to the §12 upgrade table** (Weapon | Field | Tuned | Prototype):

```
| Crossbow | Fletched Bolts (Precision) | Steady Aim (+3 STR in sweet band) | Pinning Bolt |
| Talon | Honed Talons (+2 STR) | Exploit Wound (+3 STR vs damaged location) | Evisceration |
```

- [ ] **Step 3: Document the four new mechanics** in the §12 "Tuned / Prototype Upgrade Mechanics" bullet list:

```
- **Steady Aim** (Crossbow, Tuned) — +3 STR when the measured firing distance is within 2" of the Crossbow's sweet spot (16–20").
- **Exploit Wound** (Talon, Tuned) — +3 STR against a struck location already below its max SP.
- **Evisceration** (Talon, Prototype) — a hit on a location at or below half its max SP is forced to Critical (−3 SP), every hit; downside: −1 STR against a fully-undamaged struck location.
- **Pinning Bolt** (Crossbow, Prototype) — a damaging bolt immobilises the target until the firer's next activation (guaranteed, no roll, may still pivot); the firer runs +2 heat.
```

- [ ] **Step 4: Author the design record.** Create `docs/design/medium-crossbow-talon.md` following the eight existing files (`docs/design/medium-sniper-chainsaw.md` is the closest template). Include: the focus paragraph, the explicit **differentiation from `medium-sniper-chainsaw`** (pin-and-dismantle-one-location vs alpha-strike-then-shred), the two weapon-stat lines, the six upgrades as a Nature/Name/Effect/Player-tag/Engine table, the recommended showcase build (Steady Aim + Evisceration + Servo Actuators), the alt build (Pinning Bolt + Exploit Wound), and the decided values. Copy the exact effect wording from Tasks 3–6.

- [ ] **Step 5: Full verification.**

Run: `node --test` — Expected: PASS (all shared tests).
Run: `npx vitest run` — Expected: PASS (client suites; the commission wizard renders the new chassis from `CHASSIS` + `/api/chassis`, no manual wiring).
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add rules.md docs/design/medium-crossbow-talon.md
git commit -m "docs: rules + design record for the Crossbow · Talon chassis (Shrike)"
```

---

## Self-review notes (author check against the spec)

- **Spec coverage:** Crossbow stats (T1), Talon stats (T1), all 6 upgrades (T1 data; T3–T6 engine), chassis registry + SP (T1), content/Shrike flavor (T1), distance/location plumbing (T2), Steady Aim (T3), Exploit Wound (T4), Evisceration both halves (T5), Pinning Bolt (T6), rules.md + design doc (T7), equipment-note (design doc, not registry — per spec). All covered.
- **Placeholders:** none — every code and test step shows full code; the one prose step (T7 Step 4 design doc) points at a concrete template file and the exact wording to reuse.
- **Type/name consistency:** effect flags `steadyAim` / `vsWoundedLoc` / `eviscerate` / `pinningBolt` and upgrade ids `steady-aim` / `exploit-wound` / `evisceration` / `pinning-bolt` are used identically in the data (T1), the engine branches (T3–T6), and the tests. Weapon count asserts bumped to 11; `all.length` to 22. SP part access uses `.sp` / `.max` (matching `isUndamaged` at combat.js:126–129), not `.spMax`.
