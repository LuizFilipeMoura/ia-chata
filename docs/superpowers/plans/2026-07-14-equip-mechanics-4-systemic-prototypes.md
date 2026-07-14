# Equipment Mechanics — Plan 4: Group 4 Systemic / Spatial Prototypes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the two Group-4 equipment Prototypes — **Grapnel Launcher** (servo-actuators) and **Reactor Overdrive** (overclock-core) — into the engine, replacing their inert `effect: {}` catalog rows with real tags and real behavior.

**Architecture:** Both ride an existing equipment active. Grapnel Launcher **replaces** the Jump Jets active for the rig that carries it: the `jumpjets` action key still routes, but when `equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade).grapnelLauncher` is truthy it resolves as a grapnel (spatial → narrated instruction) instead — ignoring the engagement guard that normally grounds Jump Jets, rooting the rig for the rest of the activation (reusing the `towedThisActivation` root), and arming a 3-round cooldown tracked in `rig.equipState.grapnelCooldown` (Plan 0 field) that ticks down in Recovery via the `refreshEquipState` hook (Plan 0). Reactor Overdrive rides the Overclock active: when a rig carrying it Overclocks, it sets a per-activation `rig.reactorOverdriveActive` flag that `combat.js` `computeStr` reads for **+2 STR to all attacks** and that `endActivation` reads to **double this activation's overheat bonus** (`m.bonus × 2`), then clears the flag at activation end.

**Tech Stack:** Node ESM modules, `node:test` + `node:assert` (run with `node --test`).

**Depends on Plan 0 (must be merged first):**
- `EQUIPMENT_UPGRADES` and `equipmentUpgradeEffectOf(equipmentId, upgradeId)` live in `shared/rules.js`; `game-state.js` re-exports both and already calls `equipmentUpgradeEffectOf` in `rigEffects`/`heatModel`, so the symbol is in scope in `game-state.js`. `combat.js` already imports `equipmentUpgradeEffectOf` from `rules.js` (Plan 0, Task 3).
- `rig.equipState` exists with `grapnelCooldown: 0`, initialised in `makeRig` (`freshEquipState()`) and backfilled in `ensureRigShape`.
- `refreshEquipState(rig)` is called from `runRecovery`'s per-rig loop (Plan 0, Task 5) and is the seam Group 4 extends with the cooldown tick.

**Pinned facts about seams (read the real code before editing):**
- Equipment-active branch: `shared/game-state.js:2216-2266`. `EQUIPMENT_ACTIVE_BY_KEY["jumpjets"] === "servo-actuators"`; `["overclock"] === "overclock-core"`. `reject`, `pushResolution`, `bumpHeat`, `equipmentActiveHeat`, `maybeEngageByName`, `clearEngagement`, `t` (the turn object) are all in scope there.
- The Jump Jets guards that grapnel must bypass: `game-state.js:2220-2226` (engaged / suppressed / emplaced). The EMP lockout `noActivesNextActivation` (2230) and the carry/budget guards (2231-2232) still apply to grapnel.
- Overclock branch: `game-state.js:2236` (`else if (act === "overclock") t.actionsMax += 2;`).
- Overheat roll: `game-state.js:1889-1903`; `const m = heatMeter(rig)` then `total = roll + m.bonus`. `heatMeter` returns `.bonus` = `min(MAX_OVERHEAT_BONUS, 2*over)` (`game-state.js:1203`).
- Per-activation flag clears: `game-state.js:1919-1933` (where `towedThisActivation`, `lockSightNext`, etc. reset).
- STR seam: `shared/combat.js:152-221` `computeStr(attacker, profile, opts)` — reads the **attacker rig** directly, so a rig-level flag is legal here. `combat.js` may import only from `rules.js`; `reactorOverdriveActive` is a plain rig flag, no new import.
- Spatial convention: `AGENTS.md:62` — resolve the positional part as a clear player-facing instruction in the resolution log; track only the non-spatial state (cooldown, engagement lock).
- Test helpers in `shared/game-state.test.js`: `readyThreeAndThree(r, { a1: "<equipment-id>" })` (2257), `activate(r, name)` (2270), `applyCommand`, `findRig`, `createRoom`, `__test.runRecovery(r)` (re-exported at 3441), `__test.setEngagement`. Equipment upgrade is set post-activation on the rig directly, e.g. `rig.equipmentUpgrade = "grapnel-launcher"` (mirrors the Twin Radiators test at 2362).

