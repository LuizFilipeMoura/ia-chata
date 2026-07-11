# Tether & Attrition Chassis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two prebuilt light chassis — `light-harpoon-anchor` (tether/control) and `light-rivet-pressureclaw` (attrition) — with four new weapons, twelve upgrades, and five new engine effects.

**Architecture:** Data-first. Add weapons + upgrades + prebuilt entries (Tasks 1–3) so the reused-effect upgrades work immediately and the wizard renders both chassis. Then implement the five new effects one at a time, TDD, each mirroring an existing effect's plumbing (Tasks 4–8). Docs + full verification last (Tasks 9–10).

**Tech Stack:** Plain ES modules in `shared/`. Tests: `node:test` (`shared/*.test.js`) run with `node --test`; client tests with `npx vitest run`; types with `npx tsc --noEmit`.

**Spec:** [docs/superpowers/specs/2026-07-11-tether-and-attrition-chassis-design.md](../specs/2026-07-11-tether-and-attrition-chassis-design.md)

**Key patterns to mirror (read before starting):**
- Conditional STR bonus: `computeStr` in `shared/combat.js:131-176` (see `vsDisrupted`).
- Location state mutators + ctx wiring: `sunderLocation`/`crackLocation` in `shared/game-state.js:1104-1121`, injected via `combatCtx()` (~line 1328), called from `resolveAttack` `shared/combat.js:360-367`.
- Melee-on-hit hook from the fire gate: `maybeSkewer` `shared/game-state.js:1405-1417`, called at `shared/game-state.js:1533` and `:1540`; its Disengage payload `resolveSkewerStrike` `:1422-1433`; consumed in the disengage handler `:1569-1589`.
- Stacking counter effect: `suppressLock` in `shared/combat.js:516-538`.
- Spatial narrated effect + cooldown: `towChain` in `shared/combat.js:421-435`; root flag `towedThisActivation` read at `shared/game-state.js:1555`; cooldown cleared on match reset `:1862`.
- State-field shape: defaulted in `ensureRigShape` (`shared/game-state.js:~408-463`), in both unit factories (`:~576-638` and `:~695-723`), and cleared on match reset (`:1840-1865`); per-round sweeps live in `runRecovery` (`:1216-1239`); per-activation clears in `endActivation` (`:1283-1294`).
- Chips: `rigModifiers` in `shared/battle-view.js:133-174`. Action availability: `availableActions` `:11-120`.

---

## Task 1: Add the four new weapons + bump count asserts

**Files:**
- Modify: `shared/game-state.js:30-51` (`WEAPONS`)
- Test: `shared/game-state.test.js:59-60,64-65,137-138` (bump asserts) + new stat test

- [ ] **Step 1: Update the three pairs of count asserts from 8 to 10**

In `shared/game-state.test.js`, there are three `assert.equal(Object.keys(WEAPONS.longRange).length, 8)` / `...melee).length, 8)` pairs at lines 59-60, 64-65, and 137-138. Change every `, 8)` in those six lines to `, 10)`. Also update the comment at line 136 `// The list is now 8 + 8.` to `// The list is now 10 + 10.`

- [ ] **Step 2: Add a failing stat test for the four new weapons**

Append to `shared/game-state.test.js` (after the existing Siege Maul/Bulwark test around line 139):

```javascript
test("new weapons: Harpoon, Anchor, Rivet Gun, Pressure Claw carry full profiles", () => {
  assert.deepEqual(WEAPONS.longRange["Harpoon"],
    { rof: 1, str: 12, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 });
  assert.deepEqual(WEAPONS.melee["Anchor"],
    { rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true });
  assert.deepEqual(WEAPONS.longRange["Rivet Gun"],
    { rof: 6, str: 4, sweet: 6, peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 });
  assert.deepEqual(WEAPONS.melee["Pressure Claw"],
    { rof: 2, str: 9, acc: [1, 1], rng: [2, 2], melee: true });
  assert.equal(Object.keys(WEAPONS.longRange).length, 10);
  assert.equal(Object.keys(WEAPONS.melee).length, 10);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `Harpoon` etc. undefined; count asserts still see 8.

- [ ] **Step 4: Add the four weapons to `WEAPONS`**

In `shared/game-state.js`, inside `WEAPONS.longRange` (after the `"Missile Barrage"` line, line 39), add:

```javascript
    "Harpoon":        { rof: 1, str: 12, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 },
    "Rivet Gun":      { rof: 6, str: 4,  sweet: 6,  peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 },
```

Inside `WEAPONS.melee` (after the `"Flamethrower"` line, line 49), add:

```javascript
    "Anchor":        { rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true },
    "Pressure Claw": { rof: 2, str: 9,  acc: [1, 1], rng: [2, 2], melee: true },
```

- [ ] **Step 5: Run the full node test suite to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all count-assert tests + the new stat test).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(weapons): add Harpoon, Anchor, Rivet Gun, Pressure Claw"
```

---

## Task 2: Add the twelve weapon upgrades

**Files:**
- Modify: `shared/game-state.js:204-285` (`WEAPON_UPGRADES`)
- Test: `shared/game-state.test.js` (nature test at :176 already covers this; add an id spot-check)

Effect keys: reused-and-wired (`perks`, `str`, `rof`, `pinOnHits`, `onDamage`, `breachGrip`) work immediately. New keys (`vsPinned`, `harpoonWinch`, `deadWeight`, `groundAnchor`, `rivetLock`) are inert placeholders until Tasks 4–8 wire them — that's expected.

- [ ] **Step 1: Add a failing test asserting the four new upgrade groups exist with correct natures**

Append to `shared/game-state.test.js`:

```javascript
test("new weapons each expose three correctly-natured upgrades", () => {
  for (const w of ["Harpoon", "Anchor", "Rivet Gun", "Pressure Claw"]) {
    const ups = WEAPON_UPGRADES[w];
    assert.ok(ups, `${w} has upgrades`);
    assert.deepEqual(ups.map((u) => u.nature).sort(), ["field", "prototype", "tuned"], `${w} natures`);
  }
  assert.equal(WEAPON_UPGRADES["Harpoon"].find((u) => u.nature === "tuned").effect.vsPinned, true);
  assert.equal(WEAPON_UPGRADES["Pressure Claw"].find((u) => u.nature === "tuned").effect.onDamage, "sunder");
});
```

