# Melee Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a D&D-style melee engagement lock — a rig in melee cannot walk away, guns are hampered while locked, and breaking free takes a deliberate Disengage action.

**Architecture:** Engagement is explicit tracked state (the server has no positions). Each unit carries a symmetric `engagedWith: rigId|null` link, guarded by two helper functions so the symmetric one-to-one invariant is the only way state changes. A melee attack auto-forms the pair; a `move`+`engage` declaration also forms it. Movement is blocked while engaged; a new `disengage` action clears the pair. Damage that destroys or immobilises a rig auto-clears its link. Engagement persists across rounds.

**Tech Stack:** Plain ES-module JavaScript (`shared/*.js`), Node's built-in test runner (`node --test`) for shared logic, React + TypeScript client, Vitest for client tests.

**Spec:** `docs/superpowers/specs/2026-07-10-melee-engagement-design.md`

**Test commands:**
- Shared logic: `node --test shared/game-state.test.js` (and `shared/combat.test.js`, `shared/battle-view.test.js`)
- Whole suite: `npm test`

**Key file map:**
- `shared/game-state.js` — state field, helpers, damage hooks, action handlers, ctx wiring
- `shared/combat.js` — ranged penalty, melee auto-engage trigger
- `shared/rules.js` — `ACTIONS.disengage` catalogue entry
- `shared/battle-view.js` — action-list gating + status chip
- `client/src/components/battle/ActionConsole.tsx` — action icon (disengage flows through existing groups)
- `client/src/state/BattleActionsContext.tsx` — optional engage-target picker on Move

---

## Task 1: Engagement state + helper functions

**Files:**
- Modify: `shared/game-state.js` (`ensureRigShape` ~314-335, `makeUnit` ~461-486, add helpers near `applyDamage` ~712, `__test` export ~1514)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add at the end of `shared/game-state.test.js`:

```js
test("setEngagement links both ends symmetrically", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  assert.equal(__test.setEngagement(a, b), true);
  assert.equal(a.engagedWith, 2);
  assert.equal(b.engagedWith, 1);
});

test("setEngagement is one-to-one: refuses if either rig already engaged", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  const c = makeRig(3, "b2", "light", "b", W);
  assert.equal(__test.setEngagement(a, b), true);
  assert.equal(__test.setEngagement(a, c), false); // a already engaged
  assert.equal(c.engagedWith, null);
});

test("clearEngagement clears both ends", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  __test.clearEngagement(room, a);
  assert.equal(a.engagedWith, null);
  assert.equal(b.engagedWith, null);
});

test("maybeEngage refuses friendlies and dead rigs", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const friend = makeRig(2, "a2", "light", "a", W);
  const enemyDead = makeRig(3, "b1", "light", "b", W);
  enemyDead.destroyed = true;
  assert.equal(__test.maybeEngage(null, a, friend), false); // same side
  assert.equal(__test.maybeEngage(null, a, enemyDead), false); // dead
  assert.equal(a.engagedWith, null);
});

test("makeRig and makeUnit default engagedWith to null", () => {
  assert.equal(makeRig(1, "a1", "light", "a", W).engagedWith, null);
  const tank = makeUnit("tank", 2, "t1", "b", { unit: "Tank Cannon" });
  assert.equal(tank.engagedWith, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `__test.setEngagement is not a function`, and `engagedWith` is `undefined` not `null`.

- [ ] **Step 3: Add the state default in `ensureRigShape`**

In `shared/game-state.js`, inside `ensureRigShape`, after the `immobilised` line (~323):

```js
  if (typeof rig.immobilised !== "boolean") rig.immobilised = false;
  if (rig.engagedWith === undefined) rig.engagedWith = null;
```

- [ ] **Step 4: Default `engagedWith` on both factories**

In `makeRig`, in the returned `rig` object literal (after `immobilised: false,` ~426):

```js
    immobilised: false,
    engagedWith: null,
