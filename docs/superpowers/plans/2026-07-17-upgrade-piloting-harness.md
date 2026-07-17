# Upgrade-Piloting Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the duel harness so decision-piloted weapon upgrades and all equipment upgrades are measured at their piloted benefit, at two intensities, producing the re-runnable gate sub-project B needs.

**Architecture:** A per-upgrade **piloting-hook registry** layered over the existing `greedySafe` policy (hook fires the activating command when ripe, else falls through). `runDuel` gains an equipment axis (`{equipmentA, equipmentUpgradeA}`) and an `intensity` (`conservative` | `ceiling`) argument threaded to the hooks. The report prints both intensities plus the hooks' documented biases. The engine (`shared/`) is never touched — the harness borrows the real command path exactly as `duel-sim.mjs` already does.

**Tech Stack:** Node ESM (`.mjs`), `node:test` + `node:assert/strict`. No new deps.

**Spec:** `docs/superpowers/specs/2026-07-17-upgrade-piloting-harness-design.md`

---

## Background the executor needs

Read these before starting; they are the ground truth every task builds on.

- **`scripts/balance/duel-sim.mjs`** — `runDuel({chassisA, chassisB, weaponA, upgradeA, distance, arc, seed})` builds a room, seeds a 6-rig battle, swaps `weaponA`/`upgradeA` onto A1, and drives the real command path for `MAX_ROUNDS` rounds. It returns `{spDealt, spTaken, wrecked, weaponLost, rounds, firstShotSp}`. The decision each turn comes from `greedySafe` (line ~193: `const next = canFight ? greedySafe(room, rig, foe) : null;`).
- **`scripts/balance/policy.mjs`** — `makeGreedySafe({distance, arc})` returns `greedySafe(room, rig, enemy)`, which returns a command object `{verb, attrs}` or `null`. Commands are applied via the harness's `apply(next.verb, next.attrs, rig.owner)`.
- **Command shape.** Every action is `{verb: "action", attrs: {name, action, ...}}`. Verbs confirmed in `shared/game-state.js` `performAction`:
  - Fire: `attrs {name, action:"fire", target, weapon:"longRange", arc, distance}`
  - Aimed: `attrs {name, action:"aimed", weapon:"longRange", location, target, arc, distance}` (location ∈ `LOCS`)
  - Fire-Control lock (paint): `attrs {name, action:"lock", target}` — gated to a rig whose long-range profile has `upgradeEffect.fireControl` (game-state.js:3092).
  - Emplace: `attrs {name, action:"emplace"}` — gated to `weaponUpgrades.melee === "emplacement"` (game-state.js:3112).
  - Equipment actives (plain gated verbs, game-state.js:290-333): `harden`, `purge`, `jumpjets`, `overclock`, `emergencypatch`, `heatpurgewave`, `locksight`, `popsmoke`. Reverse map: `EQUIPMENT_ACTIVE_BY_KEY` (game-state.js:336).
- **Equipment stamping.** A rig carries `rig.equipment` (module id) + `rig.equipmentUpgrade` (tier id), set by `makeRig(..., equipment, equipmentUpgrade)` (game-state.js:977). Tier nature: `equipmentUpgradeNature(equipmentId, upgradeId)`; field-tier fallback id: `firstEquipmentUpgradeId(equipmentId)`.
- **The field-is-the-floor trap.** A `null`/unknown upgrade id silently resolves to the **Field** tier (`normalizeWeaponUpgrade` / `normalizeEquipmentUpgrade`). `runDuel` already throws on a null `upgradeA`; the equipment axis must throw the same way. Never let a null id mean "no upgrade."
- **No value-pinning.** Per repo rule, tests assert **firing and ordering**, never magnitudes — the tuner changes numbers constantly. The gate (`benefit(risky) ≥ benefit(field)`) is a *report*, not a CI assertion.
- **The false-comment trap.** On the last rework every implementer shipped a code comment that lied about correct code. Each hook's one-line entry in `PILOTING_BIASES` must match what the hook's predicate actually does. Reviewers: read the predicate against its bias line, not the gist.