`WEAPON_UPGRADES` is already imported in the test file (it's used by the nature tests at line 176). Confirm the import line near the top includes it; if not, add it.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `WEAPON_UPGRADES["Harpoon"]` undefined.

- [ ] **Step 3: Add the four upgrade groups to `WEAPON_UPGRADES`**

In `shared/game-state.js`, inside the `WEAPON_UPGRADES` object (after the `"Flamethrower"` group closes at line 284, before the closing `};`), add:

```javascript
  "Harpoon": [
    { id: "barbed-head", nature: "field", name: "Barbed Head", tag: "Gains Impale", effect: { perks: ["Impale"] } },
    { id: "taut-cable", nature: "tuned", name: "Taut Cable", tag: "+3 STR vs immobilised or engaged targets", effect: { vsPinned: true } },
    { id: "harpoon-winch", nature: "prototype", name: "Harpoon Winch", tag: "Spear and reel a rig 4\" toward you; roots you, runs hot", effect: { harpoonWinch: true } },
  ],
  "Rivet Gun": [
    { id: "rapid-feed", nature: "field", name: "Rapid Feed", tag: "+2 ROF", effect: { rof: 2 } },
    { id: "staple-burst", nature: "tuned", name: "Staple Burst", tag: "4+ hits: target loses 1 action next activation", effect: { pinOnHits: 4 } },
    { id: "rivet-lock", nature: "prototype", name: "Rivet Lock", tag: "Rivet a location shut — no repairs, jams a weapon there", effect: { rivetLock: true } },
  ],
  "Anchor": [
    { id: "fluked-head", nature: "field", name: "Fluked Head", tag: "+3 STR", effect: { str: 3 } },
    { id: "dead-weight", nature: "tuned", name: "Dead Weight", tag: "Struck target can't Disengage next activation", effect: { deadWeight: true } },
    { id: "ground-anchor", nature: "prototype", name: "Ground Anchor", tag: "Anchor a rig in the lock; leaving you costs it a free Anchor hit", effect: { groundAnchor: true } },
  ],
  "Pressure Claw": [
    { id: "hardened-jaws", nature: "field", name: "Hardened Jaws", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "crush-grip", nature: "tuned", name: "Crush Grip", tag: "On damaging hit: -1 max SP to struck location", effect: { onDamage: "sunder" } },
    { id: "hydraulic-vice", nature: "prototype", name: "Hydraulic Vice", tag: "Pry a location's armour open (+2 impact from anyone)", effect: { breachGrip: true } },
  ],
```

- [ ] **Step 4: Run the full node suite**

Run: `node --test shared/game-state.test.js`
Expected: PASS (new test + the "exactly one of each nature" test at :176 + "every entry declares a valid nature" at :168).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(upgrades): add 12 upgrades for the four new weapons"
```

---

## Task 3: Add both prebuilt chassis (code + content)

**Files:**
- Modify: `shared/game-state.js:78-87` (`PREBUILT_RIGS`)
- Modify: `content/chassis.json` (append two entries)
- Test: `shared/game-state.test.js` (add a resolvePrebuilt test)

- [ ] **Step 1: Add a failing test for the two new prebuilts**

Append to `shared/game-state.test.js` (`prebuiltRig` and `resolvePrebuilt` are exported; confirm they're imported at the top — add them if missing):

```javascript
test("the two new light chassis resolve by id and by combo", () => {
  const ha = prebuiltRig("light-harpoon-anchor");
  assert.equal(ha.class, "light");
  assert.equal(ha.longRange, "Harpoon");
  assert.equal(ha.melee, "Anchor");
  assert.deepEqual(ha.sp, { hull: 12, arms: 11, legs: 11, engine: 8 });

  const rp = resolvePrebuilt({ class: "light", longRange: "Rivet Gun", melee: "Pressure Claw" });
  assert.equal(rp.id, "light-rivet-pressureclaw");
  assert.deepEqual(rp.sp, { hull: 13, arms: 11, legs: 10, engine: 9 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `prebuiltRig("light-harpoon-anchor")` is null.

- [ ] **Step 3: Add the two entries to `PREBUILT_RIGS`**

In `shared/game-state.js`, inside the `PREBUILT_RIGS` array (after the last light entry `light-sword-arc` at line 83, or at the end before `]`), add:

```javascript
  { id: "light-harpoon-anchor",       label: "Harpoon · Anchor",            class: "light",  longRange: "Harpoon",         melee: "Anchor",        sp: { hull: 12, arms: 11, legs: 11, engine: 8 } },
  { id: "light-rivet-pressureclaw",   label: "Rivet Gun · Pressure Claw",   class: "light",  longRange: "Rivet Gun",       melee: "Pressure Claw", sp: { hull: 13, arms: 11, legs: 10, engine: 9 } },
```

- [ ] **Step 4: Run to verify the code test passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Append flavor content to `content/chassis.json`**

The file is a JSON array of `{ id, label, class, longRange, melee, description, focus, balance, personality }`. Add these two objects as the last elements of the array (add a comma after the current last object's closing brace):

```json
  {
    "id": "light-harpoon-anchor",
    "label": "Harpoon · Anchor",
    "class": "light",
    "longRange": "Harpoon",
    "melee": "Anchor",
    "description": "A tether rig. The harpoon spears a target at range and the anchor chains it down in the lock — pick one enemy and refuse to let it leave. Fragile, but nothing it grabs gets away.",
    "focus": "Control one target: spear it, anchor it, deny the escape.",
    "balance": "Light SP and one heavy shot per turn — it wins by pinning, not by trading blows. Loses if it can't close.",
    "personality": "Patient and vindictive. Marks a rig and hunts it to the scrapline."
  },
  {
    "id": "light-rivet-pressureclaw",
    "label": "Rivet Gun · Pressure Claw",
    "class": "light",
    "longRange": "Rivet Gun",
    "melee": "Pressure Claw",
    "description": "An industrial brawler. The rivet gun stitches pins into a rig at spitting range; the pressure claw crushes its locations open in melee. Grinds a target down plate by plate.",
    "focus": "Attrition: seize a location with rivets, then crack it open with the claw.",
    "balance": "Short range and low STR per hit — it must get close and stay close. Rewards focus fire on one location.",
    "personality": "Methodical, mechanical, relentless. Treats an enemy rig like a stubborn bolt."
  }
```

- [ ] **Step 6: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/chassis.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js content/chassis.json
git commit -m "feat(chassis): add light-harpoon-anchor and light-rivet-pressureclaw prebuilts"
```

---

## Task 4: Taut Cable — `vsPinned` conditional STR

**Files:**
- Modify: `shared/combat.js:131-176` (`computeStr`)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/combat.test.js`:

```javascript
test("Taut Cable: +3 STR vs an immobilised or engaged target, else nothing", () => {
  const harpoon = { ...WEAPONS.longRange["Harpoon"], upgradeEffect: { vsPinned: true } };
  const attacker = { weightClass: "medium" };
  // base STR 12, medium weight mod 0
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light" } }), 12);
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light", immobilised: true } }), 15);
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light", engagedWith: 7 } }), 15);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — returns 12 in all three cases (effect not wired).

- [ ] **Step 3: Wire `vsPinned` into `computeStr`**

In `shared/combat.js`, inside `computeStr`, after the `vsDisrupted` block (ends line 156, before the Redline block at 157), add:

```javascript
  // Taut Cable — +3 STR against a target already pinned down: immobilised, or
  // held in a melee lock (engaged).
  if (opts.target && profile.upgradeEffect?.vsPinned) {
    if (opts.target.immobilised || opts.target.engagedWith != null) bonus += 3;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(harpoon): Taut Cable — +3 STR vs pinned/engaged targets"
```

---

## Task 5: Dead Weight — block the struck target's next Disengage

**Files:**
- Modify: `shared/game-state.js` — add field default (3 sites), a melee-on-hit hook, the disengage gate, the `endActivation` clear
- Modify: `shared/battle-view.js` — chip + action note
- Test: `shared/game-state.test.js`

New field: `noDisengageNextActivation` (boolean).

- [ ] **Step 1: Write the failing integration test**

Append to `shared/game-state.test.js`:

```javascript
test("Dead Weight: a damaging Anchor hit blocks the target's next Disengage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Anchor";
  b1.weaponUpgrades.melee = "dead-weight";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(a1.noDisengageNextActivation, true);
  assert.equal(a1.engagedWith, b1.id);
  // a1 activates and tries to Disengage — rejected, no slot spent.
  __test.runRecovery; // (no-op placeholder; a1 activation below)
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "disengage" } });
  assert.equal(r.game.turn.actionsUsed, usedBefore); // disengage refused
  assert.equal(a1.engagedWith, b1.id);               // still locked
});
```

Note: if activating `a1` immediately after `b1` isn't legal in turn order, replace the second activate with whatever the suite's other tests use to hand the turn over (search the file for another test that activates two rigs in sequence and mirror it). The key assertions are `noDisengageNextActivation === true` after the hit and that Disengage is refused while it holds.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `a1.noDisengageNextActivation` is undefined.

- [ ] **Step 3: Default the field in all three shape sites**

In `shared/game-state.js`:

(a) In `ensureRigShape` (near the other boolean guards ~line 452), add:
```javascript
  if (typeof rig.noDisengageNextActivation !== "boolean") rig.noDisengageNextActivation = false;
```
(b) In the rig factory (near `noPrepNextActivation: false` ~line 626) add `noDisengageNextActivation: false,`.
(c) In the second unit factory (near its `actionPenaltyNextActivation: 0` ~line 706) add `noDisengageNextActivation: false,`.
(d) In the match-reset loop (`shared/game-state.js:1855` region) add `rig.noDisengageNextActivation = false;`.

- [ ] **Step 4: Add the melee-on-hit hook and call it from both fire sites**

In `shared/game-state.js`, right after `maybeSkewer` (ends line 1417), add:

```javascript
// Dead Weight (§13, Anchor) — a damaging Anchor melee blow pins the struck target
// under the anchor: it can't Disengage on its next activation. Mirrors the
// maybeSkewer gate shape (melee only, must land SP, upgrade must be equipped).
function maybeDeadWeight(room, attacker, target, incomingWeapon, res) {
  if (incomingWeapon !== "melee") return false;
  if (!attacker || !target || attacker.destroyed) return false;
  if (!res || !(res.hits > 0)) return false;
  const dealtSp = Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (!dealtSp) return false;
  const effect = effectiveWeaponProfile("melee", attacker.weapons?.melee, attacker)?.upgradeEffect;
  if (!effect?.deadWeight) return false;
  target.noDisengageNextActivation = true;
  return true;
}
```

Then add a call at both fire sites, next to the existing `maybeSkewer` calls:
- After line 1533 (`maybeSkewer(room, rig, target, a.weapon, res);` in the facedown branch): add `maybeDeadWeight(room, rig, target, a.weapon, res);`
- After line 1540 (`if (res) maybeSkewer(room, rig, target, a.weapon, res);`): add `if (res) maybeDeadWeight(room, rig, target, a.weapon, res);`

- [ ] **Step 5: Gate the disengage action**

In `shared/game-state.js`, in the `if (act === "disengage")` block, right after the `if (rig.engagedWith == null) return false;` line (1572), add:

```javascript
    // Dead Weight (§13, Anchor) — pinned under the anchor: can't break the lock
    // this activation. Refused without spending a slot; clears at activation end.
    if (rig.noDisengageNextActivation) return false;
```

- [ ] **Step 6: Clear the flag at activation end**

In `endActivation` (`shared/game-state.js`), after `rig.noActivesNextActivation = false;` (line 1294), add:

```javascript
  // Dead Weight (§13, Anchor) — the no-Disengage pin is scoped to the one
  // activation it targeted; clear it here so it can't leak forward.
  rig.noDisengageNextActivation = false;
```

- [ ] **Step 7: Add the chip and the action note**

In `shared/battle-view.js` `rigModifiers`, after the `noPrepNextActivation` chip (line 160), add:

```javascript
  if (rig.noDisengageNextActivation) mods.push({ key: "nodisengage", tag: "Anchored — no Disengage next", tone: "warn" });
```

In `availableActions`, inside the `if (key === "disengage")` block (lines 53-56), extend it to:

```javascript
      if (key === "disengage") {
        enabled = left > 0 && rig.engagedWith != null && !rig.noDisengageNextActivation;
        if (rig.engagedWith == null) note = "Not engaged";
        else if (rig.noDisengageNextActivation) note = "Anchored — can't Disengage this activation";
      }
```

- [ ] **Step 8: Run tests**

Run: `node --test shared/game-state.test.js shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/game-state.js shared/battle-view.js shared/game-state.test.js
git commit -m "feat(anchor): Dead Weight — blocks the struck target's next Disengage"
```

---

## Task 6: Ground Anchor — free Anchor strike when the pinned target Disengages

**Files:**
- Modify: `shared/game-state.js` — `anchoredBy` field (3 shape sites + reset), hook, strike resolver, disengage handler, `clearEngagement`
- Modify: `shared/battle-view.js` — chip
- Test: `shared/game-state.test.js`

New field: `anchoredBy` (rig id or null). Mirrors `skeweredBy`. The free strike uses the Anchor's natural STR (no `strOverride`), so `resolveAnchorStrike` differs from `resolveSkewerStrike` (which forces STR 11).

- [ ] **Step 1: Write the failing test**

Append to `shared/game-state.test.js`:

```javascript
test("Ground Anchor: a damaging Anchor hit marks the target; Disengage provokes a free strike", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Anchor";
  b1.weaponUpgrades.melee = "ground-anchor";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(a1.anchoredBy, b1.id);
  assert.equal(a1.engagedWith, b1.id);
  // a1 disengages — takes a free Anchor strike, then the lock breaks and the mark clears.
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "disengage",
    dice: { toHit: [6], impacts: [6], location: 1 } } });
  assert.equal(a1.engagedWith, null);
  assert.equal(a1.anchoredBy, null);
  const struck = r.game.resolutions.some((e) => e.kind === "anchor");
  assert.equal(struck, true);
});
```

(As in Task 5, if two-in-a-row activation isn't legal, mirror the sequencing another two-rig test uses. `r.game.resolutions` is the log array — confirm the accessor name against another test that reads resolutions; adjust if it's `r.game.log` or similar.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `a1.anchoredBy` undefined.

- [ ] **Step 3: Default `anchoredBy` in all shape sites**

In `shared/game-state.js`:
(a) In `ensureRigShape`, next to the `skeweredBy` guard (line 431), add:
```javascript
  if (rig.anchoredBy === undefined) rig.anchoredBy = null;
