# Reaction Tokens — Answer Tokens & Prepare, revealed on fire

**Date:** 2026-07-05
**Status:** Design approved, pre-plan

## Summary

Turn the game's three **preparation reactions** (§5 — Evasive Manoeuvre, Return
Fire, Brace for Incoming Fire) into a fully-driven feature with two placement
entry points, secrecy, and an animated reveal when the prepared Rig receives
fire.

- The **second player** (who holds Answer tokens) places reactions the moment
  the tokens are granted at round start — a mandatory, blocking gate.
- The **Prepare action** places the same kind of reaction inline during a Rig's
  activation, via the same picker.
- A placed reaction is **facedown/secret** — the opponent sees only that "a
  reaction is set," not which one — until it **triggers** on an incoming weapon
  attack, when it flips with an animation matched to the game's existing motion
  language.
- The effect then **applies in game**: Brace (already wired) plus the two
  currently-unimplemented reactions, Evasive and Return Fire.

## Goals

1. One shared reaction picker feeding two entry points (Answer token, Prepare).
2. Secrecy: facedown-but-visible to the opponent; type hidden until reveal.
3. Answer tokens spent immediately on receipt; placement blocks the opponent's
   activation until done (or no eligible Rigs remain).
4. On an incoming Fire / Aimed Shot against a prepared Rig: reveal + resolve the
   reaction, interposing the defender's decision where the rule requires it.
5. Reveal animation consistent with `RollConsole` / chip / banner motion.

## Non-goals

- Ram, blast, and overheat do **not** trigger reactions (weapon attacks only).
- No physical position/LoS simulation — Evasive asks the defender to *declare*
  whether their tabletop move broke the attacker's range/LoS.
- No new reaction types beyond the three in §5.
- The Return Fire counter-attack does not itself trigger a reaction (no chains).

## Current state (what already exists)

- `game.answerTokens {a,b}` granted to the second activator (2) in
  `applyInitiative`, cleared in `runRecovery` (`shared/game-state.js`).
- `answer` verb: places `rig.preparation = { type, source:"answer" }`, decrements
  the token — but **no client sends it** and there is no picker.
- `prepare` action: places `rig.preparation = { type, source:"action" }`, but the
  client sends no `prep`, so it silently defaults to `brace`.
- `combat.js` implements **Brace only** (`−2` to front-arc Impact Rolls). Evasive
  and Return Fire are unimplemented; nothing is revealed or consumed on trigger.
- `rigModifiers` renders a static prep chip (`Braced` / `Evasive ready` /
  `Return fire ready`) to everyone — i.e. currently **not secret**.
- `RollConsole` plays resolution log entries (dice flicker → settle → summary →
  effects) with tone colors and `line-in` staggering; `pendingBlast` is the
  existing precedent for a parked, controller-resolved step.

## Data model changes (server — `shared/game-state.js`)

### Preparation shape

```js
rig.preparation = {
  type:   "brace" | "evasive" | "return",
  source: "answer" | "action",
  faceUp: false,   // NEW — flips true when it triggers/reveals
}
```

`ensureRigShape` backfills `faceUp: false` on load.

### Secrecy — redaction in `publicState(room, side)`

For every Rig **not** owned by the viewing `side`, if
`preparation && preparation.faceUp === false`, send `preparation: { hidden: true }`
instead of the real object. The owner always sees their own; once `faceUp` is
true the real object is sent to everyone. `formatBattleState` (chat prompt) keeps
seeing full state server-side; it is not per-viewer redacted today, and reactions
are low-value to the assistant — leave as-is.

### Round-start Answer gate

```js
game.pendingAnswer = { side, remaining } | null   // NEW
```

Set in `applyInitiative` when the second side is granted tokens **and** owns at
least one eligible Rig (non-destroyed, no existing preparation). While
`pendingAnswer` is set:

- the `activate` verb is refused (activation is blocked);
- the `answer` verb decrements `remaining` and clears the gate when
  `remaining === 0` or the side has no remaining eligible Rig.

If the second side has no eligible Rig at grant time, the gate is never set.

### Interpose state

```js
game.pendingReaction = {                          // NEW — parallels pendingBlast
  kind: "evasive" | "return",
  attackerId, targetId,
  defender,               // side id that must resolve
  attack,                 // serialized fire opts (weapon, arc, range, cover, aimed, aimedLoc, fullAuto, charged, dice, cost)
} | null
```

Only Evasive and Return Fire park here. Brace resolves inline (no defender
input). While `pendingReaction` is set, normal turn commands (`activate`,
`action`, `endactivation`) are refused; only the `react` verb progresses.