Test runner for every task: `node --test scripts/balance/<file>.test.mjs`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/balance/piloting.mjs` | **New.** The hook registry `PILOTING_HOOKS`, each `{ceiling, conservative}`; `pilotFor(upgradeId)`; exported `PILOTING_BIASES` string. Pure functions — no engine mutation, only reads room/rig and returns a command or null. |
| `scripts/balance/piloting.test.mjs` | **New.** Structural tests: each hook fires; conservative ⊆ ceiling; no calibration drift on passives. |
| `scripts/balance/duel-sim.mjs` | **Modify.** Thread `intensity`; consult `pilotFor` before `greedySafe`; add `{equipmentA, equipmentUpgradeA}` stamping + tier assertion; second CLI loop over the equipment axis. |
| `scripts/balance/duel-report.mjs` | **Modify.** `benefit_conservative` / `benefit_ceiling` columns; print `PILOTING_BIASES` next to `KNOWN_BIASES`; group weapon vs equipment axes. |

---

## Task 1: Hook registry scaffold + `pilotFor`

**Files:**
- Create: `scripts/balance/piloting.mjs`
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/balance/piloting.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pilotFor, PILOTING_HOOKS, PILOTING_BIASES } from "./piloting.mjs";

test("pilotFor returns a no-op hook for an unregistered upgrade", () => {
  const hook = pilotFor("no-such-upgrade");
  assert.equal(typeof hook, "function");
  assert.equal(hook({}, {}, {}, { intensity: "ceiling" }), null);
});

test("every registered hook exposes both intensities as functions", () => {
  for (const [id, h] of Object.entries(PILOTING_HOOKS)) {
    assert.equal(typeof h.ceiling, "function", `${id}.ceiling`);
    assert.equal(typeof h.conservative, "function", `${id}.conservative`);
  }
});

test("PILOTING_BIASES documents exactly the registered hooks", () => {
  for (const id of Object.keys(PILOTING_HOOKS)) {
    assert.ok(PILOTING_BIASES.includes(id), `PILOTING_BIASES missing a line for ${id}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: FAIL — `Cannot find module './piloting.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/balance/piloting.mjs
//
// Per-upgrade piloting hooks layered over greedySafe (policy.mjs). A hook returns
// the ACTIVATING command for its upgrade when the mechanic is ripe, else null —
// null means "nothing to pilot this instant", and the driver falls through to
// greedySafe. Only DECISION-DEPENDENT upgrades get a hook; passives measure fine
// through plain firing and are deliberately absent.
//
// Each hook has two intensities:
//   ceiling      — fire whenever the mechanic is legal (best-case piloting).
//   conservative — fire only under a documented "a competent player bothers here"
//                  predicate (the realistic floor).
// The report prints both; the spread is the skill-reward of the risky pick.
//
// A hook is a PURE reader: it inspects room/rig/enemy and returns a command. It
// must never mutate engine state — the engine owns that when the command applies.

// One line per registered hook. The report prints this verbatim next to
// policy.mjs's KNOWN_BIASES so the assumptions travel with the numbers. KEEP EACH
// LINE TRUE TO ITS PREDICATE — a lying bias line is the exact trap the last
// rework shipped eleven times.
export const PILOTING_BIASES = `
(hooks registered below add their line here)
`.trim();

// upgradeId -> { ceiling(room, rig, enemy), conservative(room, rig, enemy) }
export const PILOTING_HOOKS = {};

const NOOP = () => null;

// Returns a single hook function bound to the chosen intensity, or a no-op for an
// unregistered / passive upgrade. The driver calls this once per (upgrade,
// intensity) and asks it every turn.
export function pilotFor(upgradeId, intensity = "conservative") {
  const h = PILOTING_HOOKS[upgradeId];
  if (!h) return NOOP;
  const fn = h[intensity];
  if (typeof fn !== "function") {
    throw new Error(`pilotFor: hook "${upgradeId}" has no "${intensity}" intensity.`);
  }
  return fn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS (all three; `PILOTING_HOOKS` is empty so the loops are vacuously true).

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/piloting.mjs scripts/balance/piloting.test.mjs
git commit -m "feat(balance): piloting-hook registry scaffold + pilotFor"
```

---

## Task 2: Thread `intensity` through `runDuel` and consult `pilotFor`

**Files:**
- Modify: `scripts/balance/duel-sim.mjs` (the `runDuel` signature + the decision branch near line 193)
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/balance/piloting.test.mjs
import { runDuel } from "./duel-sim.mjs";

const WCELL = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, arc: "side" };

test("runDuel accepts an intensity and stays deterministic per (seed, intensity)", () => {
  assert.deepEqual(
    runDuel({ ...WCELL, seed: 7, intensity: "ceiling" }),
    runDuel({ ...WCELL, seed: 7, intensity: "ceiling" }),
  );
});

