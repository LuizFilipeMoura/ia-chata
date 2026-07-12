# Universal 1:1 spill on catastrophic parts (§7/§8)

**Date:** 2026-07-11
**Status:** Approved
**Supersedes:** `2026-07-11-arm-overflow-1to1-design.md` (folds its 3→1 weapon change in)

## Problem

`rules.md` §7 defines a general damage-overflow rule: a hit on a 0-SP location is
re-routed 1:1 to another non-destroyed location (defender's choice). The engine
never coded this. Instead, `catastrophicAdditional` (`shared/game-state.js`)
handles the extra hit per role:

- **structural / power** → unit `destroyed`
- **mobility** → `immobilised`, **damage evaporates**
- **weapon** → `3 SP` to Hull, forever, per hit (a dead arm becomes an unbounded
  funnel through the body)

Two defects: the **mobility** extra hit throws its damage away (not conserved),
and the **weapon** extra hit both over-spills (3, not 1:1) and contradicts §7.

## Decision

Make catastrophic overflow **1:1 and conserved** where damage currently
evaporates or over-amplifies, **without** removing the §8 kill/immobilise
identity:

- **structural (Hull) / power (Engine)** extra hit → **unchanged**: unit
  `destroyed`. The instant-kill tier stays.
- **mobility (Legs/Tracks)** extra hit → `immobilised` (unchanged) **AND spill
  1 SP** to a live part. Damage is now conserved.
- **weapon (Arms/Turret/Mount)** extra hit → spill **1 SP** (was 3) to a live
  part.

Spill amount is always **1** (pure §7 conservation, no amplification).

## Spill target

New helper `spillTarget(rig, sourceLoc)` picks the recipient:

1. Prefer the **structural** part (Hull) if it has SP > 0.
2. Else the first part with SP > 0 in role order **power → mobility → weapon**,
   excluding `sourceLoc`.
3. Else (no living part — unit is already all-zero and thus destroyed) fall back
   to the structural part; its own §8 additional clause then fires. Edge case.

Spill routes through `applyDamage`, so hitting a target that drops to 0 fires
that target's own catastrophic chain (bounded recursion).

This is an **auto-target**, not the §7 defender-choice. `rules.md` §7 keeps its
"defender chooses" wording; the code deviation is noted there.

## Kneecapper (§13) guard

`opts.noSpill` continues to block the spill — now for **both** weapon and
mobility. A Kneecapper limbs-only rake immobilises / kills the limb but never
bleeds damage into the Hull. "Cripples, never kills" preserved.

## Explicitly unchanged

- **First-zero weapon cook-off** (weapon-destroy D12 + `1 Hull + 1 Engine`).
  Only the *additional* clause changes.
- **structural / power additional = destroyed.** Instant-kill tier intact.
- **"At 0 SP" effects** (Legs move penalties, Hull action/Aim penalty, Engine
  lose-activation + heat floor). These fire in `catastrophicOnZero` / derived
  getters; untouched.

## Scope

### Changes

1. **`shared/game-state.js` — new `spillTarget(rig, sourceLoc)` helper.**
2. **`shared/game-state.js` — `catastrophicAdditional`:**
   - `mobility` branch: set `immobilised`, then (unless `opts.noSpill`) spill 1
     SP to `spillTarget`.
   - `weapon` branch: spill 1 SP (was 3) to `spillTarget` (unless `opts.noSpill`).
3. **`rules.md`:**
   - §8 Legs "Additional" cell → immobilised; **1 damage spills to Hull**.
   - §8 Arms "Additional" cell → **1 damage to Hull** (overflow); weapon already
     gone.
   - §7 — add a note that the engine auto-targets Hull (else next living part),
     not defender-choice.

## Behavior after

- Dead Legs, extra hit: immobilised (if not already) + 1 SP to Hull (or next
  living part). No evaporation.
- Dead Arms, extra hit: 1 SP to Hull (or next living part). Linear, no runaway.
- Hull at 0 already: mobility/weapon spill routes to Engine (next living),
  avoiding an accidental instant-kill through a dead Hull.
- Dead Hull / dead Engine, extra hit: unit destroyed (unchanged).
- Kneecapper rake to a dead limb: no spill (unchanged intent, now explicit for
  mobility too).

## Testing

- **New:**
  - Dead-legs extra hit → `immobilised` AND exactly 1 SP off Hull; second extra
    hit → 1 more (linear).
  - Dead-arms extra hit → 1 SP off Hull (not 3); linear, not compounding.
  - Spill retargets to Engine when Hull is already 0.
  - Kneecapper rake to 0-SP legs → immobilised, no Hull/Engine spill.
- **Regression (keep passing):**
  - `applyDamage arms-to-0 destroys a weapon and spills to hull and engine`
    (first-zero cook-off).
  - `weapon-role zero rolls the weapon-destroy D12 and cooks off 1+1`.
  - Hull/Engine additional = destroyed.
  - `Kneecapper — a rake to 0 arms ... never spills into hull/engine`.
