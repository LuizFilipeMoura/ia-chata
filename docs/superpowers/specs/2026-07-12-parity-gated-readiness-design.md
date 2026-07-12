# Parity-Gated Readiness

**Date:** 2026-07-12
**Branch:** frontend/v2-redesign

## Problem

The game currently enforces a fixed roster size: `MAX_RIGS_PER_SIDE = 3` doubles as
both floor and ceiling. Readiness requires `sideRigCount >= 3`, and `canAddRigForSide`
blocks adding past 3. The rules doc says 3–5 Rigs per side with balanced composition
"recommended," but the code enforces exactly 3 and never checks that the two sides
mirror each other.

We want to remove the fixed count entirely and instead guarantee a **fair fight**: the
two sides must field the same composition before either can be ready. A player cannot
mark ready until full parity is met.

## Goals

- Drop the fixed 3-unit floor/ceiling and the `MAX_RIGS_PER_SIDE` / `MAX_RIGS_TOTAL` caps.
- Gate readiness (and game start) on **composition parity** between the two sides.
- Parity granularity: same number of **Rigs per weight class** (light/medium/heavy/colossal),
  same number of **Tanks**, same number of **Walkers**.
- Floor of **1 unit** per side (empty rosters can never start).
- Drop the "Max 1 Colossal per Squadron" rule — parity alone governs composition.
- Surface the mismatch to each player so they know what to add or remove to reach parity.

## Non-Goals

- Loadout / weapon / module parity. Only unit composition is compared; two mirrored Rigs
  may carry entirely different weapons.
- Any change to the max cap by weight class beyond parity (no per-class ceilings).
- Changing how units are commissioned or how weight class is chosen.

## Decisions

- **Bounds:** parity-only, floor of 1 unit. No fixed minimum count, no maximum.
- **Colossal cap:** removed.
- **Parity is symmetric.** When side A's composition equals side B's, *both* sides
  satisfy the shared precondition simultaneously. There is no canonical "target" roster.

## Design

### Composition signature (shared/game-state.js)

Two new pure helpers, colocated with `sideRigCount`:

```js
// Composition signature for one side: Rigs bucketed by weight class, cold kinds
// (tank/walker) bucketed by kind. e.g. { "rig:light": 2, "rig:heavy": 1, tank: 1, walker: 2 }
function compositionOf(room, sideId) {
  const sig = {};
  for (const u of room.rigs) {
    if ((u.owner || "a") !== sideId) continue;
    const kind = kindOf(u);
    const key = kind === "rig" ? `rig:${u.weightClass}` : kind;
    sig[key] = (sig[key] || 0) + 1;
  }
  return sig;
}

// True when both sides are non-empty AND have identical composition signatures.
function sidesAtParity(room) {
  const [a, b] = room.game.sides.map((s) => compositionOf(room, s.id));
  const aCount = Object.values(a).reduce((n, v) => n + v, 0);
  const bCount = Object.values(b).reduce((n, v) => n + v, 0);
  if (aCount < 1 || bCount < 1) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
```

`kindOf` is already imported from `./unit-kinds.js`.

### Gate replacement

Replace the three fixed-count checks with `sidesAtParity(room)`:

- `maybeStartGame` (~:1259): `room.game.sides.every((s) => s.ready) && sidesAtParity(room)`.
- `ready` verb handler (~:2540): a side may set `ready = true` only when
  `!room.game.started && room.field.locked && sidesAtParity(room)`. (Floor-of-1 and
  the mirror requirement both fall out of `sidesAtParity`.)
- seed verb `canStart` (~:2653): **left as its original `>= 3 per side` check.** The
  seed is a debug force-start whose roster is deliberately *non-mirrored* (distinct
  chassis + a spread of Prototype mechanics, per the AGENTS.md no-mirror-matchup
  invariant), so it is intentionally NOT subject to the player-facing parity gate.
  *(Implementation note: this reverses the spec's original intent, which wrongly assumed
  the seed roster was already mirrored.)*

### Un-ready on roster change

