# Equipment Mechanics — Plan 1: Group 1 — Simple Conditional Tuned Upgrades

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the five Group-1 Tuned equipment upgrades — Predictive Tracking, Kickstart Pistons, Backdraft, Battlefield Triage, Coolant Injection — so each fires its approved effect from a condition already present in state. No new tracked-state fields; every read is a target flag, a heat value, or a per-activation flag that already exists (or is a one-line addition cleared in `endActivation`).

**Architecture:** Runs **after Plan 0**, which relocated `EQUIPMENT_UPGRADES` into `shared/rules.js` and added `equipmentUpgradeEffectOf(equipmentId, upgradeId)` as the single, live, id-derived effect lookup. Each mechanic (a) replaces that row's stub `effect: {}` (`+ TODO(mechanics)`) in `rules.js` with a real camelCase flag tag matching the weapon-upgrade style (e.g. `effect: { predictiveTracking: true }`), then (b) reads the tag at its engine seam via `equipmentUpgradeEffectOf`. `combat.js` imports **only** `rules.js` (import-cycle rule, `combat.js:1-6`), so its two mechanics (Predictive Tracking in `computeModifiedAim`, Kickstart Pistons in `computeStr`) read the tag through the `equipmentUpgradeEffectOf` already imported by Plan 0 Task 3. The three `game-state.js` mechanics (Backdraft, Battlefield Triage, Coolant Injection) call `equipmentUpgradeEffectOf` too — Plan 0 Task 2 added it to the `import { … } from "./rules.js"` destructure at `game-state.js:1` for `heatModel`; if it is not there, add it.

**Tech Stack:** Node ESM modules, `node:test` + `node:assert/strict`. Tests run with `node --test shared/<file>.test.js`.

**Effect-tag names introduced (camelCase, boolean flags — the shape weapon upgrades already use):**

| Row id | Equipment | New `effect` |
|---|---|---|
| `predictive-tracking` | `targeting-computer` | `{ predictiveTracking: true }` |
| `kickstart-pistons` | `servo-actuators` | `{ kickstartPistons: true }` |
| `backdraft` | `blast-furnace-core` | `{ backdraft: true }` |
| `battlefield-triage` | `field-repair-suite` | `{ battlefieldTriage: true }` |
| `coolant-injection` | `radiator-array` | `{ coolantInjection: true }` |

**Test helpers (already in the suites):**
- `shared/game-state.test.js` — `readyThreeAndThree(room, { a1: "<equipment-id>" })` commissions a 3v3 with `a1` carrying the given equipment (default upgrade = the Field row); `activate(room, "a1")` walks turns until `a1` is the active rig; `applyCommand`, `findRig`, `createRoom`. Tuned upgrades are set post-commission by assigning `rig.equipmentUpgrade = "<row-id>"` (the established pattern at `game-state.test.js:2362, 2386, 2396`).
- `shared/combat.test.js` — imports `computeModifiedAim`, `computeStr`, `WEAPONS`, `makeRig`, `effectiveWeaponProfile`, `HEAT_CAPACITY` from the two modules; pure-function tests pass hand-built `attacker`/`profile`/`opts` literals (pattern at `combat.test.js:23-79`).

---

### Task 1: Predictive Tracking — `computeModifiedAim` (+2 ACC, ignore cover vs a pinned target)

**Rule (2026-07-12 design, line 98):** vs a static / pinned / immobilised target → **+2 ACC and ignore cover**.

**Files:**
- Modify: `shared/rules.js` — the `predictive-tracking` row inside the relocated `EQUIPMENT_UPGRADES` (`targeting-computer` family).
- Modify: `shared/combat.js:38-69` (`computeModifiedAim`).
- Modify: `shared/game-state.js:2000-2009` (`resolveFire` — thread a `targetPinned` signal into the `resolveAttack` opts).
- Test: `shared/combat.test.js`.

- [ ] **Step 1: Write the failing test**

Add to `shared/combat.test.js` (near the other `computeModifiedAim` tests, ~line 60):

```js
test("Predictive Tracking: +2 ACC and ignores cover vs a pinned target", () => {
  const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "predictive-tracking" };
  const mg = WEAPONS.longRange["Mini Gun"];
  const openField = computeModifiedAim(attacker, mg, { distance: 7, cover: 2, targetPinned: false });
  const pinned    = computeModifiedAim(attacker, mg, { distance: 7, cover: 2, targetPinned: true });
  // +2 ACC lowers the aim number by 2, and the 2 points of cover are ignored
  // (−2 more) → the pinned aim number is 4 lower.
  assert.equal(openField - pinned, 4);
  // The wrong Fire-Control upgrade (Field) never triggers, even vs a pinned target.
  const ballistic = { ...attacker, equipmentUpgrade: "ballistic-processor" };
  assert.equal(
    computeModifiedAim(ballistic, mg, { distance: 7, cover: 2, targetPinned: true }),
    openField,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/combat.test.js`
