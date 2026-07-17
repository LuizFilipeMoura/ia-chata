# Sprint Heat Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint can never cost 0 heat; Reinforced Servos trades its free Sprint for 2× Speed reach.

**Architecture:** `equipmentSprintHeat` in `shared/game-state.js` is the single chokepoint every Sprint heat path already flows through — clamp it to a minimum of 1 and the floor holds everywhere. Reinforced Servos' catalog effect changes from `sprintHeat: 0` to `sprintMult: 2`, resolved by a new atomic helper `equipmentSprintMult` and surfaced on the `rigEffects` read-model, which the three client sites that currently hardcode `1.5` then render.

**Tech Stack:** Plain ES modules (`shared/`), React + TypeScript (`client/`), `node:test` + `assert` for shared tests, Vitest + Testing Library for client tests.

**Spec:** `docs/superpowers/specs/2026-07-14-sprint-heat-floor-design.md`

**Test commands:**
- Shared only: `npx vitest run` is NOT needed — use `node --test "shared/**/*.test.js"`
- Single shared test by name: `node --test --test-name-pattern "<pattern>" "shared/**/*.test.js"`
- Client only: `npx vitest run <path>`
- Everything: `npm test`

**No worktree, no stash.** Work in place on the current branch (`frontend/v2-redesign`).

---

### Task 1: Floor Sprint heat at 1

The catalog's `sprintHeat: 0` on Reinforced Servos is the only way to reach 0. Remove it *and* clamp, so no future upgrade can re-introduce a 0 by adding the same tag back.

**Files:**
- Modify: `shared/rules.js:121`
- Modify: `shared/game-state.js:341-347`
- Test: `shared/game-state.test.js:2029-2033`, `shared/game-state.test.js:2732-2740`
- Test: `shared/battle-view.test.js:67-75`

- [ ] **Step 1: Flip the failing unit test**

In `shared/game-state.test.js`, replace the test at lines 2029-2033 entirely:

```js
test("Sprint heat floors at 1: Reinforced Servos is 1, base Servo is 1, none is 2", () => {
  assert.equal(equipmentSprintHeat(null, null), 2);
  assert.equal(equipmentSprintHeat("servo-actuators", null), 1);
  assert.equal(equipmentSprintHeat("servo-actuators", "reinforced-servos"), 1);
});

test("Sprint heat can never be driven below 1, even by a 0-heat catalog tag", () => {
  // The clamp — not the catalog — is the guarantee. Prove it holds against an
  // upgrade that explicitly asks for a free Sprint.
  const servos = EQUIPMENT_UPGRADES["servo-actuators"];
  const victim = servos.find((u) => u.id === "reinforced-servos");
  const restore = victim.effect;
  victim.effect = { sprintHeat: 0 };
  try {
    assert.equal(equipmentSprintHeat("servo-actuators", "reinforced-servos"), 1);
  } finally {
    victim.effect = restore;
  }
  // A 0 passed as the base heat is clamped too.
  assert.equal(equipmentSprintHeat(null, null, 0), 1);
});
```

`EQUIPMENT_UPGRADES` must be importable in this test file. Check the import block at the top of `shared/game-state.test.js` (around line 8) — if `EQUIPMENT_UPGRADES` is not already imported from `./game-state.js`, add it to that same import list. It is re-exported there; do not add a second import statement from `./rules.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern "Sprint heat" "shared/**/*.test.js"`

Expected: FAIL. The first test fails with `Expected values to be strictly equal: 0 !== 1`. The second fails the same way.

- [ ] **Step 3: Change the catalog entry**

In `shared/rules.js`, replace line 121:

```js
    { id: "reinforced-servos", nature: "field", name: "Reinforced Servos", tag: "Sprint reaches 2× Speed, not 1½×", effect: { sprintMult: 2 } },
```

The `tag` is rendered verbatim by many surfaces — this is a full replacement of the string, not an edit to part of it.

- [ ] **Step 4: Clamp the helper**

In `shared/game-state.js`, replace lines 341-347 entirely:

```js
// Sprint heat: base 2, and Servo Actuators (Mobility) brings it to 1. Hard floor
// of 1 — a free Sprint is no decision at all, so no equipment, no upgrade, and no
// caller-supplied base may drive this to 0. The clamp is the guarantee; do not
// rely on the catalog to stay honest.
export function equipmentSprintHeat(equipmentId, equipmentUpgradeId, baseHeat = 2) {
  const raw = equipmentId === "servo-actuators" ? 1 : baseHeat;
  return Math.max(1, raw);
}
```

Note the signature keeps `equipmentUpgradeId` — callers pass it, and dropping the
parameter would silently shift every call site's arguments. It is intentionally
unused now: no servo upgrade modifies Sprint heat any more.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --test-name-pattern "Sprint heat" "shared/**/*.test.js"`

Expected: PASS, 2 tests.

- [ ] **Step 6: Fix the pipeline test**

In `shared/game-state.test.js`, replace the test at lines 2732-2740 entirely:

```js
test("Reinforced Servos Sprint still costs 1 heat through the action pipeline", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "reinforced-servos"; // Field upgrade: reach, not a heat discount
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "sprint" } });
  assert.equal(rig.engine.heat, 1); // the floor holds — never 0
});
```

- [ ] **Step 7: Fix the sprint chip test**

In `shared/battle-view.test.js`, replace line 72 only:

```js
  assert.equal(reinf.find((a) => a.key === "sprint").heat, 1);
```

Leave lines 70 and 74 as they are (servo 1, bare 2 — both unchanged). Do not
touch the drift-guard test at line 83; it compares the chip to `rigEffects` and
stays green on its own.

- [ ] **Step 8: Fix the stale Sprint comment in performAction**

In `shared/game-state.js`, replace lines 2672-2674 (the comment block directly above the `const heat = ...` line):

```js
    // Move / Sprint may repeat within an activation; each spends one slot and
    // adds its heat. Sprint costs 2 heat — 1 with Servo Actuators (Mobility).
    // It is never free: equipmentSprintHeat floors it at 1.
```

- [ ] **Step 9: Run the full shared suite**

Run: `node --test "shared/**/*.test.js"`

Expected: PASS, 0 failures. If `battle-view.test.js:305` ("Move is hidden when Sprint costs no more than Move") fails, stop and report — the hide rule was verified as a no-op for this change and a failure means that analysis was wrong.

- [ ] **Step 10: Commit**

```bash
git add shared/rules.js shared/game-state.js shared/game-state.test.js shared/battle-view.test.js
git commit -m "feat(v2): floor Sprint heat at 1 — no free repositioning

Reinforced Servos set sprintHeat: 0, so a Rig carrying it repositioned every
activation for free. Free movement is not a decision.

equipmentSprintHeat now clamps to a minimum of 1 — the single chokepoint every
Sprint path already flows through, so the floor holds in performAction, the
picker chip, and the Move drawer alike. Reinforced Servos' effect is now
sprintMult: 2 (wired in the next commit).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `equipmentSprintMult` + `rigEffects.sprintMult`

Reinforced Servos now needs to actually *do* something. Add the resolution helper and surface it on the read-model, so clients never compute reach themselves.

**Files:**
- Modify: `shared/game-state.js:341-355` (insert after `equipmentSprintHeat`)
- Modify: `shared/game-state.js:378-381` (`rigEffects`)
- Test: `shared/game-state.test.js` (after the Sprint heat tests from Task 1)

- [ ] **Step 1: Write the failing tests**

In `shared/game-state.test.js`, add directly after the clamp test added in Task 1:

```js
test("Reinforced Servos reaches 2× Speed; base Servo and bare are 1½×", () => {
  assert.equal(equipmentSprintMult(null, null), 1.5);
  assert.equal(equipmentSprintMult("servo-actuators", null), 1.5);
  assert.equal(equipmentSprintMult("servo-actuators", "reinforced-servos"), 2);
  // A non-servo equipment's upgrade can't smuggle reach in.
  assert.equal(equipmentSprintMult("radiator-array", "twin-radiators"), 1.5);
});

test("rigEffects.sprintMult matches the helper across all three servo tiers", () => {
  const tiers = [
    {},
    { equipment: "servo-actuators" },
    { equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" },
  ];
  for (const over of tiers) {
    const rig = { name: "T", ...over };
    assert.equal(
      rigEffects(rig).sprintMult,
      equipmentSprintMult(rig.equipment || null, rig.equipmentUpgrade || null),
    );
  }
  assert.equal(rigEffects({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" }).sprintMult, 2);
  assert.equal(rigEffects({}).sprintMult, 1.5);
});
```

Add `equipmentSprintMult` to the existing import list at the top of `shared/game-state.test.js` (around line 8-9, next to `equipmentSprintHeat`). `rigEffects` is already imported there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern "sprintMult|reaches 2" "shared/**/*.test.js"`

Expected: FAIL with `equipmentSprintMult is not defined` (or a SyntaxError about the missing export, depending on module resolution — either is the expected red).

- [ ] **Step 3: Add the helper**

In `shared/game-state.js`, insert directly below the `equipmentSprintHeat` function you rewrote in Task 1 (before the `equipmentRepairBonus` comment block):

```js
// Sprint reach as a multiple of Speed: 1½× by default, and Servo Actuators'
// Reinforced Servos Field upgrade sharpens it to 2× via its sprintMult effect
// tag. Reach is what the upgrade pays out now that Sprint heat is floored at 1.
export function equipmentSprintMult(equipmentId, equipmentUpgradeId) {
  if (equipmentId !== "servo-actuators") return 1.5;
  const up = (EQUIPMENT_UPGRADES[equipmentId] || []).find((u) => u.id === equipmentUpgradeId);
  return up?.effect?.sprintMult ?? 1.5;
}
```

- [ ] **Step 4: Surface it on `rigEffects`**

In `shared/game-state.js`, inside `rigEffects`, directly after the `actionHeat` block (currently lines 378-381), add:

```js
  // Sprint reach multiple (1½× Speed, 2× with Reinforced Servos). Clients render
  // this — none of them may hardcode the multiplier.
  const sprintMult = equipmentSprintMult(equip, upId);
```

Then add `sprintMult` to the object `rigEffects` returns. Replace the single-line return at `shared/game-state.js:406`:

```js
  return { actionHeat, sprintMult, repair: { bonusSp: equipmentRepairBonus(equip, upId) }, thermalMargin, hullMaxBonus, recoveryCool, combat, modifiers };
```

`sprintMult` sits next to `actionHeat` — both are Sprint's pre-resolved cost and reach.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --test-name-pattern "sprintMult|reaches 2" "shared/**/*.test.js"`

Expected: PASS, 2 tests.

- [ ] **Step 6: Run the full shared suite**

Run: `node --test "shared/**/*.test.js"`

Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(v2): Reinforced Servos reaches 2x Speed via rigEffects.sprintMult

Sprint heat no longer discounts, so the Field upgrade pays out in distance
instead: 2x Speed rather than 1.5x, at the same 1 heat. The cost stays on every
tier, so the positioning decision survives.

equipmentSprintMult resolves it from the catalog and rigEffects pre-resolves it
for consumers, matching equipmentSprintHeat/actionHeat's shape.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Clients render `sprintMult` instead of hardcoding `1.5`

Three sites compute Sprint reach themselves. Reach is now loadout-dependent, so each one is a live drift hazard.

**Files:**
- Modify: `client/src/v2/battle/MoveBody.tsx:26-31`
- Modify: `client/src/v2/overlays/RigTerminal.tsx:47-51`
- Modify: `client/src/state/BattleActionsContext.tsx:10`, `:77-79`, `:86-87`
- Test: `client/src/v2/battle/MoveBody.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `client/src/v2/battle/MoveBody.test.tsx`, replace the test at lines 20-23 and add the reach tests, so the `describe` block reads:

```tsx
describe("MoveBody sprint heat", () => {
  it("shows +1 for a Servo Actuators rig", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+1 heat");
  });
  it("shows +1 for a Reinforced Servos rig — Sprint is never free", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("+1 heat");
    expect(document.body.textContent).not.toContain("+0 heat");
  });
  it("Sprint hint notes the free 90° pivot", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain("pivot up to 90° free");
  });
});