```

In `makeUnit`, in the returned `unit` object literal (after `immobilised: false,` ~477):

```js
    immobilised: false,
    engagedWith: null,
```

- [ ] **Step 5: Add the helper functions**

In `shared/game-state.js`, immediately above `function applyDamage(` (~712):

```js
// Engagement (melee lock, §engagement design). Symmetric one-to-one link between
// two rigs, stored as each rig's `engagedWith` = the other's id. The two helpers
// below are the ONLY way the link changes, so the symmetric invariant holds.
function findRigById(room, id) {
  return room?.rigs?.find((r) => r.id === id) || null;
}
function setEngagement(a, b) {
  if (!a || !b || a === b) return false;
  if (a.engagedWith != null || b.engagedWith != null) return false; // one-to-one
  a.engagedWith = b.id;
  b.engagedWith = a.id;
  return true;
}
function clearEngagement(room, rig) {
  if (!rig || rig.engagedWith == null) return;
  const partner = findRigById(room, rig.engagedWith);
  rig.engagedWith = null;
  if (partner) partner.engagedWith = null;
}
// Enemy-only, both-alive guard around setEngagement (used by the melee and
// move-into triggers). `room` is unused today but kept for signature symmetry.
function maybeEngage(room, a, b) {
  if (!a || !b) return false;
  if ((a.owner || "a") === (b.owner || "a")) return false;
  if (a.destroyed || b.destroyed) return false;
  return setEngagement(a, b);
}
```

- [ ] **Step 6: Export helpers for tests**

In `shared/game-state.js`, extend the `__test` export (~1514):

```js
export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig, setRigSp, ensureRigShape, setEngagement, clearEngagement, maybeEngage };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all five new tests green, existing tests unaffected).

- [ ] **Step 8: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): symmetric engagement state and helpers"
```

---

## Task 2: Auto-clear on kill/immobilise + persist across rounds

**Files:**
- Modify: `shared/game-state.js` (`onRigDamaged` ~730-744)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("destroying an engaged rig clears the link on both ends", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  room.game.started = true;
  __test.setEngagement(a, b);
  // Kill b outright: drop every location to 0, then one more hit to destroy.
  for (const p of ["hull", "arms", "legs", "engine"]) __test.setRigSp(b, p, 0);
  __test.applyDamage(room, b, "hull", 1, { random: () => 0 });
  assert.equal(b.destroyed, true);
  assert.equal(b.engagedWith, null);
  assert.equal(a.engagedWith, null); // partner freed too
});

test("immobilising an engaged rig clears the link", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  __test.setRigSp(b, "legs", 0);            // legs to 0 (first time — not yet immobile)
  __test.applyDamage(room, b, "legs", 1, {}); // additional damage to 0-SP legs → immobilised
  assert.equal(b.immobilised, true);
  assert.equal(b.engagedWith, null);
  assert.equal(a.engagedWith, null);
});

test("engagement survives Recovery (unlike preparation)", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  a.preparation = { type: "brace", faceUp: false };
  __test.runRecovery(room);
  assert.equal(a.preparation, null);   // prep cleared as before
  assert.equal(a.engagedWith, 2);      // engagement persists
  assert.equal(b.engagedWith, 1);
});
```

- [ ] **Step 2: Add `runRecovery` to the `__test` export**

`runRecovery` is module-private; the persistence test needs it. Extend the `__test` export:

```js
export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig, setRigSp, ensureRigShape, setEngagement, clearEngagement, maybeEngage, runRecovery };
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — after destroy/immobilise, `engagedWith` is still set (no clear hook yet). The Recovery test should already PASS (Recovery never touched engagement) — that's fine, it's a guard against regression.

- [ ] **Step 4: Add the auto-clear hook**

In `shared/game-state.js`, in `onRigDamaged`, right before the closing `checkAnnihilation(room);` call (~743):

```js
  // Engagement (§engagement) — a destroyed or immobilised rig can no longer hold
  // the melee lock; free both ends.
  if ((rig.destroyed || rig.immobilised) && rig.engagedWith != null) clearEngagement(room, rig);
  checkAnnihilation(room);