test("a passive upgrade is unaffected by intensity (no hook = no drift)", () => {
  // depleted-core is a passive +STR field-adjacent tier with no hook, so both
  // intensities must produce the identical duel. This is the calibration guard:
  // the hook layer changes ONLY piloted upgrades.
  assert.deepEqual(
    runDuel({ ...WCELL, seed: 11, intensity: "conservative" }),
    runDuel({ ...WCELL, seed: 11, intensity: "ceiling" }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: FAIL — `runDuel` ignores `intensity`; likely passes deterministically but the second test could still pass by accident. If both pass, that only means the wiring below is a safe no-op for passives; proceed to add the wiring so hooks can take effect (Task 4 proves the effect).

- [ ] **Step 3: Write minimal implementation**

In `scripts/balance/duel-sim.mjs`, add the import at the top alongside the existing imports:

```js
import { pilotFor } from "./piloting.mjs";
```

Change the `runDuel` signature to accept `intensity` (default `"conservative"`):

```js
export function runDuel({ chassisA, chassisB, weaponA, upgradeA, equipmentA, equipmentUpgradeA, distance, arc, seed, intensity = "conservative" }) {
```

(`equipmentA`/`equipmentUpgradeA` are added now so Task 5 only touches the body; they are unused until then.)

Just before the loop's decision line (`const next = canFight ? greedySafe(room, rig, foe) : null;`), build the hook once. Find the `greedySafe` construction near the top of `runDuel` (`const greedySafe = makeGreedySafe({ distance, arc });`) and add beneath it:

```js
  // The upgrade under test drives which hook (if any) pilots A1. Equipment takes
  // precedence when present — an equipment cell tests the module, not the weapon
  // field tier A1 also carries. A passive/unregistered id yields a no-op hook.
  const pilotedId = equipmentUpgradeA || upgradeA;
  const pilot = pilotFor(pilotedId, intensity);
```

Then replace the decision line:

```js
    const next = canFight ? greedySafe(room, rig, foe) : null;
```

with a hook-first consult (A1 only — the control never pilots):

```js
    // A1 consults its upgrade hook first; a null means "nothing to pilot now" and
    // greedySafe takes over. The control (B1) is never piloted — it is the fixed
    // yardstick. Piloting both would measure the matchup, not the upgrade.
    let next = null;
    if (canFight) {
      if (rig === a1) next = pilot(room, rig, foe, { intensity });
      if (!next) next = greedySafe(room, rig, foe);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS — both new tests green; the existing `duel-sim.test.mjs` still green (`node --test scripts/balance/duel-sim.test.mjs`).

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/duel-sim.mjs scripts/balance/piloting.test.mjs
git commit -m "feat(balance): thread intensity + hook consult into runDuel"
```

---

## Task 3: A hook-firing assertion helper

A shared test helper that runs a duel and reports whether a given command verb/action was issued for A1. Every hook test needs it, so build it once (DRY).

**Files:**
- Modify: `scripts/balance/duel-sim.mjs` (export an optional `onCommand` observer)
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/balance/piloting.test.mjs
test("runDuel reports the actions A1 issued via onCommand", () => {
  const seen = [];
  runDuel({ ...WCELL, seed: 3, intensity: "ceiling",
    onCommand: (rigName, attrs) => { if (rigName === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("fire"), "A1 should fire at least once");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: FAIL — `onCommand` is ignored, `seen` stays empty.

- [ ] **Step 3: Write minimal implementation**

Add `onCommand` to the destructured signature:

```js
export function runDuel({ chassisA, chassisB, weaponA, upgradeA, equipmentA, equipmentUpgradeA, distance, arc, seed, intensity = "conservative", onCommand = null }) {
```

In the `apply` helper (near the top of `runDuel`), notify the observer on a command that actually applied:

```js
  const apply = (verb, attrs, side) => {
    const before = room.version;
    applyCommand(room, { verb, attrs }, side ? { side } : {}, { random });
    const changed = room.version !== before;
    if (changed && onCommand && attrs?.name) onCommand(attrs.name, attrs);
    return changed;
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/duel-sim.mjs scripts/balance/piloting.test.mjs
git commit -m "feat(balance): onCommand observer for hook-firing assertions"
```

---

## Task 4: First hook — `enfilade` (Aimed-cadence, the confirmed 0.00)

`enfilade` (Sniper Cannon prototype) needs Aimed Shots the base policy never takes — it is the one upgrade that reads a hard 0.00 in the current sweep. Piloting it proves the whole mechanism end-to-end.

**Files:**
- Modify: `scripts/balance/piloting.mjs`
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/balance/piloting.test.mjs
const SNIPER = { chassisA: "medium-sniper-chainsaw", chassisB: "medium-lance-mortar",
  weaponA: "Sniper Cannon", upgradeA: "enfilade", distance: 20, arc: "side" };

test("enfilade hook makes A1 take Aimed shots (was a structural 0.00)", () => {
  const seen = [];
  runDuel({ ...SNIPER, seed: 4, intensity: "ceiling",
    onCommand: (name, attrs) => { if (name === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("aimed"), "enfilade must pilot Aimed shots at ceiling");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: FAIL — no `enfilade` hook, A1 only ever `fire`s.

- [ ] **Step 3a: Pass geometry to the hook**

Hooks that issue an Aimed/Fire command need the duel's fixed `distance`/`arc`. In `scripts/balance/duel-sim.mjs`, amend Task 2's consult call to pass them on the 4th arg:

```js
      if (rig === a1) next = pilot(room, rig, foe, { intensity, distance, arc });
```

- [ ] **Step 3b: Register the hook in `piloting.mjs`**

Add the `aimedAt` helper above `PILOTING_HOOKS`, then replace the empty `PILOTING_HOOKS = {}` with the `enfilade` entry:

```js
// Build an Aimed command at the duel's fixed geometry. Location defaults to the
// enemy's engine — the kill location a marksman aims for; the choice changes only
// WHERE the shot lands, not whether the Aimed-cadence mechanic fires.
function aimedAt(rig, enemy, distance, arc, location = "engine") {
  return { verb: "action", attrs: {
    name: rig.name, action: "aimed", weapon: "longRange",
    location, target: enemy.name, arc, distance,
  } };
}

export const PILOTING_HOOKS = {
  // Sniper Cannon prototype. Keys off Aimed-shot cadence, which greedySafe never
  // triggers (its confirmed structural 0.00). The duel is pinned to the sweet
  // spot, so both intensities aim every shot here; they diverge only for a future
  // off-band cell, which is why conservative still checks the band.
  enfilade: {
    ceiling: (room, rig, enemy, { distance, arc }) => aimedAt(rig, enemy, distance, arc),
    conservative: (room, rig, enemy, { distance, arc }) => aimedAt(rig, enemy, distance, arc),
  },
};
```

Update `PILOTING_BIASES` to document it:

```js
export const PILOTING_BIASES = `
- enfilade: piloted as Aimed shots at the sweet-spot distance. Ceiling and
  conservative coincide because the duel is pinned to the sweet spot; a marksman
  aims every shot here. Off-band cells would diverge.
`.trim();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS — `seen.includes("aimed")` is true; the `PILOTING_BIASES`-coverage test from Task 1 still passes (it now finds `enfilade`).

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/piloting.mjs scripts/balance/piloting.test.mjs scripts/balance/duel-sim.mjs
git commit -m "feat(balance): enfilade piloting hook (Aimed cadence)"
```

---

## Task 5: Equipment axis — stamp + tier assertion in `runDuel`

**Files:**
- Modify: `scripts/balance/duel-sim.mjs`
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// append to scripts/balance/piloting.test.mjs
const EQCELL = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core",
  equipmentA: "ablative-plating", equipmentUpgradeA: "reinforced-plating",
  distance: 12, arc: "side" };

test("runDuel stamps an equipment module + tier onto A1 and runs", () => {
  const r = runDuel({ ...EQCELL, seed: 2, intensity: "conservative" });
  assert.ok(r.rounds > 1, "equipment cell should play out multiple rounds");
});

test("a null equipment upgrade id throws (field-is-the-floor trap)", () => {
  assert.throws(
    () => runDuel({ ...EQCELL, equipmentUpgradeA: null, seed: 2 }),
    /equipmentUpgradeA/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: FAIL — equipment fields ignored; no throw on null.

- [ ] **Step 3: Write minimal implementation**

Add the import in `scripts/balance/duel-sim.mjs`:

```js
import { WEAPONS, WEAPON_UPGRADES, EQUIPMENT, EQUIPMENT_UPGRADES,
  equipmentUpgradeNature } from "../../shared/game-state.js";
```

(Extend the existing `game-state.js` import line rather than duplicating it.)

After the block that stamps `weaponA`/`upgradeA` onto `a1` (near line 84) and asserts its tier, add the equipment stamping:

```js
  // Equipment axis: swap a module + tier onto A1 the same way the weapon is
  // swapped. Optional — a weapon cell leaves both undefined.
  if (equipmentA != null || equipmentUpgradeA != null) {
    if (!EQUIPMENT[equipmentA]) {
      throw new Error(`duel-sim: unknown equipment "${equipmentA}".`);
    }
    // A null upgrade id silently resolves to the FIELD tier (normalizeEquipmentUpgrade),
    // exactly the weapon-tier trap — so demand it explicitly, like upgradeA.
    if (typeof equipmentUpgradeA !== "string" || !equipmentUpgradeA) {
      throw new Error("duel-sim needs an explicit { equipmentUpgradeA } id: a null upgrade silently resolves to the FIELD tier, not to none.");
    }
    const nature = equipmentUpgradeNature(equipmentA, equipmentUpgradeA);
    if (!nature) {
      throw new Error(`duel-sim: equipment upgrade "${equipmentUpgradeA}" is not a tier of "${equipmentA}".`);
    }
    a1.equipment = equipmentA;
    a1.equipmentUpgrade = equipmentUpgradeA;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS — both new tests green; `duel-sim.test.mjs` still green.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/duel-sim.mjs scripts/balance/piloting.test.mjs
git commit -m "feat(balance): equipment axis stamping + tier assertion in runDuel"
```

---

## Task 6: Equipment hook — `reactor-overdrive` (player-issued active)

**Plan correction:** the earlier draft used `ablative-cascade` here, but that upgrade is **auto-reactive** — combat.js:658-660 spends a charge automatically when the rig is hit (refills to 2 each Recovery, game-state.js:2084). It takes no player command, so it needs no hook and measures passively through the equipment axis (Task 5/8). The representative equipment-active hook is instead `reactor-overdrive` (prototype tier of the Power module `overclock-core`): the player issues the `overclock` active, which the upgrade turns into +2 Penetration at the cost of a **doubled overheat bonus** (game-state.js:2207) — a genuine decision `greedySafe` never makes. Its benefit shows in A1's **spDealt**.

**Files:**
- Modify: `scripts/balance/piloting.mjs`
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Read the engine handlers first**

Read, and confirm the real field/verb names before coding:
- The `overclock` action handler in `shared/game-state.js` (~2744) — confirm `attrs.action === "overclock"`, that it sets `rig.reactorOverdriveActive = true` when the upgrade is present (game-state.js:2751), and that the flag is cleared at activation end (game-state.js:2254). This flag is the once-per-activation guard.
- `availableActions` in `shared/battle-view.js` — confirm the action key emitted for the overclock active (so the hook can gate on it being enabled and never issue a no-op that trips the driver's 3× guard). `scripts/balance/policy.mjs` already imports `availableActions`; mirror that usage.
- The overclock heat cost (EQUIPMENT `overclock-core.active.heat`, game-state.js:308) for the conservative predicate.

- [ ] **Step 2: Write the failing test**

```js
// append to scripts/balance/piloting.test.mjs
const OVERDRIVE = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
  weaponA: "Autocannon", upgradeA: "depleted-core",
  equipmentA: "overclock-core", equipmentUpgradeA: "reactor-overdrive",
  distance: 12, arc: "side" };

test("reactor-overdrive hook makes A1 issue the overclock active", () => {
  const seen = [];
  runDuel({ ...OVERDRIVE, seed: 6, intensity: "ceiling",
    onCommand: (name, attrs) => { if (name === "A1") seen.push(attrs.action); } });
  assert.ok(seen.includes("overclock"), "reactor-overdrive must pilot the overclock active at ceiling");
});
```

- [ ] **Step 3: Write minimal implementation**

Add the imports the hook needs at the top of `scripts/balance/piloting.mjs` (confirm the exact `overclock` enabled-key name from Step 1):

```js
import { HEAT_CAPACITY } from "../../shared/game-state.js";
import { availableActions } from "../../shared/battle-view.js";
```

Add to `PILOTING_HOOKS`:

```js
  // Power prototype (Overclock Core). The overclock active gains +2 Penetration
  // but DOUBLES the overheat bonus — the catch. greedySafe never overclocks.
  // Gate on availableActions so the hook never issues a no-op (which would trip
  // the driver's 3x guard), and on !reactorOverdriveActive so it fires once per
  // activation. Ceiling: overclock whenever legal. Conservative: only with heat
  // headroom for its cost, so the doubled-overheat catch does not immediately bite.
  "reactor-overdrive": {
    ceiling: (room, rig) => overclockCmd(room, rig, false),
    conservative: (room, rig) => overclockCmd(room, rig, true),
  },
```

Add the shared helper above `PILOTING_HOOKS` (use the real enabled-key + heat-cost constants confirmed in Step 1; `OVERCLOCK_HEAT` shown as 3):

```js
const OVERCLOCK_HEAT = 3; // EQUIPMENT["overclock-core"].active.heat — confirm in Step 1

// Issue the overclock active once per activation, gated on legality so it never
// no-ops. `careful` adds the conservative heat-headroom check.
function overclockCmd(room, rig, careful) {
  if (rig.reactorOverdriveActive) return null;              // already overclocked this activation
  // Defensive: a hook that cannot read the current turn cannot judge legality, so
  // it declines (the conservative⊆ceiling probe in Task 7 calls hooks with a
  // turn-less room; in a real duel the turn is always present at a decision point).
  const turn = room?.game?.turn;
  if (!turn) return null;
  const enabled = new Set(
    availableActions(rig, turn, room.game.round)
      .filter((a) => a.enabled).map((a) => a.key),
  );
  if (!enabled.has("overclock")) return null;               // not legal now — let greedySafe act
  if (careful) {
    const cap = HEAT_CAPACITY[rig.weightClass];
    if (cap == null || rig.engine.heat + OVERCLOCK_HEAT > cap) return null;
  }
  return { verb: "action", attrs: { name: rig.name, action: "overclock" } };
}
```

Append its bias line to `PILOTING_BIASES`:

```
- reactor-overdrive: piloted via the overclock active, once per activation, gated
  on availableActions. Ceiling overclocks whenever legal; conservative overclocks
  only with heat headroom for its cost, so the doubled-overheat catch does not
  immediately bite. Benefit lands in A1's spDealt.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS — `seen.includes("overclock")`; the `conservative ⊆ ceiling` invariant (Task 7) will also cover it once added.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/piloting.mjs scripts/balance/piloting.test.mjs
git commit -m "feat(balance): reactor-overdrive piloting hook (overclock active)"
```

---

## Task 7: `conservative ⊆ ceiling` invariant test

A structural guard the whole design leans on: any instant the conservative predicate fires, ceiling must fire too (conservative is a strict subset). This catches a mis-documented hook without pinning any value.

**Files:**
- Test: `scripts/balance/piloting.test.mjs`

- [ ] **Step 1: Write the test**

```js
// append to scripts/balance/piloting.test.mjs
import { PILOTING_HOOKS as HOOKS } from "./piloting.mjs";

test("conservative fires a subset of ceiling for every hook", () => {
  // Probe each hook against a spread of synthetic states. A conservative YES with
  // a ceiling NO is a contradiction — the hook is misdocumented. We assert the
  // IMPLICATION (conservative => ceiling), never a magnitude.
  //
  // The room is deliberately turn-less: hooks that need a live turn to judge
  // legality (per the contract) must DECLINE (return null) rather than throw, so
  // this probe is a smoke-level guard for those — it fully exercises pure-state
  // hooks (e.g. enfilade) and vacuously holds for legality-gated ones. The real
  // per-hook duel tests (Task 6/9) prove those actually fire.
  const room = { game: { turn: null, round: 1 } };
  const enemy = { name: "E1", id: 2 };
  const geo = { intensity: "x", distance: 12, arc: "side" };
  const states = [
    { name: "A1", id: 1, weightClass: "medium", engine: { heat: 0 },
      equipState: {}, reactorOverdriveActive: false, weapons: { longRange: "Sniper Cannon" } },
    { name: "A1", id: 1, weightClass: "medium", engine: { heat: 99 },
      equipState: {}, reactorOverdriveActive: false, weapons: { longRange: "Sniper Cannon" } },
  ];
  for (const [id, h] of Object.entries(HOOKS)) {
    for (const rig of states) {
      const c = h.conservative(room, rig, enemy, geo);
      const k = h.ceiling(room, rig, enemy, geo);
      if (c) assert.ok(k, `${id}: conservative fired but ceiling did not`);
    }
  }
});
```

Note the hook contract this enforces: **a hook that cannot judge legality from the room it is given must return null, never throw.** Any legality-gated hook added in Task 9 must follow the same turn-less guard as `overclockCmd`.

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test scripts/balance/piloting.test.mjs`
Expected: PASS for the hooks registered so far. (Each new hook in Task 9 is re-checked by this test automatically.)

- [ ] **Step 3: Commit**

```bash
git add scripts/balance/piloting.test.mjs
git commit -m "test(balance): conservative-subset-of-ceiling invariant"
```

---

## Task 8: Dual-intensity equipment sweep + report columns

**Files:**
- Modify: `scripts/balance/duel-sim.mjs` (add the equipment CLI loop + run every cell at both intensities)
- Modify: `scripts/balance/duel-report.mjs` (print both columns + `PILOTING_BIASES`)

- [ ] **Step 1: Extend the CLI `main()` in `duel-sim.mjs`**

Locate the existing weapon sweep loop in `main()` (iterates `WEAPONS.longRange` × `WEAPON_UPGRADES`). Wrap each cell run to execute both intensities and record both. Replace the single `runDuel(...)` call inside the trials loop with:

```js
        for (const intensity of ["conservative", "ceiling"]) {
          const r = runDuel({ chassisA: CHASSIS_A, chassisB: CHASSIS_B, weaponA: weapon,
            upgradeA: u.id, distance, arc: ARC, seed: s, intensity });
          agg[intensity].add(r);   // see the accumulator note below
        }
```

Use a small per-intensity accumulator so the two do not cross-contaminate. Define near the top of the trials loop:

```js
      const agg = {
        conservative: makeAcc(),
        ceiling: makeAcc(),
      };
```

Add `makeAcc` as a helper above `main()`:

```js
// A tiny sum accumulator so each intensity aggregates independently. Mirrors the
// existing per-cell running totals; censors weaponLost cells exactly as before.
function makeAcc() {
  let spDealt = 0, spTaken = 0, wrecks = 0, rounds = 0, lost = 0, n = 0;
  return {
    add(r) {
      if (r.weaponLost) { lost++; return; }
      spDealt += r.spDealt; spTaken += r.spTaken; rounds += r.rounds;
      if (r.wrecked) wrecks++; n++;
    },
    row() { return { spDealt: n ? spDealt / n : null, spTaken: n ? spTaken / n : null,
      wreckRate: n ? wrecks / n : null, rounds: n ? rounds / n : null, n, censored: lost }; },
  };
}
```

After the trials loop, push one row carrying both intensities:

```js
      rows.push({ axis: "weapon", weapon, tier: u.nature, upgrade: u.id, distance, arc: ARC,
        conservative: agg.conservative.row(), ceiling: agg.ceiling.row() });
```

- [ ] **Step 2: Add the equipment sweep loop**

After the weapon loop in `main()`, add a parallel loop over the equipment axis. The control (`CHASSIS_B`) already fires back, giving defensive/heat prototypes a real attacker. A1 keeps its chassis default weapon+field tier so the module is the only variable:

```js
  // Equipment axis. A1 carries a fixed weapon field tier (the module is the
  // variable). The control attacks as always, so defensive/heat/repair modules
  // register via spTaken / firing uptime / survival.
  const EQ_WEAPON = "Autocannon";              // documented constant, like CHASSIS_B
  const EQ_WEAPON_FIELD = WEAPON_UPGRADES[EQ_WEAPON][0].id;
  const EQ_DISTANCE = WEAPONS.longRange[EQ_WEAPON].sweet;
  for (const equipment of Object.keys(EQUIPMENT)) {
    const tiers = EQUIPMENT_UPGRADES[equipment];
    if (!tiers?.length) {
      throw new Error(`duel-sim equipment sweep: no EQUIPMENT_UPGRADES for "${equipment}".`);
    }
    for (const u of tiers) {
      const agg = { conservative: makeAcc(), ceiling: makeAcc() };
      for (let s = 1; s <= TRIALS; s++) {
        for (const intensity of ["conservative", "ceiling"]) {
          const r = runDuel({ chassisA: CHASSIS_A, chassisB: CHASSIS_B,
            weaponA: EQ_WEAPON, upgradeA: EQ_WEAPON_FIELD,
            equipmentA: equipment, equipmentUpgradeA: u.id,
            distance: EQ_DISTANCE, arc: ARC, seed: s, intensity });
          agg[intensity].add(r);
        }
      }
      rows.push({ axis: "equipment", equipment, tier: u.nature, upgrade: u.id,
        distance: EQ_DISTANCE, arc: ARC,
        conservative: agg.conservative.row(), ceiling: agg.ceiling.row() });
      process.stderr.write(`${equipment} ${u.nature}\n`);
    }
  }
```

- [ ] **Step 3: Update `duel-report.mjs`**

Open `scripts/balance/duel-report.mjs`. It reads the JSON `rows`. Update it to:
- print two SP columns per row — `cons` (conservative `spDealt`, or `spTaken` for the defensive equipment families) and `ceil` — plus the spread `ceil − cons`;
- group output by `axis` (weapon rows, then equipment rows);
- after `KNOWN_BIASES`, print `PILOTING_BIASES` (import it: `import { PILOTING_BIASES } from "./piloting.mjs";`).

Exact column layout follows the file's existing table formatter; match its style. The key addition is the second intensity column and the spread.

- [ ] **Step 4: Smoke-run the sweep at low trials**

Run: `TRIALS=20 node scripts/balance/duel-sim.mjs > /tmp/duel.json 2>/tmp/progress.txt`
Then: `DATA=/tmp/duel.json node scripts/balance/duel-report.mjs`
Expected: a table with weapon rows AND equipment rows, each showing conservative + ceiling columns; `enfilade` now non-zero; `PILOTING_BIASES` printed at the foot. No throw.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/duel-sim.mjs scripts/balance/duel-report.mjs
git commit -m "feat(balance): dual-intensity equipment sweep + report columns"
```

---

## Task 9: Populate the remaining decision-piloted hooks

Every hook here follows the Task 4 / Task 6 pattern exactly: read the engine handler, write a firing test (assert the action verb appears for A1 at ceiling), register `{ceiling, conservative}` with a documented `PILOTING_BIASES` line, run, commit. The `conservative ⊆ ceiling` test (Task 7) re-checks each automatically. **One hook = one commit.**

For each upgrade below, the command verb is given; **read the cited handler before writing the hook** to confirm state-field names (do not guess them):

**Legality-gated hooks must follow `overclockCmd`'s turn-less guard** (return null when `room?.game?.turn` is absent) so the Task 7 invariant probe never throws.

| Upgrade | Catalog | Verb / mechanic | Engine handler to read |
|---|---|---|---|
| `fire-control-lock` | Missile Barrage (weapon) | `lock` on the target, then the next volley auto-hits (fall through to `fire`) | game-state.js:3092 (`lock`), combat.js:701 (`fireControlLock`) |
| `fire-solution-lock` | Fire Control (equipment) | hold position + build solution, then auto-hit volley | game-state.js:2421, 3034-3040 (`fireSolutionLock`), combat.js (`solutionPayoff`) |
| `emplacement` | Bulwark Shield (weapon) | `emplace`, then fire from the rooted stance | game-state.js:3112 (`emplace`) |
| `cryo-reservoir` | Cooling (equipment) | charge over rounds, spend the `purge`-class active for the pen spike | game-state.js:2114 (`cryoReservoir`) |
| `meltdown-protocol` | Thermal (equipment) | bank overheat, spend for pen/burst | game-state.js:2194 (`meltdownProtocol`) |
| `nanite-swarm` | Utility (equipment) | seed nanites (active), heal each Recovery | game-state.js (grep `naniteSwarm`) |

`reactor-overdrive` is **already done in Task 6** (the representative equipment-active hook). Before writing any hook above, **first confirm it is genuinely a player-issued active** (an `action ===` handler or an `availableActions` key), not an auto-reaction. If the engine applies the effect automatically on hit/recovery with no command, it needs NO hook — it measures passively through the equipment axis. Known auto-reactive (NO hook — verify they register in the Task 8 smoke run instead):
- `ablative-cascade` (Armor) — combat.js:658-660 auto-spends a charge on being hit; refills each Recovery (game-state.js:2084).
- `point-defense-system` (Countermeasures) — verify at combat.js:1718 (`pdLocked`/`interceptors`); if `applyDefensiveReactions` spends interceptors automatically, it is passive.

Excluded on purpose (measure without a hook — verify each really fires through plain play during the Task 8 smoke run; if any reads 0.00 there, promote it into this table):
- Passive/cadence/DoT weapon tiers (Cold Bore, Redline Governor, Penetrator Rounds, Napalm, Suppression Lock, Kneecapper, Skewer, etc.) — they trigger through firing.
- Spatial/narrated payoffs whose board effect needs a placement input (Barrage zone, Tow Chain fling, Piledriver shove, Momentum Swing knockback). These need the `inZone`/`outOfZone` measurement-input treatment from the spec's Risks section — **out of scope for this plan**; capture them as a follow-up task (see Task 10).

- [ ] **Per-hook loop (repeat for each row above):**
  - [ ] Read the cited handler; note the real state-field names.
  - [ ] Write the firing test in `piloting.test.mjs` (assert the verb appears for A1 at ceiling), run it, watch it FAIL.
  - [ ] Register the `{ceiling, conservative}` hook in `PILOTING_HOOKS`; add its `PILOTING_BIASES` line.
  - [ ] Run `node --test scripts/balance/piloting.test.mjs` — the firing test AND the `conservative ⊆ ceiling` invariant must pass.
  - [ ] Commit: `feat(balance): <upgrade> piloting hook`.

- [ ] **After all hooks: full-run sanity check.**

Run: `TRIALS=200 node scripts/balance/duel-sim.mjs > /tmp/duel.json 2>/tmp/progress.txt`
Then: `DATA=/tmp/duel.json node scripts/balance/duel-report.mjs`
Expected: no cell reads a structural 0.00 except the documented spatial exclusions; every registered hook shows a non-zero conservative or ceiling benefit; `PILOTING_BIASES` lists every hook.

---

## Task 10: Capture the spatial-effect follow-up + close out

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-upgrade-piloting-harness-design.md` (append a "Deferred" note)

- [ ] **Step 1: Append the deferred-work note to the spec**

Add a short section recording that spatial/narrated prototypes (Barrage, Tow Chain, Piledriver shove, Momentum Swing knockback) are measured via an `inZone`/`outOfZone` placement input, deferred to a follow-up plan, and that sub-project B must treat those tiers as harness-blind until then (rubric+feel, flagged).

- [ ] **Step 2: Run the whole balance test suite**

Run: `node --test "scripts/**/*.test.mjs"`
Expected: PASS — `piloting.test.mjs`, `duel-sim.test.mjs`, `policy.test.mjs` all green.

- [ ] **Step 3: Run the full project test suite (no regressions in shared/server)**

Run: `npm test`
Expected: PASS — the engine was never touched, so shared/server suites are unchanged.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-upgrade-piloting-harness-design.md
git commit -m "docs(balance): record spatial-effect follow-up + harness-blind tiers"
```

---

## Self-Review notes (for the executor)

- **Gate output, not a pinned test.** `benefit(risky) ≥ benefit(field)` is read off the report; never encode a magnitude in `*.test.mjs`. Tests assert firing + `conservative ⊆ ceiling` + determinism only.
- **Bias lines must be true.** Before each hook commit, re-read the hook predicate against its `PILOTING_BIASES` line. A line that overstates what the code does is the exact defect the last rework shipped repeatedly.
- **Never `git add -A`.** This branch has a concurrent committer — stage only the files each task names.
- **Engine stays zero-diff.** Every change is under `scripts/balance/`. If a task tempts you to edit `shared/`, stop — the harness borrows the engine, it does not modify it.
