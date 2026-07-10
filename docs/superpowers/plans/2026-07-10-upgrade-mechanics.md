# Upgrade Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the `effect: {}` placeholders left by the [nature-system plan](2026-07-10-upgrade-nature-system.md) — the new Tuned/Prototype mechanics for all eight rigs — one at a time, TDD, each independently shippable.

**Architecture:** Most mechanics extend the existing combat pipeline in `shared/combat.js` (`computeStr`, `rollToHit`, `rollImpacts`, `applyOnHitPerks`) and the round/activation lifecycle in `shared/game-state.js` (`performAction`, `runRecovery`, `ensureRigShape`). New per-rig/per-target state is stored as plain fields on the rig object (persisted with the room). Effects are driven off `profile.upgradeEffect` (already threaded from `effectiveWeaponProfile`).

**Tech Stack:** Node ESM (`shared/*.js`), `node --test`. Some UI surfacing in React later, but the mechanics themselves are engine-only and test in isolation. Work on `main` (AGENTS.md), keep `rules.md` in sync with each new rule.

**Prerequisite:** the nature-system plan is merged (upgrade ids + `upgradeEffect` plumbing exist).

**Readiness legend:** each task is tagged **[ready]** (engine surface known, full code below), **[read-first]** (implementer must read the named function before coding; approach + tests given), or **[deferred-spatial]** (needs a positional model that doesn't exist yet — do not implement; ship the non-spatial part only where noted).

**Reference:** per-rig intent + decided values in `docs/design/<rig-id>.md`; combat surfaces in [shared/combat.js](../../../shared/combat.js).

---

## File Structure

- `shared/combat.js` — STR/ROF/impact hooks for conditional and per-location effects; `applyOnHitPerks` for on-hit statuses.
- `shared/game-state.js` — new rig state fields (in `makeRig` + `ensureRigShape`), lifecycle ticks (`runRecovery`/activation start), the `douse` action, engagement `skewered` flag, stance/cooldown counters.
- `shared/game-state.test.js` / `shared/combat.test.js` — one test per mechanic.
- `rules.md` — a line per new rule.

Order below is by ascending engine risk. Do Group A–C before D–F.

---

## Group A — Conditional STR / ROF (extend `computeStr` / `rollToHit`)

These read the **target** or **attacker** state at resolution. `computeStr(profile, attacker, opts)` and the to-hit path already receive `opts` with `target`/`arc`. Confirm the exact signatures by reading `shared/combat.js` lines ~78–96 (`computeStr`) and ~40–75 (`rollToHit`) before Task A1.

### Task A1: Cold Bore — +3 STR vs an undamaged target **[read-first]**

**Files:** Modify `shared/combat.js` (`computeStr`); Test `shared/combat.test.js`.

- [ ] **Step 1: Failing test**

```javascript
test("Cold Bore adds +3 STR only when the target is at full SP", () => {
  const sniper = makeRig(1, "S", "medium", "a", { longRange: "Sniper Cannon", melee: "Chainsaw", lrUpgrade: "cold-bore" });
  const fresh = makeRig(2, "F", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const hurt = makeRig(3, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  hurt.arms.sp -= 1;
  const p = effectiveWeaponProfile("longRange", "Sniper Cannon", sniper);
  assert.equal(computeStr(p, sniper, { target: fresh }), p.str + 3);
  assert.equal(computeStr(p, sniper, { target: hurt }), p.str);
});
```

- [ ] **Step 2:** Run → FAIL. `node --test shared/combat.test.js`
- [ ] **Step 3:** In `computeStr`, add before the return:

```javascript
  // Cold Bore — +3 STR against a target whose every location is at max SP.
  if (opts.target && profile.upgradeEffect?.coldBore) {
    const undamaged = ["hull", "arms", "legs", "engine"].every(
      (l) => opts.target[l] && opts.target[l].sp >= opts.target[l].max,
    );
    if (undamaged) bonus += 3; // adjust to the local accumulator name in computeStr
  }
```

Set the effect in `game-state.js` `cold-bore`: `effect: { coldBore: true }`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** `rules.md`: note Cold Bore. Commit `feat(sniper): Cold Bore +3 STR vs undamaged`.

### Task A2: Full Tilt — +3 STR if the attacker advanced this activation **[read-first]**

Depends on a per-activation "moved" flag. Check whether one exists: `git grep -n "moved" shared/game-state.js`. If not, set `rig.movedThisActivation = true` in the `move`/`sprint` branch of `performAction`, and clear it at activation start (where `longRangeShots`/`loaded` reset — search `t.longRangeShots = 0`).

- [ ] **Step 1: Failing test** (drive a move then a melee; assert +3). Mirror A1's structure using `full-tilt` on a Lance rig, calling the melee resolution after a `move` action.
- [ ] **Step 2–4:** add the flag set/clear, then in `computeStr`: `if (opts.attacker?.movedThisActivation && profile.upgradeEffect?.charge) bonus += 3;` with `full-tilt` effect `{ charge: 3 }`. (Wrecking Ball `momentum-swing` reuses the same `charge` key with value 2 — generalise: `bonus += profile.upgradeEffect.charge`.)
- [ ] **Step 5:** Commit `feat(lance): Full Tilt charge bonus; generalise charge STR`.

### Task A3: Bloodletter — +1 ROF vs a damaged target **[read-first]**

ROF is consumed in `rollToHit` (number of to-hit dice). Read where `profile.rof` becomes the dice count. Add: if `profile.upgradeEffect?.vsDamaged?.rof` and the target is missing SP anywhere, use `rof + 1`.

- [ ] Test: Chainsaw with `bloodletter`, target with a dinged location → 4 to-hit dice instead of 3; fresh target → 3. Effect `{ vsDamaged: { rof: 1 } }`. Commit `feat(chainsaw): Bloodletter extra hit vs damaged`.

### Task A4: Opportunist — +3 STR vs a disrupted/overheated target **[read-first]**

- [ ] Test: Sword with `opportunist`; target with `actionPenaltyNextActivation > 0` OR `engine.heat > HEAT_CAPACITY[target.weightClass]` → +3, else +0. In `computeStr`:

```javascript
  if (opts.target && profile.upgradeEffect?.vsDisrupted) {
    const cap = HEAT_CAPACITY[opts.target.weightClass];
    const disrupted = (opts.target.actionPenaltyNextActivation || 0) > 0
      || (cap != null && (opts.target.engine?.heat || 0) > cap);
    if (disrupted) bonus += 3;
  }
```

Effect `{ vsDisrupted: true }`. Import `HEAT_CAPACITY` if not already in combat.js. Commit `feat(sword): Opportunist +3 STR vs disrupted`.

---

## Group B — On-hit statuses (extend `applyOnHitPerks`, `shared/combat.js` ~205)

`applyOnHitPerks(room, attacker, target, profile, opts, random, ctx)` runs after hits land and can set target flags + `ctx.bumpHeat`. Read it (lines ~205–244) before this group.

### Task B1: Pinning Burst — 4+ hits ⇒ target loses 1 action **[ready]**

- [ ] Test: Double MG with `pinning-burst`; simulate an attack landing ≥4 hits → target `actionPenaltyNextActivation >= 1`; <4 hits → unchanged.
- [ ] Impl in `applyOnHitPerks`:

```javascript
  if (profile.upgradeEffect?.pinOnHits && opts.hits >= profile.upgradeEffect.pinOnHits) {
    target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    effects.push("Pinning Burst — target loses 1 action");
  }
```

Effect `{ pinOnHits: 4 }`. Confirm `opts.hits` is the landed-hit count in this scope (it is — used by the perk block). Commit.

### Task B2: Burning status + `douse` action (Napalm) **[read-first]**

Burning is a new status shared by Napalm (Tuned) and Conflagration (Prototype). Read `runRecovery` and the activation-start reset in `game-state.js` first.

- [ ] **Data:** in `makeRig` + `ensureRigShape`, add `burning: 0`.
- [ ] **Tick:** at the start of a rig's activation (where per-activation resets happen), if `rig.burning > 0`, `applyDamage(room, rig, <location>, rig.burning, ...)` — pick hull, or a stored `burnLoc`; simplest: hull. Push a resolution line.
- [ ] **Apply:** in `applyOnHitPerks`, `if (profile.upgradeEffect?.burn) target.burning = Math.max(target.burning||0, 1);` Effect for `napalm`: `{ burn: 1 }`.
- [ ] **Douse action:** add a `douse` verb branch in `performAction` (costs one slot): `rig.burning = Math.max(0, rig.burning - douseAmount)` — Napalm clears all (`rig.burning = 0`).
- [ ] Tests: hit sets burning; activation start deals `burning` SP; `douse` clears it. Commit `feat(flamethrower): Burning status + douse (Napalm)`.

### Task B3: Conflagration — stacking Burning + self-heat **[read-first]**

Builds on B2. Effect `{ burn: 1, burnStacks: true, selfHeatPerBurn: 1 }`.
- [ ] Apply: `target.burning = (target.burning||0) + 1` (stacks); `ctx.bumpHeat(attacker, 1)`.
- [ ] Douse (Conflagration case): clears only 1 per action — the `douse` branch subtracts 1 (already the B2 default; Napalm overrides to clear all — gate on whether the *source* was stacking is impossible post-hoc, so make `douse` always subtract the rig's full stack for Napalm-only rigs by storing `rig.burnClearsAll` when Napalm applied, else 1). Simpler decided rule: **douse always removes 1 stack**; Napalm just never stacks past 1, so one douse clears it anyway. Use that — drop the per-source branching.
- [ ] Tests: two hits → burning 2 + attacker heat +2; one douse → burning 1. Commit.

### Task B4: Anvil Boss — riposte the first melee attacker each round **[read-first]**

Reactive: fires when *this rig is the target* of a melee attack while `preparation.type === "raise-shield"`. Read the melee attack entry in `performAction` (the `act === "action"` weapon path, ~940–980) and the reaction reveal path.

- [ ] **Data:** `rig.ripostedThisRound = false`, reset in `runRecovery`.
- [ ] **Hook:** when resolving a melee attack against a defender that has `raise-shield` up and `weaponUpgrades.melee === "anvil-boss"` and `!defender.ripostedThisRound`: resolve one free STR-6 melee hit from defender→attacker, set `ripostedThisRound = true`. Reuse the `return`-prep counter resolution path.
- [ ] Tests: first melee vs a raised Anvil-Boss shield → attacker takes a counter; second same round → no counter. Commit.

### Task B5: Redline Governor — Chainsaw STR/ROF scale with attacker heat over cap **[ready]**

- [ ] In `computeStr`: `const over = Math.max(0, (attacker.engine?.heat||0) - HEAT_CAPACITY[attacker.weightClass]); if (profile.upgradeEffect?.redline) bonus += Math.min(3, over);`
- [ ] In the ROF path: `+ Math.min(3, over)` hits when `redline`. Effect `{ redline: true }`.
- [ ] Tests: attacker at +2 over cap → +2 STR/+2 hits (capped 3). Commit.

### Task B6: Superconductor Edge — heat transfer while running hot **[read-first]**

- [ ] In `computeStr`: `if (profile.upgradeEffect?.superconductor && (attacker.engine.heat > HEAT_CAPACITY[attacker.weightClass]/2)) bonus += 2;`
- [ ] In `applyOnHitPerks`: same gate → `ctx.bumpHeat(attacker, -1); ctx.bumpHeat(target, 1);` per hit (or once per attack — decide once; per-attack is simpler and safer). Effect `{ superconductor: true }`.
- [ ] Tests: over half cap → +2 STR and 1 heat moved attacker→target; under half → nothing. Commit.

---

## Group C — Cadence / cooldown / lock (per-rig counters)

Add counters in `makeRig`/`ensureRigShape`; increment/reset in the attack + activation lifecycle.

### Task C1: Penetrator Rounds — every 3rd Autocannon attack ignores armour **[read-first]**

- [ ] **Data:** `rig.autocannonShots = 0`, `rig.autocannonSlowNext = false`.
- [ ] **Hook (impact):** in `rollImpacts`, if the firing profile has `penetrator` and this is the 3rd shot (attacker counter % 3 === 0), force each hit to `severe` (2 SP) bypassing the armour row. Increment the counter per Autocannon attack; if the penetrator fired, set `autocannonSlowNext = true`.
- [ ] **Downside:** in the ROF path, if `autocannonSlowNext`, halve ROF and clear the flag (consumed next turn). Effect `{ penetrator: true }`.
- [ ] Tests: 3rd attack ignores armour; the following attack has halved ROF. Commit.

### Task C2: Suppression Lock — consecutive Mini Gun fire ramps to a pin **[read-first]**

- [ ] **Data:** `rig.suppressTarget = null`, `rig.suppressStacks = 0`.
- [ ] On a Mini Gun attack with `suppressLock`: if same target as `suppressTarget`, `suppressStacks = min(3, +1)`, else reset to 1 and set target. Apply by stack: 1 → `target.speedHalvedNextRound = true`; 2 → `target.actionPenaltyNextActivation = max(.,1)`; 3 → `target.immobilised = true` + block Prepare (set a `noPrepNextActivation` flag the prep branch checks). `ctx.bumpHeat(attacker, 1)` while locked. Effect `{ suppressLock: true }`.
- [ ] Tests: 3 consecutive same-target attacks escalate speed→action→immobilise; switching target resets. Commit.

### Task C3: Ion Storm — EMP lockout + self-cost **[read-first]**

- [ ] On an Arc Gun attack with `ionStorm`: set on target `actionPenaltyNextActivation = max(.,1)`, `noPrepNextActivation = true`, `noActivesNextActivation = true` (new flag checked by the equipment-active branch), and a heat spike (`ctx.bumpHeat(target, 2)`). Self: `ctx.bumpHeat(attacker, 3)` and set `attacker.arcLockedNext = true` (the Arc Gun attack path refuses to fire when set, then clears it). Effect `{ ionStorm: true }`.
- [ ] Tests: target loses action + can't prep/active next activation; attacker gains 3 heat and can't fire the Arc Gun next turn. Commit.

### Task C4: Fire Control Lock — paint then unmissable AP volley **[read-first]**

- [ ] **Data:** `rig.lockedTarget = null`, `rig.lockExpiresRound = 0`.
- [ ] New `lock` sub-action (or a flag on the attack command) sets `lockedTarget = <id>`, `lockExpiresRound = round + 1`. Next activation, a Missile Barrage attack vs `lockedTarget` auto-hits (skip to-hit) and gains Armour Piercing; clear the lock after. Expire if `round > lockExpiresRound`. Effect `{ fireControl: true }`.
- [ ] Tests: locked volley can't miss + AP; unused lock expires. Commit.

---

## Group D — Engagement

### Task D1: Skewer — Disengage from a Lance pin provokes a free hit **[read-first]**

Read the `disengage` branch (`performAction` ~1101) and `setEngagement`/`clearEngagement` (~765).

- [ ] **Data:** store `rig.skeweredBy = null` on the pinned rig (set when a `skewer`-upgraded Lance lands a damaging hit and engagement forms/exists).
- [ ] **Hook:** in the `disengage` branch, before `clearEngagement`, if the disengaging rig has `skeweredBy` pointing at its partner, resolve a free STR-11 Lance hit from the skewerer, then clear `skeweredBy`. Reuse the `return` counter resolution.
- [ ] Tests: Disengaging from a Skewer takes a lance hit; a normal engagement Disengages free. Commit `feat(lance): Skewer punishes Disengage`.

---

## Group E — Per-location tracking (extend `rollImpacts`)

### Task E1: Breach Grip — Claw cracks a location (+2 impact from anyone) **[read-first]**

Read `rollImpacts` (~99–175) — where `braced`/`hardened`/`shieldBlunt` adjust the impact total.

- [ ] **Data:** `rig.cracked = {}` (location → expiry round). Set on a damaging Claw hit with `breachGrip`.
- [ ] **Hook:** in `rollImpacts`, `+2` to the total when `target.cracked?.[location] >= room.game.round`.
- [ ] **Expire:** clear entries past their round in `runRecovery`.
- [ ] Tests: after a Breach Grip hit, any attacker's hit vs that location gets +2; expires after 2 rounds. Commit.

### Task E2: Kneecapper — limbs-only fire, any arc, progressive cripple **[read-first]**

Depends on Raking Fire (already wired) + arc/location logic. Read `arcBonus` (~85) and the location roll in `rollImpacts`/`performAction`.

- [ ] **Behaviour:** when the Double MG has `kneecapper`, its attacks may only target `arms`/`legs` (aimed), and against those limbs the Raking-Fire front auto-fail is bypassed (front-arc limb hits resolve); hull/engine are never valid targets.
- [ ] **Cripple ramp:** track nothing extra — read the limb's live SP vs max: at `sp <= max/2` apply the functional debuff (legs → `speedHalvedNextRound`/`immobilised`; arm → add to `weaponsDestroyed` or a `weaponsSuppressed` list); at 0 the existing destruction handles the rest.
- [ ] Tests: front-arc limb hit lands (vs auto-fail without the upgrade); hull can't be targeted; a leg at ≤half halves speed. Commit. **Note:** larger — split into two commits (targeting rule, then cripple ramp) if it grows.

### Task E3: Dismember — Sunder-grind a location to a permanent cripple **[read-first]**

Builds on the existing `sunder` (`ctx.sunderLocation`, reduces max SP). Read `sunderLocation` in `game-state.js`.

- [ ] **Behaviour:** with `dismember` on the Circular Saw, when a location's `max` has been ground to ≤ half its **original** max (store `origMax` per location in `makeRig`), mark it `crippled`: legs → immobilise; arm → weapon dead (`weaponsDestroyed`); hull/engine → set `noRepair` flag the Repair action checks.
- [ ] **Data:** add `origMax` per location in `makeRig`/`ensureRigShape`.
- [ ] Tests: grinding a location's max to half cripples it appropriately; Repair refuses a `noRepair` location. Commit.

---

## Group F — Stance / momentum (largest; read the whole action loop first)

### Task F1: Emplacement — rooted permanent-shield stance **[read-first]**

- [ ] **Data:** `rig.emplaced = false`, `rig.emplaceCooldownUntil = 0`.
- [ ] **Enter/exit actions:** an `emplace` action (allowed only if `round >= emplaceCooldownUntil` and the rig has the upgrade) sets `emplaced = true`, `emplaceCooldownUntil = round + 3`. An `unplant` action sets `emplaced = false` and `ctx.bumpHeat(rig, 2)`.
- [ ] **While emplaced:** (a) auto-set `preparation` to `raise-shield` each activation without spending Prepare; (b) action budget 3→2 (adjust the budget helper in `battle-view.js`/`performAction`); (c) block the `move`/`sprint` branch.
- [ ] Tests: emplace grants a standing shield + 2 actions + can't move; unplant costs 2 heat; can't re-emplace for 3 rounds. Commit. **Large — expect 3–4 commits.**

### Task F2: Piledriver Protocol — Momentum charge (non-spatial part) **[read-first]**

- [ ] **Data:** `rig.momentum = 0`.
- [ ] **Build:** +1 on any activation the rig advanced (cap 3); block `raise-shield` prep while `momentum > 0`.
- [ ] **Spend:** a Siege Maul shot with `piledriver` consumes all momentum → +momentum STR and ignores the target's Brace + cover (guard-break — see Group G note; the *shove* is deferred-spatial). Effect `{ piledriver: true }`.
- [ ] Tests: advancing builds momentum; can't raise shield while charged; the shot adds momentum STR and ignores Brace. Commit. Ship the **shove** later with the spatial group.

---

## Group G — Deferred (spatial — no positional model yet) **[deferred-spatial]**

Do **not** implement until a grid/positional layer exists (AGENTS.md "no battlefield mechanics"). The user grandfathered these designs; resolve by narration/manual play until then. Tracked so they aren't forgotten:

- **Barrage** (Mortar): 3″ shelled zone for 2 rounds.
- **Enfilade** (Sniper): every 3rd aimed shot ricochets to a rig in LoS of the struck target.
- **Tow Chain** (Wrecking Ball): fling a rig 4″.
- **Momentum Swing** knockback (3″) — ship the +2 STR charge now (Task A2), knockback later.
- **Piledriver** shove (3″) — ship guard-break + STR now (Task F2), shove later.
- **Emplacement** objective-lock nuance — the stance ships (F1); "contests objectives harder" waits on objective positioning.

When the positional model lands, write a follow-up plan for these six.

---

## Self-review checklist (run after implementing)

- **Coverage:** every 🔧 upgrade from the SPEC has a task: Cold Bore, Full Tilt, Bloodletter, Opportunist (A); Pinning Burst, Burning/Napalm, Conflagration, Anvil Boss, Redline, Superconductor (B); Penetrator, Suppression Lock, Ion Storm, Fire Control (C); Skewer (D); Breach Grip, Kneecapper, Dismember (E); Emplacement, Piledriver (F); spatial six deferred (G). ✅
- **Effect keys:** each task names the exact `effect: { … }` key it reads; update the corresponding `WEAPON_UPGRADES` entry (placeholder `{}` from the nature-system plan) in the same commit.
- **State fields:** every new rig field (`burning`, `momentum`, `emplaced`, `cracked`, `origMax`, `suppressStacks`, counters, cooldowns) must be initialised in BOTH `makeRig` and `ensureRigShape`, and reset where appropriate in `runRecovery`/activation start — verify none is left undefined on a legacy rig.
- **Placeholders:** the `[read-first]` tasks intentionally require reading a named function before coding (the code depends on local accumulator/variable names). That's a real instruction, not a gap — each still ships full test assertions and the effect shape.

## Handoff note

Recommend implementing Groups A–C first (each is a small, safe, independently valuable upgrade), then D–F (the tracked/stateful ones, one commit per sub-step), and leaving G until a positional model exists. After each group, playtest to sanity-check the 2× SP / 10-round pacing.