```

Do NOT add any engagement clearing to `runRecovery` — persistence across rounds is intentional.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all three new tests green).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): auto-clear on kill/immobilise, persist across rounds"
```

---

## Task 3: Ranged −2 accuracy while engaged

**Files:**
- Modify: `shared/combat.js` (`computeModifiedAim` ~38-46)
- Modify: `shared/game-state.js` (`resolveFire` ~896-919, pass `engaged`)
- Test: `shared/combat.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js`:

```js
test("computeModifiedAim adds +2 to the target number for an engaged ranged shot", () => {
  const mg = WEAPONS.longRange["Mini Gun"]; // sweet 7, peak 2
  const base = computeModifiedAim(attacker, mg, { distance: 7, cover: 0 });
  const engaged = computeModifiedAim(attacker, mg, { distance: 7, cover: 0, engaged: true });
  assert.equal(engaged, base + 2); // −2 accuracy raises the D6 target by 2
});

test("engaged penalty does not apply to melee weapons", () => {
  const sword = WEAPONS.melee["Sword"];
  const base = computeModifiedAim(attacker, sword, { range: "near", cover: 0 });
  const engaged = computeModifiedAim(attacker, sword, { range: "near", cover: 0, engaged: true });
  assert.equal(engaged, base); // melee unaffected
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `engaged` equals `base` for the ranged case (penalty not wired yet).

- [ ] **Step 3: Add the penalty term in `computeModifiedAim`**

In `shared/combat.js`, replace the body of `computeModifiedAim` (~38-46) with:

```js
export function computeModifiedAim(attacker, profile, opts) {
  const base = AIM[attacker.weightClass] ?? 4;
  const weaponAcc = weaponAccAt(profile, opts.distance);
  const cover = profile.upgradeEffect?.ignoreCover ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  // §engagement — a rig locked in melee fires ranged weapons at −2 accuracy.
  const engagedPenalty = opts.engaged && !profile.melee ? -2 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty;
  return base - accTotal;
}
```

- [ ] **Step 4: Pass `engaged` from `resolveFire`**

In `shared/game-state.js`, in `resolveFire`, add `engaged` to the opts object handed to `resolveAttack` (the object literal at ~905-910). Add the line after `cover: a.cover,`:

```js
  const res = resolveAttack(room, rig, target, {
    weapon: a.weapon, target: a.target, arc: a.arc, range: a.range, distance: a.distance, cover: a.cover,
    engaged: rig.engagedWith != null,
    aimed: act === "aimed", aimedLoc: String(a.loc || "hull").toLowerCase(),
    fullAuto: a.fullAuto === true || a.fullAuto === "true",
    charged: a.charged === true || a.charged === "true",
    dice: a.dice,
  }, random, combatCtx());
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS (both new tests green).

- [ ] **Step 6: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(engagement): -2 ranged accuracy while engaged"
```

---

## Task 4: Melee attack auto-engages attacker and target

**Files:**
- Modify: `shared/combat.js` (`resolveAttack` — determine melee, call `ctx.engage`; ~126-194)
- Modify: `shared/game-state.js` (`combatCtx` — add `engage`; ~883-892)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (uses the existing `startedRoom` / `clearPendingAnswer` helpers):

```js
test("a legal melee attack engages attacker and target", () => {
  const r = startedRoom(); // b's turn
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1, 1], location: 1 },
  } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  assert.equal(b1.engagedWith, a1.id);
  assert.equal(a1.engagedWith, b1.id);
});

test("an out-of-reach melee attack does not engage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "out",
  } });
  assert.equal(findRig(r, "b1").engagedWith, null);
  assert.equal(findRig(r, "a1").engagedWith, null);
});