```
(b) In the rig factory, next to `skeweredBy: null,` (line 594), add `anchoredBy: null,`.
(c) In the second unit factory, add `anchoredBy: null,` alongside its other reset fields (~line 706).
(d) In the match-reset loop (~line 1852, near `rig.engagedWith = null;`), add `rig.anchoredBy = null;`.

- [ ] **Step 4: Clear `anchoredBy` in `clearEngagement`**

In `clearEngagement` (`shared/game-state.js:1016-1025`), mirror the `skeweredBy` clears. After `if (rig.skeweredBy != null) rig.skeweredBy = null;` (line 1021) add:
```javascript
  if (rig.anchoredBy != null) rig.anchoredBy = null;
```
And inside the partner block, after `if (partner.skeweredBy != null) partner.skeweredBy = null;` (line 1024) add:
```javascript
    if (partner.anchoredBy != null) partner.anchoredBy = null;
```

- [ ] **Step 5: Add the mark hook + the strike resolver**

In `shared/game-state.js`, after `maybeDeadWeight` (added in Task 5), add:

```javascript
// Ground Anchor (§13, Anchor) — a damaging Anchor blow that leaves the target
// locked to the anchorer drives the anchor in (`anchoredBy`). Mirrors maybeSkewer.
function maybeGroundAnchor(room, attacker, target, incomingWeapon, res) {
  if (incomingWeapon !== "melee") return false;
  if (!attacker || !target || attacker.destroyed) return false;
  if (!res || !(res.hits > 0)) return false;
  const dealtSp = Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (!dealtSp) return false;
  const effect = effectiveWeaponProfile("melee", attacker.weapons?.melee, attacker)?.upgradeEffect;
  if (!effect?.groundAnchor) return false;
  if (attacker.engagedWith !== target.id || target.engagedWith !== attacker.id) return false;
  target.anchoredBy = attacker.id;
  return true;
}

