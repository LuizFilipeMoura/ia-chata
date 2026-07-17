# V2 Client Audit — Equipment Mechanics Surfacing

**Date:** 2026-07-14
**Status:** Audit only — no code changed. Ready for an implementing agent.
**Scope:** The 16 Tuned/Prototype equipment mechanics wired into the engine on
`frontend/v2-redesign` (spec `docs/superpowers/specs/2026-07-14-equipment-mechanics-rollout-design.md`)
are complete and tested **server-side** (587/587 shared tests). This document
audits the **V2 client** for whether players can *invoke* and *see* them, and
lists the gaps to close. Engine behavior is out of scope here.

V1 is retired (`client/src/main.tsx:12-21` mounts only V2; the comment there says
V1 is "no longer reachable"). Ignore `client/src/components/**` legacy render
paths and `client/src/hooks/useBattleWatchers.tsx` — audit and implement against
V2 (`client/src/v2/**`).

## Verdict at a glance

| Capability | State | Severity |
|---|---|---|
| Fire `cryo` / `nanite` / `meltdown` actives | **Impossible** — no button, no param UI | Blocker |
| Fire Grapnel **reel** mode | **Impossible** — button always yanks self | Blocker |
| See charges / cooldowns / counters (`equipState`) | **Invisible** — zero client reads | High |
| Client `Rig` type declares the new fields | **Missing** | Medium (enables the above) |
| Narrated effects (Chaff/Grapnel/Meltdown/Backdraft) render | **Works** (generic renderer) — two edge caveats | Low |

The data is already on the wire: `publicState` (`shared/game-state.js:3634-3666`)
serializes the whole rig unchanged, so `equipState` + `reactorOverdriveActive`
reach the client via `roomReducer` and are readable today — nothing is displayed.
This is a pure **display + input + typing** gap, not a transport gap.

---

## How the client fires actives (the pattern to extend)

- The action-button list is **not** built in the client. It comes from the shared
  read-model `availableActions(rig, turn, round)` in `shared/battle-view.js:11-135`.
  The equipment active is appended at `battle-view.js:68-75`, pushing **exactly
  one** active per rig, keyed by `EQUIPMENT[rig.equipment].active.key` (the 8
  original keys: `harden, purge, jumpjets, overclock, emergencypatch,
  heatpurgewave, locksight, popsmoke`).
- V2 renders that list in `client/src/v2/battle/ActionConsole.tsx` (`availableActions`
  at `:184`; the equipment active lands in the Support catch-all group at `:197-206`).
- A click routes through `onAction` (`ActionConsole.tsx:154-181`). Param-free
  actives fall through to `:180` → `sendCommand("action", { name, action: key })`.
- Command shape: `{ verb: "action", attrs: { name, action, ...extras } }`, sent by
  `client/src/hooks/useCommands.ts:11-40` (HTTP POST `/api/game/{room}/command`),
  V2 wrapper `client/src/v2/hooks/useV2Commands.ts:14-25`.
- **Actives that pass parameters do so via bespoke branches** in `onAction` that
  open a drawer/wizard, all in `client/src/v2/state/V2BattleActionsContext.tsx`:
  - `emergencypatch` → repair drawer sends `loc` (`V2BattleActionsContext.tsx:200`)
  - `move`/`sprint` → sends optional `engage` (`:157-159`)
  - `prepare` → sends `prep` (`:231`)
  - support `paint`/`fieldweld`/`vent` → sends `target` (+`loc`) (`:295-297`)
  - `lock` → `AttackWizard.tsx:573` sends `target`
  There is **no generic param mechanism** — a new active only gets params if a
  branch is written for it.

---

## Gaps and implementation guidance

### G1 — `cryo` / `nanite` / `meltdown` are unfireable (Blocker)

These are **not** `EQUIPMENT[].active` keys; they are upgrade-gated bespoke engine
branches (`shared/game-state.js:2503` cryo, `:2524` nanite, `:2547` meltdown),
reachable only when the rig carries the matching Prototype upgrade. Because
`availableActions` only surfaces `EQUIPMENT[].active.key`, they never appear as
buttons, and the param-free fall-through could not supply their inputs anyway.

Engine inputs each needs (read from `a.*` in the branch):
- `cryo` — `a.n` (how many cryo to spend). Bounded by `rig.equipState.cryo` (0-3).
- `nanite` — `a.target` (ally rig name; defaults to self) and `a.loc` (which
  location to seed). Costs 1 action + 1 heat; caps 3/location.