---

### Task 1: Grapnel Launcher — replace Jump Jets, root + cooldown, narrated instruction

**Files:**
- Modify: `shared/rules.js` — the `servo-actuators` block in `EQUIPMENT_UPGRADES` (relocated here by Plan 0), row `id: "grapnel-launcher"`: swap `effect: {}` (+ drop the `TODO(mechanics)` marker) for `effect: { grapnelLauncher: true }`.
- Modify: `shared/game-state.js:2216-2266` — intercept `jumpjets` as a grapnel when the upgrade is present, at the top of the `if (equipId) {` block.
- Modify: `shared/game-state.js` `refreshEquipState` (Plan 0 hook) — add the cooldown tick.
- Test: `shared/game-state.test.js` (add after the Servo Actuators tests, ~2429).

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("Grapnel Launcher: jumpjets breaks a melee lock, roots, arms cooldown, +2 heat, narrates", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  const a1 = findRig(r, "a1");
  const b1 = findRig(r, "b1");
  a1.equipmentUpgrade = "grapnel-launcher";        // the servo-actuators Prototype
  __test.setEngagement(a1, b1);                    // a1 pinned in a melee lock
  assert.equal(a1.engagedWith, b1.id);
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets" } });
  assert.equal(a1.engagedWith, null);              // grapnel yank broke the lock
  assert.equal(a1.towedThisActivation, true);      // rooted rest of activation
  assert.equal(a1.equipState.grapnelCooldown, 3);  // 3-round cooldown armed
  assert.equal(a1.engine.heat, 2);                 // +2 heat
  const last = r.game.resolutions.at(-1);
  const text = `${last.summary} ${last.effects.join(" ")}`;
  assert.match(text, /4"/);                         // spatial instruction narrated
});

test("Grapnel Launcher: reel mode engages the named enemy", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  const a1 = findRig(r, "a1");
  const b1 = findRig(r, "b1");
  a1.equipmentUpgrade = "grapnel-launcher";
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets", mode: "reel", engage: "b1" } });
  assert.equal(a1.engagedWith, b1.id);             // reeled into contact + engaged
  assert.equal(a1.equipState.grapnelCooldown, 3);
});

test("Grapnel Launcher: cooldown blocks reuse and no move follows the root", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  const a1 = findRig(r, "a1");
  a1.equipmentUpgrade = "grapnel-launcher";
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets" } });
  const heatAfterFire = a1.engine.heat;
  const usedAfterFire = r.game.turn.actionsUsed;
  // Second grapnel this game is on cooldown -> refused, no heat, no slot spent.
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets" } });
  assert.equal(a1.engine.heat, heatAfterFire);
  assert.equal(r.game.turn.actionsUsed, usedAfterFire);
  // And the root blocks a follow-up Move (towedThisActivation guard).
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, usedAfterFire);
});