// Ground Anchor's Disengage payload — one free Anchor strike at the weapon's
// natural STR (unlike Skewer's flat STR 11). Reuses the resolveAttack path.
function resolveAnchorStrike(room, anchorer, victim, random) {
  pushResolution(room, {
    kind: "anchor", actor: anchorer.owner, rigId: anchorer.id, rolls: [],
    summary: `${victim.name} tears off ${anchorer.name}'s Anchor — free strike as it breaks the lock.`,
    effects: ["Ground Anchor — free Anchor strike on Disengage"],
  });
  resolveAttack(room, anchorer, victim, {
    weapon: "melee", target: victim.name,
    arc: "front", range: "near", aimed: false, aimedLoc: "hull",
    engaged: anchorer.engagedWith != null,
  }, random, combatCtx());
}
```

Call the mark hook at both fire sites, next to `maybeDeadWeight`:
- After the facedown `maybeDeadWeight(...)` call: add `maybeGroundAnchor(room, rig, target, a.weapon, res);`
- After the normal-path `if (res) maybeDeadWeight(...)`: add `if (res) maybeGroundAnchor(room, rig, target, a.weapon, res);`

- [ ] **Step 6: Handle the mark in the disengage action**

In `shared/game-state.js`, in the `if (act === "disengage")` block, after the Skewer block (ends line 1580, before `clearEngagement(room, rig);` at 1581), add:

```javascript
    // Ground Anchor (§13, Anchor) — tearing off the anchor provokes one free
    // Anchor strike at its natural STR before the lock breaks.
    if (rig.anchoredBy != null && rig.engagedWith === rig.anchoredBy) {
      const anchorer = findRigById(room, rig.anchoredBy);
      if (anchorer && !anchorer.destroyed) resolveAnchorStrike(room, anchorer, rig, random);
      rig.anchoredBy = null;
    }
```

- [ ] **Step 7: Add the chip**

In `shared/battle-view.js` `rigModifiers`, after the `nodisengage` chip (Task 5), add:

```javascript
  if (rig.anchoredBy != null) mods.push({ key: "anchored", tag: "Anchored — Disengage costs a hit", tone: "warn" });
