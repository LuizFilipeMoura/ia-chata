# Threat Warning Drawer — design

**Date:** 2026-07-13
**Branch:** frontend/v2-redesign
**Status:** approved, ready for plan

## Summary

When an enemy declares an attack on one of your Rigs, the defender's screen
throws up a loud, blocking "INCOMING FIRE" overlay: a klaxon, a shaking frame,
sliding hazard bars, a targeting reticle over the doomed Rig, and the line
"Enemy IRONJAW targets your RIVETHEAD." It fires the moment the attacker opens
the attack sheet on your Rig and clears when they fire or back off.

Ordinary opponent turns are **not** changed — the existing top `TurnBanner`
wait-state already covers "hold, it's their move." This feature is *only* the
attack telegraph.

Purpose (agreed): informed **and** dramatic. The copy names the real attacker,
target, and weapon; the styling delivers dieselpunk menace.

## Scope decisions (locked with the user)

- **Signal source:** real declared-target state — broadcast when the attacker
  opens the attack sheet. Not proximity-inferred, not fire-only.
- **Prominence:** quiet turn, loud threat. No drawer for a plain opponent turn;
  a big blocking overlay only for a declared attack.
- **Loudness:** maximal — shake, siren wash, hazard bars, reticle, klaxon.
- **Sound:** on. Reuse shipped `beep_warning.mp3` + `brace_for_impact.mp3`.
- **Blocking:** hard-block. The overlay swallows all input until the threat
  clears (with a 20s failsafe, below).
- **Trigger timing:** open → fire/cancel, **debounced**. Fires 500ms after the
  sheet opens on your Rig (a sub-500ms peek never klaxons); re-points live if the
  attacker switches target; klaxons once per threat session; clears on Fire or
  close. Anti-grief.

## Non-goals

- No new gameplay effect. `pendingThreat` is cosmetic telegraph only.
- No defender action from the overlay (reactions are pre-placed answer tokens).
- No change to the ordinary opponent-turn banner or the activation recap drawer.

## Data model (server — `shared/game-state.js`)

New transient field on `room.game`, alongside `pendingReaction` / `pendingAnswer`
/ `pendingBlast`:

```js
game.pendingThreat = {
  attackerId,   // rig id of the declaring attacker (must be turn.activeRigId)
  targetId,     // rig id being targeted (an enemy of the attacker)
  defender,     // side id that owns targetId — the side that sees the overlay
  mode,         // "fire" | "aimed" | "lock"
  weapon,       // display name, e.g. "Autocannon" or "Fire Control Lock"
} | null
```

Initialize to `null` in the game factory (~line 646) and backfill in
`ensureGameShape` (~line 798): `if (room.game.pendingThreat === undefined) room.game.pendingThreat = null;`.

The whole `room.game` is snapshotted to clients, so no serializer change is
needed — the field propagates automatically.

## Server verb: `threat`

New branch in `applyCommand` (the else-if chain around line 2573+). Two actions,
selected by `a.action`:

- **declare** (`{ verb: "threat", attrs: { action: "declare", target, mode, weapon } }`)
  - Validate: `room.game.phase === "activation"`; the declaring side
    (`normalizeSide(room, a.side) || context.side`) equals `room.game.turn.side`;
    `room.game.turn.activeRigId` is set and owned by that side; `target` resolves
    to a non-destroyed enemy Rig. On any failure, no-op (return room unchanged).
  - Set `room.game.pendingThreat = { attackerId: activeRigId, targetId, defender: target.owner, mode, weapon }`, bump `room.version`.
  - Re-declare (target switch) simply overwrites — same attacker, new targetId.
- **clear** (`{ verb: "threat", attrs: { action: "clear" } }`)
  - Only the active side may clear its own threat. Set `pendingThreat = null`.

`threat` is **not** an UNDO_VERB and does **not** snapshot history — it is
cosmetic and must never enter the undo stack.

## Auto-clear sweep

A `clearThreatIfStale(room)` helper, called near the top of `applyCommand`
(after `ensureGameShape`, but skipped when `verb === "threat"`):

```js
function clearThreatIfStale(room) {
  const t = room.game.pendingThreat;
  if (!t) return;
  if (room.game.phase !== "activation" ||
      room.game.turn?.activeRigId !== t.attackerId) {
    room.game.pendingThreat = null;
  }
}
```

This clears on activation end, turn flip, and phase change (all move the active
rig off the attacker). Additionally, **explicitly clear** `pendingThreat` inside
the `action` branch after a fire/aimed/lock resolves (the attacker's rig stays
active, so the sweep alone wouldn't catch a resolved shot — the "planning"
moment is over once dice are thrown). Belt-and-suspenders: `endActivation` and
the turn-advance path already move `activeRigId`, so the sweep covers them on the
next command.

Disconnect safety: if the attacker vanishes mid-threat, no further command
arrives to run the sweep — the client-side 20s failsafe (below) covers it.

