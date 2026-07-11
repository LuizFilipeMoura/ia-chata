# V2 Frontend — Phase C Design (Battle System)

**Date:** 2026-07-11
**Status:** Approved (pre-approved for all 4 phases)
**Depends on:** Phase A (shell, squadron, rig terminal, isolation) + Phase B (commission). Same architecture.

## Goal

Make the live battle playable in V2. Port the persistent battle **chrome** to the V2 design
language and wire it to the real game, reusing V1's shared portalled overlays for the heavy
dice/drawer/targeting machinery as a documented interim (same reuse pattern as Phase A/B).

## Key architectural leverage

Every battle interaction already flows through **shared providers mounted in `AppProviders`**
(unchanged by V2) and **pure shared view functions**:
- `useBattleActions()` → `openMove, openRepair, openPrepare, resolveBlast, endActivation, rollInitiative, sendReact, resetBattle` (drive the shared `Drawer`/`Roll` overlays).
- `useWizard()` → `openAttack(rig, mode), openScore()` (shared `AttackWizard`/`VpWizard` portals).
- `useCommands()` → `sendCommand("action"|"activate"|...)`.
- View fns: `phaseSummary(game, rigs)`, `computeFocus(game, rigs, mySide)`, `availableActions(rig, turn, round)`, `actionBudget(rig, turn)`, `outcomeText(outcome, sides)`.
- `useBattleWatchers()` — the hook that opens the answer-token gate, reaction-resolution,
  activation recap, and plays the roll console. **V2 must call this** so those flows work.

Therefore V2 ports only the **chrome** and reuses the rest.

## Scope

**Ported to V2 styling (this phase):**
- **TurnBanner** — the pinned "one thing to do now" card driven by `computeFocus`; CTAs call the
  shared actions. Whole-screen `my-turn-glow` while it's your move.
- **BattleHud** — phase-label + round + turn + answer-token count + "opponent reacting" line
  (`phaseSummary`).
- **ActionConsole** (inside the V2 RigTerminal, active rig only) — action budget pips + the three
  tactile groups (Attack/Move/Support) with a popover of enabled sub-actions; routes to
  `openAttack`/`openMove`/`openRepair`/`openPrepare`/`sendCommand`/`endActivation`. Uses
  `availableActions`/`actionBudget`.
- **OutcomeBanner** — V2 victory/defeat screen (mockup lines 477–496) when `phase==="finished"`,
  with `outcomeText` and a "New Battle" button (`resetBattle`).
- **BattleSetup readiness** already lives in the Yard ready bar (Phase A); no change needed beyond
  it working once a field is locked.

**Reused from V1 as interim (V1-styled, mounted inside `.v2-root`; restyle deferred):**
- Field map + field editor: reuse V1 `FieldMap` + `FieldControls` components directly.
- Roll console (dice theater), move/repair/prepare drawers, Attack wizard, VP wizard, reaction
  picker, answer-token gate, activation recap — all reached via the shared contexts /
  `useBattleWatchers`. No V2 reimplementation this phase.

## Components / files

```
client/src/v2/
  V2Terminal.tsx            MODIFY — call useBattleWatchers(); render TurnBanner + BattleHud + (battle) FieldMap/FieldControls; OutcomeBanner when finished
  components/BattleHud.tsx   V2 phase strip
  components/TurnBanner.tsx  V2 focus banner (ported)
  battle/ActionConsole.tsx   V2 action console (ported; used by RigTerminal)
  overlays/OutcomeBanner.tsx V2 outcome screen
  overlays/RigTerminal.tsx   MODIFY — render <ActionConsole rig=…/> when started
  styles/battle.css          scoped chrome styles (hud, turn banner, action console, outcome)
```

## Behavior

- **Battle view:** when `game.started`, the Yard screen additionally shows the BattleHud (top of
  the screen area) and mounts FieldMap + FieldControls (reused V1) below the roster. TurnBanner is
  pinned above the screen area (fixed). Pre-battle, none of these render (`computeFocus`/`phaseSummary`
  return nulls / the components guard on `started`).
- **Activation:** tap your rig → RigTerminal → Activate (now enabled by real `canActivate`) →
  ActionConsole appears (active rig) → choose Attack/Move/Support → shared overlay handles it →
  server pushes state → re-render.
- **Focus guidance:** TurnBanner CTAs (commission/ready/initiative/blast/score/endTurn) call the
  shared actions exactly as V1's TurnBanner does.
- **Outcome:** when finished, OutcomeBanner overlays with VP/standing summary + New Battle.
- The V2 `my-turn-glow` border: V2 sets it on a `.v2-root` class (not `document.body`) so it stays
  scoped; a `.v2-root.my-turn-glow` rule draws the border.

## Testing

- BattleHud renders phase/round/turn from a started `game`; nothing pre-battle.
- TurnBanner renders `computeFocus` primary text + fires the right shared action on CTA click
  (mock the contexts).
- ActionConsole: active rig shows budget pips + groups; Attack group with one enabled action calls
  `openAttack`; End-turn calls `endActivation`. Non-active rig renders empty.
- OutcomeBanner shows `outcomeText` and New Battle calls `resetBattle`; hidden unless finished.
- CSS isolation guard already covers `battle.css`.

## Non-goals (Phase C)

- No V2 restyle of the roll console, drawers, attack/VP wizards, field map (reused V1 — interim).
- No new battle mechanics; presentation only.
