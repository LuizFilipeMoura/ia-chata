# Priority Elimination — Target Rework (design)

**Date:** 2026-07-12
**Status:** Approved, ready for planning
**Supersedes:** `2026-07-11-priority-elimination-design.md` (the flat "+2 for any kill"
version shipped on `frontend/v2-redesign`; this reworks it).

## What changes and why

The shipped Priority Elimination awards +2 VP for destroying **any** enemy Rig.
Per the user, that is wrong: kill VP must be earned only by destroying **one
specific designated enemy Rig** — a **Priority Target** that is **re-rolled at
random every round**. This is the **only** kill-related VP mechanic in the game.

Separately, the legacy **Ironclad Bounty** (a static, unscored, V1-only
"Priority Target" designation stored in `game.bounties`) is **removed**. Its
data structure is repurposed as the real, scored, dynamic Priority Target.

## Mechanic

- Each side has exactly **one Priority Target**: a Rig owned by the enemy.
- **Assigned** at battle start (random living enemy Rig — real start already does
  this in `maybeStartGame`; the deterministic seed start keeps first-enemy).
- **Re-rolled every round** at `advanceRound`, random among the enemy's **living**
  Rigs.
- **Scoring:** when a Rig is destroyed, the side whose Priority Target *is* that
  Rig scores **`KILL_VP` = 2**. Destroying any other enemy Rig scores nothing.
  A Rig is owned by exactly one side, so it can be at most one side's target →
  at most one side scores per kill, **once** (existing `_blastRolled` one-shot
  guard). Credit by designation, however the Rig died (enemy fire or
  self-destruct) — consistent with the prior model.
- **Secret:** each side sees only its own target (public-state redaction, as the
  old bounty did).

## Backend (`shared/game-state.js`)

### Rename `bounties` → `priorityTargets`
`Record<sideId, rigId>`. Touch every site: `createGame` init (~437),
`ensureGameShape` (~573), the two field-reset sites (~911, ~1000),
`startGameSeeded` (~1009-1015), `maybeStartGame` (~1036-1042), `publicState`
redaction (~2580-2604), `formatBattleState` (~2660). Update tests referencing
`game.bounties` (e.g. `game-state.test.js:404`).

### New helper — reroll
```js
// Re-designate each side's Priority Target: a random LIVING enemy Rig. Called at
// battle start and every round advance. Skips destroyed Rigs; leaves a side's
// target null if it has no living enemies (annihilation ends the game anyway).
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
Export it via `__test` for deterministic unit tests.

### Reroll on round advance
In `advanceRound` (~2085), call `rerollPriorityTargets(room)` in the two branches
that **continue** the game (normal `round += 1`, and the sudden-death branch) —
**not** the `finished` branches. Real play uses `Math.random`; determinism isn't
asserted in the recovery integration path (tests assert *validity* of the picked
target, and exact selection is covered by the helper's own unit test).

### Scoring — narrow `onRigDamaged`
Inside the existing `if (rig.destroyed && !rig._blastRolled)` block, replace the
"opposing side always scores" logic with target-gated scoring:
```js
    const scorer = room.game.sides.find(
      (s) => room.game.priorityTargets?.[s.id] === rig.id,
    );
    const effects = [];
    if (scorer) {
      scorer.vp = (scorer.vp || 0) + KILL_VP;
      effects.push(`+${KILL_VP} VP — Priority Elimination (${scorer.name})`);
    }
    pushResolution(room, {
      kind: "destruction", actor: rig.owner, rigId: rig.id,
      victimName: rig.name,
      vp: scorer ? { side: scorer.id, amount: KILL_VP } : undefined,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} destroyed — ${exploded ? 'munitions erupt (mark rigs within 4")' : "no secondary blast"}`,
      effects,
    });
```
`KILL_VP = 2` stays. A non-target kill yields `vp: undefined` (no VP, no toast).

### `formatBattleState`
Replace the "Your Ironclad Bounty: X" line with **"Your Priority Target: X"**,
reading `g.priorityTargets[sideId]`.

## Types (`client/src/state/types.ts`)
Rename `bounties?: Record<string, number>` → `priorityTargets?: Record<string, number>`.

## Remove Ironclad Bounty — user-facing
- **V1 `client/src/components/BattleSetup.tsx`:** the label "Ironclad Bounty:"
  and `game.bounties` reference become "Priority Target:" / `game.priorityTargets`.
  (V1 is legacy but must keep compiling; minimal rename, no behavior change.)
- **`rules.md` §11:** delete the "### Optional — Ironclad Bounty" paragraph.
  Rewrite the "### Priority Elimination" paragraph (added earlier, currently says
  "any enemy Rig") to the target-only, re-rolled-each-round mechanic.

## V2 surface

### HUD target line — `client/src/v2/components/BattleHud.tsx`
Add a line showing the local side's current target:
`🎯 Target: <rigName>` where `rigName` = the rig whose id is
`game.priorityTargets?.[mySide]` (look up in `rigs`). If that rig is destroyed,
suffix ` ✓` (already eliminated). Render nothing if no target yet.
The existing kill toast already fires only when a resolution carries `vp`, which
now happens **only** for target kills — update its text to target framing:
`🎯 Target eliminated — <victim> · +2 VP`.

### Roster highlight — `RigRow` + `Squadron`
- `client/src/v2/components/RigRow.tsx`: add an optional `target?: boolean` prop.
  When true, add a `v2-rigrow--target` class and a `🎯` marker in the row head
  (near the name). Default false so existing callers/tests are unaffected.
- `client/src/v2/screens/Squadron.tsx`: for the **foe** rows (line ~59), pass
  `target={r.id === game?.priorityTargets?.[mySide]}`.
- `client/src/v2/styles/squadron.css`: a `.v2-rigrow--target` accent (e.g. an
  ember outline / marker color) consistent with existing `--hostile` styling.

## Testing

### Backend (`shared/game-state.test.js`)
- **Rewrite** the three existing kill-VP tests to be target-gated:
  - destroying a side's Priority Target scores that side +2 (resolution carries
    `vp` + `victimName` + Priority Elimination effect);
  - destroying a **non-target** enemy scores **nothing** and the resolution has
    no `vp`;
  - once-per-rig still holds (revive + rekill of a target → stays +2).
  - self-destruct of a target still scores for its hunter.
- **New:** `rerollPriorityTargets` with an injected `random` picks a specific
  living enemy and **skips destroyed** Rigs; `advanceRound` re-rolls each side's
  target to a **living enemy** (assert membership in the living-enemy id set).
- Update the `game.bounties` reference at ~line 404 to `priorityTargets`.

### Client
- `BattleHud.test.tsx`: renders `🎯 Target: <name>` for the local side's target;
  the kill toast still fires on a `vp`-bearing resolution with the new text.
- `RigRow.test.tsx`: `target` prop renders the marker / `v2-rigrow--target` class.
- `Squadron.test.tsx`: the foe row matching `priorityTargets[mySide]` gets the
  target treatment (if the existing test seeds a started game).

## Non-goals
- Player-chosen targets (random only), per-activation rotation (per-round only),
  scaled/attribution scoring — all out of scope.
- `MAX_ROUNDS` / "Round X/5" vs "10 rounds" inconsistency is pre-existing, untouched.
```
