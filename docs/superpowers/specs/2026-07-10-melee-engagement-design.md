# Melee Engagement — design

**Date:** 2026-07-10
**Goal:** Boost melee usage. A rig locked in melee cannot simply walk away from
combat — like D&D engagement, leaving requires a deliberate act, and staying
engaged hampers ranged fire. This creates a reason to close the distance and
commit to a melee fight instead of always kiting with guns.

## Constraint that shapes everything

The server tracks **no positions or coordinates**. Distance, arc, cover, and the
melee range-band are supplied per-attack by the client — players move real (or
virtual) minis and report the numbers (see `resolveAttack` in `shared/combat.js`
and `opts.distance` / `opts.arc` / `opts.range`).

Therefore engagement cannot be *inferred* from geometry. It is modeled as
**explicit tracked state**: a symmetric one-to-one link between two rigs, formed
by an explicit trigger and cleared by explicit break rules.

## Rulings (agreed)

| Aspect | Ruling |
|---|---|
| Flee | **Hard lock** — an engaged rig cannot Move/Sprint |
| Trigger | Move into reach **or** melee attack in reach |
| Break | Kill/disable engager · Disengage action · engager leaves |
| Duration | **Persists across rounds** (not cleared in Recovery) |
| Lock | **Mutual** — both rigs pinned |
| Ranged effect | Engaged rig fires ranged at **−2 accuracy** |
| Multiplicity | **One-to-one** exclusive pair |
| Disengage cost | **1 slot + 1 heat** (same as Move) |

## 1. State

Add one field per unit:

```
rig.engagedWith: <rigId> | null   // default null
```

- `ensureRigShape` defaults it to `null` (also on cold kinds in `makeUnit` /
  `ensureRigShape`).
- **Invariant (symmetric):** `A.engagedWith === B.id` ⟺ `B.engagedWith === A.id`.
  Never one field without the other.
- Two central helpers guarantee the invariant is the only way state changes:
  - `setEngagement(a, b)` — links both ends. No-op if either is already engaged
    (enforces one-to-one) or if `a === b`.
  - `clearEngagement(rig)` — reads `rig.engagedWith`, clears both ends, tolerant
    of a dangling/missing partner.

`engagedWith` stores the **rig id**, not the name (ids are stable; names are
user-editable). UI resolves id → name for display.

## 2. Triggers

A new pair forms **only if both rigs are currently unengaged** (`engagedWith == null`).
Enemy-only (can't engage a friendly). Both must be alive.

- **Melee attack** — in `resolveAttack`, when the resolved slot is `melee`
  (or a flat-pick melee `unit` weapon) and the shot is *legal* (not
  `range: "out"`, weapon not destroyed), call `ctx.engage(attacker, target)`
  after the attack resolves. Attacking *is* the commitment.
- **Move-into** — `move` / `sprint` may carry `a.engage = <targetName>`. Server
  resolves the name → rig, validates enemy + alive + both unengaged, then forms
  the pair. This is how a player declares "I moved into base contact" (the server
  cannot know positions).
- If either rig is already engaged, no new pair forms; the underlying attack or
  move still resolves normally (you may still melee an already-engaged enemy —
  you just don't get locked to it, a deliberate consequence of one-to-one).

## 3. Movement lock (hard lock)

While `rig.engagedWith != null`, the `move` and `sprint` actions are **rejected**
(no-op, `performAction` returns `false`, no slot/heat spent). Repositioning while
engaged is meaningless without a grid, so the rule is simply: an engaged rig
cannot Move/Sprint. To move, it must Disengage first (§4).

The **Jump Jets** active (Servo Actuators equipment, action key `jumpjets`) is
movement too, so it is blocked by the same lock — an engaged rig cannot jump out
without Disengaging first. Non-movement actives (Harden, Purge, Overclock,
Emergency Patch) remain usable while engaged.

Because the lock is mutual, both rigs are pinned; either one leaving requires its
own Disengage.

## 4. Disengage action

```
ACTIONS.disengage = { label: "Disengage", heat: 1, slot: 1 }
```

- Legal only when the acting rig is engaged. Otherwise no-op (returns false).
- Effect: `clearEngagement(rig)` — clears **both** ends (mutual lock → one
  Disengage frees both rigs).
- Costs 1 slot + 1 heat. After disengaging, the rig may spend remaining slots to
  Move/Sprint in the same activation.
- Pushes a resolution log entry (`kind: "disengage"`) so both players see it.

## 5. Ranged penalty

An engaged rig firing a **ranged** weapon (`longRange` or flat-pick ranged `unit`)
suffers **−2 accuracy** (raises the D6 to-hit target number by 2). Melee attacks
are unaffected.

Implementation: `computeModifiedAim(attacker, profile, opts)` gains an
`opts.engaged` term:

```
const engagedPenalty = (opts.engaged && !profile.melee) ? -2 : 0;
const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty;
```

`resolveFire` / `resolveAttack` pass `engaged: attacker.engagedWith != null`.
−2 matches existing cover/aimed penalty magnitudes, so guns stay usable in a
pinch but melee is the better answer while locked.

## 6. Auto-clear hooks

Engagement clears automatically when the "kill or disable engager" condition is
met, routed through the existing §8 damage cascade in `game-state.js`:

- **Destroyed** — when a rig transitions to `destroyed`, `clearEngagement(rig)`
  (in `onRigDamaged`, alongside the existing destruction handling).
- **Immobilised** — when a rig becomes `immobilised` (legs/mobility part to 0,
  set in `catastrophicOnZero` / `catastrophicAdditional`), `clearEngagement(rig)`.
  A rig that can't move can't hold the lock.
- **Persists across rounds** — `runRecovery` clears `preparation` but **must not**
  clear `engagedWith`. Engagement is deliberately sticky until broken.

## 7. Client (ActionConsole)

- **Status badge** — an engaged rig shows "Engaged → `<partner name>`".
- **Engage** — surfaced on the Move action as an optional enemy target picker
  (sends `a.engage`). Only offered when the acting rig is unengaged.
- **Disengage** — a button shown only when the acting rig is engaged; sends the
  `disengage` action.
- **Fire** — when the acting rig is engaged, the ranged Fire/Aimed option shows
  the −2 penalty in its readout so the player sees why melee is favored.

## 8. Testing

Unit tests (mirroring `combat.test.js` / `game-state.test.js` style):

- `setEngagement` links both ends; `clearEngagement` clears both.
- One-to-one: a second engage attempt on an already-engaged rig is a no-op.
- Melee attack in reach auto-engages; `range:"out"` melee does not.
- `move`/`sprint` blocked while engaged; allowed after `disengage`.
- Disengage frees **both** rigs, costs 1 slot + 1 heat.
- Ranged fire while engaged applies −2 (assert `modAim` delta).
- Destroying / immobilising a rig clears its engagement (both ends).
- Engagement survives `runRecovery` (unlike `preparation`).

## Non-goals (YAGNI)

- No positional grid / coordinates.
- No multi-engager gang-up (one-to-one only).
- No opportunity-attack-on-flee (hard lock replaces it).
- No per-round re-declaration (engagement is sticky).