Expected: FAIL — `predictive-tracking` ships `effect: {}` and `computeModifiedAim` has no `targetPinned` branch, so `pinned === openField` and the delta is `0`, not `4`.

- [ ] **Step 3: Implement**

In `shared/rules.js`, replace the `predictive-tracking` row's stub and drop its `TODO(mechanics)`:

```js
{ id: "predictive-tracking", nature: "tuned", name: "Predictive Tracking", tag: "vs a static/pinned target: +2 accuracy, ignore cover", effect: { predictiveTracking: true } },
```

In `shared/combat.js` `computeModifiedAim`, after the `smoke` line (`combat.js:53`) add the predictive branch, then fold it into `coverEff` and `accTotal`:

```js
  // Predictive Tracking (Fire Control Tuned) — vs a static/pinned/immobilised
  // target the shot ignores cover and gains +2 ACC. `opts.targetPinned` is set by
  // the fire path (game-state.js). Read the effect live from the catalog by id;
  // combat.js imports only rules.js, so no game-state cycle.
  const predictive = attacker.equipment === "targeting-computer" && !profile.melee && !!opts.targetPinned
    && !!equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.predictiveTracking;
  const predictiveAcc = predictive ? 2 : 0;
```

Change `coverEff` (currently `const coverEff = opts.fireControlFirst ? 0 : cover;`) to also zero out under Predictive Tracking:

```js
  const coverEff = (opts.fireControlFirst || predictive) ? 0 : cover;
```

Add `predictiveAcc` to the `accTotal` sum:

```js
  const accTotal = weaponAcc - coverEff + aimedPenalty + hullPenalty + engagedEff + paintBonus + smoke + ballistic + predictiveAcc;
```

In `shared/game-state.js` `resolveFire`, add a `targetPinned` field to the `resolveAttack` opts object (`game-state.js:2000-2009`), so the mechanic fires through the real fire path, not only the unit test:

```js
    fireControlFirst,
    // Predictive Tracking (Fire Control Tuned) — the target counts as pinned when
    // it is immobilised, suppression-pinned, held in a melee lock, or emplaced.
    targetPinned: !!(target.immobilised || target.suppressImmobile || target.engagedWith != null || target.emplaced),
    dice: a.dice,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/combat.js shared/game-state.js shared/combat.test.js
git commit -m "feat(v2): Predictive Tracking — +2 ACC and ignore cover vs a pinned target"
```

---

### Task 2: Kickstart Pistons — `computeStr` (first melee after charging into contact +2 STR)

**Rule (2026-07-12 design, line 94):** Sprint/Jump into contact this activation → the **first melee** after it gets **+2 STR**.

**Files:**
- Modify: `shared/rules.js` — the `kickstart-pistons` row (`servo-actuators` family).
- Modify: `shared/combat.js:152-221` (`computeStr`).
- Modify: `shared/game-state.js:2379-2408` (`move`/`sprint` branch — set the charge flag) and `game-state.js:2010-2021` (`resolveFire` — consume the charge on the first melee) and `game-state.js:1918` (`endActivation` — clear both flags).
- Test: `shared/combat.test.js` (STR unit test) + `shared/game-state.test.js` (flag lifecycle).

- [ ] **Step 1: Write the failing tests**

Add to `shared/combat.test.js` (near the other `computeStr` tests, ~line 79):

```js
test("Kickstart Pistons: first melee after charging into contact hits +2 STR", () => {
  const claw = WEAPONS.melee["Claw"];
  const charged = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: false };
  const idle    = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: false, kickstartUsed: false };
  const spent   = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: true  };
  assert.equal(computeStr(charged, claw, {}) - computeStr(idle, claw, {}), 2); // charged → +2
  assert.equal(computeStr(spent, claw, {}), computeStr(idle, claw, {}));       // charge already spent → no bonus
  // The wrong Mobility upgrade (Field) never triggers, even when charged.
  const wrong = { ...charged, equipmentUpgrade: "reinforced-servos" };
  assert.equal(computeStr(wrong, claw, {}), computeStr(idle, claw, {}));
});
```

Add to `shared/game-state.test.js` (near the Mobility action tests, ~line 2389):

