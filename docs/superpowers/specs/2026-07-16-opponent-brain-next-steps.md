# Opponent Brain — Next Steps

**Date:** 2026-07-16
**Status:** Backlog. The bot itself is feature-complete (Phases E–5 + the damage term,
`docs/superpowers/plans/2026-07-15-opponent-brain.md`, 849 tests green). This doc collects
everything that remains around it. Gemma narration is deliberately **out of scope** here.

The items are grouped by what they unblock, roughly in priority order. Each is independent
unless a dependency is called out.

---

## 1. Make it playable — human vs bot

The bot plays itself out server-side (`driveBots`, hooked into `server/routes/game.js`), and a
full bot-vs-bot game runs over HTTP today. What's missing is the path for a **human** to start
and play against it. Three pieces:

### 1a. A way to set the bot flag (small, unblocks everything below)

`room.game.sides[i].bot` (`"aggressive" | "cagey" | "balanced" | null`) is what `driveBots`
and `sideBotOf` read, but **nothing sets it** — there is no command verb, only direct
assignment in tests. Needed:

- A lobby command, e.g. `{ verb: "setbot", attrs: { side, preset } }`, that writes
  `sides[i].bot` (validate `preset ∈ PRESETS`, digital rooms only, before the game starts).
- Or fold it into the existing `ready`/lobby flow.

This is the single smallest change that turns the whole bot from test-only into reachable.
No UI strictly required to test it (a route test can POST `setbot`).

### 1b. Lobby UI to pick "play vs bot" and a preset

A pre-battle control that calls `setbot` for the opponent side and its difficulty (the preset
*is* the difficulty dial). Depends on 1a.

### 1c. Verify the V2 battle UI drives digital moves and renders bot turns

The battle UI components exist (`client/src/v2/battle/`: `FieldMap`, `MoveBody`,
`ActionConsole`, …). Confirm end-to-end against the **E1/E2 seams** shipped this cycle:

- `MoveBody` must send `{ dest, facing }` on the `move`/`sprint` action so E1's path validation
  runs (the engine re-routes and rejects out-of-reach / >90° pivots). Check it isn't still on
  the physical no-position path.
- After a human command, the server runs `driveBots` and broadcasts; confirm the client
  renders the bot's whole turn from the pushed state (no "bot is thinking" gap needed — the
  turn arrives resolved).
- Recovery: digital rooms auto-score objectives (E2) and advance; confirm the UI reflects the
  geometry-derived VP rather than waiting on a manual claim.

Reaction interplay caveat: `driveBots` stops and hands control back on a human-owned
`pendingReaction`; a human's Evasive/Return against a bot resolves through the normal `react`
verb, then the next command resumes the bot. This works for the preps a human can set today.
See item 4 for the reaction paths that are still geometry-blocked.

---

## 2. Tune the weight presets (blocked on the arsenal)

Presets (`balanced` / `aggressive` / `cagey` in `shared/bot/score.js`) are **un-tuned on
purpose**: the arsenal is mid-rebalance ([[penetration-band-3-7]]), and `F2-B (price ROF in
heat)` is shelved, so `prefer-volume` is currently *correct*. Tuning now would encode a
snapshot.

When the arsenal settles:

- Run the bot-vs-bot sweep (the throwaway driver in this session's scratch, or re-derive from
  `shared/bot/game.test.js`): 200 games per matchup, report win rate + mean VP + game length.
- Current baseline (damage-term scorer, 30 games): `aggressive 10 / cagey 20`, VP `2.73 / 1.67`.
  A good tuning pass makes the three presets a rock-paper-scissors-ish spread, not one dominant.
- Do NOT tune against a mid-rebalance arsenal.

---

## 3. Bot quality refinements (independent, do when they bite)

### 3a. Exposure assumes static enemies

`exposureAt` (`score.js`) sums each enemy's best shot **from where it stands now** — it does
not model the enemy *closing first*. The bot will happily stop just outside a fast enemy's
current reach, not realising that enemy can move-and-shoot in one activation. If the bot proves
easy to bait, the cheap fix (documented in the spec) is to **inflate each enemy's threat range
by its `moveBudget`** rather than to search a second ply.

### 3b. Performance — ~4s/game

`candidatesFor` already builds the occupancy grid once (`findPathOnGrid`). The remaining cost
is `scoreCandidate` calling `bestShotFrom`/`exposureAt`, each rebuilding `terrainPolygons` and
running `sightCorridor` per candidate per enemy. If a large tuning sweep (item 2) is too slow:

- Memoize `terrainPolygons(room.field)` per `chooseAction` (it's constant across candidates).
- Optionally thin the move lattice, or cache per-enemy geometry that doesn't depend on the
  candidate's own facing.

Measure first — this only matters at sweep scale, not for live play (one activation is fast).

### 3c. Known analytic biases (leave unless they distort play)

Documented in `evaluate.js`, all small and one-directional: effective-ROF blindness (Full Auto,
Bloodletter, Redline Governor read as base `profile.rof`), and Armour Piercing's failed-wound
reroll (raises real P(wound), unmodelled → AP weapons slightly under-rated). Folding any of
these in requires reading state the pure evaluator deliberately avoids mutating; only do it if a
specific weapon reads badly in play.

### 3d. Search beyond 1 ply (large, probably never for a sparring bot)

The scorer is already the leaf evaluator a search would need. A real search needs a fast rollout
simulator (dice, hidden preps, Answer tokens) — a genuinely large project. Out of scope for a
competent sparring partner; noted only because the seam is ready.

---

## 4. Engine gaps the bot works around (spec-1 Task 10b)

These are **digital-battlefield** loose ends the bot currently routes around; closing them
tightens both the bot and human play.

### 4a. Reaction paths still take client-declared geometry

Three post-resolution reaction paths — **Return Fire, Riposte, Exploit** (resolved in the
`react` verb; `maybeAnvilRiposte` and the `pr.kind` branches in `game-state.js`) — still consume
client-declared arc/geometry rather than deriving it from positions like `resolveFire` does.
Until they derive it:

- The bot never *plans* reactions (out of scope anyway), and a human-vs-bot game where the
  human triggers one resolves through the client. `driveBots` correctly stops for it.
- Needs a design call on **reverse-direction arcs** (a counter-attack strikes back along the
  original shot) before it's mechanical. This is the original spec-1 Task 10b.

### 4b. Secondary blast targeting (§9 munition cook-off)

`driveBots` clears a bot side's `pendingBlast` with **empty targets** — the bot skips secondary
blast damage. Auto-deriving the rigs within the blast radius from geometry (the same "derive,
don't declare" move as `resolveFire`) is Task-10b-adjacent. Small once 4a's geometry approach is
settled; until then the simplification is deliberate and documented.

### 4c. rules.md §12 measurement retune

Carried over from digital-battlefield: `rules.md` §12 still needs the retune for the
[[measurement-conventions]] rebase (centre-to-centre except melee/objective rim gap).

---

## Not in this doc

Gemma narration (spec 3) and any LLM-in-the-loop opponent variant are deliberately excluded per
the current direction. The deterministic bot is the opponent; if narration is revisited it gets
its own spec.
