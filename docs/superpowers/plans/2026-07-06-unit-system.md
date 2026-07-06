# Generic Unit System — Tanks & Walkers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-06-unit-system-design.md` end to end — turn the single Rig into one instance of a generic unit registry, then add Tank and Walker as new registry entries, with heat/arcs/preparations/action-budget/weapon-domain differences flowing from data. Rig behavior remains byte-for-byte identical (regressioned by the existing `shared/*.test.js` suites).

**Architecture:** A new `shared/unit-kinds.js` module holds the registry (per-kind `parts`, `hitLocation`, `armour`, and every behavioral flag from the spec). `shared/rules.js` grows kind-aware `hitLocation` + `impactRow` helpers that read the registry. `shared/game-state.js` swaps its hardcoded `LOCS` / cascade names / `RIG_DEFAULTS` / 3-action budget for registry lookups, guarded by role and by `hasHeat` / `hasArcs` / `reactions` flags. `shared/combat.js` skips the weight-class STR modifier for units whose registry marks `weaponMode: "flat-pick"`. A new shared `UNIT_WEAPONS` catalogue holds the flat weapon list Tanks and Walkers pick from. `server/prompt.js` teaches the LLM the three unit kinds and their commission grammar. Client: `HeatGauge` guards on `hasHeat`, the accordion/`rigView.ts` reads parts from the registry, and a new **Unit Wizard** replaces the Rig-only wizard so users can commission Rigs, Tanks, or Walkers.

**Tech Stack:** Vanilla ES modules (`shared/`), Node's built-in `node:test` + `node:assert/strict` for shared/server tests, React 18 + TypeScript + Vitest for the client, Express + `ws` server (unchanged by this plan).

**All strawman numbers (SP, IMPACT rows, ROF/STR, `ramStr`, speeds, `actionBudget`, `hitLocation` bands for cold kinds) match the design doc's ⚙-flagged tuning values verbatim.** They are placeholders to be tuned in playtesting; the plan wires them through unchanged.

---

## File Structure

| File | Change |
|---|---|
| `shared/unit-kinds.js` | **New.** Exports `ROLES`, `UNIT_KINDS` (rig, tank, walker) with `parts`, `hitLocation`, `armour`, `hasHeat`, `hasArcs`, `actionBudget`, `weaponMode`, `reloads`, `hasEquipment`, `reactions`, `ramStr`, `destruction`, `speed`. Plus `roleOf(kindId, partName)`, `partsByRole(kindId, role)`, `hitPart(kindId, d12)`, `impactRow(kindId, partName)`. |
| `shared/unit-kinds.test.js` | **New.** Verifies the registry shape (all 3 kinds carry every field, part names align with their `hitLocation` / `armour` keys, every part has a role from `ROLES`). |
| `shared/rules.js` | Delete the Rig-only `hitLocation` function and the `IMPACT` object; re-export shims from `unit-kinds.js` so callers get a `hitLocation(kindId, d12)` and `impactRow(kindId, partName)` signature. `WEIGHT_STR_MOD` / `AIM` / `RAM_STR` stay (Rig-only). |
| `shared/rules.test.js` | Update tests that referenced the flat `IMPACT.medium.hull` / `hitLocation(d12)` signature to the new kind-aware forms; add coverage that Tank + Walker rows exist. |
| `shared/game-state.js` | Replace hardcoded `LOCS` inside `recompute` / `catastrophicOnZero` / `catastrophicAdditional` / `applyOverheat` / `heatMeter` / `endActivation` / `bumpHeat` / activation budget with registry-driven code. Introduce `makeUnit(kind, id, name, weightClass, owner, weapons, equipment)`; keep `makeRig` as a thin caller so no external file needs to change in Phase A. Add the flat-pick weapon catalogue `UNIT_WEAPONS` + `normalizeUnitWeapon`. |
| `shared/game-state.test.js` | Byte-for-byte regression coverage stays. Add new tests: Tank commissioning, Tank Turret 0-SP cascade uses `weapon` role (weapon destroyed + munition cook-off = 1 to structural + 1 to power), Tank action budget = 2, Tank `hasHeat=false` no overheat roll, Walker parts + hit table, flat-pick STR skips weight-class mod. |
| `shared/combat.js` | `computeStr` skips `WEIGHT_STR_MOD` when the weapon comes from the flat-pick catalogue (marker: `profile.flatPick === true`). `arcBonus` short-circuits (returns `0`) when the target's registry has `hasArcs: false` (dead code today; wired for the deferred infantry kind). Weapon-slot lookup at `resolveAttack` reads `attacker.weapons?.[slot]` for Rigs and `attacker.weapons?.unit` for flat-pick units. |
| `shared/combat.test.js` | Add tests for flat-pick STR (no weight-class mod), for Tank Cannon and Autocannon profiles, and for `arcBonus` short-circuit under `hasArcs:false`. |
| `shared/battle-view.js` | `rigModifiers` derives the part-name chip strings from `roleOf(kind, part)` instead of hardcoded `hull`/`engine`/`legs`. `availableActions` reads `actionBudget` from the unit's registry entry and hides `prepare` / `shutdown` when `reactions === false` / `hasHeat === false`. The equipment-active line skips when `hasEquipment === false`. |
| `shared/battle-view.test.js` | Add: Tank action console has 2 actions, no prepare, no shutdown, no equipment button. Modifier chips address a Tank by "Tracks 0 …" / "Turret 0 …". |
| `server/prompt.js` | The tracker protocol's `loc` enum becomes a per-kind enum ("hull|arms|legs|engine" for Rigs, "hull|tracks|turret|engine" for Tanks, "hull|legs|mount|engine" for Walkers). Add unit kinds to the commission section ("Commission a Tank", "Commission a Walker"). Stat-block generation reads parts from the registry and hides heat rows for cold kinds. |
| `server/prompt.test.js` (if present) | Update snapshot to the new stat block (kind-aware) and the extended commission grammar. Otherwise skip. |
| `client/src/state/types.ts` | Replace the fixed `Loc = "hull" \| "arms" \| "legs" \| "engine"` with `type Loc = string;` (parts are runtime-driven from the registry). `Rig` becomes `Unit` with an optional `kind: "rig" \| "tank" \| "walker"` and a `parts: Record<string, Component>` map. Preserve the old top-level `hull`/`arms`/`legs`/`engine` fields on rig instances for backward compatibility with client hot spots that read them directly. |
| `client/src/lib/rigView.ts` | Read parts from `unit.parts` / registry rather than the hardcoded `LOCS`. Rename to `unitView.ts` inside this plan but keep `rigView.ts` re-exporting the same names to keep imports stable. |
| `client/src/components/rig/RigItem.tsx` | `const LOCS: Loc[]` line becomes `Object.keys(unit.parts)`. |
| `client/src/components/rig/HeatGauge.tsx` | Return `null` when the unit's registry `hasHeat === false`. |
| `client/src/components/wizards/RigWizard.tsx` | Extend into `UnitWizard`: adds a "kind" step (Rig / Tank / Walker), branches to weight-class + 2 weapons + equipment for rigs vs a single flat-pick weapon and no equipment for tanks / walkers. `RigWizard.tsx` becomes a thin re-export wrapper. |
| `client/src/components/rig/CompRow.tsx` | No change (already generic). |
| `docs/superpowers/plans/2026-07-06-unit-system.md` | This file. |

---

## Terminology

Throughout the plan **kind** means one of the three registry entries (`"rig"`, `"tank"`, `"walker"`). **Part** is one of the four components on a unit — always four in this plan (the D12 hit table depends on it). **Role** is one of `"structural"`, `"power"`, `"mobility"`, `"weapon"`.

---

## Phase A — Registry + role refactor (Rig behavior unchanged)

Goal for Phase A: land `shared/unit-kinds.js`, rewrite every hardcoded `LOCS` / catastrophic-cascade / heat-routing branch to look up part-name via role, and prove nothing regressed by running the existing `shared/*.test.js` suites. After Phase A the code base has zero hardcoded `"hull"` / `"engine"` / `"arms"` / `"legs"` name-branches in cascades and heat routing, but only the Rig kind is exposed.

**Shared exports needed by later tests.** `shared/game-state.js` already exposes `applyDamage` through the `__test` namespace (line ~1279: `export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig };`). `setRigSp` is file-private; add it to that same `__test` object. In every test block below that reads `applyDamage(...)` or `setRigSp(...)`, use `__test.applyDamage(...)` and `__test.setRigSp(...)` — matching the existing convention (see `shared/game-state.test.js:787`). `makeUnit`, `UNIT_WEAPONS`, `normalizeUnitWeapon`, and `partsByRole` are added as normal exports by later tasks; `applyCommand` is already exported.