```js
test("Sprinting into base contact sets the Kickstart charge, and it clears at activation end", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "kickstart-pistons";
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "sprint", engage: "b1" } });
  assert.equal(rig.engagedWith != null, true);      // the sprint declared the lock
  assert.equal(rig.chargedIntoContact, true);       // charge armed for the first melee
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "endactivation" } });
  assert.equal(rig.chargedIntoContact, false);      // cleared — no leak past the activation
  assert.equal(rig.kickstartUsed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: FAIL — `computeStr` has no Kickstart branch (delta `0`, not `2`) and `rig.chargedIntoContact` is `undefined` after the sprint.

- [ ] **Step 3: Implement**

In `shared/rules.js`, replace the `kickstart-pistons` row's stub and drop its `TODO(mechanics)`:

```js
{ id: "kickstart-pistons", nature: "tuned", name: "Kickstart Pistons", tag: "Charge into contact → first melee after +2 STR", effect: { kickstartPistons: true } },
```

In `shared/combat.js` `computeStr`, add the branch before `return profile.str + …` (~line 220):

```js
  // Kickstart Pistons (Mobility Tuned) — a melee blow right after Sprinting/Jumping
  // into base contact this activation hits +2 STR, but only the FIRST such blow:
  // `chargedIntoContact` is armed by the move path, `kickstartUsed` is set by
  // resolveFire once a melee attack lands. Read the equipment effect live from the
  // catalog by id (combat.js imports only rules.js).
  if (profile.melee && attacker.chargedIntoContact && !attacker.kickstartUsed
      && equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.kickstartPistons) {
    bonus += 2;
  }
```

In `shared/game-state.js` `move`/`sprint` branch, after the `if (a.engage) maybeEngageByName(room, rig, a.engage);` line (`game-state.js:2397`) add:

```js
    // Kickstart Pistons (Mobility Tuned) — a Sprint that closes into base contact
    // this activation arms the charge; computeStr reads it and resolveFire spends
    // it on the first melee after. Only Sprint (not a plain Move) charges it.
    if (act === "sprint" && rig.engagedWith != null) rig.chargedIntoContact = true;
```

In `shared/game-state.js` `resolveFire`, after the Lock Sight consume (`game-state.js:2014`, `if (rig.lockSightNext) rig.lockSightNext = false;`) add:

```js
    // Kickstart Pistons — the charge is spent by the first melee attack this
    // activation; later melee blows resolve at normal STR.
    if (slot === "melee" && rig.chargedIntoContact) rig.kickstartUsed = true;
```

In `shared/game-state.js` `endActivation`, beside `rig.movedThisActivation = false;` (`game-state.js:1918`) add:

```js
  // Kickstart Pistons — the charge and its spent-flag are scoped to one
  // activation; clear both so a stale charge can't leak into a later melee.
  rig.chargedIntoContact = false;
  rig.kickstartUsed = false;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/combat.test.js shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/combat.js shared/game-state.js shared/combat.test.js shared/game-state.test.js
git commit -m "feat(v2): Kickstart Pistons — first melee after a charge into contact hits +2 STR"
```

---

### Task 3: Backdraft — Heat Purge Wave +1 STR per 2 heat over Capacity

**Rule (2026-07-12 design, line 97):** Heat Purge Wave gains **+1 STR per 2 heat** the rig is **over Capacity**. The wave itself is a narrated 3" AoE (`heatpurgewave` active), so the bonus rides on the narration.

**Files:**
- Modify: `shared/rules.js` — the `backdraft` row (`blast-furnace-core` family).
- Modify: `shared/game-state.js:2233-2265` (the equipment active branch — `heatpurgewave` resolution + the shared `pushResolution`).
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (beside the existing Heat Purge Wave test, ~line 2379):

```js
test("Backdraft adds +1 STR per 2 heat over Capacity to the narrated Heat Purge Wave", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "blast-furnace-core", a2: "blast-furnace-core" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "backdraft";
  rig.engine.heat = 9; // Medium raw cap 5 → over by 4 → +2 STR
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "heatpurgewave" } });
  assert.equal(rig.engine.heat, 5); // still vents down to the raw class cap
  const withBackdraft = r.game.resolutions.at(-1);
  const text = `${withBackdraft.summary} ${withBackdraft.effects.join(" ")}`;
  assert.match(text, /3"/);        // the AoE narration is preserved
  assert.match(text, /\+2 STR/);   // and now carries the Backdraft bonus
});