## Placement — one picker, two entry points (client)

New `client/src/components/overlays/ReactionPicker.tsx`: three options styled
like `ChoiceField` — Brace 🛡️, Evasive 💨, Return Fire ↩️ — each with its
one-line §5 rule. Pure presentational; returns the chosen `type`.

### Entry point A — Answer tokens (round start, mandatory, blocking)

When `pendingAnswer.side === mySide`, a watcher opens a mandatory modal:

> "Answer Token 1 of {remaining} — choose a Rig, choose a reaction."

- Rig selector = my non-destroyed Rigs without an existing preparation.
- Then the `ReactionPicker`.
- Confirm → `sendCommand("answer", { name, prep, side: mySide })`.
- Repeats until `remaining === 0` / no eligible Rig. Not dismissable.

Meanwhile the first player sees a `wait`-tone banner ("Opponent is preparing…")
and cannot activate (server-enforced by the gate).

### Entry point B — Prepare action (inline)

`ActionConsole` Prepare no longer sends immediately. It opens a drawer with the
`ReactionPicker`; Confirm → `sendCommand("action", { name, action:"prepare", prep })`.
Costs the action slot + 1 heat as today.

Both write the identical facedown `preparation`.

## Interpose & trigger (server)

In `performAction`, for `act === "fire" | "aimed"` after the target/slot/cost
checks, branch on whether the target carries a **facedown** preparation
(`target.preparation && !target.preparation.faceUp`):

- **No facedown prep** (or an already-face-up Brace): resolve exactly as today.
  A face-up Brace still applies `−2` via `combat.js` (reads `preparation.type`).

- **Facedown Brace:** set `faceUp = true`; push a `reaction` reveal entry; then
  resolve the attack normally (Brace's `−2` applies). Brace persists face-up
  until Recovery. Attacker's budget/heat spent as normal.

- **Facedown Evasive:** set `faceUp = true`; push a `reaction` reveal entry;
  **spend the action slot** (`cost`) but **defer the whole attack** (no to-hit,
  no heat, no ammo yet). Set `pendingReaction { kind:"evasive", attack }`. The
  defender resolves via `react`.

- **Facedown Return Fire:** set `faceUp = true`; push a `reaction` reveal entry;
  **resolve the incoming attack normally** (damage applied, budget/heat spent);
  then set `pendingReaction { kind:"return" }`. The defender resolves via `react`.

### New `react` verb

Accepted only from the `pendingReaction.defender` side.

- **Evasive:**
  - `attrs.evaded === true` → attack fails: mark the weapon spent
    (`loaded.longRange = false` for a ranged shot), apply the **base fire heat**
    only (`1`, `+1` if Hot — the weapon discharged), no to-hit/impact. Push an
    `attack`-kind resolution: "… evades — attack fails."
  - `attrs.evaded === false` → run `resolveAttack` with the stored `attack` opts
    (rolls to-hit, applies all heat + damage as a normal shot).
  - Consume: `target.preparation = null`. Clear `pendingReaction`.

- **Return Fire:** `attrs.attack` carries the defender's counter (weapon, target =
  the original attacker, arc, range, cover, dice). Run `resolveAttack`
  (defender → attacker) with no interpose and no action-budget/turn checks. The
  defender may also submit `attrs.decline === true` to skip (weapons destroyed /
  out of range). Consume the preparation; clear `pendingReaction`.

Recovery already nulls `preparation` for every Rig, so Brace / unspent face-up
reactions clear at end of round.

## Reveal animation (`RollConsole` + `battle.css`)

A new `reaction` branch in `RollConsole.playResolution`, reusing the scrim +
console shell and stripe header (`roll-kind` = `REACTION`):

- Center element: a round token (the `.die.d12` shape — 3rem, 50% radius) begins
  **facedown**, back face = the ⟡ glyph on the `--stripe` hazard pattern.
- **Flip:** `rotateY(0 → 180deg)` over ~0.4s on `--ease-out`
  (`cubic-bezier(.2,.85,.25,1)`), with a `die-land`-style scale pop. The front
  face carries a tone glow identical to `.die.settled`
  (`box-shadow: 0 0 14px color-mix(in srgb, var(--face) 55%, transparent)`):
  - Brace → cool teal `#7fd0c4`
  - Evasive → oil amber `var(--oil)`
  - Return Fire → ember `var(--ember-hi)`
  and shows the reaction icon + name.
- The `roll-summary` line and `roll-effect` lines then fade in via the existing
  `line-in` stagger (e.g. "Vanguard braces — front-arc impacts −2").