As a one-shot housekeeping commit at the start of Phase A: extend the `__test` object literal to include `setRigSp`. That is the only pre-work.

```javascript
// shared/game-state.js line ~1279
export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig, setRigSp };
```

Commit: `git commit -m "chore(units): expose setRigSp on __test namespace"`.

### Task 1: Create the registry module with the Rig entry only

**Files:**
- Create: `shared/unit-kinds.js`
- Create: `shared/unit-kinds.test.js`

- [ ] **Step 1: Write the failing tests**

Create `shared/unit-kinds.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, UNIT_KINDS, roleOf, partsByRole, hitPart, impactRow, kindOf,
} from "./unit-kinds.js";

test("ROLES lists the four generalized component roles", () => {
  assert.deepEqual([...ROLES].sort(), ["mobility", "power", "structural", "weapon"]);
});

test("UNIT_KINDS.rig maps every part to a role from ROLES", () => {
  const rig = UNIT_KINDS.rig;
  assert.ok(rig, "rig kind exists");
  assert.equal(rig.parts.length, 4);
  const names = rig.parts.map((p) => p.name);
  assert.deepEqual(names, ["hull", "arms", "legs", "engine"]);
  for (const p of rig.parts) assert.ok(ROLES.includes(p.role), `${p.name} role in ROLES`);
});

test("Rig registry mirrors today's flags", () => {
  const r = UNIT_KINDS.rig;
  assert.equal(r.hasHeat, true);
  assert.equal(r.hasArcs, true);
  assert.equal(r.actionBudget, 3);
  assert.equal(r.weaponMode, "rig-catalog");
  assert.equal(r.reloads, true);
  assert.equal(r.hasEquipment, true);
  assert.equal(r.reactions, true);
  assert.equal(r.destruction, "single-model");
});

test("roleOf resolves a part-name to its role", () => {
  assert.equal(roleOf("rig", "hull"), "structural");
  assert.equal(roleOf("rig", "arms"), "weapon");
  assert.equal(roleOf("rig", "legs"), "mobility");
  assert.equal(roleOf("rig", "engine"), "power");
  assert.equal(roleOf("rig", "missing"), null);
});

test("partsByRole returns every part matching that role", () => {
  assert.deepEqual(partsByRole("rig", "structural"), ["hull"]);
  assert.deepEqual(partsByRole("rig", "weapon"), ["arms"]);
});

test("hitPart returns the D12 → part-name for a kind", () => {
  assert.equal(hitPart("rig", 1), "hull");
  assert.equal(hitPart("rig", 4), "hull");
  assert.equal(hitPart("rig", 5), "arms");
  assert.equal(hitPart("rig", 7), "arms");
  assert.equal(hitPart("rig", 8), "legs");
  assert.equal(hitPart("rig", 10), "legs");
  assert.equal(hitPart("rig", 11), "engine");
  assert.equal(hitPart("rig", 12), "engine");
});

test("impactRow returns { direct, severe, critical } per weight class + part", () => {
  const row = impactRow("rig", "hull", "medium");
  assert.equal(row.direct, 11);
  assert.equal(row.severe, 14);
  assert.equal(row.critical, 17);
});

test("kindOf(unit) returns the registry id, defaulting to 'rig' on legacy shape", () => {
  assert.equal(kindOf({ kind: "tank" }), "tank");
  assert.equal(kindOf({ weightClass: "medium" }), "rig"); // legacy Rig has no `kind` field
  assert.equal(kindOf(null), "rig");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/unit-kinds.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `shared/unit-kinds.js`**

```javascript
// Unit-type registry. Every unit kind (Rig / Tank / Walker) is one entry here;
// cascade branches on role (not part-name), the activation loop reads
// actionBudget per unit, and heat / arcs / preparations are guarded on flags.
// Adding a new machine is a new registry entry — no engine changes.

export const ROLES = ["structural", "power", "mobility", "weapon"];

// The four Rig weight classes still own their own IMPACT rows; a Tank / Walker
// carries a single flat row per part (weightClass field ignored for cold kinds).
const RIG_IMPACT = {
  light: {
    hull:   { direct: 10, severe: 14, critical: 16 },
    arms:   { direct: 10, severe: 12, critical: 14 },
    legs:   { direct: 10, severe: 13, critical: 15 },
    engine: { direct: 7,  severe: 10, critical: 12 },
  },
  medium: {
    hull:   { direct: 11, severe: 14, critical: 17 },
    arms:   { direct: 10, severe: 13, critical: 15 },
    legs:   { direct: 11, severe: 13, critical: 15 },
    engine: { direct: 8,  severe: 10, critical: 12 },
  },
  heavy: {
    hull:   { direct: 13, severe: 15, critical: 17 },
    arms:   { direct: 12, severe: 14, critical: 16 },
    legs:   { direct: 14, severe: 16, critical: 17 },
    engine: { direct: 8,  severe: 11, critical: 13 },
  },
  colossal: {
    hull:   { direct: 13, severe: 16, critical: 17 },
    arms:   { direct: 13, severe: 14, critical: 16 },
    legs:   { direct: 13, severe: 16, critical: 17 },
    engine: { direct: 9,  severe: 11, critical: 14 },
  },
};

export const UNIT_KINDS = {
  rig: {
    id: "rig",
    label: "Rig",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "arms",   role: "weapon" },
      { name: "legs",   role: "mobility" },
      { name: "engine", role: "power" },
    ],
    // D12 hit-location table — { min: inclusive D12 low bound, part: string }.
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "arms" },
      { min: 8,  part: "legs" },
      { min: 11, part: "engine" },
    ],
    armour: RIG_IMPACT, // keyed by weightClass then part-name
    hasHeat: true,
    hasArcs: true,
    actionBudget: 3,
    weaponMode: "rig-catalog", // uses long-range + melee slots + upgrades + weight scaling
    reloads: true,
    hasEquipment: true,
    reactions: true,
    ramStr: null, // Rigs use RAM_STR by weightClass from rules.js
    destruction: "single-model",
  },
};

export function kindOf(unit) {
  if (!unit || typeof unit !== "object") return "rig";
  const k = unit.kind;
  return typeof k === "string" && UNIT_KINDS[k] ? k : "rig";
}

export function partsOf(kindId) {
  return UNIT_KINDS[kindId]?.parts || [];
}

export function partNamesOf(kindId) {
  return partsOf(kindId).map((p) => p.name);
}

export function roleOf(kindId, partName) {
  const p = partsOf(kindId).find((p) => p.name === partName);
  return p ? p.role : null;
}

export function partsByRole(kindId, role) {
  return partsOf(kindId).filter((p) => p.role === role).map((p) => p.name);
}

export function hitPart(kindId, d12) {
  const rows = UNIT_KINDS[kindId]?.hitLocation || [];
  const n = Math.floor(Number(d12) || 0);
  let picked = rows[0]?.part;
  for (const row of rows) if (n >= row.min) picked = row.part;
  return picked;
}