No new work. `resetReadyBeforeStart` already clears `ready` on *all* sides whenever a
unit is added or removed pre-start. Because parity is symmetric and re-checked at both
ready-time and start-time, there is no window for a stale `ready` to survive a
parity-breaking edit by the opponent.

### Remove caps

- Delete `MAX_RIGS_PER_SIDE` and `MAX_RIGS_TOTAL` from `shared/game-state.js`.
- `canAddRigForSide` returns `true` (adding is always allowed; parity, not a cap,
  governs when the game can start). Keep the function for call-site stability.
- Update referrers:
  - `client/shared.d.ts` — drop the two `export const` decls.
  - `client/src/v2/lib/viewModels.ts` — the `{ count, max }` shape loses its `max`
    source. Repurpose to a parity indicator (see below).
  - `client/src/components/RigAddScreen.tsx` — remove the "Roster full" / "Side full"
    messages tied to the caps.
  - `server/prompt.js` (~:46) — replace the "at most N Rigs per side / N total" line
    with the parity rule.

### Client hint engine (client/src/lib/computeFocus.ts)

Drop `MIN_RIGS_TO_READY`. The pre-battle (`!g.started`) branch becomes:

1. `myCount === 0` → "Commission your first unit."
2. **not at parity** → primary "Match your opponent's composition", secondary a
   human-readable diff computed from the shared `rigs` array (which already carries both
   sides' units via `owner`). Compute `mine − theirs` per bucket; surface the largest
   discrepancy, e.g. *"Short 1 Heavy Rig"* or *"1 extra Tank"*. If the opponent has no
   units yet, say *"Waiting for opponent to commission units."*
3. **at parity, not ready** → "Mark ready when set."
4. **ready** → "Waiting for {enemy} to ready…".

A small pure helper (in `computeFocus.ts` or a sibling lib) mirrors `compositionOf` on
the client `Rig[]` and returns the per-bucket delta plus a formatted label. Bucket
labels for copy: `rig:light` → "Light Rig", `tank` → "Tank", `walker` → "Walker", etc.

### viewModels parity indicator

`viewModels.ts` currently returns `{ count, max: MAX_RIGS_PER_SIDE }`. Replace with a
parity-oriented shape, e.g. `{ count, atParity: boolean }` (or `{ count, mismatch }`),
derived from both sides' compositions. Update the V2 consumer (Squadron/Commission
surface) to show parity status instead of an "N / max" meter.

## Rules.md edits

- **§intro (~:40)** "3–5 Rig models per side" → composition is mirrored between sides;
  no fixed count.
- **§3 Squadron size (~:114–123)** Replace the "agree on 3–5 Rigs" + "Max 1 Colossal"
  + "Balanced game (recommended)" text with the mandatory mirror rule: both sides field
  the **same number of Rigs in each weight class, the same number of Tanks, and the same
  number of Walkers**. At least one unit per side.
- **§Alpha note (~:639)** "Squadrons balance by matching composition (§3)" — reword from
  optional balancing to the enforced parity rule.

## Testing

- `shared/game-state.test.js` — rewrite the fixed-3 ready/start tests:
  - Mismatched composition (e.g. 2 light vs 1 light + 1 medium) blocks `ready` and start.
  - Mirrored composition allows both to ready and starts the game.
  - Extra Tank / Walker on one side blocks parity even when Rig counts match.
  - Empty side never reaches parity (floor of 1).
  - Removing a unit from a ready side clears both sides' `ready`.
- `server/prompt.test.js` — update assertions that reference `MAX_RIGS_PER_SIDE` /
  `MAX_RIGS_TOTAL` in the tracker-protocol text to the parity wording.
- `client/src/lib/computeFocus.test.ts` (if present) — add parity-diff hint cases.

## Risk / edge cases

- **Seed presets** must stay mirrored, else `sidesAtParity` blocks the force-start. The
  existing default rosters are already mirrored; add a test guard.
- **Diff copy when neither side is a subset** (e.g. A has 2 light, B has 1 light + 1
  medium): the delta has both a positive and a negative bucket. Copy picks the single
  most salient item; "Match your opponent's composition" as the primary keeps it honest
  even when the full diff is complex.