test("Grapnel Launcher: cooldown ticks down each Recovery", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  const a1 = findRig(r, "a1");
  a1.equipmentUpgrade = "grapnel-launcher";
  a1.equipState.grapnelCooldown = 3;
  __test.runRecovery(r);
  assert.equal(a1.equipState.grapnelCooldown, 2);  // one tick per round
  __test.runRecovery(r);
  __test.runRecovery(r);
  assert.equal(a1.equipState.grapnelCooldown, 0);  // floors at 0, never negative
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the `jumpjets` action still fires plain Jump Jets: it rejects while engaged (so `engagedWith` stays set), never sets `grapnelCooldown`, and `refreshEquipState` has no grapnel branch so the cooldown never ticks.

- [ ] **Step 3: Implement**

In `shared/rules.js`, the `servo-actuators` block of `EQUIPMENT_UPGRADES`, change the grapnel row:

```js
{ id: "grapnel-launcher", nature: "prototype", name: "Grapnel Launcher", tag: "Yank free of a lock or reel an enemy in — heat + cooldown", catch: "Heat and a cooldown", effect: { grapnelLauncher: true } },
```

In `shared/game-state.js`, at the very top of the `if (equipId) {` block (immediately after `const equipId = EQUIPMENT_ACTIVE_BY_KEY[act];` / `if (equipId) {`, before the Jump Jets guards at 2218), intercept the grapnel:

```js
// Grapnel Launcher (§13, Servo Actuators Prototype) — REPLACES Jump Jets for a
// rig carrying it. Unlike Jump Jets it ignores engagement (the grapnel yanks
// the rig free of a melee lock), so it bypasses the movement guards below. It
// still honours the EMP lockout, the carry check, and the action budget.
// Spatial → narrated instruction; the engine tracks only the cooldown and the
// engagement-lock change.
if (act === "jumpjets" && equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.grapnelLauncher) {
  if (rig.noActivesNextActivation) return reject("This unit's equipment is offline this activation (EMP).");
  if (rig.equipment !== equipId) return reject("This unit isn't carrying that equipment.");
  if (rig.equipState.grapnelCooldown > 0) return reject(`Grapnel is recharging — ${rig.equipState.grapnelCooldown} round(s) left.`);
  if (t.actionsUsed >= t.actionsMax) return reject("No actions left this activation.");
  t.actionsUsed += 1;
  const reel = a.mode === "reel";
  if (reel) {
    // Reel an enemy into base contact and form the lock. Invalid/friendly names
    // are ignored by maybeEngageByName (no throw), the shot still resolves.
    if (a.engage) maybeEngageByName(room, rig, a.engage);
  } else if (rig.engagedWith != null) {
    // Yank self free — break the melee lock the rig is pinned in.
    clearEngagement(room, rig);
  }
  rig.towedThisActivation = true;                 // rooted: no Move/Sprint after (reuses the tow root)
  rig.equipState.grapnelCooldown = 3;             // 3-round cooldown, ticked in Recovery
  bumpHeat(rig, equipmentActiveHeat(equipId, rig.equipmentUpgrade)); // +2 heat (Jump Jets base)
  pushResolution(room, {
    kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
    summary: `${rig.name} fires the Grapnel Launcher.`,
    effects: [reel
      ? `Reel the target into base contact and engage it — move the minis (up to 4").`
      : `Yank ${rig.name} up to 4" (ignore terrain and any melee lock) — move the mini.`],
  });
  return true;
}
```

In `refreshEquipState(rig)` (the Plan 0 hook), add the tick inside the `if (!s) return;` guard:

```js
// Grapnel Launcher (§13) — 3-round cooldown counts down one per Recovery.
if (s.grapnelCooldown > 0) s.grapnelCooldown -= 1;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — including the existing "jumpjets costs 1 slot + 2 heat for Servo Actuators" test (2423), which has no grapnel upgrade so it still takes the plain Jump Jets path.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): wire Grapnel Launcher — replaces Jump Jets, roots + 3-round cooldown, narrated"
```

---

### Task 2: Reactor Overdrive — +2 STR on Overclock, doubled overheat bonus

**Files:**
- Modify: `shared/rules.js` — the `overclock-core` block in `EQUIPMENT_UPGRADES`, row `id: "reactor-overdrive"`: swap `effect: {}` (+ drop the `TODO(mechanics)` marker) for `effect: { reactorOverdrive: true }`.
- Modify: `shared/game-state.js:2236` — the `overclock` branch sets `rig.reactorOverdriveActive` when the upgrade is present.
- Modify: `shared/game-state.js:1889-1903` — `endActivation` doubles `m.bonus` when the flag is set; `1919-1933` — clear the flag at activation end.
- Modify: `shared/game-state.js` `makeRig` rig literal + `ensureRigShape` — init/backfill `reactorOverdriveActive: false` (mirrors `overclockCoreUsed`).
- Modify: `shared/combat.js:152-221` — `computeStr` adds +2 STR when `attacker.reactorOverdriveActive`.
- Test: `shared/game-state.test.js` (add after the Overclock test, ~2410) and `shared/combat.test.js`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("Reactor Overdrive: Overclock arms the +2 STR flag (only with the upgrade)", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "overclock-core" });
  const a1 = findRig(r, "a1");
  a1.equipmentUpgrade = "reactor-overdrive";
  activate(r, "a1");
  assert.equal(a1.reactorOverdriveActive, false);
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "overclock" } });
  assert.equal(r.game.turn.actionsMax >= 2, true); // still grants the +2 actions
  assert.equal(a1.reactorOverdriveActive, true);
});

test("Reactor Overdrive: this activation's overheat bonus is doubled, then the flag clears", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "overclock-core" });
  const a1 = findRig(r, "a1");
  a1.equipmentUpgrade = "reactor-overdrive";
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "overclock" } });
  a1.engine.heat = 7; // Medium cap 5 -> 2 over -> base bonus +4, doubled to +8
  // D12 roll 3 -> total = 3 + 8 = 11; the summary records the doubled bonus.
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1", dice: { overheat: 3 } } });
  const last = r.game.resolutions.at(-1);
  assert.equal(last.kind, "overheat");
  assert.match(last.summary, /D12 3\+8=11/);       // doubled: +8, not the base +4
  assert.equal(a1.reactorOverdriveActive, false);  // per-activation flag cleared
});

test("Overclock without Reactor Overdrive leaves the overheat bonus untouched", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "overclock-core" });
  const a1 = findRig(r, "a1");
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "overclock" } });
  assert.equal(a1.reactorOverdriveActive, false);
  a1.engine.heat = 7; // 2 over -> base bonus +4, NOT doubled
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1", dice: { overheat: 3 } } });
  assert.match(r.game.resolutions.at(-1).summary, /D12 3\+4=7/);
});
```