describe("MoveBody sprint reach", () => {
  it("Sprints 12\" at 1½× Speed on base Servo Actuators (Speed 8)", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain('12"');
  });
  it("Sprints 16\" at 2× Speed with Reinforced Servos (Speed 8)", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" })} actionKey="sprint" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain('16"');
  });
  it("a plain Move is full Speed regardless of the upgrade", () => {
    render(<MoveBody rig={baseRig({ equipment: "servo-actuators", equipmentUpgrade: "reinforced-servos" })} actionKey="move" enemies={[]} onEngageChange={noop} onCancel={noop} onConfirm={noop} />);
    expect(document.body.textContent).toContain('8"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`

Expected: FAIL. "shows +1 for a Reinforced Servos rig" fails (renders `+0 heat`) and "Sprints 16\"" fails (renders `12"`).

- [ ] **Step 3: Fix `MoveBody.tsx`**

In `client/src/v2/battle/MoveBody.tsx`, replace lines 26-31:

```tsx
  // Sprint reach is loadout-derived (1½× Speed, 2× with the Reinforced Servos
  // Field upgrade), rounded to a whole inch so table measuring stays clean.
  const dist = sprint ? Math.round(base * rigEffects(rig).sprintMult) : base;
  // Sprint heat is engine-derived (Servo Actuators → 1) and floored at 1 — never
  // free. Move is always +1. Reading rigEffects keeps this drawer identical to
  // the picker chip and to what resolution charges.
  const heat = sprint ? rigEffects(rig).actionHeat.sprint : 1;
```

`rigEffects` is already imported at line 3. Then replace the stale comment at lines 38-39:

```tsx
  // Move and Sprint each spend one action slot; both generate heat (Move +1,
  // Sprint +2 / +1 with Servo Actuators). Repeat them within the budget.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 5: Fix `RigTerminal.tsx`**

In `client/src/v2/overlays/RigTerminal.tsx`, replace lines 47-51:

```tsx
  // Movement stats now live on the chassis — surface Speed (a Move's reach) and
  // its derived Sprint (1½× Speed, 2× with Reinforced Servos) so the status view
  // isn't silent on how far this Rig travels. Same resolution order as MoveBody:
  // chassis > class > 8.
  const speed = rig.speed ?? SPEED[rig.weightClass] ?? 8;
  const sprint = Math.round(speed * rigEffects(rig).sprintMult);
```

`rigEffects(rig)` is already called at line 45 for `hullMaxBonus`. Leave that line as it is — do not refactor it into a shared local.

- [ ] **Step 6: Fix `BattleActionsContext.tsx` (V1)**

This file has the same hardcoded `1.5` *and* its own hand-rolled Sprint heat at line 79 that never knew about upgrades at all. Route both through the read-model.

Replace line 10:

```tsx
import { HEAT_CAPACITY, rigEffects } from "/shared/game-state.js";
```

Replace lines 77-79:

```tsx
  // Sprint reach and heat are both loadout-derived; rigEffects is the one
  // read-model that resolves them (V2's MoveBody reads the same values).
  const dist = sprint ? Math.round(base * rigEffects(rig).sprintMult) : base;
  const heat = sprint ? rigEffects(rig).actionHeat.sprint : 1;
```

Replace the stale comment at lines 86-87:

```tsx
  // Move and Sprint each spend one action slot; both generate heat (Move +1,
  // Sprint +2 / +1 with Servo Actuators). Repeat them within the budget.
```

- [ ] **Step 7: Verify no hardcoded Sprint multiplier survives**

Run: `npx vitest run && node --test "shared/**/*.test.js"`

Expected: PASS, 0 failures.

Then run: `git grep -n "1\.5" -- client/src shared/*.js`

Expected: no hit that multiplies a Speed value. If any of the three sites still
has `base * 1.5` or `speed * 1.5`, it was missed — fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/battle/MoveBody.tsx client/src/v2/battle/MoveBody.test.tsx client/src/v2/overlays/RigTerminal.tsx client/src/state/BattleActionsContext.tsx
git commit -m "refactor(v2): clients read rigEffects.sprintMult, drop hardcoded 1.5

Sprint reach was hardcoded as base * 1.5 in three places (MoveBody, RigTerminal,
V1 BattleActionsContext). Reach is loadout-dependent now, so each was a live
drift hazard the moment Reinforced Servos started granting 2x.

Also routes V1's hand-rolled sprint heat through rigEffects — it checked
rig.equipment directly and never knew upgrades existed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Update `rules.md`

The rulebook is the player-facing source of truth and currently promises a free Sprint in four places.

**Files:**
- Modify: `rules.md:155`, `rules.md:205`, `rules.md:529`, `rules.md:544`, `rules.md:655`

- [ ] **Step 1: Update the §5 Sprint bullet**

Replace line 155:

```markdown
  - *Sprint:* you may extend a Move to up to **1½ × Speed** (**2 × Speed** with Reinforced Servos); a Sprinting Move generates **2 heat** instead of 1 (§6). Sprint is **never free** — its heat floors at 1 no matter the loadout.
```

- [ ] **Step 2: Update the §6 heat table row**

Replace line 205:

```markdown
| Move — **Sprint** (up to 1½× Speed; 2× with Reinforced Servos) | 2 |
```

- [ ] **Step 3: Update the equipment table**

Line 529's Servo Actuators passive ("Sprint costs 1 heat instead of 2") is still
accurate — **leave it alone**. Read the line to confirm before moving on.

- [ ] **Step 4: Update the upgrade ladder**

In line 544, replace only the Reinforced Servos cell text — the Kickstart Pistons and Grapnel Launcher cells on that row stay exactly as they are:

```markdown
| Servo Actuators | Reinforced Servos (Sprint reaches 2× Speed, not 1½×) | Kickstart Pistons (charge into contact → first melee after +2 STR) | Grapnel Launcher (yank free of a lock or reel an enemy in; heat + cooldown) |
```

- [ ] **Step 5: Update the tuning note**

Replace line 655:

```markdown
- **Sprint** (§5/§6) — normal Move is 1 heat at any distance up to Speed; a Sprint (up to 1½× Speed) costs 2 heat. Replaces the old "half-Speed = 1, more = 2" tax that made every advance run hot. ⚙ TUNING: Sprint heat now **floors at 1** — Reinforced Servos used to zero it, which made repositioning free and turned Sprint into a strictly-better Move. The upgrade now grants **2× Speed reach** instead.
```

- [ ] **Step 6: Verify no stale promise of a free Sprint survives**

Run: `git grep -n "Sprint costs 0\|0 heat" -- rules.md`

Expected: no hit referring to Sprint. If one remains, fix it.

- [ ] **Step 7: Commit**

```bash
git add rules.md
git commit -m "docs(v2): rules.md — Sprint heat floors at 1, Reinforced Servos grants 2x reach

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`

Expected: PASS, 0 failures across Vitest and `node --test`.

- [ ] **Step 2: Confirm the floor holds end-to-end**

Run:

```bash
node -e "import('./shared/game-state.js').then(m => {
  const tiers = [[null,null],['servo-actuators',null],['servo-actuators','reinforced-servos']];
  for (const [e,u] of tiers) console.log(e||'bare', u||'-', 'heat', m.equipmentSprintHeat(e,u), 'mult', m.equipmentSprintMult(e,u));
})"
```

Expected output:

```
bare - heat 2 mult 1.5
servo-actuators - heat 1 mult 1.5
servo-actuators reinforced-servos heat 1 mult 2
```

If any heat reads 0, the floor is broken — stop and report.

- [ ] **Step 3: Report**

Report the `npm test` summary line and the table above. Do not claim done without both.
