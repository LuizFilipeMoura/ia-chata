# Equipment Mechanics — Plan 2: Reactive / Per-Round Tuned Upgrades

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the two **Group 2** Tuned equipment upgrades — **Reactive Armor** (Ablative Plating) and **Chaff Burst** (Reactive Plating) — and introduce the shared **`applyDefensiveReactions`** on-incoming-hit seam that Groups 3 will build on. Behavior of both rows is already fixed by the 2026-07-12 equipment-depth design (table lines 88-99); this plan only implements it.

**Architecture:** Reactive Armor is the **first consumer** of a new single seam, `applyDefensiveReactions(target, hit, ctx)`, added to `shared/combat.js` in the impact-resolution path (`rollImpacts`): the defending rig may soften an incoming hit before its severity is final. The seam mutates `target.equipState` (Plan 0's per-rig tracked-state block) and returns the possibly-softened hit — consistent with how `combat.js` already mutates attacker fields (e.g. `autocannonShots`). Reactive Armor records the struck location in `rig.equipState.reactiveArmorLocs` (the first damaging hit each round hardens that location by −2 impact) and Recovery clears it via Plan 0's `refreshEquipState`. Chaff Burst is **spatial** — while a rig has Smoke up (`smokeNextActivation`, set by Pop Smoke) and is targeted, it may take a free half-Speed side-step; there is no grid, so `resolveFire` emits a narrated player instruction via `pushResolution` (AGENTS.md "Spatial effects — narrate, don't simulate") and the player moves the model. Effect tags are read live from the catalog via `equipmentUpgradeEffectOf` (Plan 0); `combat.js` imports only from `rules.js` (no game-state cycle).

**Tech Stack:** Node ESM modules, `node:test` + `node:assert` (run with `node --test`).

**Depends on Plan 0** (must be merged first). It provides:
- `equipmentUpgradeEffectOf(equipmentId, upgradeId)` in `shared/rules.js`, imported into both `combat.js` and `game-state.js` local scope.
- `rig.equipState` initialised in `makeRig` / backfilled in `ensureRigShape`, including `reactiveArmorLocs: []`.
- `refreshEquipState(rig)` — an empty per-round hook already called inside `runRecovery`'s per-rig loop; this plan fills its Reactive Armor branch.
- `EQUIPMENT_UPGRADES` relocated to `shared/rules.js`; the two rows this plan wires still ship `effect: {}` + `TODO(mechanics)` there.

**Pinned interface (Group 3 depends on this exact name):**

```js
// shared/combat.js — single seam in the impact path. A defending rig may modify
// an incoming resolved hit { die, total, tier, sp } before it is pushed. Mutates
// target.equipState (per-round flags / charge spends) and returns the hit.
// Reactive Armor is the first user; Group 3 adds Ablative Cascade + Point-Defense.
export function applyDefensiveReactions(target, hit, ctx) { /* ctx: { location, row } */ }
```

---

### Task 1: Introduce the `applyDefensiveReactions` seam (pass-through)

Add the seam and wire it into the `rollImpacts` per-hit loop as an identity function (no consumers yet), so existing impact behavior is byte-identical. This is deliberately a separate task from the mechanic so the seam lands with its own test and later plans have a stable insertion point.

**Files:**
- Modify: `shared/combat.js` — add `applyDefensiveReactions` export near `rollImpacts` (~line 330); wire the call into the loop's `out.push` (combat.js:327).
- Test: `shared/combat.test.js` — add to the imports on line 3.

- [ ] **Step 1: Write the failing test**

Extend the existing import on `shared/combat.test.js:3` to include `applyDefensiveReactions`, then add:

```js
test("applyDefensiveReactions is an identity pass-through for a defender with no reactive gear", () => {
  const target = { weightClass: "medium" }; // no equipment, no equipState
  const hit = { die: 5, total: 12, tier: "direct", sp: 1 };
  const out = applyDefensiveReactions(target, hit, { location: "hull", row: null });
  assert.deepEqual(out, hit);
});

test("rollImpacts is unchanged by the seam for a plain target", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 13); // 5 + 8(STR) + 0(front) — no dock, seam is a no-op
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `applyDefensiveReactions is not a function` (not exported yet).

- [ ] **Step 3: Implement the pass-through seam**

In `shared/combat.js`, add the export immediately after `rollImpacts` ends (after combat.js:330):

```js
// Single seam in the impact path: the defending rig may modify an incoming
// resolved hit before it is pushed. Mutates target.equipState (per-round flags /
// charge spends) and returns the possibly-softened hit. No consumers yet — Plan 2
// Task 2 (Reactive Armor) is the first; Group 3 adds Ablative Cascade +
// Point-Defense. ctx carries { location, row } for any severity re-derive.
export function applyDefensiveReactions(target, hit, ctx) {
  return hit;
}
```

Then wire it into the `rollImpacts` loop. Replace the push at `combat.js:327`:

```js
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
```

with:

```js
    const resolved = { die, total, tier: sev.tier, sp: sev.sp };
    out.push(applyDefensiveReactions(target, resolved, { location, row }));
```

(`location` and `row` are both already in scope in `rollImpacts` — `row` is computed at combat.js:302, `location` is the function parameter.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS — the two new tests plus every existing impact test (the seam returns the hit untouched).

- [ ] **Step 5: Commit**

```bash
git add shared/combat.js shared/combat.test.js
git commit -m "feat(v2): add applyDefensiveReactions on-incoming-hit seam (pass-through)"
```

---

### Task 2: Reactive Armor — first damaging hit each round hardens that location

Rule (2026-07-12 design, line 92): *"first damaging hit each round hardens that location (−2 impact) till next activation."* The first damaging hit to a location records it in `equipState.reactiveArmorLocs`; that hit and every further hit to a hardened location take −2 impact (Harden-equivalent). Recovery clears the list so it re-arms.

**Files:**
- Modify: `shared/rules.js` — the `reactive-armor` row under `EQUIPMENT_UPGRADES["ablative-plating"]`: `effect: {}` → `effect: { reactiveArmor: true }` (drop the `TODO(mechanics)`).
- Modify: `shared/combat.js` — the Reactive Armor branch inside `applyDefensiveReactions` (from Task 1).
- Modify: `shared/game-state.js` — the `refreshEquipState(rig)` body (Plan 0 scaffold) to clear `reactiveArmorLocs` each Recovery.
- Test: `shared/combat.test.js` (seam behavior), `shared/game-state.test.js` (Recovery clear).

- [ ] **Step 1: Write the failing tests**

Add to `shared/combat.test.js`:

```js
test("Reactive Armor hardens the struck location on the first damaging hit each round (−2 impact)", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const reactive = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reactive-armor",
    equipState: { reactiveArmorLocs: [] },
  };
  // d6=5 → plain hull total = 5 + 8 + 0(front) = 13
  const outPlain = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  const outReactive = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(outPlain[0].total - outReactive[0].total, 2);        // −2 impact, Harden-equivalent
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // that location is now hardened

  // A second volley to the SAME hardened location still softens and does not re-record.
  const outReactive2 = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(outPlain[0].total - outReactive2[0].total, 2);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // no duplicate
});

