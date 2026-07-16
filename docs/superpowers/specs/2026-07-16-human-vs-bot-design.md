# Human vs Bot — Design

**Date:** 2026-07-16
**Status:** Approved design. Ready for an implementation plan.
**Source:** Thread 1 ("Make it playable — human vs bot") of
`docs/superpowers/specs/2026-07-16-opponent-brain-next-steps.md`.

The deterministic opponent bot is feature-complete and already plays itself out
server-side (`driveBots`, hooked into `server/routes/game.js`); a full bot-vs-bot
game runs over HTTP today. What is missing is the path for a **human** to start
and play against it. This design covers that path end-to-end: setting the bot
flag, generating the bot's force, the lobby control, the readiness gate, and
verification that the V2 battle UI drives digital moves and renders bot turns.

---

## Goal

A solo human (side A) starts a match against the bot (side B), picks difficulty
via a preset, and plays the digital battle through to the end. The bot fields a
force that **mirrors the human's composition** at random Standard loadouts.

## Decisions (from brainstorming)

- **Bot roster:** random, matching the human's composition — same rig count per
  weight class, same tank/walker counts. Not a copy of the human's exact rigs.
- **Uniqueness:** no duplicate chassis anywhere in the battle. The V2 commission
  wizard already enforces this for humans (`CommissionWizard.tsx`:
  `usedChassis = new Set(rigs.map(r => r.chassis))`, options filtered against
  **all** rigs, both sides). The bot generator must respect the same rule.
- **Loadout depth:** Standard build only (default Field upgrades + suggested
  equipment, the scan-commission path). Bot difficulty comes from the preset
  scorer, not from gear.
- **Trigger:** lazy generation. `setbot` only flags the side; the bot's force is
  built and readied when the human readies (Approach A). This guarantees the
  mirror matches the human's *final* composition — the human can edit their
  roster freely up to the moment they ready.

## Constraints discovered

- **Chassis pool:** 7 light chassis, 4 medium (`shared/game-state.js` CHASSIS).
  Because uniqueness is battle-wide, a human fielding 4 medium rigs leaves zero
  medium chassis for the bot to mirror. Generation must fail loudly in that case
  rather than duplicate a chassis or silently under-field (see §2, Infeasible
  guard).
- **Parity signature:** `compositionOf(room, sideId)` keys are `rig:<weightClass>`
  (light/medium), `tank`, `walker`. `sidesAtParity` requires both sides
  non-empty and identical signatures. The bot force must reproduce the human's
  signature exactly for `maybeStartGame` to fire.
- **Sides always exist:** side `a` and `b` exist in `room.game.sides` from room
  init regardless of who joined, so side B can be a bot with no human claimant.

---

## Components

### 1. `setbot` verb — `shared/game-state.js`

New command verb, dispatched alongside the existing verbs in `applyCommand`.

- Shape: `{ verb: "setbot", attrs: { side, preset } }`.
- Writes `room.game.sides[i].bot = preset`.
- `preset` is one of the `PRESETS` keys (`balanced` | `aggressive` | `cagey`) or
  `null` to clear the flag (opponent becomes Human again).
- Validation, each a reject:
  - unknown side,
  - `room.mode !== "digital"` (bots require simulated positions),
  - `room.game.started` (flag is a pre-battle setting only),
  - `preset` not in `PRESETS` and not `null`.
- On success sets `changed = true`. Flags only — no roster, no ready flag, no
  game start here. `sideBotOf` (`shared/bot/index.js`) already reads
  `sides[i].bot`, so no bot-side change is needed.

Testable without any UI: a route test can POST `setbot` and assert the flag.

### 2. Mirror-gen + auto-ready — `shared/game-state.js` (ready / `maybeStartGame` path)

The single place that turns a flagged-but-empty bot side into a matched,
readied force. Triggered from the human's own `ready` verb, before the parity
check, so parity holds at the instant the human readies.

Precondition to run: the side being readied is human, the **opponent** side has
`bot` set, and that opponent side is empty (no rigs) and not yet ready.

Generation, driven by the injectable `options.random` (deterministic in tests):

1. Read the human's `compositionOf` signature.
2. For each `rig:<class>` count, pick that many **distinct unused** chassis of
   that weight class and build each with its Standard loadout (default Field
   weapon upgrades + suggested equipment — reuse the same construction the
   scan/QR "Standard" commission uses, via `makeUnit` + `resolveChassis`).
3. For each `tank` / `walker` count, build that many support units, each with
   two random distinct modules from {damage, repair, coolant, recon} (`makeUnit`
   validates the two-distinct-module rule).
4. Exclusion set for step 2 = every chassis already on the table (both sides) +
   the bot's own picks made so far in this pass. This enforces battle-wide
   chassis uniqueness.
5. Assign the generated units to the bot side (`owner = <bot side id>`), set that
   side `ready = true`, then let the existing `maybeStartGame` run.

**Infeasible guard.** If any weight class needs more distinct chassis than remain
unused in the pool, do **not** generate a partial or duplicated force. Reject the
human's `ready` with a clear, actionable reason, e.g. *"Not enough distinct
chassis remain for the bot to field a matching force — drop a medium rig."* The
human roster and bot flag stay intact so the human can adjust and retry.

Determinism: all random picks flow through `options.random`; a seeded run
produces the same bot force. No `Math.random` in this path.