test("a ranged attack does not engage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", distance: 7,
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1], location: 1 },
  } });
  assert.equal(findRig(r, "b1").engagedWith, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the melee attack leaves `engagedWith` null (no trigger wired).

- [ ] **Step 3: Add `engage` to the combat ctx**

In `shared/game-state.js`, in `combatCtx()`, add an `engage` mutation primitive:

```js
function combatCtx() {
  return {
    applyDamage,
    bumpHeat,
    pushResolution,
    sunderLocation,
    breachHull,
    engage: (room, attacker, target) => maybeEngage(room, attacker, target),
    profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker),
  };
}
```

- [ ] **Step 4: Fire the trigger in `resolveAttack`**

In `shared/combat.js`, in `resolveAttack`, just before the final `return { ok: true, hits: th.hits, location, impacts, heat };` (~193), add:

```js
  // §engagement — a legal melee blow (reached here = not out-of-range, weapon not
  // destroyed) locks attacker and target together. No-op if either is already
  // engaged (one-to-one) or same side.
  const isMelee = slot === "melee" || (slot === "unit" && profile.melee);
  if (isMelee) ctx.engage?.(room, attacker, target);

  return { ok: true, hits: th.hits, location, impacts, heat };
```

Note: `slot` and `profile` are already in scope from the top of `resolveAttack`. `ctx.engage?.` is optional-chained so the lightweight `makeCtx` double in `combat.test.js` (which has no `engage`) keeps working.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all three new tests green).

- [ ] **Step 6: Run the combat suite to confirm no regression**

Run: `node --test shared/combat.test.js`
Expected: PASS (existing `resolveAttack` tests unaffected — `engage` is optional on their ctx).

- [ ] **Step 7: Commit**

```bash
git add shared/combat.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): melee attack auto-engages attacker and target"
```

---

## Task 5: Movement hard lock while engaged

**Files:**
- Modify: `shared/game-state.js` (`performAction` move/sprint branch ~992-999)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("an engaged rig cannot Move or Sprint", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  __test.setEngagement(b1, a1); // lock b1 to a1
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 0);   // move rejected — no slot spent
  assert.equal(b1.engine.heat, heatBefore);   // no heat added
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(r.game.turn.actionsUsed, 0);   // sprint rejected too
});

test("an unengaged rig moves normally", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 1);   // still works when not engaged
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the engaged rig's Move still spends a slot (`actionsUsed` becomes 1).

- [ ] **Step 3: Add the lock to the move/sprint branch**

In `shared/game-state.js`, `performAction`, replace the move/sprint branch (~992-999) with:

```js
  if (act === "move" || act === "sprint") {
    // §engagement — a rig locked in melee is pinned; it must Disengage before it
    // can reposition. (Repositioning while engaged is meaningless without a grid.)
    if (rig.engagedWith != null) return false;
    // Move / Sprint may repeat within an activation; each spends one slot and
    // adds its heat. Sprint costs 2 heat — 1 with Servo Actuators (Mobility).
    const heat = act === "sprint" ? (rig.equipment === "servo-actuators" ? 1 : def.heat) : def.heat;
    t.actionsUsed += 1;
    bumpHeat(rig, heat);
    return true;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (both new tests green).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): hard-lock movement while engaged"
```

---

## Task 6: Disengage action

**Files:**
- Modify: `shared/rules.js` (`ACTIONS` ~9-18)
- Modify: `shared/game-state.js` (`performAction` — add disengage branch after move/sprint ~1000)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("Disengage frees both rigs and costs 1 slot + 1 heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  __test.setEngagement(b1, a1);
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  assert.equal(b1.engagedWith, null);
  assert.equal(a1.engagedWith, null);          // mutual — partner freed
  assert.equal(r.game.turn.actionsUsed, 1);    // one slot
  assert.equal(b1.engine.heat, heatBefore + 1); // +1 heat
});

