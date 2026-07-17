# Digital Battle Map (1c) — Design

**Date:** 2026-07-16
**Status:** Approved design. Ready for an implementation plan.
**Unblocks:** the human's digital **Move** — the deferred item 1c from
`docs/superpowers/specs/2026-07-16-human-vs-bot-design.md` (§5). See also
[[human-vs-bot]] and [[digital-battlefield]].

The human-vs-bot slice shipped without a way for a human to issue a spatial Move
in a digital room: `MoveBody` is a physical timed-confirm drawer that never emits
`{dest, facing}`, and no V2 surface renders unit positions at all. This design
builds the missing piece as a **map-primary battle screen**: an always-on
interactive battlefield where the player sees every unit, clicks a rig to
activate it, and issues moves directly on the map.

---

## Scope boundary

**Digital rooms only** (`room.mode === "digital"`). Physical rooms are untouched
— they keep the existing roster list + timed-hold `MoveBody` drawer, because a
physical player slides a real model and the app only tracks the budget. All new
UI in this design is gated on digital mode; no physical-room behavior changes.

## Core idea

When a digital game has started, the battle screen renders a new interactive
`BattleMap` (an SVG battlefield with unit tokens) plus a docked active-rig action
bar, **replacing** the roster list for the duration of the battle. Pre-battle
(commissioning, field lock, ready) keeps the existing `Squadron` yard screen.

The client reuses the **same shared geometry the engine validates with** —
`findPath` (`shared/pathfind.js`), `moveBudget`/`spatial` (`shared/game-state.js`),
`terrainPolygons`/`radiusOf` (`shared/geometry.js`) — so the reach ring, routed
path, and reach/pivot readout are computed with the exact code the server uses.
Previews can't drift from validation. The server remains authoritative: it
re-validates `dest`/`facing` on submit (the digital-move handler already does —
`shared/game-state.js` ~2998–3016) and rejects with a reason if anything is off.

## The engine contract (already built — do not change)

The digital-move handler in `applyCommand` (`act === "move" || "sprint"`,
`shared/game-state.js` ~2975–3045) already accepts and validates:

- `a.dest = { x, y }` — field coordinates in inches (centre of the rig).
- `a.facing` — heading in degrees; omitted → keeps `rig.facing`.
- **Pivot cap:** a move may turn at most ±90° from the current facing.
- **Path/reach:** `findPath(field, terrainPolys, blockers, radiusOf(rig),
  rig.pos, dest)` re-routes around terrain and other living rigs; the routed
  `route.length` must be ≤ `moveBudget(rig, act)` (a scalar — Speed for Move,
  the sprint reach for Sprint). Backward/side movement is **not** penalized in
  digital mode; only routed distance and the pivot cap gate a move.
- `a.engage` — optional move-into-contact declaration (an enemy name).

So this design is **UI-only on the client** plus a small V2Terminal mount
change. No engine edits.

---

## Layers (one spec, built and reviewed in order)

### L1 — `BattleMap` render (read-only)

A new component, `client/src/v2/battle/BattleMap.tsx`, rendering an SVG
battlefield. It reuses `FieldMap`'s coordinate projection (`PAD`, `CANVAS_W`,
`scale`, `sx`/`sy` inches→px) — extract that projection into a shared helper
(e.g. `client/src/v2/battle/fieldProjection.ts`) so `FieldMap` (pre-battle field
preview) and `BattleMap` (battle surface) share one source of truth rather than
duplicating the math.

Renders, on top of the field/terrain/objectives that `FieldMap` already draws:

- **A token per living rig** at `rig.pos` (`{x, y}` inches), with a short arrow
  indicating `rig.facing` (degrees). Rigs with no `pos` (shouldn't occur post
  `autoDeploy`) are skipped.