```

- [ ] **Step 8: Run tests**

Run: `node --test shared/game-state.test.js shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/game-state.js shared/battle-view.js shared/game-state.test.js
git commit -m "feat(anchor): Ground Anchor — free Anchor strike when a pinned rig Disengages"
```

---

## Task 7: Rivet Lock — stack rivets on a location, seize it (no repair + weapon jam)

**Files:**
- Modify: `shared/combat.js:340-377` (call a ctx hook with `location`)
- Modify: `shared/game-state.js` — attacker/target fields, `rivetHit` ctx mutator, `combatCtx` wiring, `repairRig` block, fire-gate jam, `runRecovery` sweep
- Modify: `shared/battle-view.js` — chip
- Test: `shared/game-state.test.js`

New fields: attacker `rivetTarget` (id|null), `rivetLoc` (str|null), `rivetStacks` (num); target `rivetSeized` (`{ [loc]: expiryRound }`). Mirrors `suppressLock` (stacking) + `cracked` (per-location expiry map).

Jam rule (spec): a seized **weapon-role** location (for a rig, `arms`) blocks the rig's **long-range** fire for a round; melee is unaffected. Non-weapon seized locations block repair only.

- [ ] **Step 1: Write the failing test**

Append to `shared/game-state.test.js`:

```javascript
test("Rivet Lock: 3 volleys on one location seize it — no repair + long-range jammed", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const a1 = findRig(r, "a1");
  a1.weapons.longRange = "Rivet Gun";
  a1.weaponUpgrades.longRange = "rivet-lock";
  const b1 = findRig(r, "b1");
  // Drive three damaging Rivet Gun volleys onto b1's arms directly via the ctx hook.
  const ctx = __test; // exposes rivetHit? if not, exercise via applyCommand fire ×3 (see note)
  for (let i = 0; i < 3; i++) __test.rivetHit(r, a1, b1, "arms");
  assert.equal(b1.rivetSeized.arms >= r.game.round, true); // seized (expiry in the future)
  // Repair is blocked on a seized location.
  b1.arms.sp = 2;
  __test.repairRig(b1, "arms", 3);
  assert.equal(b1.arms.sp, 2); // no repair while seized
});
```

Note: this test calls `__test.rivetHit` and `__test.repairRig`. Add `rivetHit` to the `__test` export (Step 5). `repairRig` is already exported in `__test` (`shared/game-state.js:2242`).

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `__test.rivetHit` is not a function.

- [ ] **Step 3: Default the new fields in the shape sites**

In `shared/game-state.js`:
(a) In `ensureRigShape`, near the other counters, add:
```javascript
  if (rig.rivetTarget === undefined) rig.rivetTarget = null;
  if (rig.rivetLoc === undefined) rig.rivetLoc = null;
  if (typeof rig.rivetStacks !== "number") rig.rivetStacks = 0;
  if (!rig.rivetSeized || typeof rig.rivetSeized !== "object") rig.rivetSeized = {};
```
(b) In the rig factory (near `enfiladeShots: 0,`), add:
```javascript
    rivetTarget: null,
    rivetLoc: null,
    rivetStacks: 0,
    rivetSeized: {},
```
(c) In the second unit factory, add the same four fields alongside its reset fields.
(d) In the match-reset loop (~1860 region), add:
```javascript
      rig.rivetTarget = null;
      rig.rivetLoc = null;
      rig.rivetStacks = 0;
      rig.rivetSeized = {};
```

- [ ] **Step 4: Add the `rivetHit` mutator**

In `shared/game-state.js`, after `crackLocation` (ends line 1121), add:

```javascript
// Rivet Lock (§13, Rivet Gun) — stack rivets on the struck location. Consecutive
// damaging volleys on the SAME target+location ramp; switching either resets to 1.
// At 3 rivets the location seizes: SP can't be repaired (checked in repairRig) and,
// if it's a weapon-role location, that rig's long-range weapon jams (fire gate) —
// both for a two-Recovery window (round N and N+1, swept in runRecovery). The
// attacker runs +1 heat every rivet volley while the lock is live.
function rivetHit(room, attacker, target, loc) {
  if (!attacker || !target || !target[loc]) return;
  if (attacker.rivetTarget === target.id && attacker.rivetLoc === loc) {
    attacker.rivetStacks = Math.min(3, (attacker.rivetStacks || 0) + 1);
  } else {
    attacker.rivetTarget = target.id;
    attacker.rivetLoc = loc;
    attacker.rivetStacks = 1;
  }
  bumpHeat(attacker, 1);
  if (attacker.rivetStacks >= 3) {
    target.rivetSeized = target.rivetSeized || {};
    target.rivetSeized[loc] = (room?.game?.round || 0) + 1;
  }
}
```

- [ ] **Step 5: Wire `rivetHit` into `combatCtx` and `__test`**

In `combatCtx()` (`shared/game-state.js:~1328`), add `rivetHit` to the returned object, alongside `crackLocation`:
```javascript
    rivetHit: (room, attacker, target, loc) => rivetHit(room, attacker, target, loc),
```
In the `__test` export (`shared/game-state.js:2242`), add `rivetHit` to the exported object.

- [ ] **Step 6: Call the hook from `resolveAttack`**

In `shared/combat.js`, in the post-damage location block, after the `breachGrip` block (ends line 367), add:

```javascript
      // Rivet Lock (§13, Rivet Gun) — a damaging volley drives a rivet into the
      // struck location; ctx stacks it and seizes at 3.
      if (profile.upgradeEffect?.rivetLock && impacts.some((h) => h.sp > 0)) {
        ctx.rivetHit?.(room, attacker, target, location);
      }
```

- [ ] **Step 7: Block repair on a seized location**

In `repairRig` (`shared/game-state.js:1082-1093`), after the `hullRepairLock` guard (line 1086), add:

```javascript
  // Rivet Lock (§13) — a seized location can't be repaired while rivets hold.
  if (rig.rivetSeized && (rig.rivetSeized[loc] || 0) > 0) return;
```

- [ ] **Step 8: Jam long-range fire when a weapon-role location is seized**

In `shared/game-state.js`, in the `if (act === "fire" || act === "aimed")` block, after the Barrage lock check (ends line 1501), add:

```javascript
    // Rivet Lock (§13, Rivet Gun) — a seized weapon-role location jams this rig's
    // long-range weapon (the gun arm is riveted shut). Melee is unaffected.
    if (a.weapon !== "melee" && rig.rivetSeized) {
      const kind = kindOf(rig);
      const jammed = Object.keys(rig.rivetSeized).some(
        (loc) => (rig.rivetSeized[loc] || 0) > 0 && roleOf(kind, loc) === "weapon",
      );
      if (jammed) return false;
    }
