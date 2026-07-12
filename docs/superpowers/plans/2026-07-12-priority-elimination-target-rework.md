# Priority Elimination — Target Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make kill VP earnable only by destroying a per-side **Priority Target** (a random enemy Rig re-rolled every round), remove the legacy Ironclad Bounty, and surface the target across the V2 UI.

**Architecture:** Repurpose the existing per-side `game.bounties` map (rename → `game.priorityTargets`) as the real, scored, dynamic target. Reroll at `advanceRound`; score in the existing one-shot `onRigDamaged` destruction transition, gated on "the destroyed Rig is this side's target". V2 HUD + roster read `priorityTargets` for display.

**Tech Stack:** Node/vanilla JS shared state (`node:test`), React + TypeScript client (`vitest` + Testing Library).

**Execution note:** run in an isolated git worktree (a live concurrent session is editing `game-state.js`, `RigRow.tsx`, `rules.md` in the main working tree). Commit with explicit paths.

---

## Task 1: Rename `bounties` → `priorityTargets` (mechanical, no behavior change)

**Files:** Modify `shared/game-state.js`, `shared/game-state.test.js`.

- [ ] **Step 1: Rename every occurrence**

In `shared/game-state.js` replace `bounties` with `priorityTargets` at all sites:
`createGame` init (~437 `priorityTargets: {}`), `ensureGameShape` (~573
`room.game.priorityTargets ||= {}`), the two reset sites (~911, ~1000
`room.game.priorityTargets = {}`), `startGameSeeded` (~1009-1015 local var +
`room.game.priorityTargets = ...`), `maybeStartGame` (~1036-1042 same),
`publicState` redaction (~2580-2604: local `const priorityTargets = {}`,
`if (sideId && room.game.priorityTargets[sideId]) priorityTargets[sideId] = ...`,
and the `game: { ..., priorityTargets, ... }` field), and `formatBattleState`
(~2660 `const targetId = sideId ? g.priorityTargets[sideId] : null;`).

In `shared/game-state.test.js`, the reference at ~line 404
`r.game.bounties.b` → `r.game.priorityTargets.b`.

- [ ] **Step 2: Run the backend suite**

Run: `node --test shared/game-state.test.js`
Expected: all pass (pure rename, no behavior change).

- [ ] **Step 3: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "refactor(vp): rename bounties → priorityTargets"
```

---

## Task 2: Reroll the Priority Target every round

**Files:** Modify `shared/game-state.js`. Test: `shared/game-state.test.js`.

Context: `randomPick(items, random = Math.random)` already exists (~974) and
returns null on an empty list. `advanceRound(room)` (~2085) has three branches:
`finished` (points win), sudden-death start, `draw`/finished, and the normal
`round += 1` else-branch. Reroll only in the branches that CONTINUE the game.

- [ ] **Step 1: Write failing tests**

Add to `shared/game-state.test.js`:

```js
test("rerollPriorityTargets picks a living enemy and skips destroyed rigs", () => {
  const r = startedRoom();
  const [b1, b2, b3] = ["b1","b2","b3"].map((id) => findRig(r, id));
  b1.destroyed = true;                       // dead — must be skipped
  // random() = 0 picks the first of the filtered (living) enemy list for side "a".
  __test.rerollPriorityTargets(r, () => 0);
  const targetA = r.game.priorityTargets.a;
  assert.ok(targetA === b2.id || targetA === b3.id, "target is a living enemy");
  assert.notEqual(targetA, b1.id, "destroyed rig never chosen");
});

