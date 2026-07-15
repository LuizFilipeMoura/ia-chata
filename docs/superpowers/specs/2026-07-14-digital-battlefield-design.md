# Digital Battlefield — Design

**Date:** 2026-07-14
**Status:** Approved, not yet planned
**Sub-project:** 1 of 2. Spec 2 is the Gemma AI opponent, which depends on this.

## Problem

The app is a companion for a physical tabletop. No unit has a position. `resolveAttack`
takes `opts.distance`, `opts.arc`, and `opts.cover` as **player-declared inputs** — the
human reads them off the real table with a tape measure and tells the app.

That makes an AI opponent impossible: there is no board for it to play on, and no way for
the engine to know whether a shot is legal. It also forces spatial rules to punt — §13's
Piledriver emits *"shove target back 3" (move the mini)"* and Barrage emits *"players
adjudicate who's inside"*, both because no coordinates are simulated.

This spec puts units on a simulated field and derives distance, arc, and cover from
geometry, so a battle can be played entirely in the app.

## Scope

**In:** positions, facing, movement with pathfinding, the 3-ray cover/LOS model, derived
distance/arc/cover, auto-scatter deployment, and the `FieldMap` interaction to drive it.

**Out:** the Gemma opponent (spec 2), manual deployment, Tanks and Walkers, wrecks as
obstacles, height/elevation, and simulating Piledriver's shove or Barrage's zone. The map
makes those last two *possible*; they are follow-ups, not this.

## Room modes

Digital is a lobby option: `room.mode: "physical" | "digital"`.

Physical rooms are untouched — declared distance/arc/cover, all 7 terrain kinds, Tanks and
Walkers, current rules. Every existing test stays valid. Digital layers positions on top.

Digital rooms are **Rigs only**, light and medium. No Tanks, no Walkers — so no support
modules, no Field Weld / Vent / Paint, no flat unit weapons. One part enum
(`hull|arms|legs|engine`), heat on every unit, and the parity gate reduces to
rigs-per-weight-class.

## Measurement model

**Applies to physical and digital alike.** This replaces the previous convention (range =
nearest-edge gap, movement = front rim → back rim). All *⚙ TUNING*-flagged.

