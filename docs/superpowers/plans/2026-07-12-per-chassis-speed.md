# Per-Chassis Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Rig chassis its own `speed` stat (tuned to its gameplay role, reinforcing the light > medium weight ladder) instead of a single Speed derived from weight class.

**Architecture:** Add a `speed` field to every `CHASSIS` entry in `shared/game-state.js`. `makeRig` resolves the rig's `speed` from its chassis id (caller-agnostic, server-authoritative) and `ensureRigShape` backfills it for reloaded rigs. The two client Move drawers read `rig.speed ?? SPEED[weightClass]`, keeping the class map as a fallback for support units, free-combo rigs, and old saves.

**Tech Stack:** JavaScript ES modules (`shared/`), React + TypeScript (`client/`), `node:test` for shared tests.

**Spec:** `docs/superpowers/specs/2026-07-12-per-chassis-speed-design.md`

---

## Design refinement vs spec

The spec said `makeRig` "copies speed the same way `sp` flows" (threaded through every
caller). During plumbing review, resolving `speed` **inside `makeRig` from the chassis id**
(`weapons.chassis`) proved strictly better: it is caller-agnostic (the `add` handler, the
seed roster, and `makeUnit` all already pass `chassis`), so no call site needs editing and
free-combo rigs (no chassis id) cleanly fall back to the class map. This plan implements that
approach. Everything else matches the spec.

## File structure

- `shared/game-state.js` — data (`CHASSIS.speed`) + resolution (`makeRig`, `ensureRigShape`). One responsibility: game rules/state.
- `client/src/state/types.ts` — `Rig.speed` type.
- `client/src/v2/battle/MoveBody.tsx` — v2 Move drawer reads `rig.speed`.
- `client/src/state/BattleActionsContext.tsx` — v1 Move drawer (duplicate) reads `rig.speed`.
- `shared/game-state.test.js` — coverage for all of the above.

The `SPEED`-by-class maps in `constants.ts` and `BattleActionsContext.tsx` are **retained** as fallbacks, not deleted.

---

## Task 1: Add `speed` to CHASSIS data

**Files:**
- Modify: `shared/game-state.js:90-102` (the `CHASSIS` array)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to `shared/game-state.test.js` (near the other `CHASSIS` assertions, e.g. after the existing chassis/weapon-shape tests around line 2455). `CHASSIS` and `makeRig` are already imported at the top of the file.