test("advanceRound re-rolls each side's target to a living enemy", () => {
  const r = startedRoom();
  r.game.round = 3;
  advanceRoundForTest(r);                     // see step 3 for the export used
  const livingEnemiesOfA = r.rigs.filter((x) => (x.owner||"a") === "b" && !x.destroyed).map((x)=>x.id);
  assert.ok(livingEnemiesOfA.includes(r.game.priorityTargets.a));
});
```

If `advanceRound` is not already reachable from tests, expose it via `__test`
(it is a module-private function). Add `advanceRound` to the `__test` export and
reference it as `__test.advanceRound` in the test (rename `advanceRoundForTest`
above to `__test.advanceRound`).

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `__test.rerollPriorityTargets` / `__test.advanceRound` undefined.

- [ ] **Step 3: Implement the helper + wire it**

Add near `randomPick` in `shared/game-state.js`:

```js
// Re-designate each side's Priority Target: a random LIVING enemy Rig. Called at
// battle start and every round advance. Skips destroyed Rigs; leaves a side's
// target unset if it has no living enemies (annihilation ends the game anyway).
function rerollPriorityTargets(room, random = Math.random) {
  const targets = {};
  for (const side of room.game.sides) {
    const enemies = room.rigs.filter((r) => (r.owner || "a") !== side.id && !r.destroyed);
    const pick = randomPick(enemies, random);
    if (pick) targets[side.id] = pick.id;
  }
  room.game.priorityTargets = targets;
}
```

In `advanceRound`, add `rerollPriorityTargets(room);` inside the sudden-death
start branch (right after `room.game.initiative = null;`) and inside the normal
`else` branch (after `room.game.initiative = null;`). Do NOT add it to the
`finished` / `draw` branches.

Add both functions to the `__test` export object:
`export const __test = { ..., rerollPriorityTargets, advanceRound };`

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: the two new tests PASS, all pre-existing PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(vp): re-roll the Priority Target every round"
```

---

## Task 3: Gate kill scoring to the Priority Target

**Files:** Modify `shared/game-state.js` (`onRigDamaged`). Test: `shared/game-state.test.js`.

Context: the current `onRigDamaged` awards KILL_VP to `sides.find(s => s.id !== rig.owner)`
(any kill). Change it to award only to the side whose target this Rig is.

- [ ] **Step 1: Rewrite the three existing kill-VP tests + add a non-target test**