test("Reactive Armor does not fire for a rig carrying only the base Ablative Plating", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const base = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating",
    equipState: { reactiveArmorLocs: [] },
  };
  const out = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 13);                          // no reactive dock
  assert.deepEqual(base.equipState.reactiveArmorLocs, []);  // nothing hardened
});
```

Add to `shared/game-state.test.js`:

```js
test("Recovery clears reactiveArmorLocs so Reactive Armor re-arms next round", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "ablative-plating" });
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "reactive-armor";
  rig.equipState.reactiveArmorLocs.push("hull", "legs");
  __test.runRecovery(r);
  assert.deepEqual(rig.equipState.reactiveArmorLocs, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: FAIL — the `reactive-armor` effect tag is still `{}`, so the seam returns the hit untouched (no −2, `reactiveArmorLocs` stays `[]`); and `refreshEquipState` does not yet clear the list.

- [ ] **Step 3: Implement**

**`shared/rules.js`** — in `EQUIPMENT_UPGRADES["ablative-plating"]`, wire the tag:

```js
    { id: "reactive-armor", nature: "tuned", name: "Reactive Armor",
      tag: "First hit each round hardens that location", effect: { reactiveArmor: true } },
```

**`shared/combat.js`** — fill the Reactive Armor branch in `applyDefensiveReactions`:

```js
export function applyDefensiveReactions(target, hit, ctx) {
  // Reactive Armor (Ablative Plating, Tuned) — the FIRST damaging hit each round
  // to a location hardens THAT location by −2 impact (Harden-equivalent) until this
  // rig's next activation; further hits to a hardened location soften too. The
  // per-round list is cleared in Recovery (refreshEquipState).
  if (equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.reactiveArmor) {
    const locs = target.equipState?.reactiveArmorLocs;
    if (locs && (locs.includes(ctx.location) || hit.sp > 0)) {
      if (!locs.includes(ctx.location)) locs.push(ctx.location); // first damaging hit hardens it
      const total = hit.total - 2;
      const sev = impactSeverity(total, ctx.row);
      // −2 impact can only hold or lower severity; never let the re-derive raise it
      // above the resolved hit (e.g. a machine-gun crit already capped to Severe).
      const sp = Math.min(hit.sp, sev.sp);
      return { ...hit, total, sp, tier: sp === hit.sp ? hit.tier : sev.tier };
    }
  }
  return hit;
}
```

(`equipmentUpgradeEffectOf` and `impactSeverity` are both already imported from `./rules.js` after Plan 0 Task 3.)

**`shared/game-state.js`** — extend the `refreshEquipState` body (Plan 0 scaffold) with the Reactive Armor clear:

```js
function refreshEquipState(rig) {
  const s = rig.equipState;
  if (!s) return;
  // Reactive Armor (Tuned) — the per-round "hardened that location" flags reset,
  // so the first damaging hit next round re-hardens.
  if (Array.isArray(s.reactiveArmorLocs)) s.reactiveArmorLocs.length = 0;
  // (Group 3 branches added below.)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/combat.js shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "feat(v2): wire Reactive Armor via applyDefensiveReactions + Recovery clear"
```

---

### Task 3: Chaff Burst — narrated free side-step under smoke

Rule (2026-07-12 design, line 99): *"while Smoke up, when targeted, free half-Speed side-step before the attack resolves."* Smoke is `rig.smokeNextActivation` (set by the Pop Smoke active, `game-state.js:2247`). This is **spatial** — no grid — so `resolveFire` emits a narrated player instruction before it calls `resolveAttack`; the player moves the model. The reaction is free and always available while Smoke is up, so there is no cooldown/counter to track.

**Files:**
- Modify: `shared/rules.js` — the `chaff-burst` row under `EQUIPMENT_UPGRADES["reactive-plating"]`: `effect: {}` → `effect: { chaffBurst: true }` (drop the `TODO(mechanics)`).
- Modify: `shared/game-state.js` — `resolveFire` (`game-state.js:1982`), just before the `resolveAttack` call (game-state.js:2000).
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("Chaff Burst narrates a free side-step when a smoked Reactive-Plating rig is targeted", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const target = findRig(r, "a1");
  target.equipment = "reactive-plating";
  target.equipmentUpgrade = "chaff-burst";
  target.smokeNextActivation = true; // Smoke up from an earlier Pop Smoke
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1], location: 1 },
  } });
  assert.ok(r.game.resolutions.some((e) => /Chaff Burst/.test(e.summary || "")));
});

