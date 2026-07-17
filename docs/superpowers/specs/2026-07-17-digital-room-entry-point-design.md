# Digital-Room Entry Point — Design

**Date:** 2026-07-17
**Status:** Approved design. Ready for an implementation plan.
**Unblocks:** the live reachability of BOTH [[human-vs-bot]] and
[[digital-battle-map]]. Both stacks are fully built and tested but **dark** —
nothing in the running app sets `room.mode = "digital"` (it is assigned only in
test code). This adds the missing switch.

## Problem

`room.mode` gates the entire digital experience (auto-deploy, terrain scatter,
Rigs-only rosters, the digital move handler, the map-primary battle screen, the
bot opponent). It defaults to `"physical"` and there is no command verb, HTTP
route, join option, or client control that flips a room to `"digital"`. So a
player can never reach a digital game through the UI.

## Decisions (from brainstorming)

- **Default stays physical.** New/existing rooms are physical unless flipped —
  backward-compatible, digital is opt-in.
- **Picking a bot opponent auto-forces digital.** Selecting a bot preset flips
  the room to digital in one step (bots require it), replacing the current
  hard reject.

## Components

### 1. `mode` verb — `shared/game-state.js`

A new command verb, dispatched in `applyCommand`'s verb chain, modeled exactly
on the existing `setdice` toggle (`shared/game-state.js` ~3619):

- Shape: `{ verb: "mode", attrs: { mode: "digital" | "physical" } }`.
- Pre-battle only: a no-op/guard when `room.game.started` (mode can't change
  mid-game — positions and terrain are fixed at start).
- Validate the value: `"digital"` or `"physical"`; anything else is ignored
  (no change, no crash).
- On a real change, set `room.mode` and `changed = true`. When the value equals
  the current mode, it's a no-op that leaves `changed` false (same idempotent
  shape as `setdice`).
- No owner gate (mirrors `setdice`, which any pre-battle participant may toggle).

`publicState` already publishes `room.mode` (added during the battle-map work),
so no serialization change is needed.

### 2. `setbot` auto-forces digital — `shared/game-state.js`

The `setbot` verb currently rejects when `room.mode !== "digital"`
(`"Bots play only in digital battles."`). Change: when a **non-null** preset is
being set on a side (pre-battle), instead of rejecting a physical room,
**set `room.mode = "digital"`** as part of applying the flag. Sequence within the
verb:

- keep the existing guards for unknown side / started game / unknown preset;
- drop the `room.mode !== "digital"` reject;
- if `preset !== null`, set `room.mode = "digital"` (idempotent if already
  digital);
- set `side.bot = preset`, `changed = true`.

Clearing to Human (`preset: null`) leaves `room.mode` unchanged — the owner can
flip back to physical with the `mode` verb if they want.

### 3. Lobby mode toggle — `client/src/v2/screens/Squadron.tsx`

A Physical/Digital control in the pre-battle lobby, beside the existing dice
toggle and the opponent selector (both already in the `!started` ready region).

- Reads room `mode` from room state (already surfaced client-side via the
  reducer during the battle-map work).
- Two options (a segmented toggle, matching the dice button's style): Physical /
  Digital. Each fires `sendCommand("mode", { mode })`.
- **Pinned to Digital while a bot opponent is selected** (`enemyBot != null`):
  the Physical option is disabled with a short hint ("Bots require digital"), so
  the mode and opponent selections can't contradict. (Because §2 auto-forces
  digital when a bot is picked, the control will already read Digital in that
  state; disabling Physical prevents an inconsistent manual flip.)
- Shown only pre-battle (`!started`), like the surrounding controls.

### 4. No other engine changes

Everything downstream of `room.mode` is already wired: `maybeStartGame` scatters
terrain + auto-deploys for digital rooms; the `add` verb enforces Rigs-only for
digital; the digital move handler validates `dest`/`facing`; `V2Terminal` renders
`BattleScreen` (the map) when `started && mode === "digital"`, else `Squadron`.

## Data flow

```
Owner in the lobby toggles Digital  ──▶ mode {mode:"digital"} ──▶ room.mode="digital"
   (OR picks a Bot opponent          ──▶ setbot {side,preset}  ──▶ room.mode="digital" + side.bot)
        │
commission Rigs (digital = Rigs-only) → lock field → (opponent) → READY
        │
maybeStartGame (digital): scatterTerrain + autoDeploy → positions assigned
        │
V2Terminal sees started && mode==="digital" → renders BattleScreen (the map)
        │
human plays on the map; a bot opponent plays via driveBots
```

## Error handling

- `mode` verb while `started`: no-op (guarded), leaves state untouched.
- `mode` verb with an unknown value: ignored, no change.
- `setbot` with a bot preset in a physical room: now succeeds by flipping the
  room to digital (was a reject).
- Switching to Physical while a bot opponent is selected: prevented in the UI
  (Physical disabled) and enforced engine-side. The `mode` verb refuses to leave
  digital while any side is bot-flagged (`room.game.sides.some((s) => s.bot)`), so
  a hand-crafted `mode: physical` command can't create the contradiction either —
  the room stays digital until the bot flag is cleared. No corrupt state, and no
  path to a physical room with a passive, positionless bot.

## Testing

- **`mode` verb (unit, via `applyCommand`):** sets `room.mode` to digital and
  back to physical pre-battle; a no-op when unchanged; a no-op when
  `game.started`; an unknown value leaves mode untouched.
- **`setbot` auto-forces digital (unit):** setting a bot preset on a physical
  pre-battle room sets `room.mode === "digital"` and the flag; clearing to Human
  leaves mode digital; the old "physical rejects" behavior is gone.
- **Integration (route or engine):** starting from a **default (physical)** room,
  flip to digital (via `mode` OR `setbot`), commission a mirrored roster, lock
  the field, ready — and assert a **started digital game** results (positions
  assigned), proving the previously-dark path is now reachable end-to-end. Extend
  the existing human-vs-bot HTTP test rather than duplicating it.
- **Lobby toggle (component):** the toggle dispatches `mode` with the chosen
  value; reflects the current room mode; Physical is disabled when a bot opponent
  is selected.
- No value-pinning ([[no-value-pinning-tests]]).

## Out of scope

- Mid-game mode changes / migrating an in-progress physical game to digital.
- Any new digital gameplay — this only exposes the existing digital stack.
- Choosing mode at room *creation* (join) — a pre-battle lobby toggle covers the
  need without touching the join/store layer; can be added later if wanted.