Add to `shared/combat.test.js` (import `computeStr` if not already imported):

```js
test("Reactor Overdrive: computeStr adds +2 STR to every attack while active", () => {
  const profile = { str: 6, sweet: 0 };
  const base = { weightClass: "medium" };
  const overdriven = { weightClass: "medium", reactorOverdriveActive: true };
  const plain = computeStr(base, profile, {});
  const boosted = computeStr(overdriven, profile, {});
  assert.equal(boosted, plain + 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: FAIL — `overclock` never sets `reactorOverdriveActive` (undefined ≠ false / true), `endActivation` uses the raw `m.bonus` (`+4`, not `+8`), and `computeStr` has no overdrive branch (`boosted === plain`).

- [ ] **Step 3: Implement**

In `shared/rules.js`, the `overclock-core` block of `EQUIPMENT_UPGRADES`, change the reactor row:

```js
{ id: "reactor-overdrive", nature: "prototype", name: "Reactor Overdrive", tag: "Overclock also +2 STR — but overheat bonus doubles", catch: "Overheat bonus doubles", effect: { reactorOverdrive: true } },
```

In `shared/game-state.js`:

- `makeRig` rig literal (near the `overclockCoreUsed: false,` field, ~994) add: `reactorOverdriveActive: false,`
- `ensureRigShape` (near the `overclockCoreUsed` backfill, ~792) add:
  `if (typeof rig.reactorOverdriveActive !== "boolean") rig.reactorOverdriveActive = false;`
- The `overclock` branch (2236) becomes:

```js
else if (act === "overclock") {
  t.actionsMax += 2;
  // Reactor Overdrive (§13, Power Prototype) — Overclocking also arms +2 STR to
  // every attack this activation (read in combat.js computeStr) at the cost of a
  // doubled overheat bonus this activation (endActivation). All-in push.
  if (equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.reactorOverdrive) rig.reactorOverdriveActive = true;
}
```

- `endActivation` overheat block (1890-1901) — compute the bonus once with the doubling, and use it in both the total and the narration:

```js
const m = heatMeter(rig);
if (m.over > 0) {
  const roll = rollD(12, dice?.overheat, random);
  // Reactor Overdrive (§13) — this activation's overheat bonus is doubled.
  const bonus = rig.reactorOverdriveActive ? m.bonus * 2 : m.bonus;
  const total = roll + bonus;
  const row = applyOverheat(room, rig, total, { random });
  pushResolution(room, {
    kind: "overheat", actor: rig.owner, rigId: rig.id,
    heatKey: row.key,
    rolls: [{ sides: 12, value: roll, label: "D12" }],
    summary: `${rig.name}: ${row.label} (D12 ${roll}+${bonus}=${total})`,
    effects: [row.text],
  });
  checkAnnihilation(room);
}
```

- In the per-activation flag-clear block (1919-1933, beside `rig.lockSightNext = false;`) add:

```js
rig.reactorOverdriveActive = false; // Reactor Overdrive (§13) — the STR boost + doubled overheat is scoped to this one activation
```

In `shared/combat.js`, inside `computeStr` (after the `let bonus = 0;` at 160, alongside the other conditional bonuses), add:

```js
// Reactor Overdrive (§13, Power Prototype) — +2 STR to every attack while the
// Overclock-armed flag rides this activation (set in game-state.js's overclock
// branch, cleared at activation end).
if (attacker.reactorOverdriveActive) bonus += 2;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS — including the existing "overclock grants +2 actions" test (2404), which has no reactor upgrade so the flag stays false and the overheat bonus is untouched.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/combat.js shared/game-state.test.js shared/combat.test.js
git commit -m "feat(v2): wire Reactor Overdrive — Overclock +2 STR, doubled overheat bonus"
```

---

### Task 3: Prototype-cap regression for the wired Group-4 rows

**Files:**
- Test: `shared/game-state.test.js` (add beside the existing "countPrototypes counts an equipment Prototype" test, ~261).

Both new rows keep `nature: "prototype"`, so `countPrototypes` (which routes equipment through `equipmentUpgradeNature`, itself reading the relocated catalog) must still count each against the one-Prototype-per-rig cap. Wiring the `effect` tag must not change the nature. This is a pure regression test — no implementation step.

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("countPrototypes still counts the wired Group-4 equipment Prototypes", () => {
  // Each wired Prototype counts as one on its own.
  assert.equal(countPrototypes(
    { longRange: "Autocannon", melee: "Claw" }, { longRange: "field", melee: "field" },
    "servo-actuators", "grapnel-launcher"), 1);
  assert.equal(countPrototypes(
    { longRange: "Autocannon", melee: "Claw" }, { longRange: "field", melee: "field" },
    "overclock-core", "reactor-overdrive"), 1);
  // Stacked with a weapon Prototype it trips the one-per-rig cap (2 > 1).
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" }, { longRange: "pinning-bolt", melee: "honed-talons" },
    "servo-actuators", "grapnel-launcher"), 2);
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" }, { longRange: "pinning-bolt", melee: "honed-talons" },
    "overclock-core", "reactor-overdrive"), 2);
  // Sanity: the nature tag survived the effect wiring.
  assert.equal(equipmentUpgradeNature("servo-actuators", "grapnel-launcher"), "prototype");
  assert.equal(equipmentUpgradeNature("overclock-core", "reactor-overdrive"), "prototype");
});
```