- `meltdown` — `a.mode` (`"str"` | `"burst"`) and `a.n` (charge to spend, bounded
  by `rig.equipState.meltdownCharge`, 0-6).

Work required:
1. **Surface the buttons (shared).** Extend `availableActions` in
   `shared/battle-view.js` to also push these actives when the rig carries the
   gating upgrade — read the upgrade via `equipmentUpgradeEffectOf(rig.equipment,
   rig.equipmentUpgrade)` (already imported in the engine). Give each a `key`,
   `label`, `heat`, and `enabled` (e.g. `meltdown`/`cryo` disabled when the
   relevant `equipState` count is 0). This is the single source the console reads,
   so it must list them or no client change can show them.
2. **Collect params (client).** Add `onAction` branches in
   `ActionConsole.tsx:154-181` for the three keys, each opening a small drawer in
   `V2BattleActionsContext.tsx` (mirror the repair/move drawers):
   - cryo → a stepper for `n` (max = `rig.equipState.cryo`).
   - nanite → an ally-target picker (friendly rigs) + a location picker (reuse the
     repair drawer's loc picker), or self+loc.
   - meltdown → a mode toggle (STR / Burst) + a stepper for `n` (max =
     `rig.equipState.meltdownCharge`).
   Send `{ name, action, ...params }` via `sendCommand`.
3. Verify the drawer only appears for a rig actually carrying the upgrade (the
   shared `availableActions` gate already ensures the button only shows then).

### G2 — Grapnel Launcher reel mode is unreachable (Blocker)

A grapnel rig still shows the plain **"Jump Jets"** button (its active key is
`jumpjets`, pushed by `battle-view.js:71-74`). `jumpjets` is not special-cased in
`onAction`, so it hits the fall-through and always sends `{ name, action:
"jumpjets" }` with no `mode`/`engage`. The engine (`game-state.js:2357-2389`)
then defaults to **yank-self**; reel (`a.mode === "reel"` + `a.engage` target) can
never be triggered.

Work required:
1. Detect a grapnel rig on the client (the rig carries `servo-actuators` +
   `grapnel-launcher`; expose it via `availableActions` — e.g. relabel the active
   "Grapnel" and/or add a flag on the action entry so the console knows to open a
   picker instead of firing directly).
2. Add an `onAction` branch that opens a mode picker: **Yank self** (sends
   `{ action: "jumpjets" }`, no extra) vs **Reel** (sends `{ action: "jumpjets",
   mode: "reel", engage: <enemyName> }` with an enemy-target picker — reuse the
   attack/support target-picker pattern).
3. Optionally surface `rig.equipState.grapnelCooldown` so the button shows
   "recharging — N round(s)" and is disabled while > 0 (the engine already rejects
   it; the UI should reflect that — ties into G3).

### G3 — Charges / cooldowns / counters are invisible (High)

No client code reads `equipState` or `reactorOverdriveActive` (confirmed zero
hits). Players cannot see any of: `ablativeCharges` (0-2), `interceptors` (0-2),
`cryo` (0-3), `meltdownCharge` (0-6), `solution.count` (0-3, + `targetId`),
`naniteStacks` (`[{loc,sp}]`), `grapnelCooldown` (rounds), `reactiveArmorLocs`,
`firedRangedThisRound`/`pdLocked` (Point-Defense lockout), the transient
`nextAttackStr`, and `reactorOverdriveActive`. Several of these are decision-
critical (you can't sensibly spend cryo/meltdown, or rely on Point-Defense, blind).

Precedent to follow: `rigModifiers(rig)` in `shared/battle-view.js:147-202`
returns `{ key, tag, tone, gloss }` status chips from ~30 plain rig fields and is
rendered in `RigTerminal.tsx:96-105` (primary rig-detail surface) and
`RigItem.tsx:107`. It is plain JS and already reads untyped runtime fields.

Work required:
1. Extend `rigModifiers` (shared) with chips for the live `equipState` counters
   and `reactorOverdriveActive` — e.g. "Ablative ×2", "Cryo 3/3", "Meltdown 4/6",
   "Solution 2/3", "PD ×2" (or "PD locked"), "Grapnel CD 2", "Nanites: legs ×2",
   "Overdrive". Choose `tone` to match existing chip conventions. Show a chip only
   when the counter is meaningful (non-zero / relevant equipment present).
2. This automatically lights up both `RigTerminal` and `RigItem`. Consider a
   dedicated, always-visible block in `RigTerminal` (near `HeatGauge` at
   `RigTerminal.tsx:139`) for the active rig's own charges, since chips are a "tap
   to read" surface.
3. For actives whose *cost/availability* depends on a counter (cryo, meltdown,
   grapnel cooldown, PD lockout), reflect the disabled/labelled state on the
   action button too (feeds back into G1/G2 via `availableActions` `enabled`).

### G4 — Client `Rig` type omits the new fields (Medium — enabler)

`client/src/state/types.ts:36-60` declares none of `equipState`,
`reactorOverdriveActive`, nor many existing transient fields `rigModifiers`
already reads. `rigModifiers` works because it's plain JS on untyped runtime
objects (and `RigTerminal.tsx:133` already casts). But any `.tsx` that reads these
fields directly (the G1/G2 drawers, a G3 dedicated block) needs the type.

Work required: add an `equipState` interface (all 11 fields + optional
`nextAttackStr`) and `reactorOverdriveActive?: boolean` to the client `Rig` type.
Optionally backfill the other transient fields `rigModifiers` reads, but that's
not required for this work.

### G5 — Narration mostly works; two edge caveats (Low)

The V2 roll console is **generic over `kind`** — it never whitelists or drops
unknown kinds, and renders both `summary` and the full `effects[]` array
(`client/src/v2/overlays/RollConsole.tsx:128-233`, effects at `:420-435`; consumer
`client/src/v2/hooks/useV2BattleWatchers.tsx:116-139`). So Chaff Burst (`perk`),
Grapnel/Meltdown (`equipment`), and Backdraft's appended `effects[]` line all
render as-is. No work needed for basic visibility. Two real caveats worth a check:

1. **Backlog fast-forward** (`useV2BattleWatchers.tsx:127`): if a single state
   update delivers **more than 3** fresh resolutions, only the **last** is played
   in the console; earlier ones are skipped. A mechanic that pushes a burst of
   separate resolutions in one tick (e.g. Meltdown AoE plus several lines) could
   have earlier narrations skipped. Prefer consolidating a mechanic's narration
   into one resolution, or verify bursts stay ≤3.
2. **Recap fallback** (`useV2BattleWatchers.tsx:356-403`): the end-of-activation
   recap only lists resolutions with a matching `rigId` **and** a truthy
   `summary`. An effects-only narration with an empty `summary`, or one with no
   `rigId`, renders live but is **dropped from the recap**. Ensure each new
   narrated resolution sets `rigId` (the acting/affected rig) and a non-empty
   `summary` — an engine-side check, verify per mechanic.

Cosmetic (optional): `equipment`/`perk` narrations show a generic uppercased kind
header and no bespoke icon/SFX (`RollConsole.tsx:312-313`). They are fully
visible; only styling is bare. A per-kind icon/SFX map is a nice-to-have.

---

## Suggested order

1. **G4** (types) — small, unblocks the `.tsx` work.
2. **G1 + G2** (make the mechanics fireable) — the actual blockers; do the shared
   `availableActions` change first (it gates the buttons), then the client drawers.
3. **G3** (surface the state) — high player value; extends `rigModifiers`.
4. **G5** (narration caveats) — verify per mechanic; mostly confirmation.

## Verification checklist (for the implementing agent)

Drive the running app (V2), not just unit tests — this is UI. For each:
- Commission a rig with the relevant upgrade; confirm the active's button appears
  only for that rig, with correct label/enabled state.
- Fire each new active and confirm: (a) the command reaches the engine with the
  right params (check the resolution/log or server state), (b) the tracked-state
  chip/indicator updates (e.g. cryo 3→1 after spending 2), (c) the narration
  renders in the roll console.
- Grapnel: confirm both Yank and Reel are selectable and Reel engages the named
  enemy; confirm the cooldown disables/relabels the button.
- Point-Defense / Fire Solution / Nanite / Meltdown / Cryo / Ablative: confirm the
  counter is visible and changes across activations and Recovery.
- Confirm no regression to the 8 existing actives' buttons.

## Out of scope (tracked elsewhere)

- Two engine design decisions (Reactive Armor vs forced-severity; Reactor Overdrive
  overheat-cap breach) — see the rollout memory / spec.
- Cross-mechanic interaction bugs (e.g. Point-Defense rerolling a nominally
  unmissable Fire-Solution/Fire-Control volley) — separate integration-test effort.
- Kickstart Pistons Jump-into-contact follow-up (engine).