Replace the three tests added in the prior feature ("destroying an enemy rig
scores +2…", "a rig lost to its own cause…", "kill VP is awarded once…") with
target-gated versions, and add a non-target case:

```js
test("destroying your Priority Target scores +2 VP", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id };
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } });
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  const kill = r.game.resolutions.find((e) => e.kind === "destruction" && e.rigId === b1.id);
  assert.deepEqual(kill.vp, { side: "a", amount: 2 });
  assert.equal(kill.victimName, b1.name);
  assert.ok(kill.effects.some((e) => /Priority Elimination/.test(e)));
});

test("destroying a NON-target enemy scores nothing", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1"); const b2 = findRig(r, "b2");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id }; // a's target is b1, not b2
  b2.hull.sp = 1;
  __test.applyDamage(r, b2, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b2.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 0);
  const kill = r.game.resolutions.find((e) => e.kind === "destruction" && e.rigId === b2.id);
  assert.equal(kill.vp, undefined);
});

test("a Priority Target lost to its own cause still scores for its hunter", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  r.game.priorityTargets = { a: findRig(r, "b1").id, b: a1.id }; // b hunts a1
  a1.hull.sp = 1;
  __test.applyDamage(r, a1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(a1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 2);
});

test("Priority Target kill VP is awarded once, never twice", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id };
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  __test.setRigSp(b1, "hull", 5);
  assert.equal(b1.destroyed, false);
  __test.applyDamage(r, b1, "hull", 9, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/game-state.test.js`
Expected: the non-target test FAILS (current code awards +2 to any kill), and the
scoring tests may fail on the scorer identity.

- [ ] **Step 3: Narrow the scorer lookup in `onRigDamaged`**

Replace `const scorer = room.game.sides.find((s) => s.id !== rig.owner);` with:

```js
    const scorer = room.game.sides.find(
      (s) => room.game.priorityTargets?.[s.id] === rig.id,
    );
```

Leave the rest of the block (the `if (scorer) { scorer.vp += KILL_VP; effects.push(...) }`
and the enriched `pushResolution`) unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `node --test shared/game-state.test.js`
Expected: all four tests PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(vp): score kill VP only for the Priority Target"
```

---

## Task 4: Types rename + remove Ironclad Bounty (V1 + prompt + rules)

**Files:** Modify `client/src/state/types.ts`, `client/src/components/BattleSetup.tsx`, `rules.md`. (`formatBattleState` label was covered in Task 1's rename — update its text here.)

- [ ] **Step 1: Types rename**

In `client/src/state/types.ts`, `GameState`:
`bounties?: Record<string, number>;` → `priorityTargets?: Record<string, number>;`

- [ ] **Step 2: `formatBattleState` label**

In `shared/game-state.js` `formatBattleState`, change the pushed line from
`Your Ironclad Bounty: ${...}` to `Your Priority Target: ${target.name}` (the
variable was renamed to `targetId`/`target` in Task 1; adjust the name here).

- [ ] **Step 3: V1 BattleSetup rename**

In `client/src/components/BattleSetup.tsx`:
- `const bountyId = game?.bounties?.[mySide];` → `game?.priorityTargets?.[mySide];`
- rename the local `bounty`/`bountyText` reads accordingly (mechanical);
- the displayed string `Ironclad Bounty: ...` / `Ironclad Bounty: awaiting target`
  → `Priority Target: ...` / `Priority Target: awaiting target`.

- [ ] **Step 4: rules.md §11**

Delete the `### Optional — Ironclad Bounty` heading and its paragraph. Rewrite the
`### Priority Elimination` paragraph to:

```markdown
### Priority Elimination
At the start of every round each squadron is assigned a single **Priority
Target** — one random enemy Rig, known only to the hunting side. Destroy **your**
Priority Target and you score **+2 VP**; wrecking any other enemy Rig scores
nothing. The target is re-rolled each round, so the pressure moves from machine
to machine. This is the game's only kill reward — it pays to hunt the mark, not
just trade blows.
```

- [ ] **Step 5: Typecheck + build sanity**

Run: `npx tsc --noEmit`
Expected: clean (no lingering `bounties` references).

- [ ] **Step 6: Commit**

```bash
git add client/src/state/types.ts client/src/components/BattleSetup.tsx shared/game-state.js rules.md
git commit -m "refactor(vp): remove Ironclad Bounty, rename to Priority Target"
```

---

## Task 5: V2 HUD — target line + toast text

**Files:** Modify `client/src/v2/components/BattleHud.tsx`, `client/src/v2/styles/battle.css`. Test: `client/src/v2/components/BattleHud.test.tsx`.

Context: `BattleHud` already reads `{ rigs, game }` and `mySide`, renders the VP
readout, and pops a kill toast when a fresh resolution carries `vp`. That toast
now fires only for target kills. Add a target line and update the toast text.

- [ ] **Step 1: Write failing tests**

Add to `BattleHud.test.tsx` (reuse the file's `Seed` + `AppProviders` render
pattern; session joins as side "a"):

```tsx
test("shows the local side's Priority Target", async () => {
  const state = { version:1, ownerSide:"a", field:null,
    rigs:[{ id:9, name:"Ravager", owner:"b", weightClass:"light",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      equipment:null, activated:false, destroyed:false }],
    game:{ round:2, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      priorityTargets:{ a: 9 } } } as unknown as ServerState;
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  expect(await screen.findByText(/🎯 Target: Ravager/)).toBeInTheDocument();
});
```

Also update the existing kill-toast test's expected text to
`/🎯 Target eliminated — Ravager · \+2 VP/`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run BattleHud`
Expected: the target-line test FAILS; the toast test FAILS on the new text.

- [ ] **Step 3: Implement**

In `BattleHud.tsx`, after the sides are derived, compute the target rig:
```tsx
  const targetId = game?.priorityTargets?.[mySide];
  const targetRig = targetId != null ? rigs.find((r) => r.id === targetId) : null;
```
Render a line inside the `v2-bh` container (after the VP row):
```tsx
      {targetRig && (
        <div className="v2-bh-target">🎯 Target: {targetRig.name}{targetRig.destroyed ? " ✓" : ""}</div>
      )}
```
Update the toast string to:
```tsx
    setToast(`🎯 Target eliminated — ${latest.victimName ?? "a unit"} · +${latest.vp!.amount} VP`);
```
(`targetId`/`targetRig` must be computed before the `if (!game?.started) return null;`
early return; use optional chaining — they're only rendered after the guard.)

Add to `battle.css`:
```css
.v2-root .v2-bh-target {
  font-family: var(--v2-mono);
  font-size: var(--v2-text-base);
  color: var(--v2-ember-hi);
  letter-spacing: 0.03em;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run BattleHud`
Expected: all BattleHud tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/components/BattleHud.tsx client/src/v2/styles/battle.css client/src/v2/components/BattleHud.test.tsx
git commit -m "feat(vp): show Priority Target + retarget kill toast in the V2 HUD"
```

---

## Task 6: V2 roster highlight

**Files:** Modify `client/src/v2/components/RigRow.tsx`, `client/src/v2/screens/Squadron.tsx`, `client/src/v2/styles/squadron.css`. Test: `client/src/v2/components/RigRow.test.tsx`.

Context: `RigRow({ rig, hostile, active, onOpen })` renders a foe/ally row.
`Squadron.tsx` renders foe rows at ~line 59:
`{foes.map((r) => <RigRow key={r.id} rig={r} hostile active={r.id === activeId} onOpen={onOpenRig} />)}`.

- [ ] **Step 1: Write a failing RigRow test**

Add to `client/src/v2/components/RigRow.test.tsx` (mirror its existing render setup):

```tsx
test("renders the Priority Target marker when target is set", () => {
  const rig = { id:9, name:"Ravager", owner:"b", weightClass:"light",
    hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
    legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
    equipment:null, activated:false, destroyed:false } as unknown as Rig;
  const { container } = render(<RigRow rig={rig} hostile target active={false} onOpen={() => {}} />);
  expect(container.querySelector(".v2-rigrow--target")).not.toBeNull();
  expect(screen.getByText("🎯")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run RigRow`
Expected: FAIL — no `target` prop / marker.

- [ ] **Step 3: Implement**

In `RigRow.tsx`, add `target` to the props:
`export function RigRow({ rig, hostile, active, target, onOpen }: { rig: Rig; hostile: boolean; active: boolean; target?: boolean; onOpen: (id: number) => void })`.
Add the class conditionally to the button:
`+ (target ? " v2-rigrow--target" : "")`.
In the row head (after the name span, near the ACTIVATING tag) add:
`{target && <span className="v2-rigrow-target" aria-label="Priority Target">🎯</span>}`.

In `Squadron.tsx`, read the target and pass it to the foe rows:
```tsx
  const targetId = game?.priorityTargets?.[mySide];
```
```tsx
  {foes.map((r) => <RigRow key={r.id} rig={r} hostile target={r.id === targetId} active={r.id === activeId} onOpen={onOpenRig} />)}
```

In `squadron.css`, add a target accent consistent with the hostile styling:
```css
.v2-rigrow--target { outline: 1px solid var(--v2-ember); outline-offset: -1px; }
.v2-rigrow-target { margin-left: 6px; font-size: 0.9em; }
```

- [ ] **Step 4: Run to verify pass + full client suite**

Run: `npx vitest run RigRow` then `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/components/RigRow.tsx client/src/v2/screens/Squadron.tsx client/src/v2/styles/squadron.css client/src/v2/components/RigRow.test.tsx
git commit -m "feat(vp): highlight the Priority Target in the V2 roster"
```

---

## Self-Review Notes

- **Spec coverage:** rename → T1; reroll → T2; target-gated scoring → T3; type +
  Ironclad Bounty removal + rules → T4; HUD target line + toast → T5; roster
  highlight → T6.
- **Type consistency:** `priorityTargets: Record<string, number>` used identically
  across game-state, types.ts, BattleHud, Squadron; `rerollPriorityTargets` and
  `advanceRound` exported via `__test`.
- **Ordering:** Task 1 (rename) must land before Tasks 2-6 reference
  `priorityTargets`. Within the worktree, run tasks in order.
```