test("Heat Purge Wave without Backdraft carries no STR bonus", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "blast-furnace-core" });
  activate(r, "a1");
  const rig = findRig(r, "a1"); // default upgrade = Insulated Core (Field), no backdraft tag
  rig.engine.heat = 9;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "heatpurgewave" } });
  const last = r.game.resolutions.at(-1);
  assert.doesNotMatch(`${last.summary} ${last.effects.join(" ")}`, /STR/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `backdraft` ships `effect: {}` and the `heatpurgewave` branch emits no STR line, so `/\+2 STR/` does not match.

- [ ] **Step 3: Implement**

In `shared/rules.js`, replace the `backdraft` row's stub and drop its `TODO(mechanics)`:

```js
{ id: "backdraft", nature: "tuned", name: "Backdraft", tag: "Heat Purge Wave +1 STR per 2 heat over Capacity", effect: { backdraft: true } },
```

In `shared/game-state.js`, in the equipment active handler: declare an `extra` narration array just after `const active = EQUIPMENT[equipId].active;` (`game-state.js:2233`):

```js
    const active = EQUIPMENT[equipId].active;
    const extra = []; // extra per-active narration lines (e.g. Backdraft STR bonus)
```

Replace the `heatpurgewave` branch (`game-state.js:2252-2259`) with:

```js
    else if (act === "heatpurgewave") {
      // Blast Furnace Core: dump banked heat down to the RAW class Heat
      // Capacity — not the raised +1/+2 thermal-margin cap from the passive
      // or the Insulated Core upgrade. The 3" AoE narration rides along on
      // active.text via the pushResolution below.
      const rawCap = HEAT_CAPACITY[rig.weightClass] ?? 5;
      // Backdraft (Thermal Tuned) — the wave hits +1 STR per 2 heat the rig is
      // over Capacity, measured BEFORE the vent below dumps that heat. Spatial:
      // the bonus rides on the narrated AoE (the player applies the light hits).
      const overCap = Math.max(0, (rig.engine.heat || 0) - rawCap);
      const backdraftStr = equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.backdraft
        ? Math.floor(overCap / 2) : 0;
      if (backdraftStr > 0) extra.push(`Backdraft — +${backdraftStr} STR to the 3" wave (banked heat over Capacity).`);
      rig.engine.heat = Math.min(rig.engine.heat, rawCap);
    }
```

Fold `extra` into the shared `pushResolution` (`game-state.js:2262-2265`) so the bonus surfaces on the equipment resolution:

```js
    pushResolution(room, {
      kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} uses ${active.label}.`, effects: [active.text, ...extra],
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): Backdraft — Heat Purge Wave +1 STR per 2 heat over Capacity"
```

---

### Task 4: Battlefield Triage — Emergency Patch heals 3 SP on a 0-SP location

**Rule (2026-07-12 design, line 96):** Emergency Patch heals **3 SP** (not 2) when the target location is **at 0 SP**.

**Files:**
- Modify: `shared/rules.js` — the `battlefield-triage` row (`field-repair-suite` family).
- Modify: `shared/game-state.js:2237-2240` (the `emergencypatch` active branch).
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js` (beside the Field Repair Suite tests, ~line 2421):

```js
test("Battlefield Triage heals 3 SP when the Emergency Patch target is at 0 SP", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "field-repair-suite" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "battlefield-triage";
  rig.arms.sp = 0; // destroyed location
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "emergencypatch", loc: "arms" } });
  assert.equal(rig.arms.sp, 3); // 3, not the base 2
});

test("Battlefield Triage heals only the base 2 SP on a merely damaged location", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "field-repair-suite" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "battlefield-triage";
  rig.arms.sp = 2; // damaged but not at 0 → no triage bump
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "emergencypatch", loc: "arms" } });
  assert.equal(rig.arms.sp, 4); // 2 + 2, the base Emergency Patch
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `emergencypatch` always heals `2`, so the 0-SP arms ends at `2`, not `3`.

- [ ] **Step 3: Implement**

In `shared/rules.js`, replace the `battlefield-triage` row's stub and drop its `TODO(mechanics)`:

```js
{ id: "battlefield-triage", nature: "tuned", name: "Battlefield Triage", tag: "Emergency Patch heals 3 SP on a destroyed location", effect: { battlefieldTriage: true } },
```

In `shared/game-state.js`, replace the `emergencypatch` branch (`game-state.js:2237-2240`) with:

```js
    else if (act === "emergencypatch") {
      const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
      // Battlefield Triage (Utility Tuned) — a destroyed (0 SP) location is patched
      // for 3 instead of 2. Read the tag live from the catalog by id.
      const triage = !!equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.battlefieldTriage;
      const amount = (triage && rig[loc] && rig[loc].sp === 0) ? 3 : 2;
      repairRig(rig, loc, amount);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): Battlefield Triage — Emergency Patch heals 3 SP on a 0-SP location"
```

---

### Task 5: Coolant Injection — vent −2 heat before the overheat roll when over Capacity