```

- [ ] **Step 9: Sweep expired seizes in `runRecovery`**

In `runRecovery`, next to the `cracked` sweep (lines 1222-1226), add:

```javascript
    // Rivet Lock (§13) — sweep out seizes whose expiry round has passed.
    if (rig.rivetSeized) {
      for (const loc of Object.keys(rig.rivetSeized)) {
        if (rig.rivetSeized[loc] < room.game.round) delete rig.rivetSeized[loc];
      }
    }
```

- [ ] **Step 10: Add the chip**

In `shared/battle-view.js` `rigModifiers`, after the `cracked` loop (line 165), add:

```javascript
  for (const loc of Object.keys(rig.rivetSeized || {})) mods.push({ key: `rivet-${loc}`, tag: `Riveted: ${cap(loc)}`, tone: "crit" });
```

- [ ] **Step 11: Run tests**

Run: `node --test shared/game-state.test.js shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/battle-view.js shared/game-state.test.js
git commit -m "feat(rivet-gun): Rivet Lock — seize a location (no repair + long-range jam)"
```

---

## Task 8: Harpoon Winch — narrated 4" reel with root + heat + cooldown

**Files:**
- Modify: `shared/combat.js:401-435` (spatial-instruction region)
- Modify: `shared/game-state.js` — `harpoonWinchCooldownUntil` field default (3 sites) + match reset
- Test: `shared/combat.test.js` (mirror the Tow Chain test at :~995)

New field: `harpoonWinchCooldownUntil` (num). Reuses the shared `towedThisActivation` root flag (a rig carries only one of Tow Chain / Harpoon Winch, and both mean "rooted this activation").

- [ ] **Step 1: Read the Tow Chain combat test to mirror it**

Read `shared/combat.test.js` around lines 990-1015 (the two Tow Chain tests). The new tests mirror them with the Harpoon (long-range) profile.

- [ ] **Step 2: Write the failing test**

Append to `shared/combat.test.js`:

```javascript
test("Harpoon Winch: a damaging hit emits a reel instruction, roots + heats the attacker, sets cooldown", () => {
  const harpoon = { ...WEAPONS.longRange["Harpoon"], upgradeEffect: { harpoonWinch: true } };
  const rig = makeRig(1, "Reeler", "light", "a", { lr: "Harpoon", melee: "Anchor" });
  rig.weaponUpgrades.longRange = "harpoon-winch";
  const target = makeRig(2, "Prey", "light", "b", { lr: "Harpoon", melee: "Anchor" });
  const ctx = makeCtx();
  const room = { rigs: [rig, target], game: { round: 2 } };
  resolveAttack(room, rig, target, {
    weapon: "longRange", target: "Prey", arc: "front", distance: 10,
    dice: { toHit: [6], impacts: [6], location: 1 },
  }, () => 0, ctx);
  assert.equal(rig.towedThisActivation, true);
  assert.equal(rig.harpoonWinchCooldownUntil, 5); // round 2 + 3
  const reel = ctx.resolutions.some((e) => /reel/i.test(e.summary || ""));
  assert.equal(reel, true);
});
```

Note: `makeCtx()` in `combat.test.js` (line 9) records `bumpHeat`/`applyDamage` as no-ops, so heat isn't asserted here — the root flag, cooldown, and instruction are the observable engine state. If `resolveAttack` needs `ctx.rivetHit`/`ctx.crackLocation` to be present, they're optional-chained (`?.`) so the minimal ctx is fine.

- [ ] **Step 3: Run to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — no reel instruction, `harpoonWinchCooldownUntil` undefined.

- [ ] **Step 4: Default the cooldown field in the shape sites**

In `shared/game-state.js`:
(a) In `ensureRigShape`, next to `towChainCooldownUntil` (line 448):
```javascript
  if (typeof rig.harpoonWinchCooldownUntil !== "number") rig.harpoonWinchCooldownUntil = 0;
```
(b) In the rig factory next to `towChainCooldownUntil: 0,` (line 616): add `harpoonWinchCooldownUntil: 0,`.
(c) In the second unit factory next to its `towChainCooldownUntil: 0,` (line 714): add `harpoonWinchCooldownUntil: 0,`.
(d) In the match-reset loop next to `rig.towChainCooldownUntil = 0;` (line 1862): add `rig.harpoonWinchCooldownUntil = 0;`.

- [ ] **Step 5: Add the narrated Harpoon Winch block**

In `shared/combat.js`, after the Tow Chain block (ends line 435, before the Enfilade block at 436), add:

```javascript
  // G1e — Harpoon Winch (Harpoon, Prototype): a damaging shot spears the target
  // and reels it up to 4" toward the attacker (narrated). The reel roots the
  // attacker for the rest of its activation and runs it +2 heat; 3-round cooldown,
  // during which the harpoon fires normally with no reel. Mirrors Tow Chain.
  if (profile.upgradeEffect?.harpoonWinch && landedDamage) {
    if (round >= (attacker.harpoonWinchCooldownUntil || 0)) {
      ctx.bumpHeat(attacker, 2);
      attacker.towedThisActivation = true;
      attacker.harpoonWinchCooldownUntil = round + 3;
      pushInstruction(`Harpoon Winch — reel ${target.name} up to 4" toward you (move the mini). You are rooted until end of activation; +2 heat.`);
    } else {
      pushInstruction(`Harpoon Winch recharging — ${attacker.name}'s hit lands with no reel.`);
    }
  }
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(harpoon): Harpoon Winch — narrated 4\" reel with root, heat, cooldown"
```

---

## Task 9: Design docs + rules.md

**Files:**
- Create: `docs/design/light-harpoon-anchor.md`
- Create: `docs/design/light-rivet-pressureclaw.md`
- Modify: `rules.md` (weapon stat lists ~362-398, upgrade table ~405-418, mechanics bullets ~431-449)

- [ ] **Step 1: Write `docs/design/light-harpoon-anchor.md`**

Follow the structure of `docs/design/light-wreckingball-double.md` (title, Focus, invariants line, weapon stats, a table per weapon with Nature/Name/Effect/Player tag/Engine columns, internal synergy, decided values, "As built"). Content:

```markdown
# Rig design — `light-harpoon-anchor`