## Client — attacker side (`client/src/v2/overlays/AttackWizard.tsx`)

- On mount (sheet opened) for a normal attack (`react !== true`): start a 500ms
  timer; when it fires, `sendCommand("threat", { action: "declare", target: state.target, mode, weapon: weapons[slot] || "", side: mySide })`.
- On `state.target` change while open: re-send declare with the new target
  (debounce not needed on switch — the sheet is already open and loud).
- On close and on submit: clear the timer; `sendCommand("threat", { action: "clear", side: mySide })`. (Submit also sends `action`, which server-clears; the explicit clear is harmless and covers the plain-close path.)
- Skip entirely when `react === true` (return-fire reuse) — no threat overlay
  stacked on an already-loud reaction sequence.
- `mode` = the wizard's `mode` prop (`fire`/`aimed`/`lock`). For `lock`,
  `weapon` = `"Fire Control Lock"`.

`mySide` via `useMySide()`; `sendCommand` via `useCommands()`.

## Client — defender side (new `client/src/v2/overlays/ThreatOverlay.tsx`)

State-driven, portal-mounted, hard-blocking, non-dismissable. Mounted once in
`V2Terminal.tsx` (alongside `OutcomeBanner`).

- Reads `game.pendingThreat` + `rigs` from `useRoomState()`, `mySide` from
  `useMySide()`.
- Renders **only** when `pendingThreat && pendingThreat.defender === mySide`.
- Resolves attacker rig (by `attackerId`) and target rig (by `targetId`) for the
  names; `mode`/`weapon` for the weapon line. Lock mode shows "is painting your
  {target} for a strike" instead of a weapon.
- Visual: the approved loud mockup — shaking frame, red siren wash, sliding
  hazard bars top & bottom, sweeping reticle on the targeted Rig card if visible
  (else a standalone reticle), blinking "⚠ INCOMING FIRE ⚠" klaxon,
  "Enemy {ATTACKER} targets your {TARGET}", weapon line, "◇ Brace for impact".
- **Sound:** on mount of a *new* threat session (keyed on `attackerId`), call a
  new `playThreatAlarm()` — plays `beep_warning` + `brace_for_impact` through the
  mixer (respects the sound-off flag). Do **not** replay on live re-point (target
  switch keeps the same `attackerId`).
- **Hard-block:** a full-viewport fixed layer with `pointer-events` capturing all
  input; no close affordance.
- **20s failsafe:** if the same threat is still mounted after 20s, downgrade to
  dismissable (show a small "Dismiss" and let scrim-tap close locally). Guards
  against an attacker disconnecting mid-threat and stranding the defender. Local
  dismiss just hides the overlay; server state clears on the next command.

## Audio (`client/src/v2/audio/actionAudio.ts`)

Add:

```js
const THREAT_SFX = ["beep_warning", "brace_for_impact"];
export function playThreatAlarm(): void {
  play([], urls(THREAT_SFX));
}
```

## Styling

New rules in `client/src/v2/styles/overlay.css` (or a dedicated `threat.css`
imported by the overlay), namespaced `v2-threat-*`, ported from the approved
mockup: `@keyframes` for shake, siren, reticle sweep, hazard-bar slide, klaxon
blink. Palette from `tokens.css` (`--ember`, `--ember-hi`, `--oil-hi`, iron
greys). Respect `prefers-reduced-motion` by disabling shake/slide (keep the
static loud styling).

## Testing

**Server (`shared/game-state.test.js`):**
- `threat declare` sets `pendingThreat` with the target's owner as `defender`.
- Only the active side may declare; a non-active side declare is a no-op.
- Declare with a bad/destroyed/friendly target is a no-op.
- Re-declare overwrites `targetId`, keeps `attackerId`.
- `threat clear` nulls it.
- Resolving a fire/aimed/lock `action` clears `pendingThreat`.
- Turn flip / activation end / phase change clears it (via the stale sweep on the
  next command).
- `threat` never enters the undo history.

**Client:**
- `ThreatOverlay` renders only when `defender === mySide`; hidden otherwise.
- Re-point (target switch) updates the name without replaying the alarm.
- Overlay unmounts when `pendingThreat` clears.
- `AttackWizard` sends debounced declare on open, re-declare on target switch,
  clear on close; sends nothing in `react` mode.
- `playThreatAlarm` resolves both stems.

## Files touched

- `shared/game-state.js` — field, `threat` verb, stale sweep, `action` clear.
- `shared/game-state.test.js` — server tests.
- `client/src/v2/overlays/AttackWizard.tsx` — declare/clear broadcast.
- `client/src/v2/overlays/ThreatOverlay.tsx` — **new** overlay.
- `client/src/v2/V2Terminal.tsx` — mount the overlay.
- `client/src/v2/audio/actionAudio.ts` — `playThreatAlarm`.
- `client/src/v2/styles/overlay.css` (or new `threat.css`) — loud styles.
- Client tests alongside the touched files.