### 3. Client READY gate — `client/src/v2/screens/Squadron.tsx`

Today `readyDisabled = started || myReady || !atParity || !field?.locked`. The
`!atParity` term blocks readying because a flagged bot side is still empty
pre-generation.

- Derive `opponentIsBot` from `game.sides` (the enemy side's `bot` field).
- When `opponentIsBot`, drop the `!atParity` requirement from `readyDisabled`:
  enable READY on **your** roster being valid (≥1 unit on your side) + field
  locked. The server generates the matching force on ready, so parity is the
  server's job, not a client gate.
- Non-bot (human-vs-human) games keep the existing parity gate unchanged.

### 4. Lobby opponent control — `client/src/v2/screens/Squadron.tsx`

A pre-battle **Opponent** selector near the READY row.

- Options: `Human · Balanced Bot · Aggressive Bot · Cagey Bot`.
- Choosing a bot preset fires `setbot { side: enemySide, preset }`; choosing
  Human fires `setbot { side: enemySide, preset: null }`.
- Reflects current state from `game.sides[enemy].bot`.
- Shown pre-battle only (alongside the existing `!started` lobby block), digital
  rooms only (matches the `setbot` server guard).
- Sub-copy: the bot mirrors your force at a random Standard loadout; difficulty
  is the preset.

### 5. Verify digital battle + bot turns (1c) — `client/src/v2/battle/`

Verification against the E1/E2 seams shipped this cycle. Not new mechanics —
confirm the human-vs-bot loop runs end-to-end and fix any seam that is still on
the pre-digital path.

- **Move path:** `MoveBody` sends `{ dest, facing }` on the `move`/`sprint`
  action so E1's path validation runs (engine re-routes, rejects out-of-reach or
  >90° pivots). Confirm it is not still on the physical no-position path.
- **Bot turn render:** after a human command, the server's `driveBots` plays side
  B to the next human decision point and broadcasts; confirm the client renders
  the bot's whole resolved turn from the pushed state (the turn arrives resolved
  — no "bot is thinking" gap needed).
- **Objectives:** digital rooms auto-score objectives (E2) and advance; confirm
  the UI reflects geometry-derived VP rather than waiting on a manual claim.
- **Reaction interplay:** a human-owned reaction (Evasive / Return) against a bot
  resolves through the normal `react` verb; `driveBots` stops on a human-owned
  `pendingReaction` and resumes after. Confirm this path for the preps a human
  can set today.

---

## Data flow

```
Human commissions side A roster (wizard dedups chassis across both sides)
        |
Human sets field + locks it (FieldControls, owner-gated)
        |
Human picks Opponent = <preset> Bot   -> setbot { side: b, preset }
        |                                  (sides[b].bot = preset; flag only)
Human taps READY  -> ready { side: a }
        |
   server ready path:
     opponent b is a bot, empty, not ready
        |
     generate mirrored random Standard force for b (distinct unused chassis)
        |  (infeasible? reject ready with reason; nothing else changes)
     sides[b].ready = true
        |
     maybeStartGame: both ready + parity -> game starts
        |
Human issues a command  -> command route -> applyCommand
        |
     driveBots(room): plays bot side b to next human decision point
        |
     broadcast resolved state -> client renders bot turn
        |
   (repeat until game end; reactions resolve via react verb, driveBots pauses)
```

## Error handling

- `setbot`: rejects on unknown side, non-digital room, started game, or unknown
  preset. Reasons surfaced via `lastRejectionReason` (409 on the command route).
- `ready` with a bot opponent: rejects with the infeasible-chassis reason when
  the pool can't supply a distinct mirror; human state untouched.
- All other existing `ready` rejections (field not locked, already ready) are
  unchanged.

## Testing

- **`setbot` verb (route + unit):** POST `setbot` sets the flag; rejects unknown
  preset, non-digital room, started game, unknown side; `null` clears the flag.
- **Mirror generation (unit, seeded random):** given a human composition, the
  generated bot force reproduces the `compositionOf` signature exactly; all
  chassis in the battle are distinct; support units carry two distinct modules;
  the force is Standard-built. Assert *composition and uniqueness*, never
  specific chassis ids, per the [[no-value-pinning-tests]] rule — the pool and
  loadouts get tuned.
- **Infeasible guard (unit):** a human roster that exhausts a class pool makes
  `ready` reject with the actionable reason and starts no game.
- **Full loop (route, deterministic):** claim A, commission, lock field,
  `setbot` b, `ready` a → game starts with a matched bot force; a human command
  drives the bot and returns resolved state (extends the existing bot-vs-bot HTTP
  test).
- **Client gate (component):** with a bot opponent, READY enables on own valid
  roster + locked field without enemy parity; human-vs-human keeps the parity
  gate.
- **1c seams:** confirm `MoveBody` emits `{ dest, facing }`; confirm a pushed bot
  turn renders. Prefer extending existing `MoveBody.test.tsx` /
  battle-watcher tests over new harness.

## Out of scope

- Preset tuning (thread 2 — blocked on the arsenal rebalance,
  [[penetration-band-3-7]]).
- The bot *planning* reactions (thread 4a) and secondary blast targeting (4b).
- Gemma narration and any LLM-in-the-loop opponent (excluded per current
  direction).