**Weapons:** Harpoon (long-range) · Anchor (melee) · **Class:** light
**Focus:** control — a light tether rig that wins by pinning one target and refusing to let it leave. The Harpoon spears at range (Impale to lock legs; Taut Cable punishes anything already pinned); the Anchor chains a rig into the melee lock and denies the Disengage. The anti-runner: catch, hold, grind.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, no mirror matchups. Upgrades follow the Field / Tuned / Prototype nature system (pick one per weapon, max one Prototype per rig).

Relevant weapon stats (from `shared/game-state.js`):
- Harpoon: ROF 1, STR 12, sweet 14", max 22" — one heavy line-thrower; punchy close-to-mid, falls off past the sweet spot.
- Anchor: melee, ROF 1, STR 12 — one heavy hooking blow.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4 base; this chassis 12 / 11 / 11 / 8. Heat cap 6 (highest), 3 actions.

## Harpoon (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Barbed Head | Gains Impale (D12 ≥ 8 immobilises the target). | `Gains Impale` | ✅ coded (`{ perks: ["Impale"] }`) |
| **Tuned** | Taut Cable | +3 STR against a target already pinned down — immobilised or held in a melee lock (engaged). | `+3 STR vs immobilised/engaged targets` | ✅ implemented (`vsPinned` in `computeStr`) |
| **Prototype** | Harpoon Winch | On a damaging hit, if charged (`round ≥ harpoonWinchCooldownUntil`), emits a player instruction — *"Harpoon Winch — reel <target> up to 4" toward you (move the mini). You are rooted until end of activation; +2 heat."* The 4" reel is narrated; the +2 heat and root-this-activation are simulated. 3-round cooldown; while recharging the harpoon fires normally with no reel. | `Spear and reel a rig 4" toward you — roots you, runs hot` | ✅ implemented (heat/root/cooldown simulated; reel is a player instruction) |