(If a bare `"field"` upgrade id is rejected by `upgradeNature`, use each weapon's real Field id instead — the intent is only that the weapon picks contribute no Prototype. Check `WEAPON_UPGRADES` for Autocannon/Claw Field ids and substitute.)

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS immediately once Tasks 1-2 have wired the rows (the nature was never touched, so the count is already correct). If run **before** Tasks 1-2 it also passes — the inert rows are already `nature: "prototype"`. This task locks the invariant so a future rebalance can't silently drop a Prototype below the cap.

- [ ] **Step 3: Implement**

No implementation — regression test only.

- [ ] **Step 4: Run the full shared suite**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.test.js
git commit -m "feat(v2): regression — Group-4 equipment Prototypes still count against the cap"
```

---

## Self-review notes

- `grep -rn "TODO(mechanics)" shared/rules.js` must no longer show the `grapnel-launcher` or `reactor-overdrive` rows after this plan; the two remaining Group-1/2/3 rows (if their plans haven't merged) still carry theirs.
- Grapnel is **spatial**: the engine tracks only the cooldown and the engagement-lock change (break on yank / form on reel); the 4" movement and target choice are narrated for the player to enact, per `AGENTS.md:62`. Do **not** add coordinate math.
- Grapnel reuses `towedThisActivation` as the root rather than introducing a new flag — the Move/Sprint guard at `game-state.js:2394` already reads it, and it clears at activation end (1921), so no new clear site is needed.
- Reactor Overdrive doubles `m.bonus` **after** `heatMeter`'s `MAX_OVERHEAT_BONUS` cap (the doubling is the whole point of the gamble — it can exceed the normal cap). If a later balance pass wants the doubled value re-clamped, that is a deliberate follow-up, not this plan.
- `combat.js` gains no new import — `reactorOverdriveActive` is a plain rig flag read off `attacker`, so the `rules.js`-only import rule (combat.js header) holds.
- Fill the `rules.md` §15 "Tuned / Prototype Equipment Mechanics" subsection for Grapnel Launcher + Reactor Overdrive as part of this group's ship, same cadence as the weapon-Prototype rollout.