export function impactRow(kindId, partName, weightClass) {
  const armour = UNIT_KINDS[kindId]?.armour;
  if (!armour) return null;
  // Rig-kind armour is nested by weightClass; cold kinds hold a flat map.
  if (weightClass && armour[weightClass]) return armour[weightClass][partName];
  return armour[partName];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/unit-kinds.test.js`
Expected: PASS — 8 subtests.

- [ ] **Step 5: Commit**

```bash
git add shared/unit-kinds.js shared/unit-kinds.test.js
git commit -m "feat(units): add unit-kind registry with Rig entry"
```

---

### Task 2: Re-export kind-aware hitLocation + impactRow from rules.js

**Files:**
- Modify: `shared/rules.js` (lines 49–84 replaced)
- Modify: `shared/rules.test.js`

- [ ] **Step 1: Write the failing test**

Update `shared/rules.test.js` — replace the current `IMPACT` and `hitLocation` tests. Add these tests (importing from `rules.js`):

```javascript
test("hitLocation(kindId, d12) resolves via the registry for rigs", () => {
  assert.equal(hitLocation("rig", 3), "hull");
  assert.equal(hitLocation("rig", 6), "arms");
  assert.equal(hitLocation("rig", 9), "legs");
  assert.equal(hitLocation("rig", 12), "engine");
});

test("impactRow(kindId, partName, weightClass) returns rig rows unchanged", () => {
  const row = impactRow("rig", "hull", "heavy");
  assert.equal(row.direct, 13);
  assert.equal(row.severe, 15);
  assert.equal(row.critical, 17);
});
```

Delete the tests that read from the old `IMPACT.medium.engine` object literal shape (they no longer make sense once `IMPACT` is gone from `rules.js`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/rules.test.js`
Expected: FAIL — `hitLocation` still has the D12-only signature.

- [ ] **Step 3: Replace the Rig-only helpers in `shared/rules.js`**

Remove `IMPACT` (lines 59–84) and the old `hitLocation(d12)` (lines 50–56). Replace with delegation into the registry:

```javascript
import { hitPart, impactRow as _impactRow } from "./unit-kinds.js";

// Hit-location table (§7): defender's D12 → part-name, keyed by unit kind.
export function hitLocation(kindId, d12) {
  return hitPart(kindId, d12);
}

// Impact Tables (§2): minimum totals for each severity, per kind × part × class.
export function impactRow(kindId, partName, weightClass) {
  return _impactRow(kindId, partName, weightClass);
}
```

Leave `impactSeverity`, `HEAT_THRESHOLDS`, `heatThreshold`, `WEIGHT_STR_MOD`, `AIM`, `RAM_STR`, `shieldCoverage`, `ACTIONS` untouched — they are still Rig-tier concerns.

- [ ] **Step 4: Fix every caller**

Grep the repo: `rg -n 'hitLocation\(|IMPACT\[' shared server client`. There are three call sites in `shared/combat.js` (`hitLocation(locDie)`, `hitLocation(rollD(...))` inside cleave, and inside `applyOnHitPerks` cluster) and one in `resolveRam` (`IMPACT[rig.weightClass][loc]`). Rewrite them to take a kind:

```javascript
// combat.js — inside resolveAttack (~line 126)
const kind = attacker.kind || "rig"; // legacy Rigs default
location = opts.aimed ? opts.aimedLoc : hitLocation(kind, locDie);
```

For `resolveRam`:

```javascript
const kind = rig.kind || "rig";
const loc = hitLocation(kind, rollD(12, d.location, random));
const row = impactRow(kind, loc, rig.weightClass);
const sev = impactSeverity(total, row);
```

For `rollImpacts`:

```javascript
const kind = target.kind || "rig";
const row = impactRow(kind, location, target.weightClass);
```

- [ ] **Step 5: Run all shared tests**

Run: `node --test shared/rules.test.js shared/combat.test.js shared/game-state.test.js shared/battle-view.test.js`
Expected: PASS — Rig behavior byte-for-byte unchanged.

- [ ] **Step 6: Commit**

```bash
git add shared/rules.js shared/rules.test.js shared/combat.js
git commit -m "refactor(units): route hitLocation and impactRow through registry"
```

---

### Task 3: Rewrite catastrophicOnZero / catastrophicAdditional on role

**Files:**
- Modify: `shared/game-state.js` (lines 529–555)
- Modify: `shared/game-state.test.js`

- [ ] **Step 1: Add a failing test that pins Rig cascade behavior**

Add to `shared/game-state.test.js`:

```javascript
test("engine-role zero fires the 'lose next activation' clause (regression)", () => {
  const room = createRoomStub();
  const rig = commissionMediumRig(room, "Alpha");
  rig.engine.sp = 1;
  applyDamage(room, rig, "engine", 1, {});
  assert.equal(rig.skipNextActivation, true);
});

test("weapon-role zero rolls the weapon-destroy D12 and cooks off 1+1 (regression)", () => {
  const room = createRoomStub();
  const rig = commissionMediumRig(room, "Alpha");
  const hullBefore = rig.hull.sp;
  const engineBefore = rig.engine.sp;
  rig.arms.sp = 1;
  applyDamage(room, rig, "arms", 1, { dice: { armsWeapon: 3 } });
  assert.ok(rig.weaponsDestroyed.includes(rig.weapons.longRange));
  assert.equal(rig.hull.sp, hullBefore - 1);
  assert.equal(rig.engine.sp, engineBefore - 1);
});
```

(Reuse whatever `createRoomStub` / `commissionMediumRig` helpers already exist near the top of `game-state.test.js`; if none exist yet, write `commissionMediumRig` as a two-line helper: `const r = makeRig("id", "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null); room.rigs.push(r); return r;`.)

- [ ] **Step 2: Run tests to verify they pass under the current (name-branched) code**

Run: `node --test shared/game-state.test.js`
Expected: PASS — these tests describe today's behavior; they exist to catch regressions when we swap the implementation to role-branched.

- [ ] **Step 3: Rewrite the cascade to key on role**

Replace lines 529–555 of `shared/game-state.js` with:

```javascript
import { kindOf, roleOf, partsByRole } from "./unit-kinds.js";

// §8 — effect when a component first reaches 0 SP. May recurse via applyDamage.
function catastrophicOnZero(room, rig, loc, opts) {
  const kind = kindOf(rig);
  const role = roleOf(kind, loc);
  if (role === "power") {
    // Overclock Core (Rig only) — the first time the power part hits 0 SP,
    // the unit does not skip its next activation.
    if (rig.equipment === "overclock-core" && !rig.overclockCoreUsed) rig.overclockCoreUsed = true;
    else rig.skipNextActivation = true;
    if (rig.engine) rig.engine.heat = Math.max(rig.engine.heat, 3);
  } else if (role === "weapon") {
    if (kind === "rig") {
      // Rig two-slot weapon-destroy roll (D12 ≤6 → long-range, >6 → melee)
      const roll = rollD(12, opts?.dice?.armsWeapon, opts?.random);
      const slot = roll <= 6 ? "longRange" : "melee";
      const name = rig.weapons?.[slot];
      if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    } else {
      // Flat-pick kinds carry exactly one gun on the weapon part.
      const name = rig.weapons?.unit;
      if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    }
    // Munition cook-off: 1 to a structural + 1 to a power part.
    const [structPart] = partsByRole(kind, "structural");
    const [powerPart] = partsByRole(kind, "power");
    if (structPart) applyDamage(room, rig, structPart, 1, opts);
    if (powerPart) applyDamage(room, rig, powerPart, 1, opts);
  }
  // structural and mobility 0-SP effects are enforced where they apply
  // (activation budget, combat modAim, movement) — no state to set here.
}

// §8 — additional damage to an already 0-SP location.
function catastrophicAdditional(room, rig, loc, opts) {
  const kind = kindOf(rig);
  const role = roleOf(kind, loc);
  if (role === "structural" || role === "power") rig[loc].destroyed = true;
  else if (role === "mobility") rig.immobilised = true;
  else if (role === "weapon") {
    const [structPart] = partsByRole(kind, "structural");
    if (structPart) applyDamage(room, rig, structPart, 3, opts);
  }
}
```

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS — including the two new regression tests and every equipment / heat / weapon test already in the file.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(units): role-key catastrophic cascade branches"
```

---

### Task 4: Registry-drive recompute + applyOverheat + heatMeter

**Files:**
- Modify: `shared/game-state.js` (lines 518–527, 683–720)

- [ ] **Step 1: Write a failing regression test**

Add to `shared/game-state.test.js`:

```javascript
test("recompute destroys the unit when every registered part hits 0 (regression)", () => {
  const room = createRoomStub();
  const rig = commissionMediumRig(room, "Alpha");
  for (const p of ["hull", "arms", "legs", "engine"]) setRigSp(rig, p, 0);
  assert.equal(rig.destroyed, true);
});

test("recompute leaves the unit alive while any part has SP (regression)", () => {
  const room = createRoomStub();
  const rig = commissionMediumRig(room, "Alpha");
  setRigSp(rig, "hull", 0);
  setRigSp(rig, "arms", 0);
  setRigSp(rig, "legs", 0);
  assert.equal(rig.destroyed, false);
});
```

- [ ] **Step 2: Run to confirm they pass under today's code**

Run: `node --test shared/game-state.test.js`
Expected: PASS (pinning current behavior).

- [ ] **Step 3: Rewrite `recompute` + `applyOverheat` + `heatMeter`**

Line 518–526 replacement:

```javascript
import { partNamesOf, partsByRole } from "./unit-kinds.js";

function engineHeatFloor(rig) {
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return 0;
  const [powerPart] = partsByRole(kind, "power");
  return rig[powerPart]?.sp === 0 ? 3 : 0;
}

function recompute(rig) {
  const kind = kindOf(rig);
  const names = partNamesOf(kind);
  const destroyed = rig.parts
    ? names.some((n) => rig.parts[n]?.destroyed)
    : (rig.hull?.destroyed || rig.engine?.destroyed);
  rig.destroyed = destroyed || names.every((n) => (rig.parts ? rig.parts[n]?.sp === 0 : rig[n]?.sp === 0));
  const floor = engineHeatFloor(rig);
  if (rig.engine && rig.engine.heat < floor) rig.engine.heat = floor;
}
```

Line 711–720 replacement (`applyOverheat`):

```javascript
function applyOverheat(room, rig, total, opts) {
  const row = heatThreshold(total);
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return row; // guard: cold units skip overheat entirely
  const [structPart] = partsByRole(kind, "structural");
  const [powerPart]  = partsByRole(kind, "power");
  const [mobPart]    = partsByRole(kind, "mobility");
  const [weapPart]   = partsByRole(kind, "weapon");
  const all = partNamesOf(kind);
  if (row.key === "stall") applyDamage(room, rig, powerPart, 1, opts);
  else if (row.key === "detonation") applyDamage(room, rig, weapPart, 2, opts);
  else if (row.key === "blowout") { applyDamage(room, rig, mobPart, 2, opts); rig.speedHalvedNextRound = true; }
  else if (row.key === "buckling") for (const l of all) applyDamage(room, rig, l, 1, opts);
  else if (row.key === "engine-failure") { applyDamage(room, rig, powerPart, 2, opts); rig.noCool = true; }
  else if (row.key === "catastrophic") { for (const l of all) setRigSp(rig, l, 0); rig.noCool = true; }
  return row;
}
```

`heatMeter` change (line 362):

```javascript
export function heatMeter(rig) {
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return { heat: 0, cap: 0, floor: 0, over: 0, bonus: 0, zone: "none" };
  // (rest of function unchanged)
}
```

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/game-state.test.js shared/rules.test.js shared/combat.test.js shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(units): registry-drive recompute, applyOverheat, heatMeter"
```

---

### Task 5: Introduce `parts` map on units (opt-in, back-compat)

**Files:**
- Modify: `shared/game-state.js` (`makeRig` / `ensureRigShape`)

Motivation: Tanks name their parts `tracks` / `turret`. To avoid `rig.tracks` / `rig.turret` collisions with existing Rig code, every unit gets a `parts` map (`rig.parts.hull === rig.hull` on rigs — same object reference). Rig code keeps reading `rig.hull` / `rig.engine`; Tank/Walker code reads `rig.parts.<partName>`. `recompute` in Task 4 already handles both shapes.

- [ ] **Step 1: Write a failing test**

Add to `shared/game-state.test.js`:

```javascript
test("makeRig exposes a parts map aliasing the four fixed component fields", () => {
  const rig = makeRig("id", "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  assert.equal(rig.parts.hull, rig.hull);
  assert.equal(rig.parts.arms, rig.arms);
  assert.equal(rig.parts.legs, rig.legs);
  assert.equal(rig.parts.engine, rig.engine);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.parts is undefined`.

- [ ] **Step 3: Add the `parts` map inside `makeRig`**

Immediately before the `return { ... }` in `makeRig` (line 329), add:

```javascript
const parts = {}; // aliased below so rig.parts.hull === rig.hull
```

And append `parts,` to the returned object literal at line 330. Then after `return`, wire the aliases — the cleanest way is to build the object first, then set `parts` fields:

```javascript
export function makeRig(id, name, cls, owner, weapons = {}, equipment = null) {
  // (existing lookups: normalizedClass, longRange, melee, d, equipmentId, hullMax)
  const rig = {
    id,
    name: String(name || "Rig").trim() || "Rig",
    kind: "rig",
    weightClass,
    owner: owner === "b" ? "b" : "a",
    hull:   { sp: hullMax,  max: hullMax,  destroyed: false },
    arms:   { sp: d.arms,   max: d.arms,   destroyed: false },
    legs:   { sp: d.legs,   max: d.legs,   destroyed: false },
    engine: { sp: d.engine, max: d.engine, destroyed: false, heat: 0 },
    // (all other fields unchanged)
    weapons: { longRange, melee },
    weaponUpgrades,
    equipment: equipmentId,
    prepare: 0,
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    loaded: { longRange: true, melee: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    hardened: false,
    overclockCoreUsed: false,
    actionPenaltyNextActivation: 0,
    hullRepairLock: 0,
    destroyed: false,
  };
  rig.parts = { hull: rig.hull, arms: rig.arms, legs: rig.legs, engine: rig.engine };
  return rig;
}
```

Do the same in `ensureRigShape` (search for it in `game-state.js`): after the shape is normalized, set `rig.parts = { hull: rig.hull, ... }` if `rig.parts` is missing, and set `rig.kind = rig.kind || "rig"`.

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(units): expose parts map alias on rigs"
```

---

### Task 6: Extract makeUnit factory (Rig delegates through)

**Files:**
- Modify: `shared/game-state.js`

- [ ] **Step 1: Write a failing test**

Add:

```javascript
test("makeUnit('rig', ...) returns a rig identical to makeRig", () => {
  const a = makeRig("id", "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  const b = makeUnit("rig", "id", "Alpha", "a", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
  assert.deepEqual({ ...a }, { ...b });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `makeUnit is not defined`.

- [ ] **Step 3: Add `makeUnit` and re-export it**

At the bottom of the file's export block:

```javascript
export function makeUnit(kindId, id, name, owner, opts = {}) {
  const kind = UNIT_KINDS[kindId];
  if (!kind) return null;
  if (kindId === "rig") {
    return makeRig(id, name, opts.weightClass, owner, {
      longRange: opts.longRange, melee: opts.melee,
      longRangeUpgrade: opts.longRangeUpgrade, meleeUpgrade: opts.meleeUpgrade,
    }, opts.equipment ?? null);
  }
  // Tank / Walker branches land in Phase B.
  return null;
}
```

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(units): add makeUnit factory delegating to makeRig"
```

---

### Task 7: Registry-drive the activation action budget

**Files:**
- Modify: `shared/game-state.js` (line 1049)
- Modify: `shared/battle-view.js` (line 51)

- [ ] **Step 1: Write a failing test**

Add:

```javascript
test("activation reads actionBudget from the unit registry (rig = 3)", () => {
  const room = createRoomStub();
  const rig = commissionMediumRig(room, "Alpha");
  // Simulate the activate branch
  applyCommand(room, "activate", { name: rig.name }, { side: "a" });
  assert.equal(room.game.turn.actionsMax, 3);
});
```

- [ ] **Step 2: Run and verify it passes under today's code (regression pin)**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 3: Refactor the activation budget calculation**

Line 1049 replacement:

```javascript
const base = UNIT_KINDS[kindOf(rig)]?.actionBudget ?? 3;
const [structPart] = partsByRole(kindOf(rig), "structural");
const structPenalty = structPart && rig[structPart]?.sp === 0 ? 2 : 0;
t.actionsMax = Math.max(0, base - structPenalty - penalty);
```

Line 51 of `shared/battle-view.js` replacement:

```javascript
import { kindOf, partsByRole } from "./unit-kinds.js";

export function actionBudget(rig, turn) {
  const [structPart] = partsByRole(kindOf(rig), "structural");
  return {
    used: turn.actionsUsed, max: turn.actionsMax,
    left: Math.max(0, turn.actionsMax - turn.actionsUsed),
    reduced: structPart && rig[structPart]?.sp === 0,
  };
}
```

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/game-state.test.js shared/battle-view.test.js`
Expected: PASS — 3 base + 2 structural penalty is byte-for-byte the old formula for Rigs.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/battle-view.js shared/game-state.test.js
git commit -m "refactor(units): registry-drive activation budget"
```

---

### Task 8: Role-derived rigModifiers chip strings

**Files:**
- Modify: `shared/battle-view.js` (lines 56–72)
- Modify: `shared/battle-view.test.js`

- [ ] **Step 1: Write a failing test**

Add:

```javascript
test("rigModifiers reports chips by role-derived label (regression for rig names)", () => {
  const rig = commissionMediumRig("Alpha");
  rig.hull.sp = 0;
  const mods = rigModifiers(rig);
  assert.ok(mods.find((m) => m.tag.startsWith("Hull 0")));
});
```

- [ ] **Step 2: Run and verify PASS (pin)**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 3: Rewrite `rigModifiers`**

```javascript
export function rigModifiers(rig) {
  const kind = kindOf(rig);
  const [structPart] = partsByRole(kind, "structural");
  const [powerPart]  = partsByRole(kind, "power");
  const [mobPart]    = partsByRole(kind, "mobility");
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";
  const mods = [];
  if (structPart && rig[structPart].sp === 0 && !rig[structPart].destroyed)
    mods.push({ key: `${structPart}0`, tag: `${cap(structPart)} 0 · −2 actions −1 Aim`, tone: "crit" });
  if (UNIT_KINDS[kind].hasHeat && powerPart && rig[powerPart].sp === 0 && !rig[powerPart].destroyed)
    mods.push({ key: `${powerPart}0`, tag: `${cap(powerPart)} 0 · heat ≥3`, tone: "crit" });
  if (mobPart && rig[mobPart].sp === 0 && !rig.immobilised)
    mods.push({ key: `${mobPart}0`, tag: `${cap(mobPart)} 0 · −3\" move`, tone: "warn" });
  if (rig.immobilised) mods.push({ key: "immobile", tag: "Immobilised", tone: "crit" });
  if (rig.noCool) mods.push({ key: "nocool", tag: "No cooling", tone: "crit" });
  if (rig.speedHalvedNextRound) mods.push({ key: "speed", tag: "Speed halved", tone: "warn" });
  if (rig.skipNextActivation) mods.push({ key: "skip", tag: "Skips next activation", tone: "warn" });
  if (UNIT_KINDS[kind].reactions && rig.preparation) {
    const p = rig.preparation;
    const tag = p.hidden || p.faceUp === false ? "Reaction set" : prepLabel(p.type);
    mods.push({ key: "prep", tag, tone: "prep" });
  }
  for (const w of rig.weaponsDestroyed || []) mods.push({ key: "weapon", tag: `Weapon lost: ${w}`, tone: "warn" });
  if (rig.loaded && rig.loaded.longRange === false) mods.push({ key: "unloaded", tag: "Ranged unloaded", tone: "warn" });
  return mods;
}
```

- [ ] **Step 4: Run all shared tests**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "refactor(units): derive modifier chips from role"
```

---

### Task 9: Client — LOCS from the registry

**Files:**
- Modify: `client/src/state/types.ts`
- Modify: `client/src/lib/rigView.ts`
- Modify: `client/src/components/rig/RigItem.tsx`

- [ ] **Step 1: Widen the `Loc` type and add `kind` to `Rig`**

In `client/src/state/types.ts`, replace `type Loc = "hull" | "arms" | "legs" | "engine"` (search for it) with:

```typescript
export type Loc = string;

export interface Unit {
  id: number;
  name: string;
  kind: "rig" | "tank" | "walker";
  owner: string;
  weightClass?: string;
  parts: Record<string, Component>;
  destroyed: boolean;
  // …every existing Rig field remains, still typed as before…
}

export type Rig = Unit; // alias while the rest of the client refers to `Rig`
```

- [ ] **Step 2: Read part names from the registry, not `LOCS`**

`client/src/lib/rigView.ts`:

```typescript
import type { Rig, Component } from "../state/types";
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";

// (barClass unchanged)

export function rigStatus(rig: Rig): { text: string; cls: string } {
  const parts = partNamesOf(kindOf(rig));
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit" };
  if (parts.some((l) => (rig as any)[l]?.sp === 0)) return { text: "⚠ Catastrophic damage", cls: "crit" };
  if (parts.some((l) => (rig as any)[l]?.sp / (rig as any)[l]?.max <= 0.34))
    return { text: "▲ Heavy damage — operational", cls: "warn" };
  if (parts.some((l) => (rig as any)[l]?.sp < (rig as any)[l]?.max))
    return { text: "◆ Damaged — operational", cls: "warn" };
  return { text: "● All systems nominal", cls: "" };
}
```

`client/src/components/rig/RigItem.tsx` — replace `const LOCS: Loc[] = ["hull", "arms", "legs", "engine"];` (line 12) with:

```typescript
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";
// …
const LOCS: string[] = partNamesOf(kindOf(rig));
```

Move the `LOCS` assignment inside the component body so it recomputes when a rig with a different `kind` is rendered.

- [ ] **Step 3: Type check**

Run: `npm run typecheck` (or `npx tsc --noEmit` if no script exists)
Expected: PASS.

- [ ] **Step 4: Vitest smoke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/types.ts client/src/lib/rigView.ts client/src/components/rig/RigItem.tsx
git commit -m "refactor(units): read client part names from registry"
```

---

**Phase A checkpoint:** All `shared/*.test.js` suites pass. The Rig behaves identically. There is a working registry with one entry. Commit tag suggestion: `git tag phase-a-unit-registry`.

---

## Phase B — Tank and Walker registry entries

Goal: expose two new kinds through the registry only. `makeUnit("tank", …)` and `makeUnit("walker", …)` return valid units; the engine handles them because Phase A already routes through role + flags.

### Task 10: Add Tank + Walker registry entries with strawman tuning

**Files:**
- Modify: `shared/unit-kinds.js`
- Modify: `shared/unit-kinds.test.js`

- [ ] **Step 1: Write failing tests**

Add:

```javascript
test("Tank entry — parts, roles, flags, strawman armour", () => {
  const t = UNIT_KINDS.tank;
  assert.ok(t);
  assert.deepEqual(t.parts.map((p) => p.name), ["hull", "tracks", "turret", "engine"]);
  assert.equal(roleOf("tank", "hull"), "structural");
  assert.equal(roleOf("tank", "tracks"), "mobility");
  assert.equal(roleOf("tank", "turret"), "weapon");
  assert.equal(roleOf("tank", "engine"), "power");
  assert.equal(t.hasHeat, false);
  assert.equal(t.hasArcs, true);
  assert.equal(t.actionBudget, 2);
  assert.equal(t.weaponMode, "flat-pick");
  assert.equal(t.reloads, true);
  assert.equal(t.hasEquipment, false);
  assert.equal(t.reactions, false);
  assert.equal(t.ramStr, 9);
  assert.equal(t.destruction, "single-model");
  assert.equal(t.speed, 3);
  assert.equal(hitPart("tank", 3), "hull");
  assert.equal(hitPart("tank", 6), "tracks");
  assert.equal(hitPart("tank", 9), "turret");
  assert.equal(hitPart("tank", 12), "engine");
  const row = impactRow("tank", "hull");
  assert.equal(row.direct, 13);
  assert.equal(row.severe, 15);
  assert.equal(row.critical, 17);
});

test("Walker entry — parts, roles, flags, Sentinel strawman", () => {
  const w = UNIT_KINDS.walker;
  assert.ok(w);
  assert.deepEqual(w.parts.map((p) => p.name), ["hull", "legs", "mount", "engine"]);
  assert.equal(roleOf("walker", "mount"), "weapon");
  assert.equal(w.hasHeat, false);
  assert.equal(w.actionBudget, 3);
  assert.equal(w.ramStr, 8);
  assert.equal(w.speed, 4);
  assert.equal(hitPart("walker", 6), "legs");
  assert.equal(hitPart("walker", 9), "mount");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test shared/unit-kinds.test.js`
Expected: FAIL — `UNIT_KINDS.tank is undefined`.

- [ ] **Step 3: Add the two entries**

Append to `UNIT_KINDS` in `shared/unit-kinds.js`:

```javascript
  tank: {
    id: "tank",
    label: "Tank",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "tracks", role: "mobility" },
      { name: "turret", role: "weapon" },
      { name: "engine", role: "power" },
    ],
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "tracks" },
      { min: 8,  part: "turret" },
      { min: 11, part: "engine" },
    ],
    // Strawman ⚙ — heavy-Rig-grade armour, tuned in playtest.
    armour: {
      hull:   { direct: 13, severe: 15, critical: 17 },
      tracks: { direct: 14, severe: 16, critical: 17 },
      turret: { direct: 12, severe: 14, critical: 16 },
      engine: { direct: 8,  severe: 11, critical: 13 },
    },
    // Strawman ⚙ — starting SP (mirrored into makeUnit below).
    partSp: { hull: 8, tracks: 7, turret: 6, engine: 6 },
    hasHeat: false,
    hasArcs: true,
    actionBudget: 2,
    weaponMode: "flat-pick",
    reloads: true,
    hasEquipment: false,
    reactions: false,
    ramStr: 9,
    destruction: "single-model",
    speed: 3,
  },
  walker: {
    id: "walker",
    label: "Walker",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "legs",   role: "mobility" },
      { name: "mount",  role: "weapon" },
      { name: "engine", role: "power" },
    ],
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "legs" },
      { min: 8,  part: "mount" },
      { min: 11, part: "engine" },
    ],
    // Strawman ⚙ — medium-Rig-grade armour.
    armour: {
      hull:   { direct: 11, severe: 14, critical: 17 },
      legs:   { direct: 11, severe: 13, critical: 15 },
      mount:  { direct: 10, severe: 13, critical: 15 },
      engine: { direct: 8,  severe: 10, critical: 12 },
    },
    partSp: { hull: 6, legs: 6, mount: 5, engine: 5 },
    hasHeat: false,
    hasArcs: true,
    actionBudget: 3,
    weaponMode: "flat-pick",
    reloads: true,
    hasEquipment: false,
    reactions: false,
    ramStr: 8,
    destruction: "single-model",
    speed: 4,
  },
```

- [ ] **Step 4: Run tests**

Run: `node --test shared/unit-kinds.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/unit-kinds.js shared/unit-kinds.test.js
git commit -m "feat(units): add Tank and Walker registry entries"
```

---

### Task 11: makeUnit branches for cold single-model kinds

**Files:**
- Modify: `shared/game-state.js` (extend `makeUnit`)
- Modify: `shared/game-state.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test("makeUnit('tank', ...) returns a valid tank with the four parts", () => {
  const t = makeUnit("tank", "t1", "Bulwark", "a", { unit: "Tank Cannon" });
  assert.ok(t);
  assert.equal(t.kind, "tank");
  assert.equal(t.owner, "a");
  assert.equal(t.parts.hull.sp, 8);
  assert.equal(t.parts.tracks.sp, 7);
  assert.equal(t.parts.turret.sp, 6);
  assert.equal(t.parts.engine.sp, 6);
  assert.equal(t.weapons.unit, "Tank Cannon");
  assert.equal(t.equipment, null);
  assert.equal(t.destroyed, false);
});

test("makeUnit('tank', ...) rejects a weapon not in the flat catalogue", () => {
  const t = makeUnit("tank", "t1", "Bulwark", "a", { unit: "Not A Weapon" });
  assert.equal(t, null);
});

test("makeUnit('walker', ...) uses the walker part table", () => {
  const w = makeUnit("walker", "w1", "Sentinel", "a", { unit: "Autocannon Mount" });
  assert.ok(w);
  assert.equal(w.kind, "walker");
  assert.equal(w.parts.legs.sp, 6);
  assert.equal(w.parts.mount.sp, 5);
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `makeUnit("tank", …)` still returns `null`.

- [ ] **Step 3: Extend `makeUnit` with the cold-kind branch**

Replace the Rig-only branch with:

```javascript
export function makeUnit(kindId, id, name, owner, opts = {}) {
  const kind = UNIT_KINDS[kindId];
  if (!kind) return null;
  if (kindId === "rig") {
    return makeRig(id, name, opts.weightClass, owner, {
      longRange: opts.longRange, melee: opts.melee,
      longRangeUpgrade: opts.longRangeUpgrade, meleeUpgrade: opts.meleeUpgrade,
    }, opts.equipment ?? null);
  }
  // Cold single-model kinds (tank / walker) — flat-pick weapon, no equipment,
  // parts driven entirely by the registry entry.
  const weaponName = normalizeUnitWeapon(opts.unit);
  if (!weaponName) return null;
  const parts = {};
  for (const p of kind.parts) {
    const sp = kind.partSp[p.name];
    parts[p.name] = { sp, max: sp, destroyed: false };
  }
  // Give the power part a heat field so cold-kind code paths that read it
  // (heatMeter, engineHeatFloor) do not NPE; guarded to 0 by hasHeat=false.
  const [powerPart] = partsByRole(kindId, "power");
  if (powerPart && !("heat" in parts[powerPart])) parts[powerPart].heat = 0;
  const unit = {
    id,
    name: String(name || kind.label).trim() || kind.label,
    kind: kindId,
    owner: owner === "b" ? "b" : "a",
    parts,
    weapons: { unit: weaponName },
    equipment: null,
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    loaded: { unit: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    hardened: false,
    actionPenaltyNextActivation: 0,
    destroyed: false,
  };
  // Also alias top-level part fields so existing Rig-shaped reads (rig.hull)
  // resolve — they will simply not exist for a Tank (rig.hull === undefined).
  for (const p of kind.parts) unit[p.name] = parts[p.name];
  return unit;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(units): makeUnit constructs Tanks and Walkers"
```

---

### Task 12: Shared flat-pick weapon catalogue

**Files:**
- Modify: `shared/game-state.js` (add `UNIT_WEAPONS`, `normalizeUnitWeapon`)
- Modify: `shared/game-state.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test("UNIT_WEAPONS holds the strawman flat catalogue", () => {
  const ids = Object.keys(UNIT_WEAPONS).sort();
  assert.deepEqual(ids, [
    "Autocannon Mount", "Coaxial MG", "Dozer Blade", "Ram Spike", "Rocket Pod", "Tank Cannon",
  ]);
  for (const [name, w] of Object.entries(UNIT_WEAPONS)) {
    assert.equal(typeof w.rof, "number");
    assert.equal(typeof w.str, "number");
    assert.ok(Array.isArray(w.acc));
    assert.ok(Array.isArray(w.rng));
    assert.ok(Array.isArray(w.perks));
    assert.equal(w.flatPick, true, `${name} carries flatPick marker`);
  }
});

test("normalizeUnitWeapon is case-insensitive and rejects unknown names", () => {
  assert.equal(normalizeUnitWeapon("tank cannon"), "Tank Cannon");
  assert.equal(normalizeUnitWeapon(""), null);
  assert.equal(normalizeUnitWeapon("Chainsaw"), null); // that's a Rig-catalog weapon
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `UNIT_WEAPONS` not defined.

- [ ] **Step 3: Add the catalogue**

Insert immediately after `WEAPONS` (line 40) in `shared/game-state.js`:

```javascript
// Flat unit-weapon list (spec §Weapons, "Unit-weapon list"). Tanks and Walkers
// pick exactly one. Marked `flatPick: true` so combat.js skips the weight-class
// STR modifier — the listed STR is the shot's STR on any chassis.
export const UNIT_WEAPONS = {
  "Tank Cannon":      { rof: 1, str: 12, acc: [0, -1], rng: [12, 24], perks: [],                         flatPick: true },
  "Autocannon Mount": { rof: 3, str: 8,  acc: [0, -1], rng: [12, 24], perks: ["Full Auto"],              flatPick: true },
  "Coaxial MG":       { rof: 6, str: 5,  acc: [1, -1], rng: [9, 18],  perks: ["Full Auto", "Raking Fire"], flatPick: true },
  "Rocket Pod":       { rof: 2, str: 10, acc: [0, 0],  rng: [15, 30], perks: ["Charged Shot"],           flatPick: true },
  "Dozer Blade":      { rof: 1, str: 10, acc: [0, 0],  rng: [1.5, 1.5], perks: ["Melee"],                flatPick: true },
  "Ram Spike":        { rof: 1, str: 11, acc: [1, 0],  rng: [1.5, 1.5], perks: ["Melee", "Impale"],      flatPick: true },
};

export function normalizeUnitWeapon(name) {
  if (!name) return null;
  const ref = String(name).trim().toLowerCase();
  return Object.keys(UNIT_WEAPONS).find((w) => w.toLowerCase() === ref) || null;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(units): flat-pick weapon catalogue for Tanks and Walkers"
```

---

### Task 13: Combat resolution reads the correct weapon slot + skips weight-class STR for flat-pick

**Files:**
- Modify: `shared/game-state.js` (`effectiveWeaponProfile` at ~line 186 — needs to consult `UNIT_WEAPONS` when the unit is a flat-pick kind; `combatCtx`'s `profileFor` follows it)
- Modify: `shared/combat.js` (`computeStr`, `resolveAttack` slot lookup)
- Modify: `shared/combat.test.js`

- [ ] **Step 1: Write failing tests**

Add to `shared/combat.test.js`:

```javascript
test("computeStr skips weight-class modifier for flat-pick weapons", () => {
  const attacker = { kind: "tank", weightClass: undefined };
  const profile = { str: 12, perks: [], flatPick: true };
  // No weightClass → default 0 anyway; but assert we explicitly ignore it even
  // when a bogus weightClass is set.
  const attackerWithClass = { kind: "tank", weightClass: "heavy" };
  assert.equal(computeStr(attackerWithClass, profile, { charged: false }), 12);
});

test("computeStr still applies weight-class modifier for rig-catalog weapons", () => {
  const attacker = { kind: "rig", weightClass: "heavy" };
  const profile = { str: 8, perks: [] };
  assert.equal(computeStr(attacker, profile, { charged: false }), 8 + 2);
});

test("resolveAttack reads weapons.unit when the attacker is a Tank", () => {
  const room = { rigs: [], history: [] };
  const attacker = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  attacker.weapons = { unit: "Tank Cannon" };
  const target = makeUnit("tank", 2, "Enemy", "b", { unit: "Coaxial MG" });
  room.rigs = [attacker, target];
  const ctx = {
    applyDamage: () => {}, bumpHeat: () => {}, pushResolution: () => {},
    profileFor: (slot, name, unit) => ({ ...UNIT_WEAPONS[name], flatPick: true, perks: UNIT_WEAPONS[name].perks }),
  };
  const res = resolveAttack(room, attacker, target, { weapon: "unit", target: "Enemy", arc: "front", range: "near", cover: 0, aimed: false, dice: { toHit: [5], location: 3 } }, () => 0, ctx);
  assert.equal(res.ok, true);
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --test shared/combat.test.js`
Expected: FAIL — slot lookup + weight-class skip not implemented.

- [ ] **Step 3: Update `computeStr`**

```javascript
export function computeStr(attacker, profile, opts) {
  const charged = opts.charged && profile.perks.includes("Charged Shot") ? 2 : 0;
  const weightMod = profile.flatPick ? 0 : (WEIGHT_STR_MOD[attacker.weightClass] || 0);
  return profile.str + weightMod + charged;
}
```

- [ ] **Step 4: Update `resolveAttack` weapon-slot lookup**

At the top of `resolveAttack`:

```javascript
export function resolveAttack(room, attacker, target, opts, random, ctx) {
  // Rigs carry a two-slot loadout (longRange + melee). Flat-pick kinds
  // (Tank / Walker) carry a single "unit" slot instead.
  let slot;
  if (attacker.weapons?.unit != null) slot = "unit";
  else slot = opts.weapon === "melee" ? "melee" : "longRange";
  const weaponName = attacker.weapons?.[slot];
  // (rest unchanged, except: only reload-guard the longRange slot)
  if (slot === "longRange" && !attacker.loaded.longRange && !opts.autoReload) return { ok: false, reason: "reload" };
```

Also update the `attacker.loaded.longRange = false` line to `if (slot === "longRange") attacker.loaded.longRange = false;` (already conditional — verify) and add the flat-pick spent-flag update:

```javascript
if (slot === "unit" && UNIT_KINDS[attacker.kind]?.reloads) attacker.loaded.unit = false;
```

- [ ] **Step 5: Update `effectiveWeaponProfile` in `shared/game-state.js`**

At the top of the function (line 186):

```javascript
function effectiveWeaponProfile(slot, name, attacker) {
  if (slot === "unit") {
    const base = UNIT_WEAPONS[name];
    if (!base) return null;
    return { ...base, upgradeEffect: {} };
  }
  // (existing WEAPONS[slot][name] + upgrade composition unchanged)
}
```

- [ ] **Step 6: Run all shared tests**

Run: `node --test shared/game-state.test.js shared/combat.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/combat.js shared/combat.test.js
git commit -m "feat(units): resolve attacks for flat-pick weapon slot"
```

---

### Task 14: `add` command commissions the new kinds

**Files:**
- Modify: `shared/game-state.js` (search `verb === "add"`; extend to accept `a.kind`)
- Modify: `shared/game-state.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('add command commissions a Tank', () => {
  const room = createRoomStub();
  applyCommand(room, "add", { name: "Bulwark", kind: "tank", side: "a", unit: "Tank Cannon" }, {});
  const tank = room.rigs.find((r) => r.name === "Bulwark");
  assert.ok(tank);
  assert.equal(tank.kind, "tank");
  assert.equal(tank.weapons.unit, "Tank Cannon");
});

test('add command commissions a Walker', () => {
  const room = createRoomStub();
  applyCommand(room, "add", { name: "Sentinel-1", kind: "walker", side: "a", unit: "Autocannon Mount" }, {});
  const w = room.rigs.find((r) => r.name === "Sentinel-1");
  assert.ok(w);
  assert.equal(w.kind, "walker");
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `kind: "tank"` not honored.

- [ ] **Step 3: Extend the `add` verb**

Locate `else if (verb === "add")` in `applyCommand`. Refactor its body to branch:

```javascript
} else if (verb === "add") {
  const kindId = (a.kind || "rig").toString().toLowerCase();
  if (!UNIT_KINDS[kindId]) return { room, changed: false };
  // Existing pre-checks (side, MAX_RIGS_PER_SIDE, etc.) stay unchanged.
  const id = nextRigId(room);
  const owner = normalizeSide(room, a.side) || context.side;
  const unit = makeUnit(kindId, id, a.name, owner, {
    // Rig-only opts
    weightClass: a.class || a.weightClass,
    longRange: a.longRange || a.lr, melee: a.melee,
    longRangeUpgrade: a.longRangeUpgrade || a.lrUpgrade, meleeUpgrade: a.meleeUpgrade,
    equipment: a.equipment ?? null,
    // Flat-pick opts
    unit: a.unit,
  });
  if (!unit) return { room, changed: false };
  room.rigs.push(unit);
  changed = true;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(units): add verb commissions Tanks and Walkers"
```

---

### Task 15: Tank cascade + heat + action budget behave per spec

**Files:**
- Modify: `shared/game-state.test.js`

Regression coverage for the four cold-kind guarantees. If any of these tests fail, the underlying refactor from Phase A is incomplete.

- [ ] **Step 1: Write the four tests**

```javascript
test("Tank turret 0 SP: weapon destroyed, munition cook-off (1 hull + 1 engine)", () => {
  const room = createRoomStub();
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  const hullBefore = tank.parts.hull.sp;
  const engineBefore = tank.parts.engine.sp;
  tank.parts.turret.sp = 1;
  applyDamage(room, tank, "turret", 1, {});
  assert.ok(tank.weaponsDestroyed.includes("Tank Cannon"));
  assert.equal(tank.parts.hull.sp, hullBefore - 1);
  assert.equal(tank.parts.engine.sp, engineBefore - 1);
});

test("Tank engine 0 SP: skipNextActivation (no equipment escape)", () => {
  const room = createRoomStub();
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  tank.parts.engine.sp = 1;
  applyDamage(room, tank, "engine", 1, {});
  assert.equal(tank.skipNextActivation, true);
});

test("Tank endActivation skips the overheat roll", () => {
  const room = createRoomStub();
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  // Would have exploded if overheat routing ran — cold kinds must skip it.
  room.game.turn = { activeRigId: tank.id, side: "a", actionsUsed: 0, actionsMax: 2 };
  applyCommand(room, "endactivation", { name: "Bulwark", dice: { overheat: 12 } }, {});
  assert.equal(tank.destroyed, false);
});

test("Tank activation sets actionsMax = 2 (registry actionBudget)", () => {
  const room = createRoomStub();
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  applyCommand(room, "activate", { name: "Bulwark" }, { side: "a" });
  assert.equal(room.game.turn.actionsMax, 2);
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `node --test shared/game-state.test.js`
Expected: PASS — the refactor from Phase A already delivers these behaviors; these tests lock them in.

- [ ] **Step 3: Commit**

```bash
git add shared/game-state.test.js
git commit -m "test(units): pin Tank cascade, heat, budget behavior"
```

---

### Task 16: Battle-view hides Rig-only surfaces for cold kinds

**Files:**
- Modify: `shared/battle-view.js` (`availableActions`)
- Modify: `shared/battle-view.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test("Tank action console = 2 actions, no shutdown, no prepare, no equipment", () => {
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  const actions = availableActions(tank, { actionsMax: 2, actionsUsed: 0, longRangeShots: 0 });
  const keys = actions.map((a) => a.key);
  assert.ok(!keys.includes("shutdown"), "no shutdown");
  assert.ok(!keys.includes("prepare"), "no prepare");
  assert.ok(!keys.some((k) => ["harden", "purge", "jumpjets", "overclock", "emergencypatch"].includes(k)), "no equipment active");
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --test shared/battle-view.test.js`
Expected: FAIL — `availableActions` still lists prepare and shutdown.

- [ ] **Step 3: Guard the list**

```javascript
export function availableActions(rig, turn) {
  const kind = UNIT_KINDS[kindOf(rig)];
  const left = turn.actionsMax - turn.actionsUsed;
  const rangedSpent = kind.weaponMode === "flat-pick"
    ? rig.loaded?.unit === false
    : rig.loaded?.longRange === false;
  const firedRanged = (turn.longRangeShots || 0) >= 1;
  const list = ACTION_ORDER
    .filter((key) => {
      if (key === "shutdown" && !kind.hasHeat) return false;
      if (key === "prepare"  && !kind.reactions) return false;
      return true;
    })
    .map((key) => {
      // (rest of loop identical to today, using rangedSpent above)
    });
  if (kind.hasEquipment && rig.equipment && EQUIPMENT[rig.equipment]) {
    const active = EQUIPMENT[rig.equipment].active;
    list.push({ key: active.key, label: active.label, heat: active.heat, enabled: left > 0, cost: 1, note: "" });
  }
  return list;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test shared/battle-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/battle-view.js shared/battle-view.test.js
git commit -m "refactor(units): hide Rig-only actions for cold kinds"
```

---

## Phase C — LLM + Client wiring

### Task 17: Teach the LLM the three unit kinds

**Files:**
- Modify: `server/prompt.js`

- [ ] **Step 1: Read the current tracker protocol section**

`less server/prompt.js` — locate the block near line 20–35 that spells out the `add` / `activate` / `action` command grammar.

- [ ] **Step 2: Extend the `add` grammar**

Replace the `add` documentation block with:

```
- add name="…" kind="rig"    class="light|medium"    side="a|b" longRange="…" melee="…" [longRangeUpgrade="…" meleeUpgrade="…" equipment="…"]
- add name="…" kind="tank"   side="a|b" unit="…"    # one of: Tank Cannon | Autocannon Mount | Coaxial MG | Rocket Pod | Dozer Blade | Ram Spike
- add name="…" kind="walker" side="a|b" unit="…"    # same flat catalogue
```

Update the `loc` enum in `action loc="…"` clauses to note it depends on `kind`:

```
- action name="…" action="aimed" weapon="…" target="…" loc="…"
      loc for kind=rig: hull|arms|legs|engine
      loc for kind=tank: hull|tracks|turret|engine
      loc for kind=walker: hull|legs|mount|engine
```

- [ ] **Step 3: Extend the stat block**

Find the function that emits per-Rig stats (search `RIG_DEFAULTS` in `server/prompt.js`). Replace with a per-kind emitter that:
- reads parts + starting SP from `UNIT_KINDS[unit.kind].partSp` (with the Rig branch keeping the existing weight-class table)
- omits the heat row when `!UNIT_KINDS[unit.kind].hasHeat`
- omits the equipment row when `!UNIT_KINDS[unit.kind].hasEquipment`
- prints `Actions: {actionBudget}`

Concrete replacement (approx.):

```javascript
import { UNIT_KINDS } from "../shared/unit-kinds.js";

function unitStatBlock(unit) {
  const kind = UNIT_KINDS[unit.kind] || UNIT_KINDS.rig;
  const parts = kind.parts.map((p) => {
    const c = unit.parts?.[p.name] ?? unit[p.name];
    return `${p.name} ${c.sp}/${c.max}`;
  }).join(" · ");
  const heat = kind.hasHeat ? ` · heat ${unit.engine.heat}/${HEAT_CAPACITY[unit.weightClass]}` : "";
  const equip = kind.hasEquipment && unit.equipment ? ` · equipment ${EQUIPMENT[unit.equipment].label}` : "";
  return `${unit.name} (${kind.label}${unit.weightClass ? " · " + unit.weightClass : ""}): ${parts}${heat}${equip} · actions ${kind.actionBudget}`;
}
```

- [ ] **Step 4: Sanity read the assembled prompt**

Run: `node -e 'import("./server/prompt.js").then((m)=>console.log(m.buildPrompt({rigs:[]},"a")))'`
Expected: prompt renders without throwing; the new command lines appear verbatim.

- [ ] **Step 5: Commit**

```bash
git add server/prompt.js
git commit -m "feat(units): teach LLM tracker protocol Tank and Walker kinds"
```

---

### Task 18: Client — HeatGauge hides when the kind is cold

**Files:**
- Modify: `client/src/components/rig/HeatGauge.tsx`

- [ ] **Step 1: Guard the component**

At the top of the component body:

```typescript
import { UNIT_KINDS, kindOf } from "/shared/unit-kinds.js";
// …
if (!UNIT_KINDS[kindOf(rig)].hasHeat) return null;
```

- [ ] **Step 2: Vitest smoke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/rig/HeatGauge.tsx
git commit -m "refactor(units): hide HeatGauge for cold units"
```

---

### Task 19: Unit Wizard replaces the Rig-only wizard

**Files:**
- Modify: `client/src/components/wizards/RigWizard.tsx` → split into `UnitWizard.tsx` + a thin `RigWizard.tsx` wrapper

- [ ] **Step 1: Copy the existing wizard to `UnitWizard.tsx`**

```bash
cp client/src/components/wizards/RigWizard.tsx client/src/components/wizards/UnitWizard.tsx
```

- [ ] **Step 2: Add a Kind step in front**

Immediately after the identity step (name / side), insert a step "Kind" with three cards: Rig / Tank / Walker (label from `UNIT_KINDS[kindId].label`, description a one-liner). Selecting Rig continues into the existing weight-class → weapons → equipment → confirm flow. Selecting Tank or Walker jumps to a new **single-weapon step** (radio list of `Object.keys(UNIT_WEAPONS)`) and then straight to Confirm.

Concrete state additions at the top of the component:

```typescript
import { UNIT_KINDS } from "/shared/unit-kinds.js";
import { UNIT_WEAPONS } from "/shared/game-state.js";

const [kind, setKind] = useState<"rig" | "tank" | "walker">("rig");
const [flatWeapon, setFlatWeapon] = useState<string>("");
```

Confirm-step submit dispatches:

```typescript
if (kind === "rig") {
  onCommand("add", { name, kind: "rig", class: weightClass, side, longRange, melee, longRangeUpgrade, meleeUpgrade, equipment });
} else {
  onCommand("add", { name, kind, side, unit: flatWeapon });
}
```

- [ ] **Step 3: Reduce `RigWizard.tsx` to a wrapper**

```typescript
import UnitWizard from "./UnitWizard";
export default UnitWizard;
```

- [ ] **Step 4: Vitest smoke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Manual browser test**

Start the dev server (`npm run dev`), open the app in Chrome, and commission one of each kind. Confirm:
- The Rig flow is byte-for-byte the old flow.
- Commissioning a Tank produces a unit with a Tracks / Turret / Engine / Hull row and no heat gauge.
- Commissioning a Walker produces a unit with a Legs / Mount / Engine / Hull row and no heat gauge.
- Activating a Tank shows a 2-action budget.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/wizards/UnitWizard.tsx client/src/components/wizards/RigWizard.tsx
git commit -m "feat(units): Unit Wizard commissions Rig, Tank, or Walker"
```

---

## Phase D — End-to-end regression + docs

### Task 20: Full test sweep + rules.md update

**Files:**
- Modify: `rules.md`

- [ ] **Step 1: Add a `§17 Units` section to `rules.md`**

```markdown
## §17 Units

The game fields three unit kinds. Every kind is one **slot** = one **count** = one **activation** (§3 balance rules unchanged).

### Rig
Four components (Hull / Arms / Legs / Engine). Heat and overheat (§6). Two weapon slots
(long-range + melee) with fixed upgrades (§12). Weight-class STR scaling. Equipment slot.
May Prepare (§5). 3 actions per activation.

### Tank
Four components (Hull / Tracks / Turret / Engine). Cold — no heat, no overheat rolls,
no Shut Down. One weapon from the shared unit-weapon list (flat STR, no weight-class
scaling). No equipment, no Prepare. 2 actions per activation. Ram STR 9.

### Walker
Four components (Hull / Legs / Mount / Engine). Cold like a Tank, faster and lighter.
One weapon from the shared unit-weapon list. No equipment, no Prepare. 3 actions per
activation. Ram STR 8.

### Shared unit weapons
Tank Cannon (12/1), Autocannon Mount (8/3 · Full Auto), Coaxial MG (5/6 · Full Auto ·
Raking Fire), Rocket Pod (10/2 · Charged Shot), Dozer Blade (10/1 · Melee), Ram Spike
(11/1 · Melee · Impale). STR is flat — no weight-class modifier.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (vitest + `node --test`).

- [ ] **Step 3: Commit**

```bash
git add rules.md
git commit -m "docs(units): document Rig, Tank, Walker in rules.md §17"
```

---

## Deferred / Non-goals

- **Infantry / multi-model squads** — not built. `hasArcs: false` and `destruction: "all-members"` are wired into the registry seams but no infantry entry lives there.
- **Points-buy economy** — dropped for good (spec §Core shape). Matched composition only.
- **Weight-class variants for Tanks / Walkers** — every Tank / Walker is one strawman entry today. Adding a Heavy Tank later is one more registry entry.
- **Tuning** — every ⚙-flagged value in this plan is a strawman, to be adjusted in playtest.

## Open tuning follow-ups (deferred to playtest, not part of this build)

1. Whether the `structural` 0-SP penalty (−2 actions) is proportionally too brutal on a 2-action Tank (drops to 0 actions) — options: role-relative penalty, floor cold units at 1 action, or accept. The plan wires the vanilla `−2` behavior; a follow-up plan can retune.
2. Balance of Tank 2 actions vs Rig 3 + heat risk.
3. Contents + tuning of `UNIT_WEAPONS`.
4. Whether Tanks / Walkers should keep reload rule or fire freely.
5. Whether Walkers want any distinguishing quirk beyond "faster, lighter Tank."