- **Ownership color:** mine vs enemy (reuse the yard's own/foe palette).
- **State cues:** already-activated rigs dimmed; the viewer's Priority-Target
  enemy gets a ring (`game.priorityTargets[mySide]`); destroyed rigs omitted.
- A compact label per token (codename initial or short name).

Pure presentational at this layer — no interaction yet. Component test: given a
room state with positioned rigs, assert tokens render at the projected
coordinates, facing arrows point the right way, and dim/priority/enemy classes
apply.

### L2 — Selection + activation

- Tapping any rig **selects** it → its vitals (SP bars, heat, actions left)
  show in the docked active-rig bar; tapping empty field clears selection.
- When it is the viewer's activation turn, there is no active rig
  (`turn.activeRigId == null`), and no pending gate
  (`pendingAnswer`/`pendingReaction`/`pendingBlast`), tapping one of the
  viewer's own **idle** (not activated, not destroyed) rigs **activates** it:
  `sendCommand("activate", { name: rig.name })`. Reuse the exact `canActivate`
  predicate logic from `V2Terminal` so the gate matches today's behavior.
- Tapping an enemy (or any non-activatable rig) selects it read-only.
- The full `RigTerminal` overlay stays reachable on demand (e.g. a detail button
  on the docked bar) for deep inspection/loadout — not required for the move
  flow, so keep it a secondary affordance.

Component test: tapping an own idle rig on-turn dispatches `activate` with its
name; tapping an enemy does not; tapping when a gate is pending does not.

### L3 — Armed on-map Move / Sprint (the unblock)

The active rig's docked bar shows action chips derived from the existing
`availableActions(rig, turn, round)`. Non-spatial actions (Fire/Repair/Prepare/
Support/End/Disengage/…) reuse the existing handlers and wizards from
`V2BattleActionsContext` **unchanged** (`openAttack`, `openRepair`,
`openPrepare`, `openSupport`, `endActivation`).

**Move/Sprint become on-map (digital only):**

1. Tap the **Move** (or **Sprint**) chip → the map enters *move-target mode* for
   the active rig (armed — per the chosen "arm Move first" interaction; the map
   does not accept a destination until a chip is tapped).
2. The **reach ring** is drawn: a circle of radius `moveBudget(rig, act)` around
   `rig.pos` as the coarse affordance. (A radius over-states reach where terrain/
   rigs force a detour; exact validation is per-destination, below.)
3. Tapping a field cell proposes a **destination**: convert the tap px→inches via
   the shared projection, then compute the routed path with the shared
   `findPath(field, terrainPolygons(field), blockers, radiusOf(rig), rig.pos,
   dest)` where `blockers = other living rigs mapped through spatial`. If no path
   or `route.length > moveBudget(rig, act)`, reject the tap inline (a brief
   "out of reach"/"no path" cue) and don't place a ghost.
4. On a valid destination: draw a **ghost token** at `dest` and the routed path.
   **Facing** auto-sets along the movement heading (angle from `rig.pos` to
   `dest`; for a near-zero move, keep `rig.facing`). A **drag-handle** on the
   ghost lets the player rotate facing, **clamped to ±90°** from `rig.facing`
   (the engine cap). A **readout** shows `move <route.length>″ · pivot <deg>° ·
   +<heat>🔥`, all derived from the shared helpers.
5. **Confirm** → `sendCommand("action", { name: rig.name, action, dest: {x, y},
   facing, engage? })`. **Cancel** exits move-target mode. After confirm, the
   server validates + applies + runs `driveBots` (a bot opponent then plays), and
   the pushed state re-renders the map with the rig at its new pos/facing.

**Engage (move-into-contact):** keep the existing optional `engage` attr. When
the chosen `dest` sits adjacent to (base-contact with) an enemy, offer an
"engage" toggle that passes that enemy's name. Low priority — a plain move with
no `engage` is the default and always valid.

Component test: arming Move shows the reach ring; a tap beyond `moveBudget`
places no ghost; a reachable tap places a ghost with a facing derived from the
heading; dragging facing past ±90° clamps; Confirm dispatches `action` with
`{name, action, dest, facing}`. Use the shared geometry helpers in the assertions
(no value-pinning of specific inches — assert the reach-clamp *relationship* via
`moveBudget`, not a hardcoded number).

---

## Mount point

`client/src/v2/V2Terminal.tsx` currently always renders `<Squadron>` as the main
child. Change: when `room.mode === "digital" && game.started`, render the new
battle screen (BattleMap + docked bar) instead of `<Squadron>`. Pre-battle
(`!started`) and all physical rooms keep `<Squadron>`. The `RigTerminal`,
`OutcomeBanner`, `ThreatOverlay`, chat, and the pending-gate overlays
(`ReactionPicker`, blast, answer prompts) continue to render alongside — they are
not replaced.

## Data flow

```
server pushes state ──▶ BattleMap renders a token per living rig (pos, facing)
                        docked bar shows the selected/active rig's vitals + chips
        │
  viewer taps own idle rig on-turn ──▶ activate {name} ──▶ (server) ──▶ pushed state
        │
  viewer taps Move chip ──▶ map arms move-target mode, draws reach ring
        │
  viewer taps a cell ──▶ client computes route via shared findPath/moveBudget
        │                 (reject inline if no path / out of reach)
  viewer adjusts facing (drag, clamped ±90°) ──▶ live readout
        │
  Confirm ──▶ action {name, action, dest, facing, engage?} ──▶ server validates
             (re-runs findPath/moveBudget/pivot) + applies + driveBots
        │
  pushed state ──▶ map re-renders rig at new pos/facing; bot's turn resolved
```

Reactions/answers/blast keep their existing overlays and verbs; the map is a
read/act surface layered under them.

## Error handling

- Out-of-reach / blocked destination: rejected client-side inline (no ghost) via
  the shared geometry, and — as a backstop — the server rejects with a reason
  surfaced through the existing `emitCommandRejected` 409 path if a stale/edge
  case slips through.
- Activation when not allowed (not your turn, active rig exists, pending gate):
  the tap is a no-op (the `canActivate` gate), matching today's behavior.
- Physical rooms never reach this UI, so the timed-drawer path is unaffected.

## Testing

- **L1:** `BattleMap` render — tokens at projected coordinates, facing arrows,
  own/enemy/dim/priority classes, terrain/objectives (reuse `FieldMap`'s tested
  projection).
- **L2:** select + activate — own idle rig on-turn dispatches `activate {name}`;
  enemy/gate taps do not.
- **L3:** move-target flow — reach ring on arm, out-of-reach tap places no ghost,
  reachable tap places a ghost with heading-derived facing, ±90° clamp, Confirm
  dispatches `action {name, action, dest, facing}`.
- Assert geometry via the shared helpers, never hardcoded inch/stat values
  ([[no-value-pinning-tests]]).
- Reuse the existing Vitest + Testing Library harness (`V2Providers`, a `Seed`
  component, a `rig()` factory with `pos`/`facing`). The engine move path is
  already covered; no engine tests change.

## Out of scope

- Any physical-room change (the roster + timed-drawer flow stays).
- On-map Fire-arc targeting — Fire keeps its existing `AttackWizard`; moving it
  onto the map is a later, separate design.
- Fog of war — the digital game shows full information (both sides' positions).
- Rich animation / interpolation of moves — a state push snaps tokens to their
  new positions; easing is a polish follow-up, not required here.
- Bot *planning* of reactions and secondary-blast targeting (tracked elsewhere in
  the opponent-brain backlog).