| measured | from | rationale |
|---|---|---|
| ranged range / sweet-spot | center → center | base size shouldn't change a gun's reach |
| movement path length | center travel | ditto |
| blast radius (§8 cook-off, 4") | center → center | area effect |
| deploy zone (8") | center → corner | *was rim; auto-scattered, so invisible* |
| **melee reach (2")** | **rim gap** | must be achievable at contact — see below |
| **objective control (2")** | **rim gap** | you stand *on* the marker |

Melee and objectives are rim-measured because center measurement makes them incoherent.
Base radii are light 1.18" (60mm) and medium 1.48" (75mm), and rigs block each other, so
two mediums can never be closer than 2.95" center-to-center. A 2" center-measured melee
reach would be unreachable — melee could never happen.

Consequence to accept: every range band and Speed value shifts by roughly a base diameter
(~2.4" light, ~3" medium). A Speed 6 medium now genuinely travels 6", not ~9". This is a
tuning pass, not a redesign.

## State

Digital rooms only:

```js
unit.pos    = { x, y }   // inches, field coords, center of base
unit.facing = 0..359     // degrees; front arc = facing ±45°
```

Radius is derived from weight class (light 1.18", medium 1.48"), not stored per-unit.

**Terrain** in a digital room draws from a reduced vocabulary: `building`, `barricade`,
`rock`, `crate`. Dropped: `wood`, `crater`, `ruin`.

Those three were dropped because pure ray-counting lies about them. A `wood` is a 3.4–5.4"
blob that eats all 3 rays and reads as *no LOS* — a forest becomes a wall, and a rig inside
one can never be shot and never shoot. A `crater` is a **hole** that would read as a wall.
A `ruin` is ambiguous. Removing them means terrain kind never needs a cover class: geometry
alone grades cover correctly for every remaining piece.

**All four kinds block movement.** So do rigs. Objectives block nothing.

Known inconsistency, accepted deliberately: a 1"-radius `rock` is a wall you cannot walk
around in one Move, but only `building` blocks LOS — so you can shoot over a rock you can't
step over. The alternative is height/elevation, which drags a height stat onto every unit
and rule. One learnable rule instead: **everything is solid; only buildings block sight.**

**Wrecks vanish.** A destroyed rig leaves the map entirely. §11's wreck clause still holds
for physical rooms; it just never fires in digital.

## Geometry — `shared/geometry.js`

New file, sibling to `field.js`. Pure, DOM-free, no imports from `game-state.js`, testable
in node. Every function is `(pos, facing, radius, obstacles) -> value`. No room state, no
dice.

### `sightCorridor(attacker, target)` — the 3-ray cover test

Take the center line A→B. Offset perpendicular to it by each unit's own radius to get three
**parallel** ray pairs:

- `A.top → B.top`
- `A.center → B.center`
- `A.bottom → B.bottom`

"Top" and "bottom" are the perpendicular tangent points on each base, so the corridor is
rotation-invariant — a flanking shot and a frontal shot get the same fair read.

Every ray is tested against **all four** terrain kinds. A ray is *obstructed* if it crosses
any piece. The kind matters in exactly one place — only a `building` can deny the shot:

```
obstructed   = rays crossing any terrain piece        // 0..3
buildingRays = rays crossing a building               // 0..3

if (buildingRays === 3) -> no LOS, the shot is illegal
else                    -> cover = min(2, obstructed)
```

So a rig fully screened by a building has no shot taken against it, while a rig behind a
perpendicular 9" barricade that eats all 3 rays is at `cover: 2` and can still be shot.
That is the whole content of "everything is solid; only buildings block sight."

The 0/1/2 result lands exactly on `combat.js`'s existing `opts.cover` clamp, with the
building-only 3 case as the natural "no shot".

Bases differ in radius, so the outer rays converge or diverge slightly. That is correct,
not a bug — a light rig shooting a medium gets a slightly wider corridor at the target end.

Note what falls out for free: a 1" rock can never obstruct all 3 rays, so small scatter
naturally reads as cover 1 and a long barricade as cover 2. **Geometry grades cover; there
is no cover-class table.** The only kind-aware line in the module is `buildingRays === 3`.

### Other functions

- **`arcOf(attacker, target)`** — angle from the target's `facing` to the attacker's
  center. Within ±45° = front, ±45–135° = side, beyond = rear. Feeds `opts.arc`.
- **`distanceBetween(a, b)`** — center-to-center. Feeds `opts.distance` and the sweet-spot
  falloff.
- **`meleeReach(a, b)`** — rim gap = `dist − rA − rB`; legal if ≤ 2" (4" with Couched Reach).
- **`controlsObjective(unit, marker)`** — rim gap ≤ 2".

### The seam

**`resolveAttack` does not change.** Its signature already accepts `opts.distance`,
`opts.arc`, `opts.cover`. Digital rooms compute those three from geometry and pass them in;
physical rooms keep taking them from the human. `combat.test.js` is untouched and stays
valid in full.

## Movement — `shared/pathfind.js`

Pure module. Grid A* at 0.25" resolution over the field. Obstacles (`building`,
`barricade`, `rock`, `crate`, and all other rigs) are inflated by the mover's radius, so
the mover is a point against fat obstacles — the standard trick, and it makes the swept
corridor check free. Objectives are not obstacles.

Returns `{ path: [{x, y}, ...], length }` or `null` if unreachable. Deterministic: same
inputs, same path, always.

**The Move action:**

1. Hover a destination → engine paths it; `FieldMap` draws the route and its length. Green
   if `length ≤ Speed`, red if over-budget or unreachable.
2. Click commits. The unit walks the path.
3. **Pivot ≤ 90°**, at either end of the move. 0" travel is allowed — pivoting in place
   still costs the action and its heat.
4. **Sprint** is the same with `Math.round(base × rigEffects(rig).sprintMult)` — 1½× Speed,
   or 2× with the Reinforced Servos field upgrade — and its own heat. Pivot cap stays 90°.
   Speed budget also honours `speedHalvedNextRound`.
5. Engaged rigs cannot Move at all (§5, pinned). Unchanged.

The preview is what makes engine-pathfinding acceptable: without it, an illegal move is
opaque. With it, you see the route and the number before you commit.

Pivot cost interacts with existing rules by design. Move is already repeatable
(§5: *"May be taken more than once per activation"*), so a 180° turn is two Moves and two
heat. Turning to face a flanker costs the activation you wanted to shoot with, which is
what makes flanking lethal — and Brace already says *immovable*, so a braced rig can't
Move and therefore can't pivot. No extra rule needed.

## Engagement

Melee-only. A rig becomes engaged by **making a melee attack** in reach; the map verifies
rim gap ≤ 2" instead of trusting the declaration.

§5 loses its *"Moving into base contact and declaring the engagement"* clause. Everything
else about engagement (mutual, one-to-one, pinned, −2 ranged ACC, Disengage) is unchanged.

## Deployment

**Auto-scatter.** The engine places both sides legally inside their deploy radius,
deterministic under the same seeded-random treatment as `scatterTerrain`. No deploy phase,
no placement UI.

`field.js` already has `deploymentCorners()` and `deployRadius()` (8", scaled to field
size). The zone has always existed; nothing has ever been placed in it.

## UI

`FieldMap.tsx` grows from a static blueprint into the board. It already has `scale`, `sx`,
`sy`, the field frame, the 12" grid, objectives, deploy corners, and corner ticks — the
projection math is done.

It gains:

- terrain shapes (the 4 digital kinds)
- unit tokens: circle at `radius`, facing wedge, front-arc cone
- selection
- hover path preview (route + length, green/red)
- target picking

`MoveBody.tsx` swaps its declared-distance input for the map interaction. In a physical
room it holds the player on a timed Confirm (long enough to actually push the mini across
the table); a digital room has no mini to push, so the hold is dropped and Confirm is live
immediately. The declared-distance UI stays alive for physical rooms.

**Trust boundary:** the client sends only `{ dest: {x, y}, facing }`. The server pathfinds
it again with the same pure module and applies the result. The client's hover preview is a
local call to that identical module, so it always agrees — but the server never takes a
client-supplied path or length on faith.

## rules.md changes

All *⚙ TUNING*-flagged:

- **§7 / §12** — measurement is center-to-center, except melee reach and objective control,
  which are rim gap
- **§10** — deploy zone 8" measured to base center, not nearest edge
- **§5** — engagement is melee-only; the base-contact declaration path is removed
- **Digital rooms** — Rigs only, 4 terrain kinds, wrecks removed

## Testing

`geometry.test.js` and `pathfind.test.js` are pure node tests — hand-placed rigs and
buildings, assert the ray count and the path.

The three hand-drawn cases become the first three tests verbatim:

1. Two rigs, a small blob below the corridor, touching no ray → `cover: 0`
2. A tall rect crossing the bottom ray only → `cover: 1`
3. A tall rect crossing the center and bottom rays → `cover: 2`

Plus:

- a building crossing all 3 rays → no LOS, shot illegal
- a **barricade** crossing all 3 rays → `cover: 2`, shot still legal (the kind-aware branch)
- a rig at 2.95" center distance has a 0" rim gap and is in melee reach
- a 2" center distance between two mediums is impossible to construct

`combat.test.js` is untouched.