test("Disengage then Move works in the same activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  __test.setEngagement(b1, findRig(r, "a1"));
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } }); // now unlocked
  assert.equal(r.game.turn.actionsUsed, 2);
});

test("Disengage is a no-op when the rig is not engaged", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  assert.equal(r.game.turn.actionsUsed, 0); // nothing spent
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `disengage` is not a known action, so nothing happens and the "frees both rigs" assertions fail.

- [ ] **Step 3: Add the `disengage` action to the catalogue**

In `shared/rules.js`, add to the `ACTIONS` object (after `prepare`, ~17):

```js
  prepare:  { label: "Prepare",     heat: 1, slot: 1 },
  disengage:{ label: "Disengage",   heat: 1, slot: 1 },
```

- [ ] **Step 4: Handle disengage in `performAction`**

In `shared/game-state.js`, `performAction`, add a new branch immediately AFTER the move/sprint branch (from Task 5) and BEFORE the `if (act === "reload")` block (~1000):

```js
  if (act === "disengage") {
    // §engagement — break the melee lock. The budget/`def` guard above (the
    // `if (!def || t.actionsUsed >= t.actionsMax)` check) already ran, so a slot
    // is available. No-op if the rig isn't actually engaged.
    if (rig.engagedWith == null) return false;
    clearEngagement(room, rig);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "disengage", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} disengages.`, effects: [],
    });
    return true;
  }
```

Note: `def` here is `ACTIONS.disengage` (resolved at the top of `performAction` by `const def = ACTIONS[act]`), so `def.heat` is 1 and the earlier `if (!def || t.actionsUsed >= t.actionsMax) return false;` guard already enforced the budget.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all three new tests green).

- [ ] **Step 6: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): Disengage action clears the lock (1 slot + 1 heat)"
```

---

## Task 7: Move-into engagement declaration

**Files:**
- Modify: `shared/game-state.js` (`performAction` move/sprint branch — read `a.engage`; add `maybeEngageByName` helper)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("Move with an engage declaration forms the pair", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move", engage: "a1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  assert.equal(r.game.turn.actionsUsed, 1); // the move still spends its slot
  assert.equal(b1.engagedWith, a1.id);      // and forms the lock
  assert.equal(a1.engagedWith, b1.id);
});