## Anchor (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Fluked Head | +3 STR (12 → 15). | `+3 STR` | ✅ coded (`{ str: 3 }`) |
| **Tuned** | Dead Weight | A damaging Anchor blow pins the struck target under the anchor: it cannot Disengage on its next activation. The pin is scoped to that one activation. | `Struck target can't Disengage next activation` | ✅ implemented (`noDisengageNextActivation`, gates Disengage, cleared at activation end) |
| **Prototype** | Ground Anchor | A damaging Anchor blow that leaves the target locked to the anchorer drives the anchor in (`anchoredBy`). The target can still Disengage, but tearing off the anchor first eats one free Anchor strike (the Anchor's natural STR) as the lock breaks. Clears with the engagement. | `Anchor a rig in the lock; leaving you costs it a free Anchor hit` | ✅ implemented (mirrors Skewer; free strike at natural STR) |

## Internal synergy & cap

- Barbed Head Impales a leg → the target is immobilised → Taut Cable turns every following Harpoon shot into +3 STR. Or Anchor it (engaged) for the same bonus.
- Dead Weight (Tuned) and Ground Anchor (Prototype) are both on the Anchor — pick one: deny the Disengage outright for a turn, or tax every escape with a free hit.
- Harpoon Winch reels a fleeing rig back into Anchor range — but roots you, so it's a commitment, not a repositioning tool.

## Decided values (all tunable)

- Harpoon: ROF 1, STR 12, sweet 14", max 22". Anchor: STR 12.
- Taut Cable: +3 STR vs immobilised or engaged.
- Harpoon Winch: 4" reel (instruction), +2 heat, root rest of activation, 3-round cooldown.
- Dead Weight: struck target can't Disengage its next activation.
- Ground Anchor: free Anchor strike (natural STR) when the pinned target Disengages.
- SP: Hull 12 / Arms 11 / Legs 11 / Engine 8.

## As built

All six upgrades are live in `shared/game-state.js` (`WEAPONS`, `WEAPON_UPGRADES`, `PREBUILT_RIGS`) and `shared/combat.js`. Harpoon Winch's reel is a player instruction per [AGENTS.md](../../AGENTS.md) (tabletop assistant, not a simulator); the engine simulates the heat/root/cooldown and narrates the spatial reel.
```

- [ ] **Step 2: Write `docs/design/light-rivet-pressureclaw.md`**

```markdown
# Rig design — `light-rivet-pressureclaw`

**Weapons:** Rivet Gun (long-range) · Pressure Claw (melee) · **Class:** light
**Focus:** attrition — an industrial light brawler that grinds a target down location by location. The Rivet Gun stitches pins into a rig at spitting range (and can seize a location shut); the Pressure Claw crushes locations open in melee. All effects are state-tracked — no spatial mechanics.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, no mirror matchups. Upgrades follow the Field / Tuned / Prototype nature system (pick one per weapon, max one Prototype per rig).

Relevant weapon stats (from `shared/game-state.js`):
- Rivet Gun: ROF 6, STR 4, sweet 6", max 14" — a rapid, low-STR, very short-range fastener gun (shortest max range in the table). Volume, not punch.
- Pressure Claw: melee, ROF 2, STR 9, ACC [1,1] — a hydraulic crushing claw.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4 base; this chassis 13 / 11 / 10 / 9.

## Rivet Gun (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Rapid Feed | +2 ROF (6 → 8). | `+2 ROF` | ✅ coded (`{ rof: 2 }`) |
| **Tuned** | Staple Burst | Land 4+ hits in one attack → target loses 1 action next activation. | `4+ hits pins the target (−1 action)` | ✅ implemented (`pinOnHits: 4`) |
| **Prototype** | Rivet Lock | Consecutive damaging volleys on the SAME location stack rivets there; switching target or location resets the stack. At 3 rivets the location seizes: its SP can't be repaired and, if it's a weapon-role location (a rig's Arms), that rig's long-range weapon jams for a round. The attacker runs +1 heat every rivet volley while stacking. Fully non-spatial. | `Rivet a location shut — no repairs, jams a weapon there` | ✅ implemented (`rivetLock`; per-location stacks + seize, swept in Recovery) |

## Pressure Claw (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Hardened Jaws | Gains Armour Piercing. | `Gains Armour Piercing` | ✅ coded (`{ perks: ["Armour Piercing"] }`) |
| **Tuned** | Crush Grip | On a damaging hit: −1 max SP to the struck location (permanent grind). | `On damaging hit: −1 max SP to struck location` | ✅ implemented (`onDamage: "sunder"`) |
| **Prototype** | Hydraulic Vice | A damaging hit clamps the struck location's armour open: +2 impact from anyone for a two-round crack window. | `Pry a location's armour open (+2 impact from anyone)` | ✅ implemented (`breachGrip`) |

## Internal synergy & cap

- Rivet Lock seizes a location (no repair) → Crush Grip grinds its max SP down → the location can't be healed back. Focus fire is rewarded.
- Rivet Lock (jam the gun arm) and Hydraulic Vice (crack a location) both punish sitting still in front of this rig.

## Decided values (all tunable)

- Rivet Gun: ROF 6, STR 4, sweet 6", max 14". Pressure Claw: STR 9.
- Rivet Lock: 3 rivets on one location → repair-locked + long-range jammed if the location is Arms; +1 self-heat per volley; two-Recovery expiry.
- Crush Grip: −1 max SP struck location. Hydraulic Vice: +2 impact crack (two rounds).
- SP: Hull 13 / Arms 11 / Legs 10 / Engine 9.

## As built

All six upgrades are live in `shared/game-state.js` and `shared/combat.js`. No spatial mechanics — every effect is tracked state.
```

- [ ] **Step 3: Update `rules.md`**

(a) In the Long Range Weapons section (~line 362-385), add Harpoon and Rivet Gun rows in the same format the other long-range weapons use (match the existing column layout exactly — copy a neighbouring row and edit the numbers: Harpoon ROF 1 / STR 12 / sweet 14" / max 22"; Rivet Gun ROF 6 / STR 4 / sweet 6" / max 14").

(b) In the Melee Weapons section (~line 386-398), add Anchor (ROF 1 / STR 12) and Pressure Claw (ROF 2 / STR 9 / ACC [1,1]) rows in the same format.

(c) In the Weapon Upgrades table (~line 405-418), add four rows:
```markdown
| Harpoon | Barbed Head (Impale) | Taut Cable (+3 STR vs pinned/engaged) | Harpoon Winch |
| Rivet Gun | Rapid Feed (+2 ROF) | Staple Burst (4+ hits → −1 action) | Rivet Lock |
| Anchor | Fluked Head (+3 STR) | Dead Weight (no Disengage next) | Ground Anchor |
| Pressure Claw | Hardened Jaws (Armour Piercing) | Crush Grip (−1 max SP) | Hydraulic Vice |
```

(d) In the "Tuned / Prototype Upgrade Mechanics" bullet list (~line 431-449), add bullets mirroring the existing wording:
```markdown
- **Taut Cable** (Harpoon, Tuned) — +3 STR against a target already pinned down: immobilised, or held in a melee lock (engaged).
- **Harpoon Winch** (Harpoon, Prototype) — a spatial reel, narrated rather than simulated. On a damaging Harpoon hit, if charged (`round ≥ harpoonWinchCooldownUntil`), the engine emits a player instruction to reel the target up to 4" toward the attacker. The attacker takes +2 heat, is rooted for the rest of this activation, and the reel goes on a 3-round cooldown. While recharging, the harpoon fires normally with no reel.
- **Dead Weight** (Anchor, Tuned) — a damaging Anchor blow pins the struck target under the anchor: it cannot Disengage on its next activation (scoped to that one activation).
- **Ground Anchor** (Anchor, Prototype) — a damaging Anchor blow that leaves the target locked to the anchorer drives the anchor in. If that target Disengages, it first eats a free Anchor strike (the Anchor's natural STR) as it tears free, then the lock breaks. The mark clears with the lock.
- **Rivet Lock** (Rivet Gun, Prototype) — consecutive damaging volleys on the *same* location stack rivets; switching target or location resets to 1. At 3 rivets the location seizes: its SP can't be repaired, and a weapon-role location (a rig's Arms) jams the rig's long-range weapon for a round. Seizes expire in Recovery (round N and N+1). The attacker runs +1 heat every rivet volley while stacking. Fully non-spatial.
```

- [ ] **Step 4: Commit**

```bash
git add docs/design/light-harpoon-anchor.md docs/design/light-rivet-pressureclaw.md rules.md
git commit -m "docs(design): design records + rules for the two new chassis"
```

---

## Task 10: Full verification + drive the app

**Files:** none (verification only; fix-ups as needed)

- [ ] **Step 1: Run every test suite + types**

Run: `node --test` then `npx vitest run` then `npx tsc --noEmit`
Expected: all green. If a client test (e.g. `client/src/components/wizards/RigWizard.test.tsx`) asserts a fixed prebuilt count or snapshot, update it to include the two new chassis (the wizard renders from `PREBUILT_RIGS` + `/api/prebuilts`).

- [ ] **Step 2: Drive the app to confirm both chassis commission**

Use the `verify` skill (or `run` skill) to launch the app. In the commission wizard, confirm "Harpoon · Anchor" and "Rivet Gun · Pressure Claw" appear, each offering three natured upgrades per weapon, and that the one-Prototype-per-rig guard still holds (picking Harpoon Winch + Ground Anchor is refused). Commission one of each and confirm the description renders on the commissioned rig card.

- [ ] **Step 3: Final commit if any fix-ups were needed**

```bash
git add -A
git commit -m "test: update wizard expectations for the two new chassis"
```

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — weapons (T1), upgrades (T2), prebuilts+content (T3), the five new effects vsPinned/deadWeight/groundAnchor/rivetLock/harpoonWinch (T4–T8), docs+rules (T9), wiring checklist + verify (T10).
- **Field-name consistency:** `noDisengageNextActivation`, `anchoredBy`, `rivetTarget`/`rivetLoc`/`rivetStacks`/`rivetSeized`, `harpoonWinchCooldownUntil` — used identically across default sites, mutators, gates, chips, and match-reset in every task that references them.
- **Reused effects need no new code:** Barbed Head, Fluked Head, Rapid Feed, Staple Burst, Hardened Jaws, Crush Grip, Hydraulic Vice all key off already-wired effects — they work the moment Task 2 lands.