**Rule (2026-07-12 design, line 93):** if the rig ends its activation **over Capacity**, vent **−2 heat before the overheat roll** — which can drop it under the cap and skip the roll entirely.

**Files:**
- Modify: `shared/rules.js` — the `coolant-injection` row (`radiator-array` family).
- Modify: `shared/game-state.js:1889-1903` (`endActivation` — before the `heatMeter` `over` check drives the D12).
- Test: `shared/game-state.test.js`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (near the overheat / activation-end tests):

```js
test("Coolant Injection vents 2 heat before the overheat roll and can skip it", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "radiator-array" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "coolant-injection";
  rig.engine.heat = 6; // Medium cap 5 → over by 1
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "endactivation" } });
  assert.equal(rig.engine.heat, 4); // vented 2 → back under the cap
  assert.equal(r.game.resolutions.some((e) => e.kind === "overheat"), false); // the D12 is skipped
});

test("without Coolant Injection an over-Capacity rig still rolls overheat at activation end", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "radiator-array" });
  activate(r, "a1");
  const rig = findRig(r, "a1"); // default upgrade = Twin Radiators (Field), no coolant tag
  rig.engine.heat = 6; // over by 1
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "endactivation", dice: { overheat: 1 } } });
  assert.equal(r.game.resolutions.some((e) => e.kind === "overheat"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `endActivation` never vents, so `a1` stays at heat 6 and the overheat D12 fires (heat stays 6, an `overheat` resolution is present).

- [ ] **Step 3: Implement**

In `shared/rules.js`, replace the `coolant-injection` row's stub and drop its `TODO(mechanics)`:

```js
{ id: "coolant-injection", nature: "tuned", name: "Coolant Injection", tag: "−2 heat before the overheat roll when over Capacity", effect: { coolantInjection: true } },
```

In `shared/game-state.js` `endActivation`, replace the opening `const m = heatMeter(rig);` (`game-state.js:1890`) with a coolant vent that runs before the roll and re-reads the meter:

```js
  let m = heatMeter(rig);
  // Coolant Injection (Cooling Tuned) — if the rig ends its activation over Heat
  // Capacity, dump 2 heat BEFORE the overheat D12. This can drop it under the cap
  // and skip the roll entirely. Read the tag live from the catalog by id.
  if (m.over > 0 && rig.equipment === "radiator-array"
      && equipmentUpgradeEffectOf(rig.equipment, rig.equipmentUpgrade)?.coolantInjection) {
    bumpHeat(rig, -2);
    m = heatMeter(rig);
  }
  if (m.over > 0) {
```

(The following overheat block — `const roll = rollD(12, …)` down through `checkAnnihilation(room);` — is unchanged; `m` is now a `let` re-read after the vent.)

- [ ] **Step 4: Run the full shared suite**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): Coolant Injection — vent 2 heat before the overheat roll when over Capacity"
```

---

## Self-review notes

- **Every row's stub is now real.** After this plan, `grep -n "TODO(mechanics)" shared/rules.js` shows only the 11 rows owned by Groups 2-4 (Reactive Armor, Chaff Burst, and the eight Prototypes) — the five Group-1 Tuned rows no longer carry the marker.
- **No new persisted state.** Predictive Tracking and Battlefield Triage read target/location state that already exists; Backdraft and Coolant Injection read `engine.heat`; Kickstart Pistons adds only two per-activation flags (`chargedIntoContact`, `kickstartUsed`) that are cleared in `endActivation` beside the existing `movedThisActivation` clear — no `equipState` block (that is Group 3's scaffold) and no Recovery hook needed.
- **Single source of truth honoured.** Every mechanic reads its tag through `equipmentUpgradeEffectOf(equipment, equipmentUpgrade)` — the Plan 0 lookup — so a later catalog rebalance applies to live rigs with no recommission. `combat.js` reaches the tag through the `rules.js` import Plan 0 Task 3 added; it never imports `game-state.js`.
- **`equipmentUpgradeEffectOf` must be importable inside `game-state.js`** for Tasks 3-5 (Backdraft, Battlefield Triage, Coolant Injection). Plan 0 Task 2 added it to the `import { … } from "./rules.js"` destructure at `game-state.js:1` for `heatModel`; confirm it is present before Task 3, and add it to that destructure if not (a re-export alone does not create a callable local binding).
- **rules.md** — once all five ship, fill the five Tuned rows into the "Tuned / Prototype Equipment Mechanics" subsection under §15 (scaffolded by the 2026-07-12 change), same cadence as the weapon-Prototype rollout. Optional in this plan; do it in a docs-only follow-up commit if preferred.
