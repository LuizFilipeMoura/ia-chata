# Battle console fixes — design decisions

Date: 2026-07-06
Branch: `feat/score-objectives-vp-wizard`

Punch list from playtest. Each item: observed problem, decision, where it lands.
Server (`shared/game-state.js`, `shared/battle-view.js`) is authoritative; the
client POSTs a command and applies the returned state. No optimistic client
mutation, so every rule change lives server-side and the UI only reflects it.

## 1. Multiple moves + heat not corresponding

**Observed:** Player can Move more than once per activation (wanted), but heat
does not go up.

**Cause:** `performAction` gated Move/Sprint behind `t.movedThisActivation` — the
second Move returns `false`, so no slot spent and no heat added. UI closes the
Move drawer regardless, so it *looks* like a free extra move with no heat.

**Decision:** Allow unlimited Moves/Sprints per activation. Each spends 1 action
slot and adds its heat (Move +1, Sprint +2 / +1 with Servo Actuators). Drop the
`movedThisActivation` guard entirely (and the flag). Fix the Move drawer copy
that wrongly said "no heat" and "2 actions" for sprint (sprint is 1 slot).

## 2. Resolve Blast — checkbox list, not `window.prompt`

**Observed:** Blast resolution uses `window.prompt` for comma-separated names.

**Decision:** Replace with a drawer showing a checkbox list of every living Rig
(the controller ticks those within 12" of the wreck). Send the checked names as
`blast { targets }`. No server change — the `blast` verb already takes a name
array.

## 3. Move the Activate control out of the header

**Observed:** The Activate button sits in the Rig header, which is also the
click-to-expand target. Tapping to expand mis-fires an activation.

**Decision:** Header becomes expand-only, keeping a small read-only status chip
(Active / Done / Inactive). The interactive Activate button moves into the Rig
body, above the action console. Enemy Rigs keep only the status chip.

## 4. Remove Ram

**Observed:** Ram is redundant with melee.

**Decision:** Remove Ram as an action: drop it from `ACTION_ORDER`, the action
console dispatch, and the AttackWizard mode union + ram-only branches. Leave
`resolveRam` in `combat.js` unexported-from-use (dead but harmless) to keep the
diff small; remove its call site in `performAction`.

## 5. Shutdown after acting, proportional cooling

**Observed:** Shutdown only allowed as the first action; cools heat fully to the
floor.

**Decision:** Allow Shutdown at any point in the activation. Cooling is
proportional to how much of the activation was spent acting: the more slots
already used, the less it cools.

    overFloor      = heat - floor
    remainingHeat  = floor + overFloor * (actionsUsed / actionsMax)

So Shutdown with 0 actions used → full cool to floor; with all slots used →
no cooling. Shutdown still ends the activation. `availableActions` marks it
enabled whenever the Rig is active.

## 6. Dice-rolling animation missing around answer tokens

**Observed:** When resolutions arrive around answer-token / reaction play, the
dice-roll animation doesn't fire.

**Cause:** The resolution watcher plays only the newest fresh entry
(`fresh[fresh.length-1]`) to avoid a backlog stampede. When a single state
update carries several resolutions (e.g. a reveal + the dice-bearing attack),
the roll-bearing entries get skipped, so no animation.

**Decision:** Play fresh resolutions in sequence, chaining each
`playResolution` promise, so dice-bearing entries animate instead of being
dropped.

## 7. Range: draggable inch input, not near/far/out segments

**Observed:** The near/far/out segmented control is confusing and "doesn't
work".

**Decision:** Replace the Range segmented field with a draggable slider measured
in inches. The band (near / far / out) is derived from the weapon's own
`rng = [near, far]` thresholds: `≤near → near`, `≤far → far`, else `out`. The
slider still resolves to the `range` band string the server expects; inches are
UI-only. Melee continues to hide the range control.

## 8. Revert last action — floating button

**Observed:** No undo.

**Decision:** Server keeps a bounded history (last ~12) of `{rigs, game}` deep
clones on `room._history`, snapshotting **before** each turn-scoped mutating
command (`action`, `endactivation`, `activate`, `blast`, `react`, `answer`). A
new `undo` verb pops the top snapshot and restores it, allowed only when the
requesting side is the current turn side and the phase is `activation`.

`publicState` exposes `game.canUndo` (computed per-viewer: history non-empty,
phase activation, viewer === turn side). A floating `RevertFab` (mirrors
`LeaveRoomFab`) shows when `canUndo` and sends `undo`.

`room._history` lives on `room`, not `room.game`, so the `publicState` whitelist
already omits it from client payloads and the LLM prompt. It serializes with the
room to disk; bounded length keeps the file small.

## Non-goals

- No change to combat math (`combat.js` STR/impact rules) beyond removing the
  ram call site.
- Undo does not cross activation/round boundaries beyond the bounded stack; the
  "your turn" gate is sufficient for playtest.
