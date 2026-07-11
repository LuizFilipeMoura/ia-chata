# V2 Phase F — Battle Action Flows, Reactions & Watchers

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** Phase E (V2 Drawer + Roll). See overview.

## Goal

Make every battle action and reactive flow native V2: the action-drawer bodies (move/repair/prepare/
blast), the reaction picker, and the reactive watcher drawers (answer-token gate, reaction resolution,
activation recap). After this, the V2 `ActionConsole`/`TurnBanner`/`OutcomeBanner` route through V2
providers only.

## Replaces

`state/BattleActionsContext.tsx` (drawer bodies + dice bridging), `overlays/ReactionPicker.tsx`,
`hooks/useBattleWatchers.tsx` — for V2.

## Architecture / components

```
client/src/v2/
  state/V2BattleActionsContext.tsx  useV2BattleActions() → { openMove, openRepair, openPrepare,
                                     resolveBlast, sendReact, endActivation, rollInitiative, resetBattle }
                                     — same signatures as V1, rendering V2 drawer bodies via useV2Drawer
                                     and prompting dice via useV2Roll.
  battle/MoveBody.tsx               timed-hold move/sprint body (5s/8s hold, distance from SPEED, heat,
                                     optional engage select) — ported from V1 BattleActionsContext MoveBody
  battle/RepairBody.tsx             location picker + Repair vs Emergency Patch
  battle/PrepareBody.tsx            facedown reaction via V2 ReactionPicker
  battle/BlastBody.tsx              checklist of rigs within 12" of the wreck
  overlays/ReactionPicker.tsx       Brace / Evasive / Return Fire (+ Raise Shield when Bulwark) — V2 styled
  hooks/useV2BattleWatchers.tsx     answer-token gate, reaction resolution (evasive/return-fire),
                                     activation recap — opens V2 drawers; plays resolutions via useV2Roll
```

- All command verbs/attrs identical to V1 (`action` with move/sprint/repair/emergencypatch/prepare,
  `blast`, `react`, `endactivation`, `initiative`, `reset`). Distances/heat from the same `SPEED` map
  and rules; the V1 `BattleActionsContext` is the behavior source.
- `V2BattleActionsProvider` slots into `V2Providers` (the Phase-E composition reserved its place).
- **Rewire V2 consumers** to V2 hooks: `v2/battle/ActionConsole.tsx` (`useV2BattleActions`,
  `useV2Wizard` once G lands — until then keep `openAttack` from V1 wizard temporarily *within this
  phase's branch only if needed*; prefer sequencing G before F's attack routing), `v2/components/
  TurnBanner.tsx` (`useV2BattleActions` for initiative/blast/endActivation; `useV2Wizard` for score),
  `v2/overlays/OutcomeBanner.tsx` (`resetBattle` from `useV2BattleActions`).
- `V2Terminal` calls `useV2BattleWatchers()` instead of V1 `useBattleWatchers`.

## Behavior

Identical to V1 semantics: Move/Sprint hold-to-confirm; Repair auto (d12) vs manual (via `promptDice`)
vs Emergency Patch (guaranteed 2 SP); Prepare sets a facedown reaction; Blast ticks rigs within 12";
answer-token gate forces facedown placement; reaction resolution asks the defender (Evasive break /
Return Fire → reopens the V2 Attack wizard from G); activation recap auto-fades after ~6.5s; overheat
d12 prompt on end-activation when hot + manual.

## Testing

- `openMove` opens a drawer whose Confirm is locked until the hold elapses, then sends `action {name,
  action, engage?}`.
- `openRepair` "Emergency Patch" sends `action {…, action:"emergencypatch", loc}`; auto Repair sends
  `repair` without dice; manual path calls `promptDice`.
- `resolveBlast` sends `blast {targets}` from the checklist.
- ReactionPicker offers Raise Shield only for a Bulwark-Shield rig.
- Watchers: an answer-token `pendingAnswer` opens the gate drawer; a `pendingReaction` opens the
  resolution drawer.

## Done when

No V2 code imports `BattleActionsContext`, `ReactionPicker`, or `useBattleWatchers` from V1; the
action console + turn banner + outcome run entirely on V2 providers.