- **Brace** chains straight into the following attack resolution (two log
  entries, played in order by the existing watcher). **Evasive / Return Fire**
  swap the OK button for their decision controls (see below).
- **Rig chip** (`rigModifiers`): the opponent's generic facedown chip
  ("⟡ Reaction set") flips to the named face-up chip with a one-shot
  `tb-flash`-style pulse.
- `@media (prefers-reduced-motion: reduce)` → instant reveal, no flip (mirrors
  the existing dice degradation).

New keyframe `reaction-flip` + `.rx-token` / `.rx-token.facedown` /
`.rx-token[data-tone]` rules added alongside the dice styles in `battle.css`.

## Defender decision UI (client)

A `pendingReaction` watcher in `useBattleWatchers` fires when
`pendingReaction.defender === mySide`:

- **Evasive** → a drawer: "Move up to ½ Speed on the table. Did it break the
  attacker's line of sight or leave their range?" → **Evaded (attack fails)** /
  **No — resolve the shot**. Sends `react { evaded }`.
- **Return Fire** → opens the existing `AttackWizard` for the reacting Rig vs the
  original attacker; on confirm sends `react { attack }`. A "Skip" path sends
  `react { decline: true }`.

When `pendingReaction` is set and it is **not** mine, the attacker/observer sees
a `wait`-tone banner ("Opponent is reacting…") and the action console is
disabled (server refuses commands anyway).

## View-model (`shared/battle-view.js`)

- `rigModifiers`: emit the facedown chip (`{ key:"prep", tag:"Reaction set",
  tone:"prep" }`) when `preparation.hidden` (opponent view) or facedown-owned;
  emit the named chip (`prepLabel(type)`) when `faceUp`/owned.
- Optional helpers `answerGate(game, side)` and `reactionPrompt(game, side)` so
  the HUD/banners can render the wait/among states without poking raw state.

## Files touched

- `shared/game-state.js` — preparation `faceUp`; `publicState` redaction;
  `pendingAnswer` gate (set in `applyInitiative`, honored by `activate`/`answer`);
  interpose in `performAction`; new `react` verb; `pendingReaction`.
- `shared/combat.js` — factor the deferred/`autoReload` heat handling so Evasive's
  two-step resolution reuses `resolveAttack` cleanly (Brace path unchanged).
- `shared/battle-view.js` — secret-aware `rigModifiers`; gate/prompt helpers.
- `client/src/state/types.ts` — `preparation.faceUp`/`hidden`, `pendingAnswer`,
  `pendingReaction`.
- `client/src/components/overlays/ReactionPicker.tsx` — new shared picker.
- `client/src/state/BattleActionsContext.tsx` — `openPrepare`; answer-gate flow;
  `react` senders.
- `client/src/hooks/useBattleWatchers.ts` — answer-gate, pendingReaction, and
  `reaction` reveal handling.
- `client/src/components/battle/ActionConsole.tsx` — Prepare opens the picker.
- `client/src/components/overlays/RollConsole.tsx` + `client/src/styles/battle.css`
  — `reaction` flip mode + keyframes.
- `client/src/components/BattleHud.tsx` / `TurnBanner.tsx` — wait states for the
  gate and the interpose.

## Testing

- **`shared/game-state.test.js`:** `answer` places facedown; `publicState`
  redacts the opponent's facedown prep but not the owner's / face-up; the
  `pendingAnswer` gate blocks `activate` and clears on spend / no-eligible-Rig;
  firing on each reaction reveals (`faceUp`), Evasive parks + `react{evaded:true}`
  deals no damage while `react{evaded:false}` resolves, Return Fire resolves then
  parks + counters, all three consume correctly (Brace persists to Recovery).
- **`shared/combat.test.js`:** Brace `−2` still only on the front arc; the
  deferred-Evasive path applies base fire heat on evade and full heat/damage on
  no-evade with no double counting.
- **Client:** `ReactionPicker` renders three options; the reveal watcher plays a
  `reaction` entry; reduced-motion path renders instantly.

## Open decisions — all resolved

| Decision | Resolution |
|---|---|
| Opponent visibility of a set reaction | Facedown but visible ("reaction set") |
| Trigger flow | Interpose & drive the defender's reaction |
| Answer-token placement timing | Spend immediately on receipt |
| Prepare action | Same picker / secrecy / reveal |
| Skippable at round start? | Mandatory — blocks until placed / no eligible Rig |
| What triggers a reveal | Weapon attacks only (Fire / Aimed Shot) |
| Block first player during placement? | Yes — activation gated on the placement |