```js
test("every chassis carries a whole-inch speed", () => {
  for (const c of CHASSIS) {
    assert.equal(typeof c.speed, "number", `${c.id} has speed`);
    assert.ok(Number.isInteger(c.speed), `${c.id} speed is a whole inch`);
  }
});

test("speed bands reinforce the weight ladder (fastest medium < slowest light)", () => {
  const lights = CHASSIS.filter((c) => c.class === "light").map((c) => c.speed);
  const mediums = CHASSIS.filter((c) => c.class === "medium").map((c) => c.speed);
  assert.ok(
    Math.max(...mediums) < Math.min(...lights),
    "fastest medium must be strictly slower than slowest light",
  );
});

test("chassis speeds match the tuned table", () => {
  const byId = Object.fromEntries(CHASSIS.map((c) => [c.id, c.speed]));
  assert.deepEqual(byId, {
    "light-claw-autocannon": 5,
    "light-missile-flamethrower": 5,
    "light-saw-minigun": 6,
    "light-wreckingball-double": 6,
    "light-sword-arc": 5,
    "light-harpoon-anchor": 5,
    "light-rivet-pressureclaw": 6,
    "medium-lance-mortar": 3,
    "medium-shield-siege": 3,
    "medium-sniper-chainsaw": 4,
    "medium-crossbow-talon": 4,
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the three new tests fail (`typeof c.speed` is `"undefined"`, `deepEqual` mismatch).

- [ ] **Step 3: Add the `speed` field to each CHASSIS entry**

Replace the `CHASSIS` array (`shared/game-state.js:90-102`) with:

```js
export const CHASSIS = [
  { id: "light-claw-autocannon",      label: "Claw · Autocannon",           class: "light",  longRange: "Autocannon",      melee: "Claw",          speed: 5, sp: { hull: 13, arms: 11, legs: 11, engine: 9 } },
  { id: "light-missile-flamethrower", label: "Missile Barrage · Flamethrower", class: "light", longRange: "Missile Barrage", melee: "Flamethrower", speed: 5, sp: { hull: 12, arms: 10, legs: 10, engine: 8 } },
  { id: "light-saw-minigun",          label: "Circular Saw · Mini Gun",     class: "light",  longRange: "Mini Gun",        melee: "Circular Saw",  speed: 6, sp: { hull: 13, arms: 11, legs: 11, engine: 9 } },
  { id: "light-wreckingball-double",  label: "Wrecking Ball · Double MG",   class: "light",  longRange: "Double MG",       melee: "Wrecking Ball", speed: 6, sp: { hull: 12, arms: 10, legs: 11, engine: 8 } },
  { id: "light-sword-arc",            label: "Sword · Arc Gun",             class: "light",  longRange: "Arc Gun",         melee: "Sword",         speed: 5, sp: { hull: 11, arms: 9,  legs: 10, engine: 7 } },
  { id: "light-harpoon-anchor",       label: "Harpoon · Anchor",            class: "light",  longRange: "Harpoon",         melee: "Anchor",        speed: 5, sp: { hull: 12, arms: 11, legs: 11, engine: 8 } },
  { id: "light-rivet-pressureclaw",   label: "Rivet Gun · Pressure Claw",   class: "light",  longRange: "Rivet Gun",       melee: "Pressure Claw", speed: 6, sp: { hull: 13, arms: 11, legs: 10, engine: 9 } },
  { id: "medium-lance-mortar",        label: "Lance · Mortar",              class: "medium", longRange: "Mortar",          melee: "Lance",         speed: 3, sp: { hull: 14, arms: 12, legs: 12, engine: 10 } },
  { id: "medium-shield-siege",        label: "Bulwark Shield · Siege Maul", class: "medium", longRange: "Siege Maul",      melee: "Bulwark Shield", speed: 3, sp: { hull: 16, arms: 13, legs: 12, engine: 11 } },
  { id: "medium-sniper-chainsaw",     label: "Sniper Cannon · Chainsaw",    class: "medium", longRange: "Sniper Cannon",   melee: "Chainsaw",      speed: 4, sp: { hull: 12, arms: 11, legs: 11, engine: 9 } },
  { id: "medium-crossbow-talon",     label: "Crossbow · Talon",            class: "medium", longRange: "Crossbow",        melee: "Talon",         speed: 4, sp: { hull: 12, arms: 11, legs: 12, engine: 9 } },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — all three new tests green, no regressions in the file.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(chassis): per-chassis speed stat tuned to role"
```

---

## Task 2: Resolve `speed` onto the rig in `makeRig`

**Files:**
- Modify: `shared/game-state.js:615-649` (`makeRig` — add lookup + `speed` on the rig literal)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js`:

```js
test("makeRig resolves speed from the chassis id", () => {
  const rig = makeRig(1, "Shrike", "medium", "a", {
    longRange: "Crossbow", melee: "Talon", chassis: "medium-crossbow-talon",
  });
  assert.equal(rig.speed, 4);
});

test("makeRig leaves speed null for a free combo with no chassis id", () => {
  const rig = makeRig(1, "Freeform", "light", "a", {
    longRange: "Mini Gun", melee: "Sword",
  });
  assert.equal(rig.speed, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.speed` is `undefined`, so both `assert.equal` calls fail.

- [ ] **Step 3: Resolve the chassis speed inside `makeRig`**

In `shared/game-state.js`, inside `makeRig`, add the lookup just after the class is
normalized. Change (around line 626):

```js
  const weightClass = normalizedClass;
```

to:

```js
  const weightClass = normalizedClass;
  // Speed is a per-chassis stat. Resolve it from the commissioning chassis id so
  // every caller (add / seed / makeUnit) gets it without threading; free-combo
  // rigs (no chassis id) stay null and the client falls back to the class map.
  const chassisDef = chassisById(weapons.chassis);
  const chassisSpeed = Number.isFinite(chassisDef?.speed) ? chassisDef.speed : null;
```

Then add `speed` to the `rig` object literal. Change the `chassis:` line (around line 653):

```js
    chassis: weapons.chassis || null, // CHASSIS id it was commissioned from — drives its flavor description in the UI
```

to:

```js
    chassis: weapons.chassis || null, // CHASSIS id it was commissioned from — drives its flavor description in the UI
    speed: chassisSpeed,               // per-chassis Move distance (inches); null -> client uses SPEED[weightClass]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — both new tests green.

- [ ] **Step 5: Run the full shared/server suite to check for regressions**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js"`
Expected: PASS — no existing test broken (rig snapshots gain a `speed` field; no test asserts an exact whole-rig equality that would break — verify none fail).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(chassis): makeRig resolves rig.speed from chassis id"
```

---

## Task 3: Backfill `speed` in `ensureRigShape` for reloaded rigs

**Files:**
- Modify: `shared/game-state.js:471-479` (`ensureRigShape`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("ensureRigShape backfills speed from the chassis id on reload", () => {
  // Simulate an old saved rig that predates the speed field.
  const rig = makeRig(1, "OldSave", "medium", "a", {
    longRange: "Crossbow", melee: "Talon", chassis: "medium-crossbow-talon",
  });
  delete rig.speed;
  const room = createRoom("r");
  room.rigs.push(rig);
  __test.ensureRigShape(rig); // exposed via __test (see Step 3)
  assert.equal(rig.speed, 4);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `__test.ensureRigShape` is undefined (not yet exported) and/or `rig.speed` stays deleted.

- [ ] **Step 3: Backfill in `ensureRigShape` and expose it for the test**

In `shared/game-state.js`, in `ensureRigShape`, after the existing chassis default
(`if (rig.chassis === undefined) rig.chassis = null;`, line 479) add:

```js
    if (rig.speed === undefined) {
      const cd = chassisById(rig.chassis);
      rig.speed = Number.isFinite(cd?.speed) ? cd.speed : null;
    }
```

`ensureRigShape` is **already exported** on the `__test` object at
`shared/game-state.js:2697` (`export const __test = { …, ensureRigShape, … }`), and the
test file already imports `__test`. No export change is needed — the Step 1 test can call
`__test.ensureRigShape` as written.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(chassis): backfill rig.speed on reload via ensureRigShape"
```

---

## Task 4: Add `speed` to the `Rig` type

**Files:**
- Modify: `client/src/state/types.ts:38-49` (the `Rig` interface)

No unit test — this is a type-only change verified by the type-checker in Task 5.

- [ ] **Step 1: Add the field**

In `client/src/state/types.ts`, in the `Rig` type, next to `weightClass` / `chassis`
(around line 38-49), add:

```ts
  speed?: number;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p . --noEmit`
Expected: PASS — no type errors from the new optional field.

- [ ] **Step 3: Commit**

```bash
git add client/src/state/types.ts
git commit -m "types: add optional Rig.speed"
```

---

## Task 5: Client Move drawers read `rig.speed`

**Files:**
- Modify: `client/src/v2/battle/MoveBody.tsx:22`
- Modify: `client/src/state/BattleActionsContext.tsx:74`

Both files compute `const base = SPEED[rig.weightClass] ?? 8;`. The `SPEED` maps stay as
fallbacks.

- [ ] **Step 1: Update the v2 Move drawer**

In `client/src/v2/battle/MoveBody.tsx`, change line 22 from:

```tsx
  const base = SPEED[rig.weightClass] ?? 8;
```

to:

```tsx
  // Per-chassis Speed wins; fall back to the weight-class map for support units,
  // free-combo rigs, and pre-speed saves.
  const base = rig.speed ?? SPEED[rig.weightClass] ?? 8;
```

- [ ] **Step 2: Update the v1 Move drawer**

In `client/src/state/BattleActionsContext.tsx`, change line 74 from:

```tsx
  const base = SPEED[rig.weightClass] ?? 8;
```

to:

```tsx
  // Per-chassis Speed wins; fall back to the weight-class map for support units,
  // free-combo rigs, and pre-speed saves.
  const base = rig.speed ?? SPEED[rig.weightClass] ?? 8;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/battle/MoveBody.tsx client/src/state/BattleActionsContext.tsx
git commit -m "feat(v2): Move drawers use per-chassis rig.speed"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full shared/server test suite**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js"`
Expected: PASS — all tests green.

- [ ] **Step 2: Run the client tests + type-check**

Run: `npx vitest run && npx tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual smoke check (browser)**

Start the dev server via the preview tool (do NOT use a raw shell). Seed a battle, open the
Move drawer for a Crossbow · Talon medium (expect **4"** full / **6"** sprint) and a
Rivet Gun light (expect **6"** full / **9"** sprint), and a Lance · Mortar medium
(expect **3"** full / **5"** sprint). Confirm the drawer hint shows the per-chassis value,
not a flat 4"/5".

- [ ] **Step 4: Final commit (if any smoke-fix was needed)**

```bash
git add -A
git commit -m "chore: per-chassis speed verification fixes"
```

---

## Self-review notes

- **Spec coverage:** data field (Task 1), `makeRig` resolution (Task 2), reload backfill
  (Task 3), `Rig` type (Task 4), both client consumers + fallback retained (Task 5), tests
  in Tasks 1–3, verification Task 6. Every spec touch-point mapped.
- **Values:** the exact-table test in Task 1 locks all 11 speeds and the band-ladder test
  guards the non-overlap invariant.
- **Fallback:** `rig.speed ?? SPEED[weightClass] ?? 8` keeps support units and free-combo
  rigs working; `null` (not `undefined`) is what `makeRig`/`ensureRigShape` write, and `??`
  treats `null` as nullish, so the fallback fires correctly.
- **No range changes** — movement Speed only, per spec non-goals.