test("Chaff Burst stays silent when the targeted rig has no Smoke up", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const target = findRig(r, "a1");
  target.equipment = "reactive-plating";
  target.equipmentUpgrade = "chaff-burst";
  target.smokeNextActivation = false;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1], location: 1 },
  } });
  assert.equal(r.game.resolutions.some((e) => /Chaff Burst/.test(e.summary || "")), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the first test finds no `Chaff Burst` resolution (the effect tag is still `{}` and `resolveFire` emits no instruction).

- [ ] **Step 3: Implement**

**`shared/rules.js`** — in `EQUIPMENT_UPGRADES["reactive-plating"]`, wire the tag:

```js
    { id: "chaff-burst", nature: "tuned", name: "Chaff Burst",
      tag: "Under smoke, free half-Speed side-step when targeted", effect: { chaffBurst: true } },
```

**`shared/game-state.js`** — in `resolveFire`, immediately before `const res = resolveAttack(...)` (game-state.js:2000):

```js
  // Chaff Burst (Reactive Plating, Tuned) — a smoked rig that gets targeted may
  // take a free half-Speed side-step before the attack resolves. Spatial → narrate
  // the instruction; the player moves the model (AGENTS.md "narrate, don't
  // simulate"). Free whenever Smoke is up, so there is no cadence to track.
  if (target.smokeNextActivation
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.chaffBurst) {
    const step = Number.isFinite(target.speed) ? `${Math.floor(target.speed / 2)}" ` : "half-Speed ";
    pushResolution(room, {
      kind: "perk", actor: target.owner, rigId: target.id, rolls: [],
      summary: `Chaff Burst — ${target.name} has Smoke up: it may take a free ${step}side-step before the attack resolves (move the mini).`,
      effects: ["Chaff Burst — free side-step under smoke"],
    });
  }
```

(`equipmentUpgradeEffectOf` is already imported into `game-state.js` scope after Plan 0 Task 2; `pushResolution` is local.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): wire Chaff Burst — narrated free side-step under smoke"
```

---

## Self-review notes

- **Seam name is load-bearing.** Group 3 (Ablative Cascade, Point-Defense System) reuses `applyDefensiveReactions(target, hit, ctx)` verbatim — do not rename it or change the `(target, hit, ctx)` shape. Those consumers step the resolved `tier`/`sp` (charge spend); Reactive Armor re-derives from `total` — both patterns coexist in the one function.
- **No import cycle.** `combat.js` only gained reads of `equipmentUpgradeEffectOf` + `impactSeverity` from `rules.js`; it never imports `game-state.js`. `equipState` arrives on the `target` object at call time.
- **Monotonic softening.** The `Math.min(hit.sp, sev.sp)` guard keeps Reactive Armor from ever *raising* damage when the resolved hit was already capped (machine-gun crit cap, penetrator force-Severe). Normal-path hits just drop −2 on `total`.
- **Recovery-scoped, not activation-scoped.** Per the task and the rollout spec's Group 2 row, `reactiveArmorLocs` clears in `refreshEquipState` (once per Recovery), not on the rig's own activation — a deliberate simplification of the design's "till next activation" wording.
- After this plan, both Group 2 rows in `EQUIPMENT_UPGRADES` (rules.js) carry a real camelCase tag and no longer show `TODO(mechanics)`. Update the "Tuned / Prototype Equipment Mechanics" subsection of `rules.md` §15 for Reactive Armor + Chaff Burst as part of the Task 2/3 commits if following the per-group rules.md cadence.
