# Priority Elimination — Kill VP (design)

**Date:** 2026-07-11
**Status:** Approved, ready for planning

## Problem

The game currently has one coded VP source: **salvage objectives** (§11),
scored positionally each Recovery Phase via the VP wizard. Rewards holding
ground only. Nothing rewards **aggression** — wrecking enemy Rigs earns zero VP
(annihilation is a separate auto-win, and the rules-only "Ironclad Bounty"
Priority Target is not implemented).

Additionally, `side.vp` is currently **invisible during battle** — it renders
only in the end-of-game `OutcomeBanner`. Any VP that accrues mid-game is
silent.

## Goal

Add **Priority Elimination**: a 2nd coded VP source that scores a flat **2 VP**
to a side each time an **enemy Rig is destroyed**, instantly and automatically.
Surface it with a **live VP readout in the battle HUD** and a **kill toast** so
the reward is visible and immediate.

## Scoring model

- **Trigger:** a Rig transitions to `destroyed`.
- **Credit:** the **opposing** side (the side whose id ≠ the destroyed Rig's
  `owner`) scores **2 VP**. Credit is by ownership, not by who dealt the fatal
  blow — however a Rig dies (enemy fire, overheat, munition cascade), the other
  side collects. (Chosen for simplicity; combat attribution not tracked.)
- **Once per Rig, permanent.** Tied to the existing one-shot destruction
  transition so a Rig can never double-score, even if repaired and re-killed.
- Two-side game: exactly one opposing side, found via
  `game.sides.find((s) => s.id !== rig.owner)`.

## Backend (`shared/game-state.js`)

Single insertion point: **`onRigDamaged`** (~line 1263), inside the existing
`if (rig.destroyed && !rig._blastRolled)` block — the one-time destruction
transition that already rolls the §9 blast D12 and pushes a `destruction`
resolution.

Within that block:

1. Resolve the scorer: `const scorer = room.game.sides.find((s) => s.id !== rig.owner)`.
2. If `scorer` exists, `scorer.vp += KILL_VP` (a named const, value **2**).
3. Enrich the **existing** `destruction` resolution entry with a machine-readable
   award so the client can toast precisely:
   - add `vp: { side: scorer.id, amount: KILL_VP }`;
   - append an effect line, e.g.
     `` `+${KILL_VP} VP — Priority Elimination (${scorer.name})` `` to its
     `effects` array, so the recap/roll console also shows it.

No new command, no phase change, no state-shape migration — VP lives on the
existing `side.vp`. Award happens on the same event whether the kill occurs in
`activation` or a reaction.

Guard notes:
- The `!rig._blastRolled` flag is set true in the same block → award fires
  exactly once. `repairRig` does not reset `_blastRolled`, so a revived-then
  re-killed Rig will not re-award (verified against current code).
- Annihilation: `checkAnnihilation` still runs after; the final kill scores
  harmlessly before the game ends.

## Frontend

### Live VP readout — `client/src/v2/components/BattleHud.tsx`

Add both sides' running VP to the HUD, `mySide` highlighted (mirror the existing
`v2-bh-mine` / `v2-bh-foe` treatment used for the turn line). Reads
`game.sides` directly. New markup + a small style rule in `v2/styles/battle.css`.
Format: compact, e.g. `You 4 · Enemy 2` with the mine/foe classes.

### Kill toast — `client/src/v2/hooks/useV2BattleWatchers.tsx`

Add a watcher effect that scans fresh resolutions (same freshness pattern as the
existing resolution-log watcher, keyed off a `useRef` high-water mark) for
entries carrying `entry.vp`. On a fresh kill entry, show a transient toast:
*"{scorer} scored — {victim} wrecked · +2 VP"*. Derive victim from the entry's
`rigId` → rig name (or embed the victim name in the resolution to avoid the
lookup after the Rig may be gone — prefer embedding `victimName` on the entry).

Reuse the existing non-blocking drawer/toast affordance already used for recaps
(auto-dismiss after a beat), or a lightweight dedicated toast element if the
drawer is too heavy — implementer's call during planning, favoring reuse.

### Types — `client/src/state/types.ts`

Extend the `Resolution` type: optional `vp?: { side: string; amount: number }`
and optional `victimName?: string`.

## Testing

### `shared/game-state.test.js`
- Enemy Rig destroyed by fire → opposing side `+2 VP`; `vp` field on the
  destruction resolution names the scorer.
- Self-destruct (overheat / munition cascade to own Rig) → the **other** side
  still scores +2.
- Fires **once**: destroy, repair the Rig back up, destroy again → total is
  still +2 (no double-award).
- Annihilating kill → scorer gets +2 and the game still resolves to annihilation.

### Client
- `BattleHud.test.tsx` — renders both sides' VP with the correct mine/foe
  emphasis.
- `useV2BattleWatchers.test.tsx` — a fresh resolution carrying `vp` triggers the
  kill toast; a resolution without `vp` does not.

## Non-goals

- **Scaled bounties** (heavier Rigs worth more) — flat 2 VP only.
- **Combat attribution** (crediting the actual shooter vs. self-immolation) —
  out of scope; credit is by ownership.
- **Ironclad Bounty / Priority Target** (secret single target) — a separate,
  still-unimplemented system; not touched here.
- **Damage/crit VP** — kills only.
- Rules text (`rules.md` §11) update is desirable but a doc follow-up, not a
  blocker for the mechanic.
```