test("Move engage declaration against a friendly is ignored but the move still happens", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move", engage: "b2" } });
  const b1 = findRig(r, "b1");
  assert.equal(r.game.turn.actionsUsed, 1); // move resolves
  assert.equal(b1.engagedWith, null);       // no engagement (same side)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the first test's `engagedWith` stays null (the `engage` attr is ignored).

- [ ] **Step 3: Add the `maybeEngageByName` helper**

In `shared/game-state.js`, directly below `maybeEngage` (from Task 1):

```js
// Move-into declaration: resolve an engage-target name to a rig and try to
// engage it. Tolerates an unknown/invalid name (returns false, no throw).
function maybeEngageByName(room, rig, name) {
  const target = findRig(room, name);
  return target ? maybeEngage(room, rig, target) : false;
}
```

- [ ] **Step 4: Read `a.engage` in the move/sprint branch**

In `shared/game-state.js`, `performAction`, update the move/sprint branch (from Task 5) to declare engagement after the lock check, before spending the slot:

```js
  if (act === "move" || act === "sprint") {
    // §engagement — a rig locked in melee is pinned; it must Disengage before it
    // can reposition. (Repositioning while engaged is meaningless without a grid.)
    if (rig.engagedWith != null) return false;
    // Optional move-into declaration: the player states they moved into base
    // contact with an enemy, forming the lock. Invalid/friendly names are ignored.
    if (a.engage) maybeEngageByName(room, rig, a.engage);
    const heat = act === "sprint" ? (rig.equipment === "servo-actuators" ? 1 : def.heat) : def.heat;
    t.actionsUsed += 1;
    bumpHeat(rig, heat);
    return true;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (both new tests green).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(engagement): move-into engagement declaration"
```

---

## Task 8: Client — action list gating, status chip, icon, engage picker

**Files:**
- Modify: `shared/battle-view.js` (`availableActions` ~7-52, `rigModifiers` ~64-90)
- Modify: `client/src/state/BattleActionsContext.tsx` (`ACTION_ICONS` ~22-26; `openMove`/`MoveBody` engage picker)
- Test: `shared/battle-view.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/battle-view.test.js` (match the file's existing import/setup style — it already imports `availableActions`, `rigModifiers`, and builds rigs; reuse those. If a helper to build a rig+turn is not present, use the inline objects below):

```js
test("availableActions blocks Move/Sprint and enables Disengage while engaged", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  rig.engagedWith = 2;
  const turn = { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 };
  const list = availableActions(rig, turn);
  const by = (k) => list.find((x) => x.key === k);
  assert.equal(by("move").enabled, false);
  assert.equal(by("sprint").enabled, false);
  assert.equal(by("disengage").enabled, true);
});

test("availableActions enables Move and disables Disengage when not engaged", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  const turn = { actionsMax: 3, actionsUsed: 0, longRangeShots: 0 };
  const list = availableActions(rig, turn);
  const by = (k) => list.find((x) => x.key === k);
  assert.equal(by("move").enabled, true);
  assert.equal(by("disengage").enabled, false);
});

test("rigModifiers surfaces an Engaged chip", () => {
  const rig = makeRig(1, "a1", "light", "a", { lr: "Mini Gun", melee: "Sword" });
  rig.engagedWith = 2;
  assert.ok(rigModifiers(rig).some((m) => m.key === "engaged"));
});
```

Ensure the test file imports `makeRig` from `./game-state.js` (add it to the existing import if absent).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — `disengage` is not in the action list; no `engaged` modifier.

- [ ] **Step 3: Add `disengage` to the action order and gate move/fire**

In `shared/battle-view.js`, extend `ACTION_ORDER` (~7):

```js
const ACTION_ORDER = ["move", "sprint", "disengage", "fire", "aimed", "reload", "repair", "prepare", "shutdown"];
```

Then inside the `.map((key) => { ... })` of `availableActions`, after the existing `fire`/`aimed` block and before `return { key, ... }` (~44), add:

```js
      if ((key === "move" || key === "sprint") && rig.engagedWith != null) {
        enabled = false;
        note = "Engaged — Disengage first";
      }
      if (key === "disengage") {
        enabled = left > 0 && rig.engagedWith != null;
        if (rig.engagedWith == null) note = "Not engaged";
      }
      if ((key === "fire" || key === "aimed") && rig.engagedWith != null && !rangedSpent) {
        note = note ? `${note} · Engaged −2 Aim` : "Engaged — ranged −2 Aim";
      }
```

- [ ] **Step 4: Add the Engaged chip to `rigModifiers`**

In `shared/battle-view.js`, in `rigModifiers`, after the `immobilised` chip (~78):

```js
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit" });
  if (rig.engagedWith != null) mods.push({ key: "engaged", tag: "Engaged", tone: "warn" });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test shared/battle-view.test.js`
Expected: PASS (all three new tests green).

- [ ] **Step 6: Add the Disengage icon**

In `client/src/state/BattleActionsContext.tsx`, add to `ACTION_ICONS` (~22-26):

```js
  reload: "🔄", repair: "🔧", prepare: "🛡️", shutdown: "⏻", disengage: "🔓",
```

The Disengage action flows through the existing `GROUPS` "support" catch-all in `ActionConsole.tsx` and the default `onAction` branch (`sendCommand("action", { name, action: key })`), so no `ActionConsole.tsx` change is required for it to appear and fire.

- [ ] **Step 7: Add an optional engage-target picker to the Move drawer**

In `client/src/state/BattleActionsContext.tsx`, thread an enemy target into the Move flow. Replace `openMove` (~170-191) with:

```jsx
  const openMove = useCallback(
    (rig: Rig, key: string) => {
      const sprint = key === "sprint";
      const enemies = (rigsRef.current || []).filter(
        (r) => !r.destroyed && r.owner !== rig.owner && r.engagedWith == null,
      );
      const state: { engage: string } = { engage: "" };
      openDrawer({
        title: `${iconFor(key)} ${sprint ? "Sprint" : "Move"} — ${rig.name}`,
        tone: "oil",
        dismissable: false,
        render: () => (
          <MoveBody
            rig={rig}
            actionKey={key}
            enemies={enemies}
            onEngageChange={(v) => (state.engage = v)}
            onCancel={() => closeDrawer()}
            onConfirm={() => {
              closeDrawer();
              const attrs: Record<string, unknown> = { name: rig.name, action: key };
              if (state.engage) attrs.engage = state.engage;
              sendCommand("action", attrs);
            }}
          />
        ),
      });
    },
    [openDrawer, closeDrawer, sendCommand],
  );
```

Then extend `MoveBody`'s props and render an optional picker. Update the `MoveBody` signature (~63-70) and add the picker just above the `<div className="dwr-actions">` (~120):

```jsx
function MoveBody({
  rig, actionKey, enemies, onEngageChange, onCancel, onConfirm,
}: {
  rig: Rig;
  actionKey: string;
  enemies: Rig[];
  onEngageChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
```

And, immediately before `<div className="dwr-actions">`:

```jsx
      {enemies.length > 0 && (
        <label className="dwr-engage">
          <span className="dwr-engage-label">Engage an enemy in reach (optional)</span>
          <select
            className="dwr-engage-select"
            defaultValue=""
            onChange={(e) => onEngageChange(e.target.value)}
          >
            <option value="">— none —</option>
            {enemies.map((e) => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </label>
      )}
```

- [ ] **Step 8: Verify the client build/tests still pass**

Run: `npm test`
Expected: PASS — Vitest (client) and `node --test` (shared) both green. The Move drawer now shows an optional "Engage" picker; picking an enemy sends `engage` with the move.

- [ ] **Step 9: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js client/src/state/BattleActionsContext.tsx
git commit -m "feat(engagement): client action gating, Engaged chip, Move engage picker"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — all shared, server, and client tests green.

- [ ] **Step 2: Manual smoke (optional, if a dev server is handy)**

Start the app (`npm run dev`), start a battle, and confirm:
- A melee Fire shows an "Engaged" chip on both rigs afterward.
- The engaged rig's Move/Sprint tile is disabled; Disengage appears under Support.
- Disengaging re-enables movement.
- Firing a ranged weapon while engaged shows the "−2 Aim" note.

- [ ] **Step 3: Final commit (if any smoke-fix was needed)**

```bash
git add -A
git commit -m "chore(engagement): smoke-test fixes"
```

---

## Self-review notes (author checklist — already applied)

- **Spec coverage:** state (T1) · triggers melee (T4) + move-into (T7) · hard lock (T5) · Disengage 1 slot+1 heat (T6) · −2 ranged (T3) · auto-clear kill/immobilise (T2) · persist across rounds (T2) · one-to-one (T1) · client badge/gating/picker (T8). All spec sections mapped.
- **Type/name consistency:** `engagedWith` (id, nullable), `setEngagement(a,b)`, `clearEngagement(room,rig)`, `maybeEngage(room,a,b)`, `maybeEngageByName(room,rig,name)`, `findRigById(room,id)`, `ctx.engage(room,attacker,target)` used identically across tasks.
- **Known minor edge (out of scope):** the `Impale` perk sets `target.immobilised` directly in `combat.js` without routing through `applyDamage`, so that specific immobilise won't auto-clear engagement. Damage-driven immobilise (legs shot to 0) does, which is the spec's "disable engager" case.
